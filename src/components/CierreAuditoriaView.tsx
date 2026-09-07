import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Zap, 
  Users, 
  Search, 
  Building2, 
  Boxes, 
  Layers, 
  TrendingUp, 
  PieChart,
  X,
  ShieldCheck,
  RefreshCw,
  Clock,
  User,
  RotateCcw,
  PackageX,
  Check,
  WifiOff
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

import { 
  calcularResumenAuditoria, 
  fetchProductividadColaboradores, 
  exportarAuditoriaExcel, 
  cerrarCamionNae,
  reabrirCamionNae,
  calcularDuracionAuditoria,
  formatDateTimeArg,
  ResultadoCierreCamion
} from '../services/reportService';
import { guardarSnapshotReporte } from '../services/historyService';
import { parseFotoUrls } from '../utils/imageCompressor';
import { formatNumber, getUomLabel, getItemCostoReferencial, calcularUnidadesFisicasItem } from '../utils/formatUtils';
import { BottomNavCapsule } from './BottomNavCapsule';
import { CamionNAE, AuditoriaItem, ProductividadColaborador, isItemInAuditScope, isCamionCierreParcial } from '../types';

interface CierreAuditoriaViewProps {
  naeId: string;
  onBackToScan: () => void;
  onHome?: () => void;
  onNaeClosed?: () => void;
}

interface DonutCardProps {
  title: string;
  percent: number;
  strokeColorClass: string;
  mainText: string;
  subText: string;
  subTextColorClass?: string;
}

const DonutCard: React.FC<DonutCardProps> = ({
  title,
  percent,
  strokeColorClass,
  mainText,
  subText,
  subTextColorClass = "text-slate-400"
}) => {
  const radius = 38;
  const strokeWidth = 13;
  const circumference = 2 * Math.PI * radius;
  const validPct = Math.min(100, Math.max(0, percent));
  const offset = circumference - (validPct / 100) * circumference;

  return (
    <div className="bg-[#05132d]/80 border border-sky-500/20 rounded-2xl p-3 sm:p-3.5 flex flex-col items-center justify-between text-center shadow-lg backdrop-blur-sm transition-all hover:border-sky-500/40 min-h-[220px]">
      {/* Título Superior */}
      <h4 className="font-sans font-bold text-xs text-slate-200 tracking-normal mb-1 flex items-center justify-center text-center leading-tight">
        {title}
      </h4>

      {/* Gráfico Circular SVG Donut */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 my-1 flex items-center justify-center shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-[#0c2847]"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={`${strokeColorClass} transition-all duration-700 ease-out filter drop-shadow-[0_0_4px_rgba(56,189,248,0.25)]`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        <span className="absolute font-sans font-black text-lg sm:text-xl text-white tracking-tight">
          {validPct}%
        </span>
      </div>

      {/* Textos Inferiores (Sin truncar, permitiendo 2 líneas con fluidez) */}
      <div className="mt-1 space-y-0.5 w-full">
        <p className="font-sans font-black text-xs sm:text-sm text-white mt-0.5 leading-tight">
          {mainText}
        </p>
        <p className={`text-[10px] sm:text-[11px] ${subTextColorClass} font-medium leading-tight whitespace-normal break-words px-0.5 mt-1`}>
          {subText}
        </p>
      </div>
    </div>
  );
};

export const CierreAuditoriaView: React.FC<CierreAuditoriaViewProps> = ({
  naeId,
  onBackToScan,
  onHome,
  onNaeClosed
}) => {
  const [camion, setCamion] = useState<CamionNAE | null>(null);
  const { isOnline } = useNetworkStatus();
  const [items, setItems] = useState<AuditoriaItem[]>([]);

  const [productividad, setProductividad] = useState<ProductividadColaborador[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterTab, setFilterTab] = useState<'TODOS' | 'DIFERENCIAS' | 'NO_CONTADOS' | 'AGOTADOS' | 'DANADOS'>('DIFERENCIAS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  // Modal de Cierre
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState<boolean>(false);
  const [isConfirmPartialCloseOpen, setIsConfirmPartialCloseOpen] = useState<boolean>(false);
  const [isConfirmReopenOpen, setIsConfirmReopenOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isReopening, setIsReopening] = useState<boolean>(false);
  const [closeSuccess, setCloseSuccess] = useState<boolean>(false);
  const [closeResult, setCloseResult] = useState<ResultadoCierreCamion | null>(null);

  // Cargar datos completos del camión, sus ítems y la productividad
  const loadData = async () => {
    setLoading(true);
    try {
      const [camionRes, itemsRes, prodRes] = await Promise.all([
        supabase.from('camiones_nae').select('*').eq('id', naeId).single(),
        supabase.from('auditoria_items').select('*').eq('nae_id', naeId).order('depto_nombre'),
        fetchProductividadColaboradores(naeId)
      ]);

      if (camionRes.data) setCamion(camionRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      setProductividad(prodRes);
    } catch (e) {
      console.error('Error al cargar datos del reporte:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [naeId]);

  // Universo de SKUs delimitado estrictamente por la modalidad de auditoría
  const scopedItems = useMemo(() => {
    return items.filter(it => {
      const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);

      // Omitir sobrantes no facturados que quedaron en cero
      if (isSobranteNoFact && uEscRaw === 0 && bEsc === 0) {
        return false;
      }

      const tieneEscaneoFisico = uEscRaw > 0 || bEsc > 0 || Boolean(it.es_sobrante_no_facturado);

      return isItemInAuditScope(
        it,
        camion?.modo_auditoria,
        camion?.umbral_unidades || 0,
        camion?.umbral_monto || 0
      ) || tieneEscaneoFisico;
    });
  }, [items, camion]);

  // Resumen calculado de la auditoría sobre los SKUs del filtro de modalidad
  const resumen = useMemo(() => calcularResumenAuditoria(scopedItems), [scopedItems]);

  // Métricas calculadas para la grilla 2x2 de Anillos Donut
  const metrics = useMemo(() => {
    // 1. Unidades Físicas
    const uEsc = resumen.unidadesEscaneadas;
    const uEsp = resumen.unidadesEsperadas;
    const pctUnidades = uEsp > 0 ? Math.min(100, Math.round((uEsc / uEsp) * 100)) : 100;
    const uFaltantes = resumen.unidadesFaltantes;
    const uSobrantes = resumen.unidadesSobrantes + resumen.unidadesNoFacturadas;

    const mainTextUnidades = uEsp > 0 
      ? `${formatNumber(Math.min(uEsc, uEsp))} / ${formatNumber(uEsp)} un` 
      : `${formatNumber(uEsc)} un`;
    const subTextUnidades = `${formatNumber(uEsc)} auditadas • ${formatNumber(uFaltantes)} falt • ${formatNumber(uSobrantes)} sobr`;

    // 2. SKUs Controlados
    const totalSkus = scopedItems.length;
    const skusAuditados = scopedItems.filter(it => 
      Number(it.unidades_escaneadas || 0) > 0 || Number(it.bultos_escaneados || 0) > 0
    ).length;
    const skusPendientes = Math.max(0, totalSkus - skusAuditados);
    const skusNoFacturados = resumen.skusNoFacturados;

    const pctSkus = totalSkus > 0 
      ? Math.min(100, Math.round((skusAuditados / totalSkus) * 100)) 
      : 100;

    const mainTextSkus = `${skusAuditados} / ${totalSkus} SKUs`;
    let subTextSkus = `${skusAuditados} auditados • ${skusPendientes} pend`;
    if (skusNoFacturados > 0) {
      subTextSkus += ` • ${skusNoFacturados} ${skusNoFacturados === 1 ? 'SKU no facturado' : 'SKUs no facturados'}`;
    }

    // 3. Prioridad de Góndola (Agotados en Tránsito)
    const itemsAgotados = scopedItems.filter(it => Boolean(it.es_agotado_transito));
    const totalAgotados = itemsAgotados.length;
    const agotadosSeparados = itemsAgotados.filter(it => 
      Number(it.unidades_escaneadas || 0) > 0 || Number(it.bultos_escaneados || 0) > 0
    ).length;
    const agotadosPendientes = Math.max(0, totalAgotados - agotadosSeparados);
    const pctAgotados = totalAgotados > 0 
      ? Math.min(100, Math.round((agotadosSeparados / totalAgotados) * 100)) 
      : 100;

    const mainTextAgotados = `${agotadosSeparados} / ${totalAgotados} SKUs`;
    const subTextAgotados = `${agotadosSeparados} separados para reposición • ${agotadosPendientes} pendientes`;

    // 4. Bultos Controlados
    const bEscTotal = resumen.bultosEscaneados;
    const bEsp = resumen.bultosEsperados;
    const pctBultos = bEsp > 0 ? Math.min(100, Math.round((bEscTotal / bEsp) * 100)) : 100;
    const bultosSobrantes = Math.max(0, bEscTotal - bEsp);

    const mainTextBultos = bEsp > 0 
      ? `${formatNumber(Math.min(bEscTotal, bEsp))} / ${formatNumber(bEsp)} bultos` 
      : `${formatNumber(bEscTotal)} bultos`;

    let subTextBultos = `${formatNumber(bEsp)} esperados`;
    if (bultosSobrantes > 0) {
      subTextBultos += ` • ${formatNumber(bultosSobrantes)} ${bultosSobrantes === 1 ? 'bulto sobr' : 'bultos sobr'}`;
    } else {
      subTextBultos += ` • 0 bultos sobr`;
    }

    return {
      pctUnidades,
      mainTextUnidades,
      subTextUnidades,
      pctSkus,
      mainTextSkus,
      subTextSkus,
      pctAgotados,
      mainTextAgotados,
      subTextAgotados,
      pctBultos,
      mainTextBultos,
      subTextBultos
    };
  }, [scopedItems, resumen]);

  // Productividad consolidada y agrupada por persona normalizando nombres
  const sortedProductividad = useMemo(() => {
    const normalizeCollaboratorName = (rawName?: string | null): string => {
      if (!rawName) return 'DESCONOCIDO';
      let cleaned = rawName.replace(/\s*\(.*?\)/g, '').trim().toUpperCase();
      cleaned = cleaned.replace(/\s+/g, ' ');
      return cleaned || 'DESCONOCIDO';
    };

    const mapConsolidado = new Map<string, { totalUnidades: number; totalBultos: number; totalEscaneos: number }>();

    productividad.forEach(p => {
      const cleanName = normalizeCollaboratorName(p.colaborador_nombre);
      const existing = mapConsolidado.get(cleanName) || { totalUnidades: 0, totalBultos: 0, totalEscaneos: 0 };
      existing.totalUnidades += Number(p.totalUnidades || 0);
      existing.totalBultos += Number(p.totalBultos || 0);
      existing.totalEscaneos += Number(p.totalEscaneos || 0);
      mapConsolidado.set(cleanName, existing);
    });

    const activeList: ProductividadColaborador[] = [];
    mapConsolidado.forEach((val, key) => {
      if (val.totalUnidades > 0 || val.totalEscaneos > 0) {
        activeList.push({
          colaborador_nombre: key,
          totalUnidades: Math.round(val.totalUnidades),
          totalBultos: Math.round(val.totalBultos),
          totalEscaneos: val.totalEscaneos,
          porcentajeParticipacion: 0
        });
      }
    });

    const totalUnidadesOperarios = activeList.reduce((acc, curr) => acc + curr.totalUnidades, 0);

    return activeList
      .sort((a, b) => b.totalUnidades - a.totalUnidades)
      .map(p => {
        const pct = totalUnidadesOperarios > 0 
          ? Math.min(100, Math.round((p.totalUnidades / totalUnidadesOperarios) * 100)) 
          : 0;
        return {
          ...p,
          porcentajeCalculado: pct
        };
      });
  }, [productividad]);

  // Filtrado táctil de la lista sobre los SKUs de la modalidad
  const filteredItems = useMemo(() => {
    return scopedItems.filter((it) => {
      const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);

      // Omitir sobrantes no facturados que quedaron en cero
      if (isSobranteNoFact && uEscRaw === 0 && bEsc === 0) {
        return false;
      }

      const uEsp = Number(it.unidades_esperadas || 0);
      const totalUnidades = calcularUnidadesFisicasItem(it);

      const tieneDiferencia = totalUnidades !== uEsp || it.es_sobrante_no_facturado;
      const esDanado = Number(it.cantidad_danada || 0) > 0 || Boolean(it.observacion_dano) || parseFotoUrls(it.foto_dano_url || (it as any).fotos_dano_urls).length > 0;

      if (filterTab === 'DIFERENCIAS' && !tieneDiferencia) return false;
      if (filterTab === 'NO_CONTADOS' && (totalUnidades > 0 || isSobranteNoFact)) return false;
      if (filterTab === 'AGOTADOS' && !it.es_agotado_transito) return false;
      if (filterTab === 'DANADOS' && !esDanado) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        it.descripcion.toLowerCase().includes(q) ||
        it.upc.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q)
      );
    });
  }, [scopedItems, filterTab, searchQuery]);

  // Exportar archivo Excel usando el universo delimitado por la modalidad
  const handleExportExcel = async () => {
    if (!camion) return;
    await exportarAuditoriaExcel(camion, scopedItems, productividad);
  };

  // Cierre formal del camión
  const handleConfirmClose = async () => {
    setIsClosing(true);
    try {
      const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
      const res = await cerrarCamionNae(naeId, activeUser);
      setCloseResult(res);

      if (camion) {
        const isReopened = Boolean(camion.fecha_reapertura);
        const camionCerrado: CamionNAE = { 
          ...camion, 
          estado: 'CERRADO', 
          fecha_fin_auditoria: isReopened ? camion.fecha_fin_auditoria : new Date().toISOString(),
          fecha_fin_reapertura: isReopened ? new Date().toISOString() : camion.fecha_fin_reapertura,
          usuario_fin_auditoria: isReopened ? camion.usuario_fin_auditoria : activeUser,
          usuario_cierre_reapertura: isReopened ? activeUser : camion.usuario_cierre_reapertura
        };
        setCamion(camionCerrado);
        if (onNaeClosed) onNaeClosed();
        // Guardar snapshot de resguardo permanente para el módulo de Historial
        await guardarSnapshotReporte(camionCerrado, items, productividad);
      }
      setCloseSuccess(true);
      if (onNaeClosed) {
        onNaeClosed();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cerrar auditoría');
    } finally {
      setIsClosing(false);
      setIsConfirmCloseOpen(false);
    }
  };

  // Cierre parcial del camión
  const handleConfirmPartialClose = async () => {
    setIsClosing(true);
    try {
      const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
      const res = await cerrarCamionNae(naeId, activeUser, true);
      setCloseResult(res);

      if (camion) {
        const isReopened = Boolean(camion.fecha_reapertura);
        const camionCerrado: CamionNAE = { 
          ...camion, 
          estado: 'FINALIZADO_PARCIAL', 
          fecha_fin_auditoria: isReopened ? camion.fecha_fin_auditoria : new Date().toISOString(),
          fecha_fin_reapertura: isReopened ? new Date().toISOString() : camion.fecha_fin_reapertura,
          usuario_fin_auditoria: isReopened ? camion.usuario_fin_auditoria : activeUser,
          usuario_cierre_reapertura: isReopened ? activeUser : camion.usuario_cierre_reapertura
        };
        setCamion(camionCerrado);
        if (onNaeClosed) onNaeClosed();
        await guardarSnapshotReporte(camionCerrado, items, productividad);
      }
      setCloseSuccess(true);
      if (onNaeClosed) {
        onNaeClosed();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cerrar auditoría parcial');
    } finally {
      setIsClosing(false);
      setIsConfirmPartialCloseOpen(false);
    }
  };

  // Reapertura formal del camión
  const handleConfirmReopen = async () => {
    setIsReopening(true);
    try {
      const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
      await reabrirCamionNae(naeId, activeUser);

      if (camion) {
        setCamion({
          ...camion,
          estado: 'EN_PROCESO',
          fecha_reapertura: new Date().toISOString(),
          usuario_reapertura: activeUser
        });
      }
      if (onNaeClosed) onNaeClosed();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reabrir auditoría');
    } finally {
      setIsReopening(false);
      setIsConfirmReopenOpen(false);
    }
  };

  const formatAuditDateTime = (dateStr?: string | null): string => {
    return formatDateTimeArg(dateStr);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] flex flex-col items-center justify-center text-slate-400 p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <p className="text-xs font-bold">Generando conciliación de auditoría...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-28 select-none">
      
      {/* Header Fijo */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider">
                Resumen NAE #{camion?.numero_nae || '---'}
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1 ${
                isCamionCierreParcial(camion)
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : camion?.estado === 'FINALIZADO' || camion?.estado === 'CERRADO' 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                  : camion?.estado === 'EN_PROCESO'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {isCamionCierreParcial(camion) ? (
                  <>
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>FINALIZADO PARCIAL</span>
                  </>
                ) : camion?.estado === 'FINALIZADO' || camion?.estado === 'CERRADO' ? (
                  'FINALIZADO'
                ) : camion?.estado === 'EN_PROCESO' ? (
                  'EN PROCESO'
                ) : (
                  'PENDIENTE'
                )}
              </span>

              <span className={`px-2 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1 ${
                !isOnline
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${!isOnline ? 'bg-rose-400 animate-ping' : 'bg-emerald-400 animate-ping'}`} />
                <span>{!isOnline ? '🔴 SIN CONEXIÓN' : '🟢 EN VIVO'}</span>
              </span>
            </div>

            <p className="text-[11px] text-sky-400/80 font-medium truncate max-w-[200px]">
              {camion?.tienda_codigo} - {camion?.tienda_nombre}
            </p>
          </div>
        </div>

        <button
          onClick={handleExportExcel}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1 shadow-md shadow-emerald-600/30"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Excel</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="p-3 space-y-5 max-w-md mx-auto w-full flex-1">

        {/* 1. BALANCE DE AUDITORÍA / ENCABEZADO E INDICADORES DONUT DIRECTOS */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>Balance de Auditoría</span>
            </span>
            <span className="text-xs font-mono text-emerald-400 font-bold px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              {resumen.efectividadPorcentaje}% Efectividad
            </span>
          </div>

          {/* Registro Temporal en Orden Cronológico */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-300 font-mono px-1">
            <div className="flex items-start space-x-2">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex flex-col space-y-0.5 leading-tight">
                <span>Carga en Sistema: {camion?.created_at ? `${formatAuditDateTime(camion.created_at)}${camion.usuario_carga ? ` • ${camion.usuario_carga}` : ''}` : '--/--/-- --:-- hs'}</span>
                {camion?.fecha_inicio_auditoria ? (
                  <span className="text-sky-300 font-semibold">
                    Inicio descarga: {formatAuditDateTime(camion.fecha_inicio_auditoria)}{camion.usuario_inicio_auditoria ? ` • ${camion.usuario_inicio_auditoria}` : ''}
                  </span>
                ) : (
                  <span className="text-slate-400">Inicio descarga: --/--/-- --:-- hs</span>
                )}
                
                {(camion?.estado === 'CERRADO' || camion?.estado === 'FINALIZADO' || camion?.fecha_reapertura || camion?.fecha_fin_auditoria || camion?.fecha_fin) && (
                  <span>
                    Fin descarga: {formatAuditDateTime(camion?.fecha_fin_auditoria || camion?.fecha_fin || camion?.created_at)}{camion?.usuario_fin_auditoria ? ` • ${camion.usuario_fin_auditoria}` : ''}
                  </span>
                )}

                {camion?.fecha_reapertura && (
                  <span className="text-amber-300 font-semibold">
                    Reapertura: {formatAuditDateTime(camion.fecha_reapertura)}{camion.usuario_reapertura ? ` • ${camion.usuario_reapertura}` : ''}
                  </span>
                )}

                {camion?.fecha_reapertura && (
                  <span className={camion.fecha_fin_reapertura ? "text-purple-300 font-semibold" : "text-emerald-400 font-bold"}>
                    Cierre Reapertura: {camion.fecha_fin_reapertura 
                      ? `${formatAuditDateTime(camion.fecha_fin_reapertura)}${camion.usuario_cierre_reapertura ? ` • ${camion.usuario_cierre_reapertura}` : ''}`
                      : (camion.estado === 'EN_PROCESO' ? 'En proceso' : 'Sin finalizar')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 self-end sm:self-auto px-2.5 py-1 bg-[#05132d]/80 border border-sky-500/20 rounded-xl backdrop-blur-sm">
              <span className="text-slate-400 text-[10px]">Duración:</span>
              <span className="font-bold text-sky-300 text-xs">
                {calcularDuracionAuditoria(camion?.fecha_inicio_auditoria, camion?.fecha_fin_reapertura || camion?.fecha_fin_auditoria || camion?.fecha_fin)}
              </span>
            </div>
          </div>

          {/* Grilla 2x2 Donut Progress Rings estilo GDS directamente sobre el fondo */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Tarjeta 1: UNIDADES FÍSICAS */}
            <DonutCard
              title="Unidades Físicas"
              percent={metrics.pctUnidades}
              strokeColorClass="stroke-sky-400"
              mainText={metrics.mainTextUnidades}
              subText={metrics.subTextUnidades}
              subTextColorClass="text-sky-300/90"
            />

            {/* Tarjeta 2: SKUS CONTROLADOS */}
            <DonutCard
              title="SKUs Controlados"
              percent={metrics.pctSkus}
              strokeColorClass="stroke-emerald-400"
              mainText={metrics.mainTextSkus}
              subText={metrics.subTextSkus}
              subTextColorClass="text-emerald-400/90"
            />

            {/* Tarjeta 3: PRIORIDAD DE GÓNDOLA / AGOTADOS */}
            <DonutCard
              title="Prioridad de Góndola"
              percent={metrics.pctAgotados}
              strokeColorClass="stroke-amber-400"
              mainText={metrics.mainTextAgotados}
              subText={metrics.subTextAgotados}
              subTextColorClass="text-amber-300/90"
            />

            {/* Tarjeta 4: BULTOS CONTROLADOS */}
            <DonutCard
              title="Bultos Controlados"
              percent={metrics.pctBultos}
              strokeColorClass="stroke-purple-400"
              mainText={metrics.mainTextBultos}
              subText={metrics.subTextBultos}
              subTextColorClass="text-purple-300/90"
            />
          </div>
        </div>

        {/* Separador Visual Tecnológico entre Métricas y Rendimiento por Colaborador */}
        <div className="border-t border-sky-500/25 my-4 shadow-[0_1px_8px_rgba(56,189,248,0.15)]" />

        {/* 2. RENDIMIENTO POR COLABORADOR (BARRAS DE PROGRESO DIRECTAS SOBRE EL FONDO AZUL) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Rendimiento por Colaborador</span>
            </span>
            <span className="text-[10px] font-mono text-sky-300 font-bold px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 rounded-full">
              {sortedProductividad.length} Operario{sortedProductividad.length === 1 ? '' : 's'}
            </span>
          </div>

          {sortedProductividad.length === 0 ? (
            <p className="text-xs font-mono text-slate-400 text-center py-3 bg-[#05132d]/80 border border-sky-500/20 rounded-2xl backdrop-blur-sm">
              No se han registrado escaneos detallados de operarios aún.
            </p>
          ) : (
            <div className="space-y-2.5">
              {sortedProductividad.map((p, idx) => (
                <div key={idx} className="bg-[#05132d]/80 border border-sky-500/20 rounded-2xl p-3 shadow-md space-y-2 backdrop-blur-sm">
                  {/* Fila Nombre y Total Escaneado con formato claro */}
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center space-x-2 truncate min-w-0 flex-1">
                      <div className="p-1 bg-[#020b18] border border-sky-500/30 rounded-lg text-sky-400 shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-['Chakra_Petch'] font-bold text-white uppercase tracking-wide truncate">
                        {p.colaborador_nombre}
                      </span>
                    </div>

                    <span className="font-mono text-xs text-sky-300 font-bold shrink-0">
                      {formatNumber(p.totalUnidades)} un ({p.totalEscaneos} {p.totalEscaneos === 1 ? 'escaneo' : 'escaneos'}) <span className="text-emerald-400 font-extrabold">• {p.porcentajeCalculado}%</span>
                    </span>
                  </div>

                  {/* Barra de Progreso por Aporte */}
                  <div className="w-full bg-[#0a254a] rounded-full h-2.5 overflow-hidden border border-sky-500/20 p-0.5 shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out shadow-sm shadow-emerald-400/30"
                      style={{ width: `${p.porcentajeCalculado}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Separador Visual Tecnológico entre Rendimiento por Colaborador y Pestañas de Filtro */}
        <div className="border-t border-sky-500/25 my-4 shadow-[0_1px_8px_rgba(56,189,248,0.15)]" />

        {/* 3. TABS Y LISTADO DESGLOSADO DE CONCILIACIÓN */}
        <div className="space-y-2.5">
          {/* Tabs de Filtro Rápido con Íconos Oficiales */}
          <div className="grid grid-cols-5 p-1 bg-[#040e21] border border-sky-500/20 rounded-xl text-xs font-semibold gap-1">
            <button
              type="button"
              onClick={() => setFilterTab('DIFERENCIAS')}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                filterTab === 'DIFERENCIAS' ? 'bg-blue-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <img src="/diferencia.png" alt="Diferencias" className="w-4 h-4 object-contain shrink-0" />
              <span className="truncate">Diferencias</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('NO_CONTADOS')}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                filterTab === 'NO_CONTADOS' 
                  ? 'bg-amber-600 text-white shadow-md font-bold' 
                  : resumen.skusNoContados > 0
                  ? 'text-amber-400 font-bold hover:text-amber-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <img src="/pendiente.png" alt="No Contados" className="w-4 h-4 object-contain shrink-0" />
              <span className="truncate">No Contados ({resumen.skusNoContados})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('AGOTADOS')}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                filterTab === 'AGOTADOS' ? 'bg-blue-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <img src="/agotado.png" alt="Agotados" className="w-4 h-4 object-contain shrink-0" />
              <span className="truncate">Agotados ({resumen.skusAgotadosTransito})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('DANADOS')}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                filterTab === 'DANADOS' ? 'bg-red-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <PackageX className="w-4 h-4 text-red-400 shrink-0" />
              <span className="truncate">Dañados</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('TODOS')}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                filterTab === 'TODOS' ? 'bg-blue-600 text-white shadow-md font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">Todos ({scopedItems.length})</span>
            </button>
          </div>

          {/* Input de Búsqueda */}
          <div className="relative">
            <Search className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en el informe..."
              className="w-full pl-9 pr-3 py-2 bg-[#040e21] border border-sky-500/20 text-slate-200 text-xs rounded-xl focus:outline-none focus:border-sky-400"
            />
          </div>

          {/* Tarjetas de Productos en la Conciliación */}
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-[#040e21] rounded-xl border border-sky-500/20">
                No hay productos en esta categoría de conciliación.
              </div>
            ) : (
              filteredItems.map((item) => {
                const uEsp = Number(item.unidades_esperadas || 0);
                const bEsp = Number(item.bultos_esperados || 0);
                const bEsc = Number(item.bultos_escaneados || 0);
                const uEscRaw = Number(item.unidades_escaneadas || 0);

                const totalFisicoEscaneado = Number(calcularUnidadesFisicasItem(item).toFixed(3));
                const diferencia = Number((totalFisicoEscaneado - uEsp).toFixed(3));

                const isSobranteNoFact = item.es_sobrante_no_facturado || (item.depto_codigo && parseInt(item.depto_codigo, 10) === 999);

                const esFaltante = diferencia < 0 && !isSobranteNoFact;
                const esSobrante = diferencia > 0 && uEsp > 0 && !isSobranteNoFact;
                const esNoFacturado = isSobranteNoFact;
                const esConforme = diferencia === 0 && !isSobranteNoFact;

                return (
                  <div 
                    key={item.id || item.upc}
                    className={`bg-[#051329]/90 border rounded-xl p-3 space-y-2 text-xs shadow-sm ${
                      esFaltante
                        ? 'border-red-500/50 bg-red-950/20'
                        : esSobrante
                        ? 'border-amber-500/50 bg-amber-950/20'
                        : esNoFacturado
                        ? 'border-purple-500/50 bg-purple-950/20'
                        : 'border-sky-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 bg-[#0c244d] border border-sky-500/30 text-sky-200 text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg inline-block mb-1">
                          {isSobranteNoFact
                            ? '999 - DESCONOCIDO'
                            : item.depto_codigo 
                            ? `${item.depto_codigo} - ${item.depto_nombre || 'GENERAL'}` 
                            : (item.depto_nombre || 'GENERAL')}
                        </span>
                        <h4 className="font-bold text-white text-xs leading-tight">{item.descripcion}</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {item.sku} | UPC: {item.upc}</p>
                      </div>

                      <div className="text-right shrink-0">
                        {esFaltante && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 font-bold rounded text-[10px]">
                            Faltante: {formatNumber(Math.abs(diferencia))}u
                          </span>
                        )}
                        {esSobrante && (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 font-bold rounded text-[10px]">
                            Sobrante: +{formatNumber(diferencia)}u
                          </span>
                        )}
                        {esNoFacturado && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 font-bold rounded text-[10px]">
                            No Facturado (+{formatNumber(totalFisicoEscaneado)}u)
                          </span>
                        )}
                        {esConforme && (
                          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 text-white font-bold shrink-0 animate-scale-up" title="100% Conforme">
                            <Check className="w-5 h-5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-sky-500/10 text-[11px] text-slate-400">
                      <span>Bultos: {formatNumber(item.bultos_escaneados)} / {formatNumber(item.bultos_esperados)}</span>
                      <span>Unidades: <strong className="text-white">{formatNumber(totalFisicoEscaneado)}</strong> / {formatNumber(uEsp)}</span>
                    </div>

                    {/* Desglose de Mercadería Dañada si aplica */}
                    {(Number(item.cantidad_danada || 0) > 0 || Boolean(item.observacion_dano) || parseFotoUrls(item.foto_dano_url || item.fotos_dano_urls).length > 0) && (
                      <div className="mt-2 p-2.5 bg-red-950/40 border border-red-500/40 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between font-bold text-red-300">
                          <span className="flex items-center space-x-1.5">
                            <PackageX className="w-4 h-4 text-red-400 shrink-0" />
                            <span>Mercadería Dañada / Rota:</span>
                            <strong className="text-white font-mono">{formatNumber(item.cantidad_danada)} un</strong>
                          </span>

                          {Boolean(item.costo_unitario) && (
                            <span className="text-amber-300 font-mono text-[11px]">
                              Monto: ${(Number(item.cantidad_danada || 0) * Number(item.costo_unitario || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>

                        {item.observacion_dano && (
                          <p className="text-[11px] text-red-200 bg-red-900/30 p-2 rounded-lg border border-red-500/20 italic">
                            " {item.observacion_dano} "
                          </p>
                        )}

                        {parseFotoUrls(item.foto_dano_url || item.fotos_dano_urls).length > 0 && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {parseFotoUrls(item.foto_dano_url || item.fotos_dano_urls).map((url, idx) => (
                              <div 
                                key={idx}
                                onClick={() => setSelectedPhotoUrl(url)}
                                className="relative aspect-square rounded-xl overflow-hidden border border-red-500/40 bg-black/60 cursor-pointer group shadow-inner"
                              >
                                <img 
                                  src={url} 
                                  alt={`Evidencia daño ${idx + 1}`} 
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                                />
                                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all flex items-center justify-center">
                                  <span className="px-1.5 py-0.5 bg-black/70 text-white font-bold text-[9px] rounded-full border border-white/20 backdrop-blur-sm">
                                    🔍 #{idx + 1}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(item.foto_upc_url || item.foto_frente_url) && (
                      <div className="mt-2 p-2.5 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-1 text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <span>📷 Evidencia Producto Sin Catalogar:</span>
                        </span>
                        <div className="flex items-center gap-2 pt-1">
                          {item.foto_upc_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhotoUrl(item.foto_upc_url!);
                              }}
                              className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/30 transition-colors"
                            >
                              <span>📷 Foto UPC</span>
                            </button>
                          )}
                          {item.foto_frente_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhotoUrl(item.foto_frente_url!);
                              }}
                              className="px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-sky-500/30 transition-colors"
                            >
                              <span>📷 Foto Frente</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );

              })
            )}
          </div>
        </div>

        {/* MODAL VISOR DE FOTO DE EVIDENCIA DE DAÑO */}
        {selectedPhotoUrl && (
          <div 
            onClick={() => setSelectedPhotoUrl(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in cursor-pointer"
          >
            <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-3 shadow-2xl space-y-3">
              <div className="flex items-center justify-between px-2 pt-1">
                <h3 className="font-['Chakra_Petch'] font-black text-sm text-red-400 uppercase tracking-wider flex items-center space-x-2">
                  <PackageX className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Evidencia de Mercadería Dañada / Rota</span>
                </h3>
                <button 
                  onClick={() => setSelectedPhotoUrl(null)}
                  className="p-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="w-full max-h-[70vh] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-slate-800">
                <img src={selectedPhotoUrl} alt="Foto evidencia" className="max-w-full max-h-[70vh] object-contain" />
              </div>

              <p className="text-center text-xs text-slate-400 font-mono">
                Haz clic fuera o presiona la X para cerrar
              </p>
            </div>
          </div>
        )}
      </main>

      {/* CÁPSULA FLOTANTE "FINALIZAR PARCIAL" Y "FINALIZAR AUDITORÍA" (SOLO EN PROCESO / PENDIENTE) */}
      {camion?.estado !== 'FINALIZADO' && camion?.estado !== 'CERRADO' && camion?.estado !== 'CERRADO_PARCIAL' && camion?.estado !== 'FINALIZADO_PARCIAL' && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            disabled={!isOnline}
            onClick={() => setIsConfirmPartialCloseOpen(true)}
            className="px-4 py-2.5 bg-[#1a1202]/95 hover:bg-amber-950/90 hover:text-amber-200 border border-amber-500/60 text-amber-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-full shadow-lg shadow-amber-950/50 backdrop-blur-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Finalizar Parcial</span>
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={() => setIsConfirmCloseOpen(true)}
            className="px-4 py-2.5 bg-slate-900/95 hover:bg-red-950/80 hover:text-red-200 hover:border-red-400 border border-red-500/50 text-red-300 font-['Chakra_Petch'] font-semibold text-xs uppercase tracking-wider rounded-full shadow-lg shadow-red-950/40 backdrop-blur-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4 text-red-400" />
            <span>Finalizar Auditoría</span>
          </button>

        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE CIERRE PARCIAL */}
      {isConfirmPartialCloseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-white font-['Chakra_Petch'] uppercase tracking-wide">
                CERRAR AUDITORÍA PARCIAL
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-[#05132d] p-3 rounded-xl border border-amber-500/20 text-left">
                ¿Confirmas el cierre parcial de este camión? Únicamente se calcularán faltantes, sobrantes y roturas de los artículos efectivamente escaneados (conteo &gt; 0 o rotura &gt; 0). Todos los ítems sin contar quedarán excluidos de los reclamos y no sumarán diferencias monetarias.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmPartialCloseOpen(false)}
                disabled={isClosing}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmPartialClose}
                disabled={isClosing}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5"
              >
                {isClosing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>CONFIRMAR CIERRE PARCIAL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE CIERRE */}
      {isConfirmCloseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-white">¿Cerrar Auditoría de Camión?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Se cambiará el estado del NAE <strong className="text-white">{camion?.numero_nae}</strong> a <code className="text-red-400 font-bold">CERRADO</code>. No se registrarán nuevos escaneos.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setIsConfirmCloseOpen(false)}
                disabled={isClosing}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmClose}
                disabled={isClosing}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5"
              >
                {isClosing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sí, Cerrar NAE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE REAPERTURA */}
      {isConfirmReopenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto">
              <RotateCcw className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-white">¿Reabrir Auditoría de Camión?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                El estado del NAE <strong className="text-white">{camion?.numero_nae}</strong> pasará a <code className="text-amber-400 font-bold">EN PROCESO</code>. Podrás continuar escaneando y sumando bultos conservando todos los avances.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setIsConfirmReopenOpen(false)}
                disabled={isReopening}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmReopen}
                disabled={isReopening}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5"
              >
                {isReopening ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Sí, Reabrir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESULTADO / FEEDBACK DE CIERRE DE AUDITORÍA */}
      {closeSuccess && closeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center">
            {closeResult.es100Conforme ? (
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
            ) : (
              <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
            )}

            <div>
              <h3 className="font-extrabold text-base text-white font-['Chakra_Petch'] uppercase tracking-wide">
                {closeResult.es100Conforme ? 'Camión 100% Conforme' : 'Auditoría Cerrada'}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-[#05132d] p-3 rounded-xl border border-sky-500/20">
                {closeResult.mensaje}
              </p>
            </div>

            {!closeResult.es100Conforme && (
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 font-mono">
                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                  Faltantes: <strong className="text-red-400">{closeResult.cantFaltantes}</strong>
                </div>
                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                  Sobrantes: <strong className="text-amber-400">{closeResult.cantSobrantes}</strong>
                </div>
                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                  Dañados: <strong className="text-rose-400">{closeResult.cantDaniados}</strong>
                </div>
                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                  Sin contar: <strong className="text-sky-400">{closeResult.cantSinContar}</strong>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCloseSuccess(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95"
            >
              Entendido / Continuar
            </button>
          </div>
        </div>
      )}

      {/* CÁPSULA NAVEGACIÓN FLOTANTE INFERIOR GDS */}
      <BottomNavCapsule
        onBack={onBackToScan}
        showScan={false}
        onHome={onHome}
      />

      {/* CORTINA / OVERLAY PREVENTIVO DE CONEXIÓN PERDIDA EN DEPÓSITO */}
      {!isOnline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mx-auto text-rose-400 animate-bounce">
              <WifiOff className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white font-['Chakra_Petch'] uppercase tracking-wide">
                ⚠️ Conexión Perdida en Depósito
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                El escaneo se encuentra en pausa preventiva para no perder registros. Por favor, acércate a una zona con cobertura Wi-Fi.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                <span>Esperando re-conexión de red...</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

