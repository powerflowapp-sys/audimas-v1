import React, { useState } from 'react';
import { 
  Lock, 
  CheckCircle2, 
  Percent, 
  DollarSign, 
  Package, 
  Layers, 
  X, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../services/supabase';

interface ModalModalidadAuditoriaProps {
  isOpen: boolean;
  naeId: string;
  numeroNae: string;
  tieneReporteAp?: boolean;
  montoTotalEsperado?: number;
  unidadesTotalesEsperadas?: number;
  currentModo?: 'TOTAL' | 'MONTO' | 'UNIDADES' | 'MIXTO';
  currentMetaMonto?: number;
  currentMetaUnidades?: number;
  currentMetaPorcentaje?: number;
  onClose: () => void;
  onConfirm: (
    modo: 'TOTAL' | 'MONTO' | 'UNIDADES' | 'MIXTO',
    metaMonto: number,
    metaUnidades: number,
    metaPorcentaje: number
  ) => void;
}

export const ModalModalidadAuditoria: React.FC<ModalModalidadAuditoriaProps> = ({
  isOpen,
  naeId,
  numeroNae,
  tieneReporteAp = false,
  montoTotalEsperado = 0,
  unidadesTotalesEsperadas = 0,
  currentModo = 'TOTAL',
  currentMetaMonto = 0,
  currentMetaUnidades = 0,
  currentMetaPorcentaje = 100,
  onClose,
  onConfirm
}) => {
  const [modo, setModo] = useState<'TOTAL' | 'MONTO' | 'UNIDADES' | 'MIXTO'>(currentModo);
  const [metaPorcentaje, setMetaPorcentaje] = useState<number>(currentMetaPorcentaje || 100);
  const [metaMonto, setMetaMonto] = useState<number>(currentMetaMonto || montoTotalEsperado || 0);
  const [metaUnidades, setMetaUnidades] = useState<number>(currentMetaUnidades || unidadesTotalesEsperadas || 0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSelectModo = (newModo: 'TOTAL' | 'MONTO' | 'UNIDADES' | 'MIXTO') => {
    if ((newModo === 'MONTO' || newModo === 'MIXTO') && !tieneReporteAp) {
      return; // Bloqueado con candado
    }
    setModo(newModo);
    if (newModo === 'TOTAL') {
      setMetaPorcentaje(100);
    } else if (newModo === 'MONTO' && montoTotalEsperado > 0) {
      setMetaMonto(Math.round(montoTotalEsperado * (metaPorcentaje / 100)));
    } else if (newModo === 'UNIDADES' && unidadesTotalesEsperadas > 0) {
      setMetaUnidades(Math.round(unidadesTotalesEsperadas * (metaPorcentaje / 100)));
    }
  };

  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      let finalMetaMonto = metaMonto;
      let finalMetaUnidades = metaUnidades;

      if (modo === 'TOTAL') {
        finalMetaMonto = montoTotalEsperado;
        finalMetaUnidades = unidadesTotalesEsperadas;
      } else if (modo === 'MONTO') {
        if (!finalMetaMonto && montoTotalEsperado > 0) {
          finalMetaMonto = Math.round(montoTotalEsperado * (metaPorcentaje / 100));
        }
      } else if (modo === 'UNIDADES') {
        if (!finalMetaUnidades && unidadesTotalesEsperadas > 0) {
          finalMetaUnidades = Math.round(unidadesTotalesEsperadas * (metaPorcentaje / 100));
        }
      }

      // Consultar estado actual para registrar inicio de auditoría si está pendiente
      const { data: currentTruck } = await supabase
        .from('camiones_nae')
        .select('estado, fecha_inicio_auditoria')
        .eq('id', naeId)
        .single();

      const estUpper = (currentTruck?.estado || '').trim().toUpperCase();
      const isPending = !currentTruck?.fecha_inicio_auditoria || estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE';
      const now = new Date().toISOString();

      const updateData: Record<string, any> = {
        modo_auditoria: modo,
        meta_monto: finalMetaMonto,
        meta_unidades: finalMetaUnidades,
        meta_porcentaje: metaPorcentaje
      };

      if (isPending) {
        const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
        updateData.estado = 'EN_PROCESO';
        updateData.fecha_inicio_auditoria = now;
        updateData.usuario_inicio_auditoria = activeUser;
      }

      const { error } = await supabase
        .from('camiones_nae')
        .update(updateData)
        .eq('id', naeId);

      if (error) {
        throw new Error(error.message);
      }

      onConfirm(modo, finalMetaMonto, finalMetaUnidades, metaPorcentaje);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar modalidad de auditoría');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-md bg-[#061224] border border-sky-500/30 rounded-3xl p-5 space-y-4 shadow-2xl relative text-white">
        
        {/* Botón Cerrar */}
        <button 
          onClick={onClose}
          disabled={isSaving}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-900 border border-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado */}
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <h3 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider">
              Modalidad de Auditoría NAE #{numeroNae}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Selecciona el criterio para medir la barra de progreso y el cumplimiento de descarga.
          </p>
        </div>

        {/* Grilla 2x2 de Modalidades */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          
          {/* 1. Modo 100% TOTAL */}
          <div
            onClick={() => handleSelectModo('TOTAL')}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
              modo === 'TOTAL'
                ? 'bg-blue-600/30 border-sky-400 shadow-lg shadow-blue-500/20'
                : 'bg-[#020b18] border-sky-500/20 hover:border-sky-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <Layers className="w-5 h-5 text-sky-400" />
              {modo === 'TOTAL' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <div>
              <h4 className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider">100% Total</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Audita la totalidad de bultos y SKUs esperados.</p>
            </div>
          </div>

          {/* 2. Modo POR UNIDADES */}
          <div
            onClick={() => handleSelectModo('UNIDADES')}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
              modo === 'UNIDADES'
                ? 'bg-blue-600/30 border-sky-400 shadow-lg shadow-blue-500/20'
                : 'bg-[#020b18] border-sky-500/20 hover:border-sky-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <Package className="w-5 h-5 text-emerald-400" />
              {modo === 'UNIDADES' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
            <div>
              <h4 className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider">Por Unidades</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Meta por cantidad de unidades / % de bultos.</p>
            </div>
          </div>

          {/* 3. Modo POR MONTO ($) */}
          <div
            onClick={() => handleSelectModo('MONTO')}
            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative ${
              !tieneReporteAp 
                ? 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed' 
                : modo === 'MONTO'
                ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20 cursor-pointer'
                : 'bg-[#020b18] border-purple-500/20 hover:border-purple-500/40 cursor-pointer'
            }`}
            title={!tieneReporteAp ? 'Requiere cargar reporte AP con valorización' : ''}
          >
            <div className="flex items-center justify-between">
              <DollarSign className="w-5 h-5 text-purple-400" />
              {!tieneReporteAp ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : modo === 'MONTO' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : null}
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <h4 className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider">Por Monto ($)</h4>
                {!tieneReporteAp && <span className="text-[9px] font-mono text-amber-400">🔒</span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                {!tieneReporteAp ? 'Requiere reporte AP con valorización.' : 'Meta financiera acumulada en $.'}
              </p>
            </div>
          </div>

          {/* 4. Modo MIXTO ($ y Unidades) */}
          <div
            onClick={() => handleSelectModo('MIXTO')}
            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative ${
              !tieneReporteAp 
                ? 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed' 
                : modo === 'MIXTO'
                ? 'bg-indigo-600/30 border-indigo-400 shadow-lg shadow-indigo-500/20 cursor-pointer'
                : 'bg-[#020b18] border-indigo-500/20 hover:border-indigo-500/40 cursor-pointer'
            }`}
            title={!tieneReporteAp ? 'Requiere cargar reporte AP con valorización' : ''}
          >
            <div className="flex items-center justify-between">
              <Percent className="w-5 h-5 text-indigo-400" />
              {!tieneReporteAp ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : modo === 'MIXTO' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : null}
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <h4 className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider">Mixta ($ y Un)</h4>
                {!tieneReporteAp && <span className="text-[9px] font-mono text-amber-400">🔒</span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                {!tieneReporteAp ? 'Requiere reporte AP con valorización.' : 'Combina metas de $ y unidades.'}
              </p>
            </div>
          </div>

        </div>

        {/* Inputs de Configuración de Metas según la Modalidad Seleccionada */}
        {modo !== 'TOTAL' && (
          <div className="p-3.5 bg-[#020b18] border border-sky-500/20 rounded-2xl space-y-3 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-300">Configurar Meta de Cumplimiento</span>
              <span className="font-mono text-[10px] text-slate-400">% Porcentaje deseado</span>
            </div>

            {/* Slider de Porcentaje */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-slate-400">Meta Porcentaje:</span>
                <span className="font-bold text-emerald-400">{metaPorcentaje}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={metaPorcentaje}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  setMetaPorcentaje(pct);
                  if (montoTotalEsperado > 0) setMetaMonto(Math.round(montoTotalEsperado * (pct / 100)));
                  if (unidadesTotalesEsperadas > 0) setMetaUnidades(Math.round(unidadesTotalesEsperadas * (pct / 100)));
                }}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            {/* Campos de Entrada Específicos */}
            {(modo === 'MONTO' || modo === 'MIXTO') && (
              <div className="space-y-1">
                <label className="text-[11px] text-purple-300 font-bold block">Meta en Monto ($):</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 font-bold">$</span>
                  <input
                    type="number"
                    value={metaMonto || ''}
                    onChange={(e) => setMetaMonto(Number(e.target.value))}
                    placeholder="Monto $"
                    className="w-full pl-7 pr-3 py-1.5 bg-[#061224] border border-purple-500/40 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>
            )}

            {(modo === 'UNIDADES' || modo === 'MIXTO') && (
              <div className="space-y-1">
                <label className="text-[11px] text-emerald-300 font-bold block">Meta en Unidades:</label>
                <input
                  type="number"
                  value={metaUnidades || ''}
                  onChange={(e) => setMetaUnidades(Number(e.target.value))}
                  placeholder="Unidades"
                  className="w-full px-3 py-1.5 bg-[#061224] border border-emerald-500/40 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-400"
                />
              </div>
            )}
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex items-center space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-sky-600/30 flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <span>Confirmar Modalidad</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
