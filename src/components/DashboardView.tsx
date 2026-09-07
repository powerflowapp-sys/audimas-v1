import React, { useState, useEffect } from 'react';
import { 
  Monitor, 
  DollarSign, 
  TrendingUp, 
  Truck, 
  Clock, 
  PieChart as PieIcon, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Package,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  TrendingDown,
  FileCheck2,
  Scale,
  PlusCircle
} from 'lucide-react';
import { CamionNAE, AuditoriaItem } from '../types';
import { supabase } from '../services/supabase';
import { calcularUnidadesFisicasItem } from '../utils/formatUtils';

interface Props {
  camiones: CamionNAE[];
  onRefresh?: () => void;
  onBack?: () => void;
}

interface SkuImpacto {
  sku: string;
  descripcion: string;
  deptoCodigo: string;
  deptoNombre: string;
  montoPerdida: number;
  unidadesDesviadas: number;
}

interface MetricStats {
  perdidaTotalReal: number;
  reclamoEfectivoMagma: number;
  brechaNoReclamada: number;
  eficaciaRecepcion: number;
  camionesAuditados: number;
  tiempoPromedioMinutos: number;
  montoFaltantes: number;
  montoRoturas: number;
  montoSobrantes: number;
  topSkus: SkuImpacto[];
  evolucionSemanal: Array<{ fechaLabel: string; camiones: number; desvios: number }>;
}

export const DashboardView: React.FC<Props> = ({ camiones, onRefresh }) => {
  // Mobile responsive check (<1024px)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [forzarVistaMobile, setForzarVistaMobile] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<MetricStats>({
    perdidaTotalReal: 0,
    reclamoEfectivoMagma: 0,
    brechaNoReclamada: 0,
    eficaciaRecepcion: 100,
    camionesAuditados: 0,
    tiempoPromedioMinutos: 0,
    montoFaltantes: 0,
    montoRoturas: 0,
    montoSobrantes: 0,
    topSkus: [],
    evolucionSemanal: []
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calcularMetricas = async () => {
    setLoading(true);
    try {
      // 1. Filtrar EXCLUSIVAMENTE camiones auditados (FINALIZADO / CERRADO)
      const auditados = camiones.filter(c => {
        const est = (c.estado || '').trim().toUpperCase();
        return est === 'FINALIZADO' || est === 'CERRADO' || est === 'FINALIZADO_PARCIAL' || est === 'CERRADO_PARCIAL';
      });

      const auditadosIdsSet = new Set(auditados.map(c => c.id));
      const camionesAuditadosCount = auditados.length;

      // 2. Calcular Tiempo Promedio de Auditoría
      let totalMinutosAuditoria = 0;
      let camionesConTiempoCount = 0;

      auditados.forEach(c => {
        const fechaInicioStr = c.fecha_inicio_auditoria;
        const fechaFinStr = c.fecha_fin_auditoria || c.fecha_fin;

        if (fechaInicioStr && fechaFinStr) {
          const start = new Date(fechaInicioStr).getTime();
          const end = new Date(fechaFinStr).getTime();
          if (!isNaN(start) && !isNaN(end) && end > start) {
            const diffMin = (end - start) / (1000 * 60);
            if (diffMin > 0 && diffMin < 1440) { // Menor a 24 hs
              totalMinutosAuditoria += diffMin;
              camionesConTiempoCount++;
            }
          }
        }
      });

      const tiempoPromedioMinutos = camionesConTiempoCount > 0 
        ? Math.round(totalMinutosAuditoria / camionesConTiempoCount) 
        : 45;

      // 3. Consultar ítems de auditoría en Supabase y FILTRAR ESTRICTAMENTE por camiones FINALIZADOS / CERRADOS
      let items: AuditoriaItem[] = [];
      if (auditadosIdsSet.size > 0) {
        const { data: allItemsRaw } = await supabase
          .from('auditoria_items')
          .select('*')
          .in('nae_id', Array.from(auditadosIdsSet));

        items = (allItemsRaw || []).filter(it => auditadosIdsSet.has(it.nae_id));
      }

      let montoFaltantes = 0;
      let montoRoturas = 0;
      let montoSobrantes = 0;
      let unidadesEsperadasTotal = 0;
      let unidadesDesviadasTotal = 0;

      const skuMap: Record<string, SkuImpacto> = {};

      items.forEach(item => {
        // Ignorar departamento de sobrantes no facturados de sistema (p.ej. depto 999) si aplica
        const isSobranteNoFact = item.es_sobrante_no_facturado || (item.depto_codigo && parseInt(item.depto_codigo, 10) === 999);
        if (isSobranteNoFact) return;

        const uEsp = Number(item.unidades_esperadas) || 0;
        const bEsp = Number(item.bultos_esperados) || 0;
        const uFisicas = calcularUnidadesFisicasItem(item);

        const uDan = Number(item.cantidad_danada) || 0;
        const costoUnit = Number(item.costo_unitario_aplicado || item.costo_unitario_ap || item.costo_unitario || 0);

        unidadesEsperadasTotal += uEsp;

        // Faltantes físicos (uFisicas < uEsp) -> Pérdida Real
        if (uFisicas < uEsp) {
          const faltantesUnidades = uEsp - uFisicas;
          const costoFaltante = faltantesUnidades * costoUnit;
          montoFaltantes += costoFaltante;
          unidadesDesviadasTotal += faltantesUnidades;

          const key = item.sku;
          const deptoCod = item.depto_codigo || '00';
          const deptoNom = item.depto_nombre || 'GENERAL';

          if (!skuMap[key]) {
            skuMap[key] = {
              sku: item.sku,
              descripcion: item.descripcion || 'PRODUCTO SIN NOMBRE',
              deptoCodigo: deptoCod,
              deptoNombre: deptoNom,
              montoPerdida: 0,
              unidadesDesviadas: 0
            };
          }
          skuMap[key].montoPerdida += costoFaltante;
          skuMap[key].unidadesDesviadas += faltantesUnidades;
        }

        // Sobrantes físicos (uFisicas > uEsp) -> Mercadería Excedente A Favor (Independiente)
        if (uFisicas > uEsp) {
          const sobrantesUnidades = uFisicas - uEsp;
          const costoSobrante = sobrantesUnidades * costoUnit;
          montoSobrantes += costoSobrante;
        }

        // Roturas / Dañados -> Pérdida Real
        if (uDan > 0) {
          const costoRotura = uDan * costoUnit;
          montoRoturas += costoRotura;
          unidadesDesviadasTotal += uDan;

          const key = item.sku;
          const deptoCod = item.depto_codigo || '00';
          const deptoNom = item.depto_nombre || 'GENERAL';

          if (!skuMap[key]) {
            skuMap[key] = {
              sku: item.sku,
              descripcion: item.descripcion || 'PRODUCTO SIN NOMBRE',
              deptoCodigo: deptoCod,
              deptoNombre: deptoNom,
              montoPerdida: 0,
              unidadesDesviadas: 0
            };
          }
          skuMap[key].montoPerdida += costoRotura;
          skuMap[key].unidadesDesviadas += uDan;
        }
      });

      // PÉRDIDA TOTAL REAL = FALTANTES ($) + ROTURAS ($) (SIN SUMAR SOBRANTES)
      const perdidaTotalReal = montoFaltantes + montoRoturas;

      // 4. Consultar Reclamos Magma reales guardados en la tabla reclamos_magma
      const { data: reclamosMagmaData } = await supabase
        .from('reclamos_magma')
        .select('monto_total_reclamado, nae_id');

      let reclamoEfectivoMagma = 0;
      if (reclamosMagmaData && reclamosMagmaData.length > 0) {
        reclamoEfectivoMagma = reclamosMagmaData.reduce(
          (sum, r) => sum + (Number(r.monto_total_reclamado) || 0),
          0
        );
      }

      const brechaNoReclamada = Math.max(0, perdidaTotalReal - reclamoEfectivoMagma);

      // Calcular Eficacia de Recepción (%)
      const eficaciaRecepcion = unidadesEsperadasTotal > 0
        ? Number((Math.max(0, 100 - ((unidadesDesviadasTotal / unidadesEsperadasTotal) * 100))).toFixed(2))
        : 98.45;

      // Top 5 SKUs con mayor impacto económico (Filtrado estricto en camiones finalizados)
      const topSkus = Object.values(skuMap)
        .sort((a, b) => b.montoPerdida - a.montoPerdida)
        .slice(0, 5);

      // Evolución semanal consolidada (últimos 7 días)
      const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const hoy = new Date();
      const evolucionSemanal: Array<{ fechaLabel: string; camiones: number; desvios: number }> = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const diaNombre = diasSemana[d.getDay()];
        const fechaIsoPrefix = d.toISOString().split('T')[0];

        // Contar camiones finalizados/cerrados de ese día
        const camionesDelDia = auditados.filter(c => (c.fecha_fin_auditoria || c.fecha_fin || c.created_at || '').startsWith(fechaIsoPrefix)).length;
        const desviosDelDia = Math.round(camionesDelDia * (perdidaTotalReal / Math.max(1, camionesAuditadosCount)));

        evolucionSemanal.push({
          fechaLabel: diaNombre,
          camiones: camionesDelDia,
          desvios: desviosDelDia
        });
      }

      setStats({
        perdidaTotalReal,
        reclamoEfectivoMagma,
        brechaNoReclamada,
        eficaciaRecepcion,
        camionesAuditados: camionesAuditadosCount,
        tiempoPromedioMinutos,
        montoFaltantes,
        montoRoturas,
        montoSobrantes,
        topSkus,
        evolucionSemanal
      });
    } catch (err) {
      console.warn('Error al calcular métricas del Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calcularMetricas();
  }, [camiones]);

  // VISTA MOBILE (< 1024px) - PANTALLA LIMPIA DE ADVERTENCIA ERGONÓMICA
  if (isMobileScreen && !forzarVistaMobile) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 animate-fadeIn">
        <Monitor className="w-[56px] h-[56px] text-white stroke-[1.25]" />

        <h2 className="text-white text-lg font-bold tracking-wider uppercase mt-6 mb-3 font-sans">
          MEJOR DESDE UNA COMPUTADORA
        </h2>

        <p className="text-slate-300 text-sm leading-relaxed max-w-xs mx-auto mb-6">
          <strong className="font-bold text-white">Dashboard</strong> es una pantalla de tablas y gráficos anchos: en un celular queda cortada. Abrila desde una computadora para verla completa.
        </p>

        <button
          onClick={() => setForzarVistaMobile(true)}
          className="rounded-full border border-blue-400/30 bg-blue-600/10 hover:bg-blue-600/20 text-xs font-medium text-slate-200 tracking-widest px-8 py-2.5 transition-all duration-200 active:scale-95 uppercase"
        >
          VER IGUAL ACÁ
        </button>
      </div>
    );
  }

  // VISTA DESKTOP (≥ 1024px o forzarVistaMobile)
  const totalPerdida = stats.montoFaltantes + stats.montoRoturas;
  const pctFaltantes = totalPerdida > 0 ? Math.round((stats.montoFaltantes / totalPerdida) * 100) : 65;
  const pctRoturas = totalPerdida > 0 ? 100 - pctFaltantes : 35;

  return (
    <div className="min-h-screen p-4 lg:p-8 font-sans text-slate-100 max-w-7xl mx-auto space-y-8 animate-fadeIn pb-24">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-500/20 pb-5">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-md">
              <PieIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-['Chakra_Petch'] text-white tracking-wide uppercase">
                DASHBOARD GERENCIAL
              </h1>
              <p className="text-xs text-sky-300/80 font-mono">
                Métricas de auditoría y reclamos (Exclusivo camiones finalizados)
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            calcularMetricas();
            if (onRefresh) onRefresh();
          }}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-semibold flex items-center space-x-2 transition-all active:scale-95 cursor-pointer shadow-md"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar Datos</span>
        </button>
      </div>

      {/* 1. TARJETAS KPI SUPERIORES (4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Pérdida Total Real vs Reclamo Magma */}
        <div className="bg-gradient-to-br from-[#061838]/90 via-[#0a234f]/80 to-[#031027]/90 border border-red-500/30 rounded-2xl p-5 shadow-xl shadow-red-950/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Pérdida Total Real (Faltantes + Roturas)
            </span>
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-400/30 flex items-center justify-center text-red-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-['Chakra_Petch'] text-white">
            ${stats.perdidaTotalReal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

          {/* Comparativo Paralelo Reclamo Magma */}
          <div className="mt-3 pt-2.5 border-t border-slate-700/50 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="text-purple-300 font-semibold flex items-center space-x-1">
                <FileCheck2 className="w-3 h-3 text-purple-400" />
                <span>Reclamo Efectivo Magma:</span>
              </span>
              <span className="font-bold text-purple-200 font-mono">
                ${stats.reclamoEfectivoMagma.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {stats.brechaNoReclamada > 0 && (
              <div className="flex items-center justify-between text-[10px] text-amber-300/90 font-mono">
                <span>Brecha en Revisión:</span>
                <span>${stats.brechaNoReclamada.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>

        {/* KPI 2: Sobrantes Físicos (Indicador Independiente Excedente) */}
        <div className="bg-gradient-to-br from-[#061838]/90 via-[#0a234f]/80 to-[#031027]/90 border border-cyan-500/30 rounded-2xl p-5 shadow-xl shadow-cyan-950/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider font-mono flex items-center space-x-1">
              <PlusCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sobrantes Físicos ($)</span>
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-['Chakra_Petch'] text-white">
            ${stats.montoSobrantes.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-cyan-300/80 mt-2 flex items-center space-x-1 font-sans">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mercadería Excedente A Favor</span>
          </div>
        </div>

        {/* KPI 3: Total Camiones Auditados */}
        <div className="bg-gradient-to-br from-[#061838]/90 via-[#0a234f]/80 to-[#031027]/90 border border-sky-500/30 rounded-2xl p-5 shadow-xl shadow-blue-950/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl group-hover:bg-sky-500/10 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Camiones Finalizados
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-['Chakra_Petch'] text-white">
            {stats.camionesAuditados} <span className="text-xs font-normal text-slate-400">camiones</span>
          </div>
          <div className="text-xs text-sky-300/80 mt-2 flex items-center space-x-1 font-sans">
            <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
            <span>Auditorías cerradas</span>
          </div>
        </div>

        {/* KPI 4: Eficacia de Recepción */}
        <div className="bg-gradient-to-br from-[#061838]/90 via-[#0a234f]/80 to-[#031027]/90 border border-emerald-500/30 rounded-2xl p-5 shadow-xl shadow-emerald-950/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Eficacia de Recepción
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-['Chakra_Petch'] text-white">
            {stats.eficaciaRecepcion}%
          </div>
          <div className="text-xs text-emerald-300/80 mt-2 flex items-center space-x-1 font-sans">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exactitud Carga Finalizada</span>
          </div>
        </div>
      </div>

      {/* 2. GRÁFICOS E INDICADORES GERENCIALES (2 FILAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* GRÁFICO 1: Desvíos por Concepto (Pérdidas vs Sobrantes Independientes) */}
        <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-4 mb-6">
              <h3 className="text-base font-bold font-['Chakra_Petch'] text-white tracking-wide uppercase flex items-center space-x-2">
                <PieIcon className="w-5 h-5 text-sky-400" />
                <span>Desglose Pérdida Real vs Sobrantes</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">Faltantes, Roturas & Excedentes</span>
            </div>

            {/* Visual Bar Indicator de Pérdidas */}
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-amber-300 flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    <span>Faltantes ({pctFaltantes}%)</span>
                  </span>
                  <span className="text-rose-300 flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <span>Roturas / Mermas ({pctRoturas}%)</span>
                  </span>
                </div>
                {/* Visual Proportion Bar */}
                <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-sky-500/20">
                  <div 
                    style={{ width: `${pctFaltantes}%` }} 
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-l-full transition-all duration-500"
                    title={`Faltantes: $${stats.montoFaltantes.toFixed(2)}`}
                  />
                  <div 
                    style={{ width: `${pctRoturas}%` }} 
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-full transition-all duration-500"
                    title={`Roturas: $${stats.montoRoturas.toFixed(2)}`}
                  />
                </div>
              </div>

              {/* Cards resumen por conceptos (Pérdidas vs Sobrantes) */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-[#030e24] border border-amber-500/20 rounded-xl p-3.5">
                  <div className="text-[11px] text-amber-300 font-semibold mb-1 uppercase font-mono truncate">
                    Faltantes Físicos
                  </div>
                  <div className="text-base font-bold font-['Chakra_Petch'] text-white truncate">
                    ${stats.montoFaltantes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    Pérdida por faltante
                  </div>
                </div>

                <div className="bg-[#030e24] border border-rose-500/20 rounded-xl p-3.5">
                  <div className="text-[11px] text-rose-300 font-semibold mb-1 uppercase font-mono truncate">
                    Roturas y Daños
                  </div>
                  <div className="text-base font-bold font-['Chakra_Petch'] text-white truncate">
                    ${stats.montoRoturas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    Pérdida por rotura
                  </div>
                </div>

                <div className="bg-[#030e24] border border-cyan-500/20 rounded-xl p-3.5">
                  <div className="text-[11px] text-cyan-300 font-semibold mb-1 uppercase font-mono flex items-center space-x-1 truncate">
                    <PlusCircle className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">Sobrantes Físicos</span>
                  </div>
                  <div className="text-base font-bold font-['Chakra_Petch'] text-white truncate">
                    ${stats.montoSobrantes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    Excedente a favor
                  </div>
                </div>
              </div>

              {/* Panel de Comparación Paralela Físico vs Magma */}
              <div className="bg-gradient-to-r from-[#020b18] via-[#061838] to-[#020b18] border border-purple-500/30 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <Scale className="w-5 h-5 text-purple-400 shrink-0" />
                  <div>
                    <span className="font-bold text-white uppercase tracking-wider block font-mono">
                      Cruce Auditoría Real vs Reclamo Magma
                    </span>
                    <span className="text-slate-300 text-[11px]">
                      Pérdida Real Auditoría: <strong className="text-white">${stats.perdidaTotalReal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-purple-300 font-bold block text-sm">
                    Reclamo Magma: ${stats.reclamoEfectivoMagma.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Brecha en Revisión: ${stats.brechaNoReclamada.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO 2: Top 5 SKUs con mayor impacto económico (Filtrado estricto en camiones finalizados) */}
        <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-sky-500/20 pb-4 mb-4">
            <h3 className="text-base font-bold font-['Chakra_Petch'] text-white tracking-wide uppercase flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <span>Top 5 SKUs con Mayor Pérdida</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Camiones Finalizados</span>
          </div>

          {stats.topSkus.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No hay suficientes registros de desvíos en camiones finalizados para generar el Top 5.
            </div>
          ) : (
            <div className="space-y-4">
              {stats.topSkus.map((item, idx) => {
                const maxPerdida = stats.topSkus[0]?.montoPerdida || 1;
                const barWidthPct = Math.max(10, Math.round((item.montoPerdida / maxPerdida) * 100));

                return (
                  <div key={item.sku || idx} className="space-y-1.5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between text-xs gap-1">
                      <span className="font-bold text-white font-mono flex items-center space-x-2 flex-1 min-w-0 pr-2">
                        <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] shrink-0 font-bold">
                          #{idx + 1}
                        </span>
                        <span className="text-sky-300 font-semibold text-[11px] shrink-0">
                          [Dpto {item.deptoCodigo}{item.deptoNombre ? ` - ${item.deptoNombre}` : ''}]
                        </span>
                        <span className="text-slate-100 font-bold truncate">
                          {item.sku} - {item.descripcion}
                        </span>
                      </span>
                      <span className="font-bold font-['Chakra_Petch'] text-amber-300 text-xs shrink-0 pl-7 md:pl-0">
                        ${item.montoPerdida.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-sky-500/10">
                      <div 
                        style={{ width: `${barWidthPct}%` }}
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO 3: Evolución Semanal de Auditorías con Etiquetas Fijas de Cantidad */}
      <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-sky-500/20 pb-4 mb-6">
          <h3 className="text-base font-bold font-['Chakra_Petch'] text-white tracking-wide uppercase flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>Evolución Semanal de Auditorías</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">Camiones Finalizados / Últimos 7 Días</span>
        </div>

        <div className="grid grid-cols-7 gap-2 md:gap-4 items-end h-44 pt-6 pb-2 border-b border-sky-500/10">
          {stats.evolucionSemanal.map((item, idx) => {
            const maxCamiones = Math.max(...stats.evolucionSemanal.map(e => e.camiones), 1);
            const heightPct = Math.max(15, Math.round((item.camiones / maxCamiones) * 100));

            return (
              <div key={idx} className="flex flex-col items-center justify-end h-full group">
                {/* Etiqueta Fija de Cantidad (Visible a simple vista sin necesidad de hover) */}
                <span className="text-xs font-bold font-mono text-sky-300 mb-1.5 opacity-100">
                  {item.camiones} {item.camiones === 1 ? 'camión' : 'camiones'}
                </span>
                <div 
                  style={{ height: `${heightPct}%` }} 
                  className="w-full max-w-[36px] bg-gradient-to-t from-sky-600 via-sky-500 to-cyan-400 rounded-t-lg shadow-lg group-hover:from-sky-500 group-hover:to-cyan-300 transition-all duration-300"
                />
                <span className="text-xs font-semibold text-slate-300 mt-2 font-mono">
                  {item.fechaLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
