import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
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
  User
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { 
  calcularResumenAuditoria, 
  fetchProductividadColaboradores, 
  exportarAuditoriaExcel, 
  cerrarCamionNae,
  calcularDuracionAuditoria
} from '../services/reportService';
import { guardarSnapshotReporte } from '../services/historyService';
import { BottomNavCapsule } from './BottomNavCapsule';
import { CamionNAE, AuditoriaItem, ProductividadColaborador } from '../types';

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
    <div className="bg-[#05132d]/80 border border-sky-500/20 rounded-2xl p-3.5 flex flex-col items-center justify-between text-center shadow-lg backdrop-blur-sm transition-all hover:border-sky-500/40">
      {/* Título Superior */}
      <h4 className="font-sans font-bold text-xs text-slate-200 tracking-normal mb-2 truncate max-w-full leading-tight">
        {title}
      </h4>

      {/* Gráfico Circular SVG Donut (Grueso y Visualmente Impactante) */}
      <div className="relative w-28 h-28 my-1 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Círculo Base de Fondo */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-[#0c2847]"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Círculo de Progreso */}
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

        {/* Porcentaje en el Centro (Tipografía Sans-Serif Geométrica Gruesa) */}
        <span className="absolute font-sans font-black text-xl text-white tracking-tight">
          {validPct}%
        </span>
      </div>

      {/* Textos Inferiores */}
      <div className="mt-2 space-y-0.5 w-full">
        <p className="font-sans font-black text-sm text-white mt-1 truncate">
          {mainText}
        </p>
        <p className={`text-[11px] ${subTextColorClass} font-medium truncate`}>
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
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [productividad, setProductividad] = useState<ProductividadColaborador[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterTab, setFilterTab] = useState<'TODOS' | 'DIFERENCIAS' | 'AGOTADOS'>('DIFERENCIAS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal de Cierre
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [closeSuccess, setCloseSuccess] = useState<boolean>(false);

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

  // Resumen calculado de la auditoría
  const resumen = useMemo(() => calcularResumenAuditoria(items), [items]);

  // Métricas calculadas para la grilla 2x2 de Anillos Donut
  const metrics = useMemo(() => {
    // 1. Unidades Físicas
    const uEsc = resumen.unidadesEscaneadas;
    const uEsp = resumen.unidadesEsperadas;
    const pctUnidades = uEsp > 0 ? Math.min(100, Math.round((uEsc / uEsp) * 100)) : 100;
    const uFaltantes = uEsc >= uEsp ? 0 : (uEsp - uEsc);

    // 2. SKUs Controlados
    const totalSkus = items.length;
    const skusAuditados = items.filter(it => Number(it.unidades_escaneadas || 0) > 0 || it.es_sobrante_no_facturado).length;
    const pctSkus = totalSkus > 0 ? Math.min(100, Math.round((skusAuditados / totalSkus) * 100)) : 100;
    const skusPendientes = Math.max(0, totalSkus - skusAuditados);

    // 3. Agotados en Tránsito
    const totalAgotados = items.filter(it => it.es_agotado_transito).length;
    const agotadosSeparados = items.filter(it => it.es_agotado_transito && Number(it.unidades_escaneadas || 0) > 0).length;
    const pctAgotados = totalAgotados > 0 ? Math.min(100, Math.round((agotadosSeparados / totalAgotados) * 100)) : (totalAgotados === 0 ? 100 : 0);

    // 4. Bultos Auditados
    const bEsc = resumen.bultosEscaneados;
    const bEsp = resumen.bultosEsperados;
    const pctBultos = bEsp > 0 ? Math.min(100, Math.round((bEsc / bEsp) * 100)) : 100;

    return {
      pctUnidades,
      uEsc,
      uEsp,
      uFaltantes,
      pctSkus,
      skusAuditados,
      totalSkus,
      skusPendientes,
      pctAgotados,
      agotadosSeparados,
      totalAgotados,
      pctBultos,
      bEsc,
      bEsp
    };
  }, [items, resumen]);

  // Productividad ordenada de mayor a menor aporte con calculo seguro de porcentaje
  const sortedProductividad = useMemo(() => {
    const totalUnidadesOperarios = productividad.reduce((acc, curr) => acc + curr.totalUnidades, 0);

    return [...productividad]
      .sort((a, b) => b.totalUnidades - a.totalUnidades)
      .map(p => {
        const pct = totalUnidadesOperarios > 0 
          ? Math.min(100, Math.round((p.totalUnidades / totalUnidadesOperarios) * 100)) 
          : (p.porcentajeParticipacion || 0);
        return {
          ...p,
          porcentajeCalculado: pct
        };
      });
  }, [productividad]);

  // Filtrado táctil de la lista
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const uEsc = Number(it.unidades_escaneadas || 0);
      const tieneDiferencia = uEsc !== uEsp || it.es_sobrante_no_facturado;

      if (filterTab === 'DIFERENCIAS' && !tieneDiferencia) return false;
      if (filterTab === 'AGOTADOS' && !it.es_agotado_transito) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        it.descripcion.toLowerCase().includes(q) ||
        it.upc.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q)
      );
    });
  }, [items, filterTab, searchQuery]);

  // Exportar archivo Excel
  const handleExportExcel = () => {
    if (!camion) return;
    exportarAuditoriaExcel(camion, items, productividad);
  };

  // Cierre formal del camión
  const handleConfirmClose = async () => {
    setIsClosing(true);
    try {
      await cerrarCamionNae(naeId);
      if (camion) {
        const camionCerrado: CamionNAE = { 
          ...camion, 
          estado: 'CERRADO', 
          fecha_fin_auditoria: new Date().toISOString() 
        };
        setCamion(camionCerrado);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <p className="text-xs font-bold">Generando conciliación de auditoría...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col font-sans pb-28 select-none">
      
      {/* Header Fijo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 p-3 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2.5">
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider">
                Resumen NAE #{camion?.numero_nae || '---'}
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold ${
                camion?.estado === 'FINALIZADO' || camion?.estado === 'CERRADO' 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                  : camion?.estado === 'EN_PROCESO'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {camion?.estado === 'FINALIZADO' || camion?.estado === 'CERRADO' ? 'FINALIZADO' : camion?.estado === 'EN_PROCESO' ? 'EN PROCESO' : 'PENDIENTE'}
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

          {/* Registro Temporal (Inicio y Fin descarga + Duración) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-300 font-mono px-1">
            <div className="flex items-start space-x-2">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex flex-col space-y-0.5 leading-tight">
                <span>Inicio descarga: {camion?.fecha_inicio_auditoria ? new Date(camion.fecha_inicio_auditoria).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' hs' : 'Sin iniciar'}</span>
                {camion?.fecha_fin_auditoria && (
                  <span>Fin descarga: {new Date(camion.fecha_fin_auditoria).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} hs</span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 self-end sm:self-auto px-2.5 py-1 bg-[#05132d]/80 border border-sky-500/20 rounded-xl backdrop-blur-sm">
              <span className="text-slate-400 text-[10px]">Duración:</span>
              <span className="font-bold text-sky-300 text-xs">
                {calcularDuracionAuditoria(camion?.fecha_inicio_auditoria, camion?.fecha_fin_auditoria)}
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
              mainText={`${metrics.uEsc.toLocaleString()} / ${metrics.uEsp.toLocaleString()} un`}
              subText={`${metrics.uEsc.toLocaleString()} auditadas • ${metrics.uFaltantes.toLocaleString()} falt`}
              subTextColorClass="text-sky-300/90"
            />

            {/* Tarjeta 2: SKUS CONTROLADOS */}
            <DonutCard
              title="SKUs Controlados"
              percent={metrics.pctSkus}
              strokeColorClass="stroke-emerald-400"
              mainText={`${metrics.skusAuditados} / ${metrics.totalSkus} SKUs`}
              subText={`${metrics.skusAuditados} auditados • ${metrics.skusPendientes} pend`}
              subTextColorClass="text-emerald-400/90"
            />

            {/* Tarjeta 3: PRIORIDAD DE GÓNDOLA / AGOTADOS */}
            <DonutCard
              title="Prioridad de Góndola"
              percent={metrics.pctAgotados}
              strokeColorClass="stroke-amber-400"
              mainText={`${metrics.agotadosSeparados} / ${metrics.totalAgotados} SKUs`}
              subText={`${metrics.agotadosSeparados} separados • ${metrics.totalAgotados} a góndola`}
              subTextColorClass="text-amber-300/90"
            />

            {/* Tarjeta 4: BULTOS AUDITADOS */}
            <DonutCard
              title="Bultos Auditados"
              percent={metrics.pctBultos}
              strokeColorClass="stroke-purple-400"
              mainText={`${metrics.bEsc.toLocaleString()} / ${metrics.bEsp.toLocaleString()} bultos`}
              subText="Descarga en muelle"
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
                  {/* Fila Nombre y Total Escaneado */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 truncate">
                      <div className="p-1 bg-[#020b18] border border-sky-500/30 rounded-lg text-sky-400 shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-['Chakra_Petch'] font-bold text-white uppercase tracking-wide truncate">
                        {p.colaborador_nombre}
                      </span>
                    </div>

                    <span className="font-mono text-xs text-sky-300 font-bold shrink-0">
                      {p.totalUnidades.toLocaleString()} un <span className="text-emerald-400 font-extrabold">• {p.porcentajeCalculado}%</span>
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
          {/* Tabs de Filtro Rápido */}
          <div className="grid grid-cols-3 p-1 bg-[#040e21] border border-sky-500/20 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterTab('DIFERENCIAS')}
              className={`py-2 rounded-lg transition-all ${
                filterTab === 'DIFERENCIAS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚠️ Diferencias
            </button>
            <button
              onClick={() => setFilterTab('AGOTADOS')}
              className={`py-2 rounded-lg transition-all ${
                filterTab === 'AGOTADOS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              🚨 Agotados ({resumen.skusAgotadosTransito})
            </button>
            <button
              onClick={() => setFilterTab('TODOS')}
              className={`py-2 rounded-lg transition-all ${
                filterTab === 'TODOS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 Todos ({items.length})
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
                const uEsc = Number(item.unidades_escaneadas || 0);
                const diff = uEsc - uEsp;

                const esFaltante = uEsc < uEsp && !item.es_sobrante_no_facturado;
                const esSobrante = uEsc > uEsp && uEsp > 0;
                const esNoFacturado = item.es_sobrante_no_facturado;

                return (
                  <div 
                    key={item.id || item.upc}
                    className={`bg-[#051329]/90 border rounded-xl p-3 space-y-2 text-xs shadow-sm ${
                      esFaltante
                        ? 'border-red-500/50 bg-red-950/20'
                        : esSobrante
                        ? 'border-yellow-500/50 bg-yellow-950/20'
                        : esNoFacturado
                        ? 'border-purple-500/50 bg-purple-950/20'
                        : 'border-sky-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 bg-[#0c244d] border border-sky-500/30 text-sky-200 text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg inline-block mb-1">
                          {item.es_sobrante_no_facturado || item.depto_codigo === '999'
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
                            Faltante: {diff}u
                          </span>
                        )}
                        {esSobrante && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 font-bold rounded text-[10px]">
                            Sobrante: +{diff}u
                          </span>
                        )}
                        {esNoFacturado && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 font-bold rounded text-[10px]">
                            No Facturado (+{uEsc}u)
                          </span>
                        )}
                        {!esFaltante && !esSobrante && !esNoFacturado && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded text-[10px]">
                            OK / Conforme
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-sky-500/10 text-[11px] text-slate-400">
                      <span>Bultos: {item.bultos_escaneados} / {item.bultos_esperados}</span>
                      <span>Unidades: <strong className="text-white">{item.unidades_escaneadas}</strong> / {item.unidades_esperadas}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* 4. BARRA DE ACCIONES FIJA EN INFERIOR */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#061224]/95 backdrop-blur-md border-t border-sky-500/20 p-3 shadow-2xl">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2.5">
          {/* Botón Exportar Excel */}
          <button
            onClick={handleExportExcel}
            className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Descargar Excel</span>
          </button>

          {/* Botón Cerrar Camión NAE */}
          <button
            onClick={() => setIsConfirmCloseOpen(true)}
            disabled={camion?.estado === 'CERRADO'}
            className="py-3 px-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            <Lock className="w-4 h-4" />
            <span>{camion?.estado === 'CERRADO' ? 'Auditoría Cerrada' : 'Finalizar NAE'}</span>
          </button>
        </div>
      </footer>

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

      {/* CÁPSULA NAVEGACIÓN FLOTANTE INFERIOR GDS */}
      <BottomNavCapsule
        onBack={onBackToScan}
        onHome={onHome}
      />
    </div>
  );
};
