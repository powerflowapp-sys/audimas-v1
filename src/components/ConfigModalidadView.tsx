import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  Layers, 
  Package, 
  DollarSign, 
  Percent, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  Boxes,
  Sparkles,
  Play
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { AuditoriaItem, CamionNAE, isItemInAuditScope } from '../types';
import { BottomNavCapsule } from './BottomNavCapsule';

interface ConfigModalidadViewProps {
  naeId: string;
  onBack: () => void;
  onConfirmSuccess: (naeId: string) => void;
}

export const ConfigModalidadView: React.FC<ConfigModalidadViewProps> = ({
  naeId,
  onBack,
  onConfirmSuccess
}) => {
  const [camion, setCamion] = useState<CamionNAE | null>(null);
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [modo, setModo] = useState<'TOTAL' | 'UNIDADES' | 'MONTO' | 'MIXTO'>('TOTAL');
  const [umbralUnidades, setUmbralUnidades] = useState<number>(0);
  const [umbralMonto, setUmbralMonto] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: camData, error: camErr } = await supabase
          .from('camiones_nae')
          .select('*')
          .eq('id', naeId)
          .single();

        if (camErr) throw camErr;
        setCamion(camData);

        if (camData?.modo_auditoria) {
          setModo(camData.modo_auditoria);
        }
        if (camData?.umbral_unidades !== undefined) {
          setUmbralUnidades(camData.umbral_unidades);
        }
        if (camData?.umbral_monto !== undefined) {
          setUmbralMonto(camData.umbral_monto);
        }

        const { data: itemsData, error: itemsErr } = await supabase
          .from('auditoria_items')
          .select('*')
          .eq('nae_id', naeId);

        if (itemsErr) throw itemsErr;
        setItems(itemsData || []);
      } catch (err) {
        console.error('Error al cargar configuración de modalidad:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [naeId]);

  const tieneReporteAp = camion?.tiene_reporte_ap || false;
  const montoTotalCamion = camion?.monto_total_esperado || 0;

  // Previsualización en Tiempo Real según filtros aplicados
  const previewStats = useMemo(() => {
    let skusSeleccionados = 0;
    let unidadesAControlar = 0;
    let agotadosASeparar = 0;
    let montoTotalSeleccionado = 0;

    items.forEach(it => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const cUnit = Number(it.costo_unitario || 0);
      const cTotal = Number(it.costo_total || (cUnit * uEsp));

      const inScope = isItemInAuditScope(
        { unidades_esperadas: uEsp, costo_total: cTotal, costo_unitario: cUnit },
        modo,
        umbralUnidades,
        umbralMonto
      );

      if (inScope) {
        skusSeleccionados++;
        unidadesAControlar += uEsp;
        if (it.es_agotado_transito) {
          agotadosASeparar++;
        }
        montoTotalSeleccionado += cTotal;
      }
    });

    const porcentajeSkus = items.length > 0 ? Math.round((skusSeleccionados / items.length) * 100) : 0;

    return {
      skusSeleccionados,
      totalSkus: items.length,
      unidadesAControlar,
      agotadosASeparar,
      montoTotalSeleccionado,
      porcentajeSkus
    };
  }, [items, modo, umbralUnidades, umbralMonto]);

  const estUpper = (camion?.estado || '').trim().toUpperCase();
  const isEnProceso = estUpper === 'EN_PROCESO' || Boolean(camion?.fecha_inicio_auditoria);

  const handleSelectModo = (newModo: 'TOTAL' | 'UNIDADES' | 'MONTO' | 'MIXTO') => {
    if (isEnProceso) return; // Bloqueado estricto si está en proceso
    if ((newModo === 'MONTO' || newModo === 'MIXTO') && !tieneReporteAp) {
      return; // Bloqueado con candado si no tiene AP
    }
    setModo(newModo);
  };

  const handleSaveAndStart = async () => {
    if (!camion) return;

    if (isEnProceso) {
      onConfirmSuccess(naeId);
      return;
    }

    setIsSaving(true);

    try {
      const isPending = !camion.fecha_inicio_auditoria || estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE';
      const now = new Date().toISOString();

      const updateData: Record<string, any> = {
        modo_auditoria: modo,
        umbral_unidades: umbralUnidades,
        umbral_monto: umbralMonto,
        meta_unidades: previewStats.unidadesAControlar,
        meta_monto: previewStats.montoTotalSeleccionado,
        meta_porcentaje: previewStats.porcentajeSkus
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

      if (error) throw error;

      onConfirmSuccess(naeId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar la modalidad de auditoría');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col items-center justify-center space-y-4 font-sans select-none p-4">
        <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" />
        <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">
          Cargando manifiesto del camión...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* 1. Header Pantalla Completa Estilo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div>
            <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider leading-tight flex items-center space-x-2">
              <span>Configuración de Auditoría</span>
            </h1>
            <p className="text-[11px] text-sky-400/80 font-mono tracking-wide">
              NAE #{camion?.numero_nae || '---'} • {camion?.tienda_nombre || 'Tienda Destino'}
            </p>
          </div>
        </div>

        <div className="px-3 py-1 bg-blue-600/30 border border-sky-500/30 rounded-xl font-['Chakra_Petch'] font-bold text-xs text-sky-200">
          {items.length} SKUs en Manifiesto
        </div>
      </header>

      {/* 2. Cuerpo Principal */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {/* Instrucción de Modalidad / Cartel de Bloqueo si está en Proceso */}
        {isEnProceso ? (
          <div className="p-3.5 bg-amber-950/80 border border-amber-500/40 rounded-2xl flex items-start space-x-3 text-xs text-amber-200 shadow-xl">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-bold text-white mb-0.5">Auditoría en Proceso (Modalidad Bloqueada)</p>
              <p className="text-amber-300/80">La modalidad y los umbrales de filtrado quedaron fijados al iniciar la descarga y no pueden ser modificados.</p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-[#061224]/90 border border-sky-500/30 rounded-2xl flex items-start space-x-3 text-xs text-sky-200 shadow-xl">
            <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-bold text-white mb-0.5">Selección de Criterio de Auditoría</p>
              <p className="text-sky-300/80">Aplica filtros strictly por volumen o costo para enfocar la descarga en los productos prioritarios.</p>
            </div>
          </div>
        )}

        {/* 3. Selección de Modalidad (Tarjetas 2x2) */}
        <div className="grid grid-cols-2 gap-3">
          
          {/* MODO 1: 100% TOTAL */}
          <div
            onClick={() => handleSelectModo('TOTAL')}
            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative shadow-lg ${
              isEnProceso
                ? modo === 'TOTAL'
                  ? 'bg-blue-600/20 border-sky-400/50 opacity-90 cursor-not-allowed'
                  : 'bg-[#061224]/40 border-slate-800 opacity-40 cursor-not-allowed'
                : modo === 'TOTAL'
                ? 'bg-blue-600/30 border-sky-400 shadow-blue-500/20 ring-1 ring-sky-400 cursor-pointer'
                : 'bg-[#061224]/80 border-sky-500/20 hover:border-sky-500/40 cursor-pointer'
            }`}
          >
            <div className="flex items-center justify-between">
              <Layers className="w-6 h-6 text-sky-400" />
              {modo === 'TOTAL' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            </div>
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">100% Total</h3>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">Audita todos los SKUs sin aplicar ningún filtro.</p>
            </div>
          </div>

          {/* MODO 2: POR UNIDADES */}
          <div
            onClick={() => handleSelectModo('UNIDADES')}
            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative shadow-lg ${
              isEnProceso
                ? modo === 'UNIDADES'
                  ? 'bg-emerald-600/20 border-emerald-400/50 opacity-90 cursor-not-allowed'
                  : 'bg-[#061224]/40 border-slate-800 opacity-40 cursor-not-allowed'
                : modo === 'UNIDADES'
                ? 'bg-emerald-600/30 border-emerald-400 shadow-emerald-500/20 ring-1 ring-emerald-400 cursor-pointer'
                : 'bg-[#061224]/80 border-sky-500/20 hover:border-sky-500/40 cursor-pointer'
            }`}
          >
            <div className="flex items-center justify-between">
              <Package className="w-6 h-6 text-emerald-400" />
              {modo === 'UNIDADES' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            </div>
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">Por Unidades</h3>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">Filtra SKUs por volumen esperados ≥ umbral.</p>
            </div>
          </div>

          {/* MODO 3: POR MONTO ($) */}
          <div
            onClick={() => handleSelectModo('MONTO')}
            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative shadow-lg ${
              !tieneReporteAp || isEnProceso
                ? modo === 'MONTO'
                  ? 'bg-purple-600/20 border-purple-400/50 opacity-90 cursor-not-allowed'
                  : 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed' 
                : modo === 'MONTO'
                ? 'bg-purple-600/30 border-purple-400 shadow-purple-500/20 ring-1 ring-purple-400 cursor-pointer'
                : 'bg-[#061224]/80 border-purple-500/20 hover:border-purple-500/40 cursor-pointer'
            }`}
            title={!tieneReporteAp ? 'Requiere cargar reporte AP con valorización' : ''}
          >
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-purple-400" />
              {!tieneReporteAp ? (
                <Lock className="w-5 h-5 text-amber-400" />
              ) : modo === 'MONTO' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : null}
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">Por Monto ($)</h3>
                {!tieneReporteAp && <span className="text-[10px]">🔒</span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                {!tieneReporteAp ? 'Requiere reporte AP con valorización.' : 'Filtra por costo total del SKU.'}
              </p>
            </div>
          </div>

          {/* MODO 4: MIXTA (Unidades O Monto) */}
          <div
            onClick={() => handleSelectModo('MIXTO')}
            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-2 relative shadow-lg ${
              !tieneReporteAp || isEnProceso
                ? modo === 'MIXTO'
                  ? 'bg-indigo-600/20 border-indigo-400/50 opacity-90 cursor-not-allowed'
                  : 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed' 
                : modo === 'MIXTO'
                ? 'bg-indigo-600/30 border-indigo-400 shadow-indigo-500/20 ring-1 ring-indigo-400 cursor-pointer'
                : 'bg-[#061224]/80 border-indigo-500/20 hover:border-indigo-500/40 cursor-pointer'
            }`}
            title={!tieneReporteAp ? 'Requiere cargar reporte AP con valorización' : ''}
          >
            <div className="flex items-center justify-between">
              <Percent className="w-6 h-6 text-indigo-400" />
              {!tieneReporteAp ? (
                <Lock className="w-5 h-5 text-amber-400" />
              ) : modo === 'MIXTO' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : null}
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">Mixta (Un o $)</h3>
                {!tieneReporteAp && <span className="text-[10px]">🔒</span>}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                {!tieneReporteAp ? 'Requiere reporte AP con valorización.' : 'Cumple Unidades O Costo.'}
              </p>
            </div>
          </div>

        </div>

        {/* 4. Panel de Inputs para Umbrales según la Modalidad */}
        {modo !== 'TOTAL' && (
          <div className="p-4 bg-[#061224]/90 border border-sky-500/30 rounded-2xl space-y-3.5 shadow-xl animate-fade-in">
            <h4 className="font-['Chakra_Petch'] font-bold text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-2">
              {isEnProceso ? 'Umbrales Fijados para esta Auditoría' : 'Definir Umbrales de Filtrado Estricto'}
            </h4>

            {/* Input Umbral Unidades con botones laterales [-] y [+] */}
            {(modo === 'UNIDADES' || modo === 'MIXTO') && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-emerald-300 block">
                  Auditar SKUs con cantidad esperada mayor o igual a:
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={isEnProceso}
                    onClick={() => setUmbralUnidades(prev => Math.max(0, prev - 10))}
                    className="w-10 h-10 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#1d488f] text-emerald-400 font-black text-lg rounded-xl border border-emerald-500/40 flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md select-none disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Disminuir 10 unidades"
                  >
                    -
                  </button>

                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      readOnly={isEnProceso}
                      value={umbralUnidades || ''}
                      onChange={(e) => setUmbralUnidades(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-full text-center px-8 py-2.5 bg-[#020b18] border border-emerald-500/40 rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-80"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-emerald-400/80 font-bold pointer-events-none">
                      un
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isEnProceso}
                    onClick={() => setUmbralUnidades(prev => prev + 10)}
                    className="w-10 h-10 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#1d488f] text-emerald-400 font-black text-lg rounded-xl border border-emerald-500/40 flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md select-none disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Aumentar 10 unidades"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Input Umbral Monto $ con botones laterales [-] y [+] */}
            {(modo === 'MONTO' || modo === 'MIXTO') && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-300 block">
                  Auditar SKUs con costo total mayor o igual a:
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={isEnProceso}
                    onClick={() => setUmbralMonto(prev => Math.max(0, prev - 10000))}
                    className="w-10 h-10 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#1d488f] text-purple-400 font-black text-lg rounded-xl border border-purple-500/40 flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md select-none disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Disminuir $10.000"
                  >
                    -
                  </button>

                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 font-bold text-sm pointer-events-none">$</span>
                    <input
                      type="number"
                      min="0"
                      readOnly={isEnProceso}
                      value={umbralMonto || ''}
                      onChange={(e) => setUmbralMonto(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-full text-center pl-7 pr-3 py-2.5 bg-[#020b18] border border-purple-500/40 rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:border-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-80"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isEnProceso}
                    onClick={() => setUmbralMonto(prev => prev + 10000)}
                    className="w-10 h-10 bg-[#0c244d] hover:bg-[#163a75] active:bg-[#1d488f] text-purple-400 font-black text-lg rounded-xl border border-purple-500/40 flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md select-none disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Aumentar $10.000"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Previsualización en Tiempo Real */}
        <div className="p-4 bg-gradient-to-br from-[#071938] to-[#020b18] border border-sky-500/40 rounded-2xl space-y-3 shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
            <span className="font-['Chakra_Petch'] font-black text-xs text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Resumen Previsualización en Vivo</span>
            </span>
            <span className="px-2.5 py-0.5 bg-blue-600/40 border border-sky-400/40 text-white font-mono font-bold rounded-lg text-xs">
              {previewStats.porcentajeSkus}% del Camión
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#020b18]/80 p-3 rounded-xl border border-sky-500/20 space-y-0.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">SKUs Seleccionados</span>
              <p className="font-mono font-bold text-white text-sm">
                {previewStats.skusSeleccionados} <span className="text-xs text-slate-400 font-normal">de {previewStats.totalSkus}</span>
              </p>
            </div>

            <div className="bg-[#020b18]/80 p-3 rounded-xl border border-sky-500/20 space-y-0.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Unidades a Controlar</span>
              <p className="font-mono font-bold text-emerald-400 text-sm">
                {previewStats.unidadesAControlar.toLocaleString('es-AR')} un
              </p>
            </div>

            <div className="bg-[#020b18]/80 p-3 rounded-xl border border-sky-500/20 space-y-0.5">
              <span className="text-[10px] text-amber-300/90 uppercase font-mono block">Agotados en Tránsito</span>
              <p className="font-mono font-bold text-amber-400 text-sm">
                {previewStats.agotadosASeparar} SKUs
              </p>
            </div>

            {tieneReporteAp && (
              <div className="bg-[#020b18]/80 p-3 rounded-xl border border-sky-500/20 space-y-0.5">
                <span className="text-[10px] text-purple-300/90 uppercase font-mono block">Monto Seleccionado</span>
                <p className="font-mono font-bold text-purple-300 text-sm">
                  ${previewStats.montoTotalSeleccionado.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 6. Botón de Confirmación Principal */}
        <button
          type="button"
          onClick={handleSaveAndStart}
          disabled={isSaving}
          className={`w-full py-3.5 font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer disabled:opacity-50 ${
            isEnProceso
              ? 'bg-slate-700 hover:bg-slate-600 text-white shadow-slate-700/30'
              : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-blue-600/30'
          }`}
        >
          {isSaving ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : isEnProceso ? (
            <>
              <ArrowLeft className="w-5 h-5" />
              <span>Volver a la Auditoría</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-white" />
              <span>Confirmar e Iniciar Auditoría</span>
            </>
          )}
        </button>

      </main>

      {/* Cápsula Flotante Inferior de Navegación */}
      <BottomNavCapsule 
        onBack={onBack} 
        showScan={false} 
        showHome={false} 
      />
    </div>
  );
};
