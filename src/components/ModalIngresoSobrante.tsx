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
  ArrowLeft,
  Lightbulb,
  Lock,
  Camera,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { AuditoriaItem, AuditoriaLog } from '../types';
import { getBarcodeVariants, matchBarcode } from '../utils/barcodeUtils';
import { uploadFotoDano, parseFotoUrls } from '../utils/imageCompressor';
import { formatNumber, isItemPesable, getUomLabel, getUomButtonLabel, getScanLogUomLabel } from '../utils/formatUtils';
import { BottomNavCapsule } from './BottomNavCapsule';

interface ModalIngresoSobranteProps {
  isOpen: boolean;
  upc: string;
  descripcion?: string;
  item?: AuditoriaItem | null;
  naeId?: string;
  isFinalizado?: boolean;
  onClose: () => void;
  onHome?: () => void;
  onConfirm: (
    cantidad: number, 
    modo?: 'BULTOS' | 'UNIDADES', 
    cajaSeparada?: boolean,
    danoInfo?: { cantidadDanada: number; observacionDano: string; fotoDanoUrl: string; fotosDanoUrls?: string[] }
  ) => Promise<void>;
}

export const ModalIngresoSobrante: React.FC<ModalIngresoSobranteProps> = ({
  isOpen,
  upc,
  descripcion,
  item,
  naeId,
  isFinalizado = false,
  onClose,
  onHome,
  onConfirm
}) => {
  const [cantidadInput, setCantidadInput] = useState<string>('');
  const [modoSeleccionado, setModoSeleccionado] = useState<'BULTOS' | 'UNIDADES'>('UNIDADES');
  const [cajaSeparada, setCajaSeparada] = useState<boolean>(false);
  const [showAgotadoWarning, setShowAgotadoWarning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estados para reporte de mercadería dañada / rota
  const [showDanoSection, setShowDanoSection] = useState<boolean>(false);
  const [cantidadDanadaInput, setCantidadDanadaInput] = useState<string>('');
  const [observacionDanoInput, setObservacionDanoInput] = useState<string>('');
  const [fotosDanoUrl, setFotosDanoUrl] = useState<string[]>([]);
  const [isUploadingFoto, setIsUploadingFoto] = useState<boolean>(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [masterUom, setMasterUom] = useState<string | undefined>(item?.unidad_medida);
  const inputRef = useRef<HTMLInputElement>(null);

  // Consultar unidad_medida oficial en maestro_productos por SKU / UPC cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return;

    setMasterUom(item?.unidad_medida);

    const targetSku = (item?.sku || '').trim();
    const targetUpc = (item?.upc || upc || '').trim();

    if (!targetSku && !targetUpc) return;

    const fetchMasterUom = async () => {
      try {
        let query = supabase.from('maestro_productos').select('unidad_medida');
        if (targetSku) {
          query = query.eq('sku', targetSku);
        } else if (targetUpc) {
          query = query.eq('upc', targetUpc);
        }

        const { data, error } = await query.limit(1).maybeSingle();
        if (!error && data && data.unidad_medida && data.unidad_medida.trim()) {
          setMasterUom(data.unidad_medida.trim());
        }
      } catch (err) {
        console.warn('⚠️ Error al consultar unidad_medida en maestro_productos:', err);
      }
    };

    fetchMasterUom();
  }, [isOpen, item?.sku, item?.upc, upc, item?.unidad_medida]);

  // Determinar si el producto es del camión (facturado esperados > 0)
  const esDelCamion = Boolean(
    item && (Number(item.unidades_esperadas || 0) > 0 || Number(item.bultos_esperados || 0) > 0)
  );

  const esAgotadoTransito = item?.es_agotado_transito ?? false;
  const yaFueSeparada = item?.caja_separada_transito ?? false;

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

  // Función de consulta del historial global de escaneos para este producto
  const fetchLogs = async () => {
    if (!naeId) {
      setLogs([]);
      return;
    }

    const targetUpc = (item?.upc || upc || '').trim();
    const targetSku = (item?.sku || '').trim();

    if (!targetUpc && !targetSku) {
      setLogs([]);
      return;
    }

    setLoadingLogs(true);
    try {
      const targetUpc = (item?.upc || upc || '').trim();
      const targetSku = (item?.sku || '').trim();
      const variantsUpc = getBarcodeVariants(targetUpc);
      const variantsSku = getBarcodeVariants(targetSku);
      const searchCodes = Array.from(new Set([...variantsUpc, ...variantsSku])).filter(Boolean);

      const { data, error } = await supabase
        .from('auditoria_logs')
        .select('*')
        .eq('nae_id', naeId)
        .in('upc', searchCodes)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ Error al consultar auditoria_logs:', error);
      }

      setLogs(data || []);
    } catch (err) {
      console.error('❌ Excepción al obtener historial:', err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Bloquear scroll del body al abrir modal para eliminar el doble scroll lateral
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Inicialización al abrir modal (sin despliegue automático del teclado virtual)
  useEffect(() => {
    if (isOpen) {
      setCantidadInput('');
      setIsSubmitting(false);
      setShowAgotadoWarning(false);
      setModoSeleccionado(esDelCamion ? 'BULTOS' : 'UNIDADES');
      setCajaSeparada(Boolean(item?.caja_separada_transito));

      // Inicializar sección de dañados limpia por defecto cada vez que se abre el modal
      setCantidadDanadaInput('');
      setObservacionDanoInput('');
      setFotosDanoUrl([]);
      setShowDanoSection(false);
    }
  }, [isOpen, esDelCamion, item?.caja_separada_transito]);

  // Carga inicial y suscripción Realtime en vivo a los escaneos de auditoria_logs de todo el equipo
  useEffect(() => {
    if (!isOpen || !naeId) return;

    fetchLogs();

    const targetUpc = (item?.upc || upc || '').trim();
    const targetSku = (item?.sku || '').trim();
    const searchCodes = new Set([
      ...getBarcodeVariants(targetUpc),
      ...getBarcodeVariants(targetSku)
    ]);

    const channelName = `realtime-sobrante-logs-${naeId}-${targetUpc || targetSku}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auditoria_logs',
          filter: `nae_id=${naeId}`
        },
        (payload) => {
          console.log('⚡ [ModalIngresoSobrante] Actualización Realtime en auditoria_logs:', payload);
          const newUpc = (payload.new as any)?.upc?.trim();
          const oldUpc = (payload.old as any)?.upc?.trim();

          if (!newUpc && !oldUpc) {
            fetchLogs();
          } else if ((newUpc && searchCodes.has(newUpc)) || (oldUpc && searchCodes.has(oldUpc))) {
            fetchLogs();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`📡 [ModalIngresoSobrante] Suscripción en vivo activa a escaneos NAE ${naeId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, naeId, upc, item?.upc, item?.sku, item?.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fotosDanoUrl.length >= 3) {
      alert('Máximo 3 fotos de evidencia permitidas.');
      return;
    }

    setIsUploadingFoto(true);
    try {
      const url = await uploadFotoDano(file, naeId || 'draft', item?.upc || upc);
      setFotosDanoUrl((prev) => [...prev, url]);
    } catch (err) {
      alert('Error al procesar la foto de evidencia.');
    } finally {
      setIsUploadingFoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (indexToRemove: number) => {
    setFotosDanoUrl((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  if (!isOpen) return null;

  const parsedCantidad = parseFloat(cantidadInput.replace(',', '.').trim());
  const isInputValid = !isNaN(parsedCantidad) && parsedCantidad !== 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFinalizado) return;

    if (!isInputValid || isSubmitting) return;

    if (esAgotadoTransito && !yaFueSeparada && !cajaSeparada) {
      setShowAgotadoWarning(true);
      return;
    }

    const parsedDanada = parseFloat(cantidadDanadaInput.replace(',', '.').trim()) || 0;
    const danoInfo = (parsedDanada > 0 || observacionDanoInput.trim() || fotosDanoUrl.length > 0) ? {
      cantidadDanada: parsedDanada,
      observacionDano: observacionDanoInput.trim(),
      fotoDanoUrl: fotosDanoUrl.length > 1 ? JSON.stringify(fotosDanoUrl) : (fotosDanoUrl[0] || ''),
      fotosDanoUrls: fotosDanoUrl
    } : undefined;

    setIsSubmitting(true);
    try {
      await onConfirm(parsedCantidad, modoSeleccionado, cajaSeparada, danoInfo);
      await fetchLogs();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatHoraFechaLog = (dateStr?: string) => {
    if (!dateStr) return '--:--:--';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const displayDescripcion = item?.descripcion || descripcion || 'Producto no identificado';

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] h-screen max-h-screen overflow-hidden flex flex-col font-sans select-none animate-fade-in">
      
      {/* Header Fijo Superior GDS */}
      <header className="shrink-0 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-3.5 py-2.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div>
            <h2 className="font-['Chakra_Petch'] font-black text-xs sm:text-sm text-sky-300 uppercase tracking-wider leading-tight">
              {isFinalizado ? '🔒 Consulta (Solo Lectura)' : '📦 Ingreso de Cantidad'}
            </h2>
            <p className="text-xs font-mono font-bold text-white">UPC: {item?.upc || upc}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 px-2 py-1 bg-[#0c244d] border border-sky-500/30 rounded-xl text-xs text-sky-200">
          <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-bold truncate max-w-[80px]">
            {item?.ultimo_colaborador || 'Operador'}
          </span>
        </div>
      </header>

      {/* Cuerpo Principal Unificado con Scroll Único sin barra visual y pb-36 de seguridad */}
      <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden no-scrollbar pb-36 px-4 py-3 max-w-md mx-auto w-full space-y-3">
        
        {/* Banner Modo Solo Lectura */}
        {isFinalizado && (
          <div className="p-3 bg-[#061224] border-2 border-amber-500/80 rounded-2xl flex items-center space-x-2.5 text-xs text-amber-200 shadow-xl">
            <Lock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h4 className="font-['Chakra_Petch'] font-extrabold text-xs text-white uppercase tracking-wider">
                🔒 Auditoría Finalizada (Solo Lectura)
              </h4>
              <p className="text-[10px] text-amber-200/90 mt-0.5 font-medium leading-relaxed">
                Este camión está cerrado y no permite modificaciones.
              </p>
            </div>
          </div>
        )}

        {/* 1. Tarjeta de Datos del Producto y Estado Acumulado */}
        <div className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-3 space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="px-2 py-0.5 bg-[#0c244d] text-sky-200 rounded-lg text-[10px] font-['Chakra_Petch'] font-extrabold uppercase tracking-wider border border-sky-500/30 flex items-center space-x-1">
              <span>🏷️ Depto:</span>
              <span className="text-white font-black">
                {item?.es_sobrante_no_facturado || item?.depto_codigo === '999' || !esDelCamion
                  ? '999 - DESCONOCIDO'
                  : item?.depto_codigo 
                  ? `${item.depto_codigo} - ${item.depto_nombre || 'GENERAL'}` 
                  : (item?.depto_nombre || 'GENERAL')}
              </span>
            </span>

            <span className="text-xs font-mono font-bold text-white">
              SKU: {item?.sku || '--'}
            </span>
          </div>

          <div>
            <h3 className="font-black text-sm text-white leading-snug">
              {displayDescripcion}
            </h3>
          </div>

          {/* Desglose Facturado vs Ingresado */}
          {esDelCamion && item ? (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-500/10 text-xs">
              <div className="p-2 bg-[#020b18] rounded-xl border border-sky-500/20 text-center">
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">Facturado Esperado</span>
                <span className="font-black text-slate-100 text-sm block mt-0.5 font-mono">
                  {formatNumber(unidadesEsp)} <span className="text-[10px] font-bold text-slate-400">{getUomLabel(masterUom)}</span>
                </span>
                {bultosEsp > 0 && (
                  <span className="text-[10px] text-slate-400 block font-medium">
                    ({formatNumber(bultosEsp)} bultos)
                  </span>
                )}
              </div>

              <div className="p-2 bg-[#020b18] rounded-xl border border-sky-500/20 text-center">
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">Ingresado Hasta Ahora</span>
                <span className="font-black text-sky-300 text-sm block mt-0.5 font-mono">
                  {formatNumber(totalUnidadesEscaneadas)} <span className="text-[10px] font-bold text-sky-400">{getUomLabel(masterUom)}</span>
                </span>
                {Number(item.bultos_escaneados || 0) > 0 && (
                  <span className="text-[10px] text-sky-400/80 block font-medium">
                    ({formatNumber(item.bultos_escaneados)} bultos)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-2 bg-[#020b18] rounded-xl border border-purple-500/30 text-center">
              <span className="text-[10px] font-['Chakra_Petch'] font-bold text-purple-300 uppercase tracking-wider block">Acumulado Registrado (Sobrante)</span>
              <span className="font-black text-purple-400 text-base block mt-0.5 font-mono">
                {formatNumber(item?.unidades_escaneadas || 0)} <span className="text-xs font-bold text-purple-300">{getUomLabel(masterUom)}</span>
              </span>
            </div>
          )}

          {yaCompletoFactura && item && !isFinalizado && (
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl text-left text-amber-200 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-extrabold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>⚠️ ALERTA DE SOBRANTE FÍSICO</span>
              </div>
              <p className="text-[10px] leading-relaxed text-amber-200/90">
                Este producto ya completó lo facturado ({formatNumber(item.bultos_escaneados)}/{formatNumber(item.bultos_esperados)} bultos). Si ingresas más, se registrará como SOBRANTE FÍSICO.
              </p>
            </div>
          )}
        </div>

        {/* CONTROLES E INPUT DE INGRESO DIRECTO */}
        {!isFinalizado && (
          <form onSubmit={handleSubmit} className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-3 space-y-2.5 shadow-xl">
            
            {/* Selección de Unidad (Bultos vs Unidades/Kg) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider block">
                  Selecciona Unidad de Conteo:
                </label>
                {isItemPesable({ unidad_medida: masterUom, depto_codigo: item?.depto_codigo }) && (
                  <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                    秤 Pesable (Kg/G)
                  </span>
                )}
              </div>
              {!esDelCamion ? (
                <div className="p-2 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
                  <span className="flex items-center space-x-1.5 font-bold">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>Modo Sobrantes:</span>
                  </span>
                  <span className="px-2 py-0.5 bg-purple-600 text-white rounded font-black text-xs font-mono">
                    {getUomButtonLabel(masterUom)}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 p-1 bg-[#020b18] rounded-xl border border-sky-500/20">
                  <button
                    type="button"
                    onClick={() => setModoSeleccionado('BULTOS')}
                    className={`py-1.5 px-2.5 text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                      modoSeleccionado === 'BULTOS'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>📦 Por Bultos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModoSeleccionado('UNIDADES')}
                    className={`py-1.5 px-2.5 text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                      modoSeleccionado === 'UNIDADES'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{getUomButtonLabel(masterUom)}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Input Numérico con soporte para Decimales y Negativos */}
            <div className="space-y-1 text-center">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider block">
                  Ingresar cantidad:
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Admite -1.5, 20.5, 12.350
                </span>
              </div>

              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={cantidadInput}
                onChange={(e) => setCantidadInput(e.target.value)}
                placeholder="0.00"
                required
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-[#020b18] border-2 border-purple-500/80 focus:border-purple-400 text-white font-mono text-2xl font-black text-center rounded-xl placeholder:text-slate-700 focus:outline-none focus:ring-4 focus:ring-purple-500/20"
              />
            </div>

            {/* Conversión Dinámica de Bultos */}
            {modoSeleccionado === 'BULTOS' && unidadesPorBulto > 0 && isInputValid && (
              <div className="p-2 bg-blue-950/70 border border-blue-500/40 rounded-xl text-center text-xs text-blue-200 animate-fade-in flex items-center justify-center space-x-2 font-medium shadow-inner">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  💡 <strong>{formatNumber(parsedCantidad)} {Math.abs(parsedCantidad) === 1 ? 'bulto' : 'bultos'}</strong> = <strong>{formatNumber(parsedCantidad * unidadesPorBulto)} {getUomLabel(masterUom)}</strong> ({formatNumber(unidadesPorBulto)} {getUomLabel(masterUom)}/bulto).
                </span>
              </div>
            )}

            {/* ALERTA Y CHECKBOX DE AGOTADO EN TRÁNSITO */}
            {esAgotadoTransito && (
              yaFueSeparada ? (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-200 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold">
                    ✅ Caja de Agotado en Tránsito separada.
                  </span>
                </div>
              ) : (
                <div className={`p-3 bg-red-950/90 border-2 rounded-xl text-red-100 space-y-2 shadow-xl transition-all ${
                  showAgotadoWarning ? 'border-amber-400 ring-4 ring-amber-500/30' : 'border-red-500 animate-pulse'
                }`}>
                  <div className="flex items-start space-x-2">
                    <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-['Chakra_Petch'] font-black text-xs text-red-200 uppercase tracking-tight">
                        🚨 ¡AGOTADO EN TRÁNSITO!
                      </h4>
                      <p className="text-[11px] font-black text-white">
                        SEPARAR 1 CAJA A GÓNDOLA DE INMEDIATO
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 pt-1.5 border-t border-red-800/90 cursor-pointer select-none bg-red-900/40 p-1.5 rounded-lg border border-red-500/40">
                    <input
                      type="checkbox"
                      checked={cajaSeparada}
                      onChange={(e) => {
                        setCajaSeparada(e.target.checked);
                        if (e.target.checked) setShowAgotadoWarning(false);
                      }}
                      className="w-4 h-4 text-red-600 bg-[#020b18] border-red-500 rounded focus:ring-red-500"
                    />
                    <span className="text-[10px] font-bold text-white leading-tight">
                      ☑️ Confirmo que separé 1 caja para reposición
                    </span>
                  </label>

                  {showAgotadoWarning && (
                    <p className="text-[10px] font-bold text-amber-300 animate-pulse text-center pt-1 border-t border-amber-500/40">
                      ⚠️ ATENCIÓN: Debes confirmar haber separado 1 caja antes de continuar.
                    </p>
                  )}
                </div>
              )
            )}

            {/* SECCIÓN DESPLEGABLE: ¿REPORTAR MERCADERÍA DAÑADA / ROTA? */}
            <div className="bg-[#020b18] border border-red-500/30 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDanoSection(!showDanoSection)}
                className="w-full p-2.5 flex items-center justify-between text-xs font-['Chakra_Petch'] font-bold text-red-300 bg-red-950/20 hover:bg-red-950/40 transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <PackageX className="w-4 h-4 text-red-400 shrink-0" />
                  <span>¿Reportar Mercadería Dañada / Rota?</span>
                  {(Boolean(cantidadDanadaInput) || fotosDanoUrl.length > 0) && (
                    <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full font-mono font-bold">
                      {cantidadDanadaInput || '1'} un rotas ({fotosDanoUrl.length} {fotosDanoUrl.length === 1 ? 'foto' : 'fotos'})
                    </span>
                  )}
                </div>
                {showDanoSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDanoSection && (
                <div className="p-3 space-y-3 border-t border-red-500/20 animate-fade-in text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-['Chakra_Petch'] font-bold text-red-300 uppercase tracking-wider block mb-1">
                        Cant. Dañada / Rota:
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cantidadDanadaInput}
                        onChange={(e) => setCantidadDanadaInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full py-1.5 px-2 bg-[#05132d] border border-red-500/40 text-white font-mono text-xs font-bold rounded-lg focus:outline-none focus:border-red-400"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                        Fotos Evidencia ({fotosDanoUrl.length}/3):
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFoto || fotosDanoUrl.length >= 3}
                        className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploadingFoto ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5 text-red-400" />
                            <span>{fotosDanoUrl.length >= 3 ? 'Máx 3 Fotos' : fotosDanoUrl.length > 0 ? `+ Foto (${fotosDanoUrl.length}/3)` : 'Tomar Foto'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Grilla compacta de miniaturas cargadas (hasta 3) */}
                  {fotosDanoUrl.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {fotosDanoUrl.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-red-500/40 bg-black/60 group shadow-md">
                          <img 
                            src={url} 
                            alt={`Evidencia daño ${idx + 1}`} 
                            className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                            onClick={() => setSelectedPhotoUrl(url)}
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute top-1 right-1 p-1 bg-red-600/90 hover:bg-red-500 text-white rounded-full transition-all shadow-md z-10"
                            title="Eliminar esta foto"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Observación del daño:
                    </label>
                    <textarea
                      rows={2}
                      value={observacionDanoInput}
                      onChange={(e) => setObservacionDanoInput(e.target.value)}
                      placeholder="Ej: Caja aplastada, frasco roto, derrame..."
                      className="w-full py-1.5 px-2 bg-[#05132d] border border-sky-500/20 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-red-400"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Botón Principal de Confirmación */}
            <button
              type="submit"
              disabled={!isInputValid || isSubmitting}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider rounded-xl shadow-xl flex items-center justify-center space-x-2 transition-all active:scale-98 disabled:opacity-50 disabled:shadow-none shadow-purple-600/30"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Confirmar Cantidad</span>
            </button>
          </form>
        )}

        {/* Trazabilidad Historial */}
        <div className="bg-[#061224]/90 border border-sky-500/20 rounded-2xl p-3 space-y-2.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-sky-500/10 pb-1.5">
            <h4 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <History className="w-4 h-4 text-sky-400" />
              <span>HISTORIAL DE ESCANEOS ({logs.length})</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">Cronológico</span>
          </div>

          <div className="space-y-1.5">
            {loadingLogs ? (
              <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>Cargando trazabilidad...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
                Sin escaneos registrados para este producto en el camión
              </div>
            ) : (
              logs.map((log) => {
                const cant = Number(log.cantidad || 0);
                const esResta = cant < 0;
                const cantFormateada = cant > 0 ? `+${formatNumber(cant)}` : `${formatNumber(cant)}`;
                const modoLabel = getScanLogUomLabel(log.modo_conteo, cant, masterUom);

                return (
                  <div 
                    key={log.id || `${log.created_at}-${Math.random()}`}
                    className={`p-2 border rounded-xl flex items-center justify-between text-xs shadow-sm ${
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
                        {cantFormateada} {modoLabel}
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

      {/* Modal Advertencia Agotado en Tránsito */}
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

      {/* Modal de Ampliación de Foto de Evidencia */}
      {selectedPhotoUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedPhotoUrl(null)}
        >
          <div 
            className="relative max-w-lg max-h-[85vh] w-full overflow-hidden rounded-2xl border border-red-500/40 bg-[#061224] p-2 flex flex-col items-center justify-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedPhotoUrl(null)} 
              className="absolute top-3 right-3 p-2 bg-red-600/90 text-white rounded-full hover:bg-red-500 transition-all shadow-lg z-10"
              title="Cerrar visor"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={selectedPhotoUrl} 
              alt="Evidencia ampliada" 
              className="max-w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Cápsula Flotante Inferior de Navegación Contextual (Atrás + Inicio + Bajar, 100% Centrada) */}
      <div className="fixed bottom-4 inset-x-0 z-50 flex items-center justify-center pointer-events-none">
        <BottomNavCapsule onBack={onClose} onHome={onHome || onClose} showScan={false} showHome={true} />
      </div>
    </div>
  );
};
