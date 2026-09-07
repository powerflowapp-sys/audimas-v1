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
  Monitor
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

  const loadReclamos = async () => {
    setLoading(true);
    try {
      const data = await fetchReclamosMagma(camiones);
      setReclamos(data);
    } catch (err) {
      console.warn('Error al cargar reclamos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReclamos();
  }, [camiones]);

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

  // Filtrado
  const filteredReclamos = reclamos.filter(r => {
    if (filterEstado !== 'TODOS' && r.estado !== filterEstado) return false;
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
  const pendientesCount = reclamos.filter(r => r.estado === 'PENDIENTE' || r.estado === 'EXPORTADO').length;
  const reclamadosCount = reclamos.filter(r => r.estado === 'RECLAMADO').length;

  const handleSavedReclamo = (updated: ReclamoMagma) => {
    setReclamos(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleExportQuick = async (r: ReclamoMagma) => {
    try {
      const { data: items } = await supabase
        .from('auditoria_items')
        .select('*')
        .eq('nae_id', r.nae_id);

      await exportarPlanillaReclamoMagmaExcel(r, items || []);
      loadReclamos();
    } catch (err) {
      console.warn('Error al exportar rápida:', err);
    }
  };

  const getEstadoBadge = (estado: EstadoReclamoMagma) => {
    switch (estado) {
      case 'PENDIENTE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> PENDIENTE</span>;
      case 'EXPORTADO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> EXPORTADO</span>;
      case 'RECLAMADO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> RECLAMADO</span>;
      case 'ACEPTADO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> ACEPTADO</span>;
      case 'RECHAZADO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> RECHAZADO</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn pb-24">
      {/* Header View */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Reclamos Magma</h1>
            <p className="text-sm text-slate-400">Seguimiento manual de diferencias de auditoría, tickets Magma e historial de tiempos</p>
          </div>
        </div>

        <button
          onClick={loadReclamos}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all self-start md:self-auto"
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
          <span className="text-[11px] text-slate-400 mt-1 font-medium">{reclamos.length} auditorías con discrepancia</span>
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
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por NAE, Tienda o Ticket..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'PENDIENTE', label: '⏳ Pendientes' },
            { id: 'EXPORTADO', label: '📊 Exportados' },
            { id: 'RECLAMADO', label: '📑 Reclamados' },
            { id: 'ACEPTADO', label: '✅ Aceptados' },
            { id: 'RECHAZADO', label: '❌ Rechazados' }
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilterEstado(btn.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterEstado === btn.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* List of Claim Cards */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-200/80">
          Cargando módulo de reclamos Magma...
        </div>
      ) : filteredReclamos.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200/80 space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No hay reclamos registrados</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Los reclamos se generan automáticamente cuando una auditoría de camión finaliza en estado CERRADO y contiene productos faltantes o dañados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReclamos.map((rec) => (
            <div 
              key={rec.id} 
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* Card Header */}
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-slate-900 text-white font-black text-sm rounded-xl">
                    NAE {rec.nae_numero}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {rec.tienda_codigo} - {rec.tienda_nombre}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {rec.ticket_magma && (
                    <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-bold flex items-center gap-1">
                      <Tag className="w-3 h-3 text-purple-600" /> Ticket: {rec.ticket_magma}
                    </span>
                  )}
                  {getEstadoBadge(rec.estado)}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-5">
                {/* Stats & Amounts Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Monto Reclamado</span>
                    <span className="text-emerald-700 font-black text-base">
                      ${rec.monto_total_reclamado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Monto Liquidado</span>
                    <span className="text-slate-800 font-bold text-sm">
                      {rec.monto_liquidado !== undefined ? `$${rec.monto_liquidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold uppercase block text-[10px]">SKUs Afectados</span>
                    <span className="text-slate-800 font-bold text-sm">{rec.cant_skus_afectados || 0} SKUs</span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold uppercase block text-[10px]">Unidades Discrepantes</span>
                    <span className="text-slate-800 font-bold text-sm">{rec.cant_unidades_afectadas || 0} un</span>
                  </div>
                </div>

                {/* Timeline / Trazabilidad de Tiempos (4 Hitos) */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Timeline de Trazabilidad del Reclamo
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Hito 1: Cierre Auditoría */}
                    <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-start gap-2.5">
                      <div className="p-1.5 bg-emerald-500 text-white rounded-lg shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-emerald-900 block leading-tight">1. Fin Auditoría</span>
                        <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                          {formatDateTimeArg(rec.fecha_cierre_auditoria)}
                        </span>
                      </div>
                    </div>

                    {/* Hito 2: Exportación Planilla */}
                    <div className={`p-3 border rounded-xl flex items-start gap-2.5 ${
                      rec.fecha_ultima_exportacion 
                        ? 'bg-blue-50/60 border-blue-100' 
                        : 'bg-slate-50 border-slate-100 opacity-60'
                    }`}>
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        rec.fecha_ultima_exportacion ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'
                      }`}>
                        <Download className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-900 block leading-tight">2. Planilla Exportada</span>
                        <span className="text-[10px] text-slate-600 font-medium block mt-0.5">
                          {rec.fecha_ultima_exportacion ? formatDateTimeArg(rec.fecha_ultima_exportacion) : 'Pendiente de descarga'}
                        </span>
                      </div>
                    </div>

                    {/* Hito 3: Reclamado en Magma */}
                    <div className={`p-3 border rounded-xl flex items-start gap-2.5 ${
                      rec.fecha_reclamado_magma 
                        ? 'bg-purple-50/60 border-purple-100' 
                        : 'bg-slate-50 border-slate-100 opacity-60'
                    }`}>
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        rec.fecha_reclamado_magma ? 'bg-purple-600 text-white' : 'bg-slate-300 text-slate-600'
                      }`}>
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-900 block leading-tight">3. Reclamado Magma</span>
                        <span className="text-[10px] text-slate-600 font-medium block mt-0.5">
                          {rec.fecha_reclamado_magma ? formatDateTimeArg(rec.fecha_reclamado_magma) : 'Sin ticket cargado'}
                        </span>
                      </div>
                    </div>

                    {/* Hito 4: Resolución */}
                    <div className={`p-3 border rounded-xl flex items-start gap-2.5 ${
                      rec.fecha_resolucion 
                        ? (rec.estado === 'ACEPTADO' ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100')
                        : 'bg-slate-50 border-slate-100 opacity-60'
                    }`}>
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        rec.fecha_resolucion 
                          ? (rec.estado === 'ACEPTADO' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
                          : 'bg-slate-300 text-slate-600'
                      }`}>
                        {rec.estado === 'RECHAZADO' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-900 block leading-tight">4. Resolución</span>
                        <span className="text-[10px] text-slate-600 font-medium block mt-0.5">
                          {rec.fecha_resolucion ? formatDateTimeArg(rec.fecha_resolucion) : 'En dictamen'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Observaciones si existen */}
                {rec.observaciones && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                    <span className="font-bold uppercase tracking-wider block text-[10px] text-amber-700">Observaciones:</span>
                    {rec.observaciones}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedForDetalle(rec)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalle & Copiar
                  </button>

                  <button
                    onClick={() => setSelectedForGestion(rec)}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Actualizar Estado / Ticket
                  </button>

                  <button
                    onClick={() => handleExportQuick(rec)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar Excel
                  </button>
                </div>

              </div>
            </div>
          ))}
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
        />
      )}
    </div>
  );
};
