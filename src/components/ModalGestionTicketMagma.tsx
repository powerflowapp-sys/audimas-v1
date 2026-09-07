import React, { useState } from 'react';
import { X, Check, FileText, AlertCircle, DollarSign, Tag, MessageSquare, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { ReclamoMagma, EstadoReclamoMagma } from '../types';
import { updateReclamoMagma } from '../services/reclamosService';

interface Props {
  reclamo: ReclamoMagma;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: ReclamoMagma) => void;
}

export const ModalGestionTicketMagma: React.FC<Props> = ({
  reclamo,
  isOpen,
  onClose,
  onSaved
}) => {
  const [estado, setEstado] = useState<EstadoReclamoMagma>(
    (reclamo.estado as string) === 'EXPORTADO' ? 'PENDIENTE' : (reclamo.estado || 'PENDIENTE')
  );
  const [ticketMagma, setTicketMagma] = useState<string>(reclamo.ticket_magma || '');
  const [montoLiquidado, setMontoLiquidado] = useState<string>(
    reclamo.monto_liquidado !== undefined ? String(reclamo.monto_liquidado) : String(reclamo.monto_total_reclamado || '')
  );
  const [observaciones, setObservaciones] = useState<string>(reclamo.observaciones || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isResolucionStage = estado === 'ACEPTADO' || estado === 'RECHAZADO';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validación: si pasa a RECLAMADO o RESOLUCIÓN, exige número de ticket
    if ((estado === 'RECLAMADO' || isResolucionStage) && !ticketMagma.trim()) {
      setErrorMsg('Debés ingresar el N° de Ticket o Incidencia Magma para avanzar el estado.');
      return;
    }

    setIsSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const updates: Partial<ReclamoMagma> = {
        estado,
        ticket_magma: ticketMagma.trim() || undefined,
        observaciones: observaciones.trim() || undefined
      };

      // Timestamp de reclamo en Magma
      if ((estado === 'RECLAMADO' || ticketMagma.trim()) && !reclamo.fecha_reclamado_magma) {
        updates.fecha_reclamado_magma = nowIso;
      }

      // Timestamp y montos de Resolución
      if (isResolucionStage) {
        if (!reclamo.fecha_resolucion) {
          updates.fecha_resolucion = nowIso;
        }
        if (estado === 'ACEPTADO') {
          const numLiq = parseFloat(montoLiquidado);
          updates.monto_liquidado = !isNaN(numLiq) ? numLiq : reclamo.monto_total_reclamado;
        } else {
          updates.monto_liquidado = 0;
        }
      }

      const updated = await updateReclamoMagma(reclamo.id, updates);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar reclamo Magma:', err);
      setErrorMsg('No se pudo guardar el reclamo Magma. Verificá los datos e intentá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-100">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Gestionar Estado de Reclamo</h3>
              <p className="text-xs text-slate-400 font-medium">NAE {reclamo.nae_numero} — {reclamo.tienda_nombre}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector de 3 Etapas Operativas */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Etapa del Reclamo (3 Fases)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Etapa 1: PENDIENTE */}
              <button
                type="button"
                onClick={() => setEstado('PENDIENTE')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  estado === 'PENDIENTE'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-md font-semibold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5" /> 1. Pendiente
                </div>
                <div className={`text-[10px] mt-0.5 ${estado === 'PENDIENTE' ? 'opacity-90' : 'text-slate-400'}`}>
                  Sin cargar
                </div>
              </button>

              {/* Etapa 2: RECLAMADO */}
              <button
                type="button"
                onClick={() => setEstado('RECLAMADO')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  estado === 'RECLAMADO'
                    ? 'bg-purple-600 text-white border-purple-700 shadow-md font-semibold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Tag className="w-3.5 h-3.5" /> 2. Reclamado
                </div>
                <div className={`text-[10px] mt-0.5 ${estado === 'RECLAMADO' ? 'opacity-90' : 'text-slate-400'}`}>
                  Ticket cargado
                </div>
              </button>

              {/* Etapa 3: RESOLUCIÓN */}
              <button
                type="button"
                onClick={() => {
                  if (!isResolucionStage) setEstado('ACEPTADO');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isResolucionStage
                    ? (estado === 'ACEPTADO' ? 'bg-emerald-600 text-white border-emerald-700 shadow-md font-semibold' : 'bg-red-600 text-white border-red-700 shadow-md font-semibold')
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  {estado === 'RECHAZADO' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />} 3. Resolución
                </div>
                <div className={`text-[10px] mt-0.5 ${isResolucionStage ? 'opacity-90' : 'text-slate-400'}`}>
                  {isResolucionStage ? (estado === 'ACEPTADO' ? 'Dictamen: Aceptado' : 'Dictamen: Rechazado') : 'Dictamen Magma'}
                </div>
              </button>
            </div>
          </div>

          {/* Sub-toggle de Dictamen en Etapa 3: RESOLUCIÓN */}
          {isResolucionStage && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Dictamen de Resolución
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEstado('ACEPTADO')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    estado === 'ACEPTADO'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Aceptado / Liquidado
                </button>
                <button
                  type="button"
                  onClick={() => setEstado('RECHAZADO')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    estado === 'RECHAZADO'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <XCircle className="w-4 h-4" /> Rechazado
                </button>
              </div>
            </div>
          )}

          {/* Input Ticket Magma */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> N° Ticket / Incidencia Magma
            </label>
            <input
              type="text"
              value={ticketMagma}
              onChange={(e) => setTicketMagma(e.target.value)}
              placeholder="Ej: INC-94821 o TCK-2026-042"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase placeholder:normal-case placeholder:font-normal"
            />
          </div>

          {/* Monto Liquidado (Solo si ACEPTADO) */}
          {estado === 'ACEPTADO' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Monto Liquidado por Magma ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={montoLiquidado}
                onChange={(e) => setMontoLiquidado(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2 bg-white rounded-lg border border-emerald-300 text-sm font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-emerald-700">Monto reclamado original: ${reclamo.monto_total_reclamado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Observaciones / Notas
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder={estado === 'RECHAZADO' ? "Motivo del rechazo dictaminado por Magma..." : "Comentarios adicionales..."}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none placeholder:text-slate-400"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
