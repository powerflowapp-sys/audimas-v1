import React, { useEffect, useState } from 'react';
import { History, X, Clock, User, Package, Layers, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { AuditoriaItem, AuditoriaLog } from '../types';

interface ModalHistorialItemProps {
  isOpen: boolean;
  item: AuditoriaItem | null;
  naeId: string;
  onClose: () => void;
}

export const ModalHistorialItem: React.FC<ModalHistorialItemProps> = ({
  isOpen,
  item,
  naeId,
  onClose
}) => {
  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !item || !naeId) return;

    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from('auditoria_logs')
          .select('*')
          .eq('nae_id', naeId)
          .eq('upc', item.upc)
          .order('created_at', { ascending: false });

        if (fetchErr) {
          throw new Error(fetchErr.message);
        }

        setLogs(data || []);
      } catch (err) {
        console.error('Error al cargar historial de auditoría:', err);
        setError(err instanceof Error ? err.message : 'Error al consultar logs');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [isOpen, item, naeId]);

  if (!isOpen || !item) return null;

  // Formato legible de fecha y hora (HH:mm:ss - DD/MM)
  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '--:--:--';
    try {
      const d = new Date(dateStr);
      const timeStr = d.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${timeStr} - ${day}/${month}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between">
          <div className="flex items-start space-x-3 pr-2">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30 shrink-0 mt-0.5">
              <History className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-extrabold text-sm text-white leading-snug line-clamp-2">
                {item.descripcion}
              </h3>
              <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
                <span>SKU: {item.sku}</span>
                <span>•</span>
                <span>UPC: {item.upc}</span>
              </div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                {item.depto_nombre || `Depto ${item.depto_codigo || 'GENERAL'}`}
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg shrink-0 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen Total Acumulado */}
        <div className="p-3.5 bg-slate-900 border-b border-slate-800/80">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-slate-950 rounded-2xl border border-slate-800/80 text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Bultos</span>
              <span className="text-lg font-black text-white">{item.bultos_escaneados}</span>
              <span className="text-[10px] text-slate-500 block">/ {item.bultos_esperados} esperados</span>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-2xl border border-slate-800/80 text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Unidades</span>
              <span className="text-lg font-black text-blue-400">{item.unidades_escaneadas}</span>
              <span className="text-[10px] text-slate-500 block">/ {item.unidades_esperadas} esperadas</span>
            </div>
          </div>
        </div>

        {/* Lista Cronológica de Registros de Escaneo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[160px]">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Historial de Escaneos ({logs.length})
            </h4>
            <span className="text-[10px] text-slate-500">Cronológico (Recientes primero)</span>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center space-y-2">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <span>Cargando trazabilidad de escaneos...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-2xl text-xs text-red-300 text-center">
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 space-y-1.5">
              <Clock className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-bold text-slate-300">Sin escaneos registrados</p>
              <p className="text-[11px] text-slate-500">
                No se registran escaneos manuales para este ítem.
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const esResta = log.cantidad < 0;
              const cantAbs = Math.abs(log.cantidad);
              const textoCantidad = esResta ? `-${cantAbs}` : `+${log.cantidad}`;
              const modoText = log.modo_conteo === 'BULTOS' ? 'Bulto(s)' : 'Unidad(es)';

              return (
                <div 
                  key={log.id || `${log.created_at}-${Math.random()}`}
                  className={`p-3 border rounded-2xl flex items-center justify-between shadow-sm ${
                    esResta ? 'bg-red-950/30 border-red-500/40' : 'bg-slate-950 border-slate-800/90'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-slate-900 text-slate-300 rounded-xl border border-slate-800">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <span className="font-extrabold text-xs text-white block">
                        {log.colaborador_nombre}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formatTimestamp(log.created_at)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 text-xs font-black rounded-xl inline-block ${
                      esResta
                        ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                        : log.modo_conteo === 'BULTOS'
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                    }`}>
                      {textoCantidad} {modoText}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pie de Modal */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors"
          >
            Cerrar Historial
          </button>
        </div>
      </div>
    </div>
  );
};
