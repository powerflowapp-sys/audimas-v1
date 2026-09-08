import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Edit3, 
  Eye, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  DollarSign, 
  Layers, 
  Tag,
  ArrowRight,
  RefreshCw,
  Building2,
  Calendar,
  Monitor,
  Flame,
  CircleOff,
  Globe
} from 'lucide-react';
import { CamionNAE, ReclamoMagma, EstadoReclamoMagma, AuditoriaItem } from '../types';
import { fetchReclamosMagma, exportarPlanillaReclamoMagmaExcel } from '../services/reclamosService';
import { formatDateTimeArg } from '../services/reportService';
import { ModalGestionTicketMagma } from './ModalGestionTicketMagma';
import { ModalDetalleReclamoMagma } from './ModalDetalleReclamoMagma';
import { supabase } from '../services/supabase';

interface Props {
  camiones: CamionNAE[];
  onRefreshCamiones?: () => void;
}

export const ReclamosMagmaView: React.FC<Props> = ({ camiones, onRefreshCamiones }) => {
  const [reclamos, setReclamos] = useState<ReclamoMagma[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');
  const [filterMonto, setFilterMonto] = useState<'ACTIVOS' | 'CEROS' | 'TODOS'>('ACTIVOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mobile warning state (<1024px)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [forzarVistaMobile, setForzarVistaMobile] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modales
  const [selectedForGestion, setSelectedForGestion] = useState<ReclamoMagma | null>(null);
  const [selectedForDetalle, setSelectedForDetalle] = useState<ReclamoMagma | null>(null);

  // Control de carga concurrente y silent refresh
  const isFetchingRef = React.useRef<boolean>(false);
  const camionesRef = React.useRef<CamionNAE[]>(camiones);
  camionesRef.current = camiones;

  const loadReclamos = React.useCallback(async (silent: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const data = await fetchReclamosMagma(camionesRef.current);
      setReclamos(data);
    } catch (err) {
      console.warn('Error al cargar reclamos:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Carga inicial y ante cambios reales en la lista de camiones
  const prevCamionesSignature = React.useRef<string>('');
  useEffect(() => {
    const signature = (camiones || []).map(c => `${c.id}_${c.estado}`).join('|');
    if (prevCamionesSignature.current !== signature) {
      prevCamionesSignature.current = signature;
      loadReclamos(reclamos.length > 0);
    }
  }, [camiones, loadReclamos, reclamos.length]);

  // Suscripción Realtime aislada a la tabla reclamos_magma con debounce
  useEffect(() => {
    let debounceTimer: any = null;
    const channel = supabase
      .channel('realtime_reclamos_magma_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reclamos_magma' },
        () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadReclamos(true); // Actualización silenciosa en background sin spinner bloqueante
          }, 1200);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadReclamos]);


  if (isMobileScreen && !forzarVistaMobile) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 animate-fadeIn">
        <Monitor className="w-[56px] h-[56px] text-white stroke-[1.25]" />

        <h2 className="text-white text-lg font-bold tracking-wider uppercase mt-6 mb-3 font-sans">
          MEJOR DESDE UNA COMPUTADORA
        </h2>

        <p className="text-slate-300 text-sm leading-relaxed max-w-xs mx-auto mb-6">
          <strong className="font-bold text-white">Reclamos Magma</strong> es una pantalla de tablas anchas: en un celular queda cortada y se vuelve incómoda de leer. Abrila desde una computadora de escritorio para verla completa.
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

  // Filtrado compuesto por Monto, Estado y Búsqueda
  const filteredReclamos = reclamos.filter(r => {
    const monto = Number(r.monto_total_reclamado || 0);

    // Filtro por Monto
    if (filterMonto === 'ACTIVOS' && monto <= 0) return false;
    if (filterMonto === 'CEROS' && monto > 0) return false;

    // Filtro por Estado
    if (filterEstado !== 'TODOS' && r.estado !== filterEstado) return false;

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNae = r.nae_numero.toLowerCase().includes(q);
      const matchTienda = `${r.tienda_codigo} ${r.tienda_nombre}`.toLowerCase().includes(q);
      const matchTicket = (r.ticket_magma || '').toLowerCase().includes(q);
      return matchNae || matchTienda || matchTicket;
    }
    return true;
  });

  // KPIs
  const totalMontoReclamado = reclamos.reduce((sum, r) => sum + (r.monto_total_reclamado || 0), 0);
  const totalMontoLiquidado = reclamos.reduce((sum, r) => sum + (r.monto_liquidado || 0), 0);
  const pendientesCount = reclamos.filter(r => r.estado === 'PENDIENTE' && (r.monto_total_reclamado || 0) > 0).length;
  const reclamadosCount = reclamos.filter(r => r.estado === 'RECLAMADO').length;

  const handleSavedReclamo = (updated: ReclamoMagma) => {
    setReclamos(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleExportQuick = async (r: ReclamoMagma) => {
    try {
      const targetCamion = camiones.find(c => c.id === r.nae_id || c.numero_nae === r.nae_numero);
      const { data: items } = await supabase
        .from('auditoria_items')
        .select('*')
        .eq('nae_id', r.nae_id);

      await exportarPlanillaReclamoMagmaExcel(r, items || [], undefined, targetCamion);
      loadReclamos(true);
    } catch (err) {
      console.warn('Error al exportar rápida:', err);
    }
  };

  const getEstadoBadge = (estado: EstadoReclamoMagma) => {
    switch (estado) {
      case 'PENDIENTE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><Clock className="w-3 h-3" /> PENDIENTE</span>;
      case 'RECLAMADO':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1"><Tag className="w-3 h-3" /> RECLAMADO</span>;
      case 'ACEPTADO':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> ACEPTADO</span>;
      case 'RECHAZADO':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> RECHAZADO</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn pb-24 select-none">
      {/* Header View */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Reclamos Magma</h1>
            <p className="text-sm text-slate-400">Seguimiento de diferencias de auditoría, tickets Magma e historial de tiempos</p>
          </div>
        </div>

        <button
          onClick={() => loadReclamos(false)}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar Reclamos
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Reclamado</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl md:text-2xl font-black text-slate-900">
            ${totalMontoReclamado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 font-medium">{reclamos.filter(r => (r.monto_total_reclamado || 0) > 0).length} auditorías con discrepancia activa</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Monto Liquidado</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl md:text-2xl font-black text-emerald-600">
            ${totalMontoLiquidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">Cobrado en resoluciones</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pendientes de Carga</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl md:text-2xl font-black text-amber-600">
            {pendientesCount} <span className="text-xs font-semibold text-slate-400">casos</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 font-medium">Reclamos sin ticket Magma</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Reclamados en Magma</span>
            <Tag className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl md:text-2xl font-black text-purple-600">
            {reclamadosCount} <span className="text-xs font-semibold text-slate-400">tickets</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 font-medium">En gestión con auditoría</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Search */}
          <div className="relative w-full lg:w-80 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por NAE, Tienda o Ticket..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Filtros de Monto (Reclamo Activo vs $0.00) */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Visibilidad:</span>
            {[
              { id: 'ACTIVOS', label: '🔥 Con Reclamo Activo (> $0)', icon: Flame },
              { id: 'CEROS', label: '⚪ Sin Reclamo ($0.00)', icon: CircleOff },
              { id: 'TODOS', label: '🌐 Todos los Montos', icon: Globe }
            ].map((btn) => {
              const IconComp = btn.icon;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setFilterMonto(btn.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    filterMonto === btn.id
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtros de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Estado:</span>
          {[
            { id: 'TODOS', label: 'Todos los Estados' },
            { id: 'PENDIENTE', label: '⏳ Pendientes' },
            { id: 'RECLAMADO', label: '📑 Reclamados' },
            { id: 'ACEPTADO', label: '✅ Aceptados' },
            { id: 'RECHAZADO', label: '❌ Rechazados' }
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilterEstado(btn.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterEstado === btn.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Responsivo de Tarjetas Magma en 3 Columnas */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-200/80">
          Cargando módulo de reclamos Magma...
        </div>
      ) : filteredReclamos.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200/80 space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No se encontraron reclamos</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {filterMonto === 'ACTIVOS'
              ? 'No hay camiones cerrados con reclamos activos mayores a $0.00 para los filtros seleccionados.'
              : 'No hay reclamos que coincidan con la búsqueda y filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredReclamos.map((rec) => {
            // Resolver el camión original para extraer la fecha del ÚLTIMO cierre
            const targetCamion = camiones.find(c => c.id === rec.nae_id || c.numero_nae === rec.nae_numero);
            const fechaUltimoCierre = targetCamion?.fecha_fin_reapertura || targetCamion?.fecha_fin_auditoria || rec.fecha_cierre_auditoria;

            return (
              <div 
                key={rec.id} 
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Header de Tarjeta */}
                <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2.5 py-1 bg-slate-900 text-white font-black text-xs rounded-lg shrink-0">
                      NAE {rec.nae_numero}
                    </span>
                    <span className="font-bold text-slate-800 text-xs truncate" title={`${rec.tienda_codigo} - ${rec.tienda_nombre}`}>
                      {rec.tienda_codigo} - {rec.tienda_nombre}
                    </span>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    {getEstadoBadge(rec.estado)}
                  </div>
                </div>

                {/* Body de Tarjeta */}
                <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                  {/* Resumen de Montos y Desviación */}
                  <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Monto Reclamado</span>
                      <span className={`text-base font-black ${rec.monto_total_reclamado > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                        ${(rec.monto_total_reclamado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Discrepancias</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">
                        {rec.cant_skus_afectados || 0} SKUs ({rec.cant_unidades_afectadas || 0} un)
                      </span>
                    </div>
                  </div>

                  {/* Ticket Magma si existe */}
                  {rec.ticket_magma && (
                    <div className="px-3 py-1.5 bg-purple-50 border border-purple-200/80 rounded-xl flex items-center justify-between text-xs font-bold text-purple-950">
                      <span className="flex items-center gap-1 text-[11px] text-purple-700">
                        <Tag className="w-3.5 h-3.5 text-purple-600" /> Ticket Magma:
                      </span>
                      <span className="font-mono text-purple-900">{rec.ticket_magma}</span>
                    </div>
                  )}

                  {/* Timeline de 3 Etapas Operativas */}
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Trazabilidad del Reclamo
                    </span>
                    <div className="space-y-1.5">
                      {/* Hito 1: Fin Auditoría (Sincronizado con el ÚLTIMO cierre) */}
                      <div className="p-2 bg-amber-50/60 border border-amber-200/80 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px] font-bold text-amber-950">1. Fin Auditoría</span>
                        </div>
                        <span className="text-[10px] text-amber-800 font-mono font-semibold">
                          {formatDateTimeArg(fechaUltimoCierre)}
                        </span>
                      </div>

                      {/* Hito 2: Reclamado Magma */}
                      <div className={`p-2 border rounded-lg flex items-center justify-between ${
                        rec.fecha_reclamado_magma || rec.ticket_magma ? 'bg-purple-50/60 border-purple-200 text-purple-950' : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <Tag className={`w-3.5 h-3.5 ${rec.fecha_reclamado_magma || rec.ticket_magma ? 'text-purple-600' : 'text-slate-400'}`} />
                          <span className="text-[11px] font-bold">2. Reclamado Magma</span>
                        </div>
                        <span className="text-[10px] font-mono">
                          {rec.fecha_reclamado_magma ? formatDateTimeArg(rec.fecha_reclamado_magma) : (rec.ticket_magma ? 'Registrado' : 'Pendiente')}
                        </span>
                      </div>

                      {/* Hito 3: Dictamen / Resolución */}
                      <div className={`p-2 border rounded-lg flex items-center justify-between ${
                        rec.estado === 'ACEPTADO'
                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                          : rec.estado === 'RECHAZADO'
                          ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {rec.estado === 'ACEPTADO' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : rec.estado === 'RECHAZADO' ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="text-[11px] font-bold">3. Dictamen / Resolución</span>
                        </div>
                        <span className="text-[10px] font-mono">
                          {rec.fecha_resolucion ? formatDateTimeArg(rec.fecha_resolucion) : 'En espera'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer de Tarjeta con Acciones */}
                <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportQuick(rec)}
                    className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    title="Descargar Planilla Excel de Ajuste"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedForGestion(rec)}
                      className="px-3 py-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Ticket Magma</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedForDetalle(rec)}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Detalle Reclamo</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {selectedForGestion && (
        <ModalGestionTicketMagma
          reclamo={selectedForGestion}
          isOpen={!!selectedForGestion}
          onClose={() => setSelectedForGestion(null)}
          onSaved={handleSavedReclamo}
        />
      )}

      {selectedForDetalle && (
        <ModalDetalleReclamoMagma
          reclamo={selectedForDetalle}
          isOpen={!!selectedForDetalle}
          onClose={() => setSelectedForDetalle(null)}
          onExportExcel={() => loadReclamos()}
          onSelectionSaved={(updated) => handleSavedReclamo(updated)}
          camion={camiones.find(c => c.id === selectedForDetalle.nae_id || c.numero_nae === selectedForDetalle.nae_numero)}
        />
      )}
    </div>
  );
};
