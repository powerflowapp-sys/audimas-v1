import React, { useState, useEffect, useRef } from 'react';
import { 
  PackageX, 
  Layers, 
  CheckCircle2, 
  X, 
  AlertTriangle, 
  Clock, 
  User, 
  Package, 
  History, 
  RefreshCw, 
  AlertOctagon, 
  Plus, 
  Minus, 
  RotateCcw,
  ArrowLeft,
  Lightbulb,
  Lock
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { AuditoriaItem, AuditoriaLog } from '../types';

interface ModalIngresoSobranteProps {
  isOpen: boolean;
  upc: string;
  descripcion?: string;
  item?: AuditoriaItem | null;
  naeId?: string;
  isFinalizado?: boolean;
  onClose: () => void;
  onConfirm: (cantidad: number, modo?: 'BULTOS' | 'UNIDADES', cajaSeparada?: boolean) => Promise<void>;
}

export const ModalIngresoSobrante: React.FC<ModalIngresoSobranteProps> = ({
  isOpen,
  upc,
  descripcion,
  item,
  naeId,
  isFinalizado = false,
  onClose,
  onConfirm
}) => {
  const [cantidadInput, setCantidadInput] = useState<string>('');
  const [operacion, setOperacion] = useState<'SUMAR' | 'RESTAR'>('SUMAR');
  const [modoSeleccionado, setModoSeleccionado] = useState<'BULTOS' | 'UNIDADES'>('UNIDADES');
  const [cajaSeparada, setCajaSeparada] = useState<boolean>(false);
  const [showAgotadoWarning, setShowAgotadoWarning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determinar si el producto es del camión (facturado esperados > 0)
  const esDelCamion = Boolean(
    item && (Number(item.bultos_esperados || 0) > 0 || Number(item.unidades_esperadas || 0) > 0)
  );

  // Determinar si es agotado en tránsito y si ya fue separada previamente en BD
  const esAgotadoTransito = Boolean(item?.es_agotado_transito);
  const yaFueSeparada = Boolean(item?.caja_separada_transito);

  // Alerta si ya completó o superó lo facturado
  const yaCompletoFactura = Boolean(
    esDelCamion && item && (
      (item.bultos_esperados > 0 && item.bultos_escaneados >= item.bultos_esperados) ||
      (item.unidades_esperadas > 0 && item.unidades_escaneadas >= item.unidades_esperadas)
    )
  );

  // Factores de empaque y cálculo unificado de unidades
  const bultosEsp = Number(item?.bultos_esperados || 0);
  const unidadesEsp = Number(item?.unidades_esperadas || 0);
  const unidadesPorBulto = (bultosEsp > 0 && unidadesEsp > 0) ? (unidadesEsp / bultosEsp) : 0;

  const totalUnidadesEscaneadas = unidadesPorBulto > 0
    ? Number(item?.unidades_escaneadas || 0) + (Number(item?.bultos_escaneados || 0) * unidadesPorBulto)
    : Number(item?.unidades_escaneadas || 0);

  // Función de consulta del historial de escaneos para este producto
  const fetchLogs = async () => {
    if (!naeId) {
      console.warn('⚠️ [ModalIngresoSobrante] No se proporcionó naeId para consultar auditoria_logs.');
      setLogs([]);
      return;
    }

    const targetUpc = (item?.upc || upc || '').trim();
    const targetSku = (item?.sku || '').trim();

    console.log('🔍 [ModalIngresoSobrante] Ejecutando fetchLogs con:', {
      naeId,
      upcProp: upc,
      itemUpc: item?.upc,
      targetUpc,
      targetSku,
      isFinalizado
    });

    if (!targetUpc && !targetSku) {
      console.warn('⚠️ [ModalIngresoSobrante] No hay UPC ni SKU para filtrar auditoria_logs.');
      setLogs([]);
      return;
    }

    setLoadingLogs(true);
    try {
      // 1. Consulta principal por nae_id y upc
      let { data, error } = await supabase
        .from('auditoria_logs')
        .select('*')
        .eq('nae_id', naeId)
        .eq('upc', targetUpc)
        .order('created_at', { ascending: false });

      // 2. Si no devolvió filas por UPC, intentar buscar por SKU (por si fue guardado con SKU)
      if ((!data || data.length === 0) && targetSku && targetSku !== targetUpc) {
        console.log('🔄 [ModalIngresoSobrante] Sin resultados por UPC. Reintentando consulta por SKU:', targetSku);
        const skuRes = await supabase
          .from('auditoria_logs')
          .select('*')
          .eq('nae_id', naeId)
          .eq('upc', targetSku)
          .order('created_at', { ascending: false });

        if (!skuRes.error && skuRes.data && skuRes.data.length > 0) {
          data = skuRes.data;
        }
      }

      if (error) {
        console.error('❌ [ModalIngresoSobrante] Error de Supabase al consultar auditoria_logs:', error);
      }

      console.log(`📊 [ModalIngresoSobrante] Registros obtenidos (${data?.length || 0}):`, data);
      setLogs(data || []);
    } catch (err) {
      console.error('❌ [ModalIngresoSobrante] Excepción al obtener historial:', err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCantidadInput('');
      setOperacion('SUMAR');
      setIsSubmitting(false);
      setShowAgotadoWarning(false);
      setModoSeleccionado(esDelCamion ? 'BULTOS' : 'UNIDADES');
      setCajaSeparada(Boolean(item?.caja_separada_transito));

      // Autofocus en el input sólo si no está finalizado
      if (!isFinalizado) {
        const timer = setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 150);
        return () => clearTimeout(timer);
      }

      // Cargar trazabilidad de escaneos
      fetchLogs();
    }
  }, [isOpen, upc, item?.upc, item?.id, naeId, isFinalizado]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFinalizado) return;

    const cant = parseFloat(cantidadInput);
    if (isNaN(cant) || cant === 0 || isSubmitting) return;

    // Validación estricta para la primera vez en Agotado en Tránsito (si no fue separada previamente)
    if (esAgotadoTransito && !yaFueSeparada && !cajaSeparada) {
      setShowAgotadoWarning(true);
      return;
    }

    // Calcular cantidad final respetando la operación seleccionada o el signo ingresado
    let finalCantidad = cant;
    if (operacion === 'RESTAR') {
      finalCantidad = -Math.abs(cant);
    }

    setIsSubmitting(true);
    try {
      await onConfirm(finalCantidad, modoSeleccionado, cajaSeparada);
      await fetchLogs();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatHoraFechaLog = (dateStr?: string) => {
    if (!dateStr) return '--:--:--';
    try {
      const d = new Date(dateStr);
      const hora = d.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const fecha = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit'
      });
      return `${fecha} ${hora}`;
    } catch {
      return dateStr;
    }
  };

  const displayDescripcion = item?.descripcion || descripcion || 'Producto no identificado';

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col h-full w-full overflow-y-auto font-sans select-none animate-fade-in">
      
      {/* 1. Header Fijo Superior GDS (Sticky Header) */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 bg-[#0c244d] hover:bg-[#163a75] text-sky-300 font-bold text-xs rounded-xl flex items-center space-x-1 border border-sky-500/30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </button>

          <div>
            <h2 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider leading-tight">
              {isFinalizado 
                ? '🔒 Consulta de Producto (Solo Lectura)' 
                : operacion === 'RESTAR' 
                ? '🔄 Corrección / Ajuste' 
                : esDelCamion 
                ? '📦 Auditoría de Producto' 
                : '📦 Mercadería No Facturada'}
            </h2>
            <p className="text-xs sm:text-sm font-mono font-bold text-white">
              UPC: {item?.upc || upc}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#0c244d] border border-sky-500/30 rounded-xl text-xs text-sky-200">
          <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-bold truncate max-w-[80px]">
            {item?.ultimo_colaborador || 'Operador'}
          </span>
        </div>
      </header>

      {/* 2. Cuerpo Principal con Scroll Táctil Natural */}
      <main className="flex-1 p-4 pb-28 max-w-md mx-auto w-full space-y-4">
        
        {/* BANNER AVISO DE MODO SOLO LECTURA SI EL CAMIÓN ESTÁ FINALIZADO */}
        {isFinalizado && (
          <div className="p-3.5 bg-[#061224] border-2 border-amber-500/80 rounded-2xl flex items-center space-x-3 text-xs text-amber-200 shadow-xl animate-fade-in">
            <Lock className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h4 className="font-['Chakra_Petch'] font-extrabold text-sm text-white uppercase tracking-wider">
                🔒 Auditoría Finalizada - Modo Solo Lectura (Sin modificaciones)
              </h4>
              <p className="text-[11px] text-amber-200/90 mt-0.5 font-medium leading-relaxed">
                Este camión está cerrado y no permite modificaciones ni nuevos ingresos.
              </p>
            </div>
          </div>
        )}

        {/* 1. Tarjeta de Datos del Producto y Estado Acumulado GDS */}
        <div className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            {/* Etiqueta de Departamento Clara */}
            <span className="px-2.5 py-1 bg-[#0c244d] text-sky-200 rounded-xl text-xs font-['Chakra_Petch'] font-extrabold uppercase tracking-wider border border-sky-500/30 flex items-center space-x-1.5 shadow-sm">
              <span>🏷️ Depto:</span>
              <span className="text-white font-black">
                {item?.es_sobrante_no_facturado || item?.depto_codigo === '999' || !esDelCamion
                  ? '999 - DESCONOCIDO'
                  : item?.depto_codigo 
                  ? `${item.depto_codigo} - ${item.depto_nombre || 'GENERAL'}` 
                  : (item?.depto_nombre || 'GENERAL')}
              </span>
            </span>

            <span className="text-xs sm:text-sm font-mono font-bold text-white">
              SKU: {item?.sku || '--'}
            </span>
          </div>

          <div>
            <h3 className="font-black text-base text-white leading-snug">
              {displayDescripcion}
            </h3>
          </div>

          {/* Desglose de Estado Facturado vs Ingresado Centrado en Unidades */}
          {esDelCamion && item ? (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-500/10 text-xs">
              {/* Facturado Esperado */}
              <div className="p-3 bg-[#020b18] rounded-xl border border-sky-500/20 text-center">
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">Facturado Esperado</span>
                <span className="font-black text-slate-100 text-base block mt-0.5 font-mono">
                  {unidadesEsp} <span className="text-xs font-bold text-slate-400">un</span>
                </span>
                {bultosEsp > 0 && (
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                    ({bultosEsp} bultos)
                  </span>
                )}
              </div>

              {/* Ingresado Hasta Ahora */}
              <div className="p-3 bg-[#020b18] rounded-xl border border-sky-500/20 text-center">
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">Ingresado Hasta Ahora</span>
                <span className="font-black text-sky-300 text-base block mt-0.5 font-mono">
                  {totalUnidadesEscaneadas} <span className="text-xs font-bold text-sky-400">un</span>
                </span>
                {Number(item.bultos_escaneados || 0) > 0 && (
                  <span className="text-[10px] text-sky-400/80 block mt-0.5 font-medium">
                    ({item.bultos_escaneados} bultos)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-[#020b18] rounded-xl border border-purple-500/30 text-center">
              <span className="text-[10px] font-['Chakra_Petch'] font-bold text-purple-300 uppercase tracking-wider block">Acumulado Registrado (Sobrante)</span>
              <span className="font-black text-purple-400 text-lg block mt-0.5 font-mono">
                {item?.unidades_escaneadas || 0} <span className="text-xs font-bold text-purple-300">Unidades</span>
              </span>
            </div>
          )}

          {yaCompletoFactura && item && operacion === 'SUMAR' && !isFinalizado && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-left text-amber-200 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-extrabold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⚠️ ALERTA DE SOBRANTE FÍSICO</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Este producto ya completó lo facturado ({item.bultos_escaneados}/{item.bultos_esperados} bultos). Si continúas, se registrará como SOBRANTE FÍSICO.
              </p>
            </div>
          )}
        </div>

        {/* CONTROLES DE INGRESO SOLO VISIBLES SI NO ESTÁ FINALIZADO */}
        {!isFinalizado && (
          <>
            {/* 2. Panel de Controles Táctiles GDS: Operación y Modo */}
            <div className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-3.5 space-y-3 shadow-xl">
              <div className="space-y-1.5">
                <label className="text-xs font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">
                  1. Selecciona la Operación:
                </label>
                <div className="grid grid-cols-2 p-1 bg-[#020b18] rounded-xl border border-sky-500/20">
                  <button
                    type="button"
                    onClick={() => setOperacion('SUMAR')}
                    className={`py-2.5 px-3 rounded-lg text-xs font-['Chakra_Petch'] font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
                      operacion === 'SUMAR'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>➕ Sumar Conteo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOperacion('RESTAR')}
                    className={`py-2.5 px-3 rounded-lg text-xs font-['Chakra_Petch'] font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all ${
                      operacion === 'RESTAR'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Minus className="w-4 h-4" />
                    <span>➖ Restar / Corregir</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">
                  2. Modo de Conteo:
                </label>
                {!esDelCamion ? (
                  <div className="p-2.5 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
                    <span className="flex items-center space-x-1.5 font-bold">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>Modo Fijo para Sobrantes:</span>
                    </span>
                    <span className="px-2.5 py-1 bg-purple-600 text-white rounded-lg font-black text-xs shadow-sm font-mono">
                      UNIDADES (Exclusivo)
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 p-1 bg-[#020b18] rounded-xl border border-sky-500/20">
                    <button
                      type="button"
                      onClick={() => setModoSeleccionado('BULTOS')}
                      className={`py-2 px-3 text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                        modoSeleccionado === 'BULTOS'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      <span>📦 Por Bultos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModoSeleccionado('UNIDADES')}
                      className={`py-2 px-3 text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                        modoSeleccionado === 'UNIDADES'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>낱 Por Unidades</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Formulario de Ingreso con Input Numérico GDS */}
            <form onSubmit={handleSubmit} className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-4 space-y-3 shadow-xl">
              <div className="space-y-1.5 text-center">
                <label className="text-xs font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider block">
                  {operacion === 'RESTAR' ? 'Ingresar Cantidad a Restar:' : 'Ingresar Cantidad a Sumar:'}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
                  placeholder={operacion === 'RESTAR' ? "-0" : "0"}
                  required
                  disabled={isSubmitting}
                  className={`w-full py-3.5 px-4 bg-[#020b18] border-2 font-mono text-3xl font-black text-center rounded-2xl placeholder:text-slate-700 focus:outline-none focus:ring-4 ${
                    operacion === 'RESTAR'
                      ? 'border-red-500 text-red-400 focus:border-red-400 focus:ring-red-500/20'
                      : 'border-purple-500 text-white focus:border-purple-400 focus:ring-purple-500/20'
                  }`}
                />
              </div>

              {/* Conversión Dinámica Automática en Tiempo Real si se selecciona Por Bultos */}
              {modoSeleccionado === 'BULTOS' && unidadesPorBulto > 0 && cantidadInput && !isNaN(parseFloat(cantidadInput)) && parseFloat(cantidadInput) !== 0 && (
                <div className="p-2.5 bg-blue-950/70 border border-blue-500/40 rounded-xl text-center text-xs text-blue-200 animate-fade-in flex items-center justify-center space-x-2 font-medium shadow-inner">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    💡 <strong>{Math.abs(parseFloat(cantidadInput))} {Math.abs(parseFloat(cantidadInput)) === 1 ? 'bulto' : 'bultos'}</strong> {operacion === 'RESTAR' ? 'equivalen a restar' : 'equivalen a'} <strong>{Math.abs(parseFloat(cantidadInput)) * unidadesPorBulto} unidades</strong> ({unidadesPorBulto} un/bulto).
                  </span>
                </div>
              )}

              {/* ALERTA Y CHECKBOX DE AGOTADO EN TRÁNSITO */}
              {esAgotadoTransito && (
                yaFueSeparada ? (
                  /* AVISO TENUE SI YA FUE SEPARADA PREVIAMENTE EN BD */
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-200 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-bold">
                      ✅ Caja de Agotado en Tránsito ya fue separada para salón.
                    </span>
                  </div>
                ) : (
                  /* VALIDACIÓN Y CHECKBOX OBLIGATORIO LA PRIMERA VEZ */
                  <div className={`p-3.5 bg-red-950/90 border-2 rounded-xl text-red-100 space-y-2.5 shadow-xl transition-all ${
                    showAgotadoWarning ? 'border-amber-400 ring-4 ring-amber-500/30' : 'border-red-500 animate-pulse'
                  }`}>
                    <div className="flex items-start space-x-2.5">
                      <AlertOctagon className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-['Chakra_Petch'] font-black text-xs text-red-200 uppercase tracking-tight">
                          🚨 ¡AGOTADO EN TRÁNSITO (STOCK 0 en Salón)!
                        </h4>
                        <p className="text-[11px] font-black text-white mt-0.5">
                          SEPARAR 1 CAJA A GÓNDOLA DE INMEDIATO
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center space-x-2.5 pt-2 border-t border-red-800/90 cursor-pointer select-none bg-red-900/40 p-2 rounded-lg border border-red-500/40">
                      <input
                        type="checkbox"
                        checked={cajaSeparada}
                        onChange={(e) => {
                          setCajaSeparada(e.target.checked);
                          if (e.target.checked) setShowAgotadoWarning(false);
                        }}
                        className="w-4 h-4 text-red-600 bg-[#020b18] border-red-500 rounded focus:ring-red-500"
                      />
                      <span className="text-[11px] font-bold text-white leading-tight">
                        ☑️ Confirmo que separé 1 caja para reposición en góndola
                      </span>
                    </label>

                    {showAgotadoWarning && (
                      <p className="text-[11px] font-bold text-amber-300 animate-pulse text-center pt-1 border-t border-amber-500/40">
                        ⚠️ ATENCIÓN: Debes confirmar haber separado 1 caja antes de continuar.
                      </p>
                    )}
                  </div>
                )
              )}

              {/* Botón Principal de Confirmación */}
              <button
                type="submit"
                disabled={!cantidadInput || parseFloat(cantidadInput) === 0 || isSubmitting}
                className={`w-full py-4 text-white font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center space-x-2 transition-all active:scale-98 disabled:opacity-50 disabled:shadow-none ${
                  operacion === 'RESTAR'
                    ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-red-600/30'
                    : 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700 shadow-purple-600/30'
                }`}
              >
                {isSubmitting ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : operacion === 'RESTAR' ? (
                  <RotateCcw className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                <span>
                  {operacion === 'RESTAR' ? 'Confirmar Corrección (Resta)' : 'Confirmar Ingreso'}
                </span>
              </button>
            </form>
          </>
        )}

        {/* 4. Sección de Historial de Trazabilidad Integrado GDS */}
        <div className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-sky-500/10 pb-2">
            <h4 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <History className="w-4 h-4 text-sky-400" />
              <span>HISTORIAL DE ESCANEOS ({logs.length})</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">Cronológico</span>
          </div>

          <div className="space-y-2">
            {loadingLogs ? (
              <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Cargando trazabilidad...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
                Sin escaneos registrados para este producto en el camión
              </div>
            ) : (
              logs.map((log) => {
                const esResta = log.cantidad < 0;
                const cantAbs = Math.abs(log.cantidad);
                const textoCantidad = esResta ? `-${cantAbs}` : `+${log.cantidad}`;
                const modoLabel = log.modo_conteo === 'BULTOS' 
                  ? (cantAbs === 1 ? 'Bulto' : 'Bultos') 
                  : (cantAbs === 1 ? 'Unidad' : 'Unidades');

                return (
                  <div 
                    key={log.id || `${log.created_at}-${Math.random()}`}
                    className={`p-2.5 border rounded-xl flex items-center justify-between text-xs shadow-sm ${
                      esResta 
                        ? 'bg-red-950/30 border-red-500/40' 
                        : 'bg-slate-950 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="font-bold text-slate-200 truncate">{log.colaborador_nombre}</span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 font-mono">
                      <span className={`font-black ${esResta ? 'text-red-400' : 'text-purple-300'}`}>
                        {textoCantidad} {modoLabel}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-600" />
                        <span>{formatHoraFechaLog(log.created_at)}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE ADVERTENCIA PREVENTIVA SI NO CONFIRMA EL CHECKBOX DE AGOTADO EN TRÁNSITO */}
      {showAgotadoWarning && !isFinalizado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900 border-2 border-amber-500 rounded-2xl p-4 space-y-3 shadow-2xl text-center">
            <div className="flex justify-center text-amber-400">
              <AlertTriangle className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="font-black text-sm text-amber-200 uppercase tracking-tight">
              ⚠️ ATENCIÓN: CONFIRMACIÓN REQUERIDA
            </h3>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              Este producto es <strong>Agotado en Tránsito</strong> (Stock 0 en salón). Debes confirmar que separaste 1 caja para reposición marcando el casillero antes de continuar.
            </p>
            <button
              type="button"
              onClick={() => setShowAgotadoWarning(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all"
            >
              Entendido, marcaré la casilla
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
