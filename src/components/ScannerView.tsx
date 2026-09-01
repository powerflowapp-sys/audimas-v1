import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Scan, 
  Camera, 
  Search, 
  User, 
  Package, 
  Boxes, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Plus, 
  Minus, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  ArrowLeft,
  X,
  UserCheck,
  Zap,
  Sparkles,
  Trash2,
  Lock,
  PieChart,
  Menu
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuditoriaRealtime } from '../hooks/useAuditoriaRealtime';
import { feedbackService, ScanFeedbackType } from '../utils/feedback';
import { CameraScannerModal } from './CameraScannerModal';
import { ModalIngresoSobrante } from './ModalIngresoSobrante';
import { CollaboratorProfileModal } from './CollaboratorProfileModal';
import { BottomNavCapsule } from './BottomNavCapsule';
import { AuditoriaItem, CamionNAE } from '../types';

interface ScannerViewProps {
  naeId: string;
  onBack?: () => void;
  onHome?: () => void;
  onOpenCierre?: () => void;
  collaboratorName?: string;
}

interface LastScanBanner {
  type: ScanFeedbackType;
  title: string;
  subtitle: string;
  item?: AuditoriaItem;
  upc?: string;
  modo?: string;
  cantidad?: number;
  timestamp: number;
}

export const ScannerView: React.FC<ScannerViewProps> = ({ 
  naeId, 
  onBack,
  onHome,
  onOpenCierre,
  collaboratorName 
}) => {
  // Estado local del camión
  const [camion, setCamion] = useState<CamionNAE | null>(null);

  // Estado del Colaborador Activo y Avatar
  const [collaborator, setCollaborator] = useState<string>(() => {
    return (collaboratorName || localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
  });
  const [collaboratorAvatar, setCollaboratorAvatar] = useState<string>(() => {
    return localStorage.getItem('audimas_collaborator_avatar') || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos&backgroundColor=001040';
  });

  // Modal para cambiar colaborador
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [tempUser, setTempUser] = useState<string>(collaborator);

  // Hook Realtime
  const { items, isRealtimeConnected, toastMessage, setToastMessage, refreshItems } = useAuditoriaRealtime(naeId);

  // Estado del Escaneo y Búsqueda
  const [scanInput, setScanInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [selectedDepto, setSelectedDepto] = useState<string>('TODOS');

  // Banner de Feedback del último escaneo
  const [lastScan, setLastScan] = useState<LastScanBanner | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  // Modal para ingreso obligatorio de sobrantes / no facturados / auditoría táctil
  const [isSobranteModalOpen, setIsSobranteModalOpen] = useState<boolean>(false);
  const [sobranteUpc, setSobranteUpc] = useState<string>('');
  const [sobranteDescripcion, setSobranteDescripcion] = useState<string>('');

  // Referencias para autofoco permanente
  const inputScanRef = useRef<HTMLInputElement>(null);

  // Cargar datos del Camión NAE
  useEffect(() => {
    const fetchCamion = async () => {
      const { data, error } = await supabase
        .from('camiones_nae')
        .select('*')
        .eq('id', naeId)
        .single();
      if (data) {
        console.log('🚚 [ScannerView] Datos completos del camión NAE:', data);
        console.log('🔒 [ScannerView] Estado del camión:', data.estado);
        setCamion(data);
      } else if (error) {
        console.error('❌ [ScannerView] Error al cargar camión NAE:', error);
      }
    };
    fetchCamion();
  }, [naeId]);

  const isFinalizado = ['FINALIZADO', 'CERRADO'].includes((camion?.estado || '').trim().toUpperCase());

  // Mantener Autofoco en el input de escaneo (para pistolas Bluetooth y físicas)
  const focusScanInput = () => {
    if (isFinalizado) return;
    const isSearchActive = isSearchFocused || searchQuery.trim().length > 0;
    if (inputScanRef.current && !isUserModalOpen && !isCameraOpen && !isSobranteModalOpen && !isSearchActive) {
      inputScanRef.current.focus();
    }
  };

  useEffect(() => {
    if (isFinalizado) return;
    focusScanInput();
    const interval = setInterval(focusScanInput, 3000);
    return () => clearInterval(interval);
  }, [isUserModalOpen, isCameraOpen, isSobranteModalOpen, isSearchFocused, searchQuery, isFinalizado]);

  const formatFechaHorario = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return dateStr;
    }
  };

  interface DeptoFilterOption {
    codigo: string;
    nombre: string;
  }

  // Departamentos únicos para el carrusel de filtros (ordenados numéricamente)
  const departamentos = useMemo<DeptoFilterOption[]>(() => {
    const mapDeptos = new Map<string, string>();
    items.forEach(it => {
      const code = (it.depto_codigo || '').trim();
      if (code) {
        if (!mapDeptos.has(code)) {
          mapDeptos.set(code, it.depto_nombre || `Depto ${code}`);
        }
      }
    });

    const sortedCodes = Array.from(mapDeptos.keys()).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return [
      { codigo: 'TODOS', nombre: 'Todos los Departamentos' },
      ...sortedCodes.map(code => ({
        codigo: code,
        nombre: mapDeptos.get(code) || `Depto ${code}`
      }))
    ];
  }, [items]);

  // Filtrado y ordenamiento dinámico de ítems por departamento, búsqueda y escaneados recientemente
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // 1. Filtrar por departamento y texto de búsqueda
    const matched = items.filter(it => {
      const matchDepto = selectedDepto === 'TODOS' || (it.depto_codigo || '').trim() === selectedDepto;
      if (!q) return matchDepto;

      const upcClean = (it.upc || '').toLowerCase().trim();
      const skuClean = (it.sku || '').toLowerCase().trim();
      const descClean = (it.descripcion || '').toLowerCase().trim();

      const matchQuery = 
        upcClean.includes(q) || 
        skuClean.includes(q) || 
        descClean.includes(q) ||
        upcClean.endsWith(q) ||
        skuClean.endsWith(q);

      return matchDepto && matchQuery;
    });

    // 2. Ordenamiento dinámico:
    // Prioridad 1: Escaneados / Auditados (más recientemente modificado arriba en 1er lugar)
    // Prioridad 2: Pendientes / Sin escanear (debajo, manteniendo su orden de importación)
    return [...matched].sort((a, b) => {
      const aTieneEscaneo = Number(a.bultos_escaneados || 0) > 0 || Number(a.unidades_escaneadas || 0) > 0 || Boolean(a.es_sobrante_no_facturado) || Boolean(a.updated_at);
      const bTieneEscaneo = Number(b.bultos_escaneados || 0) > 0 || Number(b.unidades_escaneadas || 0) > 0 || Boolean(b.es_sobrante_no_facturado) || Boolean(b.updated_at);

      // Si ambos tienen historial de escaneo, el más recientemente actualizado va primero
      if (aTieneEscaneo && bTieneEscaneo) {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA;
      }

      // Si solo A tiene escaneo, A va arriba
      if (aTieneEscaneo && !bTieneEscaneo) return -1;
      // Si solo B tiene escaneo, B va arriba
      if (!aTieneEscaneo && bTieneEscaneo) return 1;

      // Si ninguno tiene escaneo (pendientes), mantener su orden de importación
      return 0;
    });
  }, [items, selectedDepto, searchQuery]);

  // Totales de avance unificados
  const stats = useMemo(() => {
    let esperados = 0;
    let escaneados = 0;
    let bultosEsperados = 0;
    let bultosEscaneados = 0;

    items.forEach(it => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const bEsp = Number(it.bultos_esperados || 0);
      const uEsc = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);

      const unPorBulto = bEsp > 0 ? (uEsp / bEsp) : 1;
      const unTotalesItem = (bEsc * unPorBulto) + uEsc;

      esperados += uEsp;
      escaneados += unTotalesItem;
      bultosEsperados += bEsp;
      bultosEscaneados += bEsc;
    });

    const porcentajeUnidades = esperados > 0 ? Math.min(100, Math.round((escaneados / esperados) * 100)) : 0;
    const porcentajeBultos = bultosEsperados > 0 ? Math.min(100, Math.round((bultosEscaneados / bultosEsperados) * 100)) : 0;

    return { esperados, escaneados, bultosEsperados, bultosEscaneados, porcentajeUnidades, porcentajeBultos };
  }, [items]);

  // Función interna para llamar a la RPC registrar_escaneo
  const procesarRegistroEscaneo = async (
    cleanUpc: string, 
    modo: 'BULTOS' | 'UNIDADES', 
    cantidad: number,
    cajaSeparada: boolean = false
  ) => {
    setIsScanning(true);
    setScanInput('');

    try {
      const { data, error } = await supabase.rpc('registrar_escaneo', {
        p_nae_id: naeId,
        p_upc: cleanUpc,
        p_modo: modo,
        p_cantidad: cantidad,
        p_colaborador: collaborator,
        p_caja_separada: cajaSeparada
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.success) {
        const itemUpdated: AuditoriaItem = data.data;
        let scanType: ScanFeedbackType = 'OK';
        let title = '';
        let subtitle = '';

        if (itemUpdated.es_agotado_transito) {
          scanType = 'AGOTADO_TRANSITO';
          title = '🚨 AGOTADO EN TRÁNSITO REGISTRADO';
          subtitle = cajaSeparada ? 'Caja separada correctamente para góndola.' : 'Recuerda separar 1 caja a góndola.';
        } else if (itemUpdated.descripcion.includes('⚠️ PRODUCTO NO ENCONTRADO')) {
          scanType = 'DESCONOCIDO';
          title = '⚠️ CÓDIGO FUERA DE CATÁLOGO';
          subtitle = '⚠️ PRODUCTO NO ENCONTRADO - BUSCAR DATOS EN SIM';
        } else if (itemUpdated.es_sobrante_no_facturado) {
          scanType = 'SOBRANTE_MAESTRO';
          title = '🟣 SOBRANTE NO FACTURADO';
          subtitle = `Producto "${itemUpdated.descripcion}" no venía en el camión. Encontrado en Catálogo Maestro.`;
        } else if (
          (modo === 'BULTOS' && itemUpdated.bultos_escaneados > itemUpdated.bultos_esperados) ||
          (modo === 'UNIDADES' && itemUpdated.unidades_escaneadas > itemUpdated.unidades_esperadas)
        ) {
          scanType = 'SOBRANTE_FACTURA';
          title = '🟡 SOBRANTE SOBRE FACTURA';
          const ex = modo === 'BULTOS' 
            ? itemUpdated.bultos_escaneados - itemUpdated.bultos_esperados 
            : itemUpdated.unidades_escaneadas - itemUpdated.unidades_esperadas;
          subtitle = `Llevas +${ex} ${modo.toLowerCase()} por encima de lo esperado.`;
        } else {
          scanType = 'OK';
          title = '🟢 CONTEO REGISTRADO';
          subtitle = `Llevas ${modo === 'BULTOS' ? itemUpdated.bultos_escaneados : itemUpdated.unidades_escaneadas} de ${modo === 'BULTOS' ? itemUpdated.bultos_esperados : itemUpdated.unidades_esperadas} ${modo.toLowerCase()}.`;
        }

        feedbackService.trigger(scanType);

        setLastScan({
          type: scanType,
          title,
          subtitle,
          item: itemUpdated,
          upc: cleanUpc,
          modo,
          cantidad,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error('Error al registrar escaneo:', err);
      feedbackService.trigger('ERROR');
      setLastScan({
        type: 'ERROR',
        title: '❌ ERROR DE PROCESAMIENTO',
        subtitle: err instanceof Error ? err.message : 'Error desconocido al escanear',
        timestamp: Date.now()
      });
    } finally {
      setIsScanning(false);
      focusScanInput();
    }
  };

  // Manejador del Escaneo Inicial (Apertura universal del Modal en CADA escaneo o ingreso manual)
  const handleExecuteScan = async (upcToScan: string) => {
    const cleanUpc = upcToScan.trim();
    if (!cleanUpc || isScanning) return;

    // Buscar si el producto ya está en la lista de auditoría del camión
    const itemEnCamion = items.find(it => (it.upc || '').trim() === cleanUpc);

    // Abrir SIEMPRE el modal táctil de auditoría/ingreso sin sumar cantidades automáticamente
    setScanInput('');
    setSobranteUpc(cleanUpc);
    setSobranteDescripcion(itemEnCamion ? itemEnCamion.descripcion : '');
    setIsSobranteModalOpen(true);
  };

  // Confirmar registro desde el Modal de Auditoría / Ingreso
  const handleConfirmSobrante = async (
    cantidad: number, 
    modo: 'BULTOS' | 'UNIDADES' = 'UNIDADES',
    cajaSeparada: boolean = false
  ) => {
    if (!sobranteUpc) return;
    const upcParaProcesar = sobranteUpc;
    setIsSobranteModalOpen(false);
    setSobranteUpc('');
    setSobranteDescripcion('');
    await procesarRegistroEscaneo(upcParaProcesar, modo, cantidad, cajaSeparada);
  };

  // Ajuste rápido manual (+ / -) directamente en la tarjeta de ítem
  const handleQuickAdjust = async (item: AuditoriaItem, delta: number) => {
    if (delta <= 0) return;
    // Abrir el modal de auditoría e ingreso contextual precargado para este ítem
    setSobranteUpc(item.upc);
    setSobranteDescripcion(item.descripcion);
    setIsSobranteModalOpen(true);
  };

  // Guardar cambio de colaborador (Siempre en MAYÚSCULAS)
  const handleSaveUser = () => {
    if (tempUser.trim()) {
      const upper = tempUser.trim().toUpperCase();
      setCollaborator(upper);
      localStorage.setItem('audimas_collaborator', upper);
    }
    setIsUserModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col font-sans pb-44 select-none">
      
      {/* 1. HEADER FIJO DE AUDITORÍA GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 shadow-lg">
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-['Chakra_Petch'] font-black text-sm text-sky-300 tracking-wider uppercase">
                  NAE: {camion?.numero_nae || 'Cargando...'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1 ${
                  isRealtimeConnected 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRealtimeConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                  <span>{isRealtimeConnected ? '● En vivo' : 'Conectando'}</span>
                </span>
              </div>
              <p className="text-[11px] text-sky-400/80 font-medium truncate max-w-[190px]">
                {camion?.tienda_nombre || 'Tienda Retail'}
              </p>
            </div>
          </div>

          {/* Colaborador Activo con Cápsula Estilizada Unificada */}
          <div
            onClick={() => setIsUserModalOpen(true)}
            className="bg-[#061224]/80 border border-sky-500/30 rounded-full px-3 py-1.5 flex items-center space-x-2.5 shadow-md backdrop-blur-md cursor-pointer hover:bg-[#0c244d] transition-all select-none"
            title={`Operario: ${collaborator} • Cambiar Perfil`}
          >
            <div className="w-7 h-7 rounded-full bg-[#020b18] overflow-hidden flex items-center justify-center border border-sky-400/40 shrink-0">
              {collaboratorAvatar ? (
                <img src={collaboratorAvatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="font-['Chakra_Petch'] font-bold text-[10px] text-sky-300">
                  {collaborator.substring(0, 2)}
                </span>
              )}
            </div>

            <span className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate max-w-[100px] sm:max-w-[140px]">
              {collaborator}
            </span>

            <Menu className="w-4 h-4 text-sky-400 shrink-0 ml-0.5" />
          </div>
        </div>

        {/* Barra de Avance de Unidades y Bultos */}
        <div className="px-3.5 pb-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span className="flex items-center space-x-1 font-['Chakra_Petch'] uppercase tracking-wider text-sky-400">
              <Boxes className="w-3.5 h-3.5 text-sky-400" />
              <span>Avance Mercadería</span>
            </span>
            <span className="font-mono text-sky-300">
              {stats.escaneados.toLocaleString()} / {stats.esperados.toLocaleString()} un ({stats.porcentajeUnidades}%)
            </span>
          </div>

          <div className="w-full bg-[#020b18] rounded-full h-2.5 overflow-hidden flex shadow-inner border border-sky-500/10">
            <div 
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400 h-full rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${stats.porcentajeUnidades}%` }}
            />
          </div>
        </div>

        {/* Carrusel Deslizable por Código de Departamento */}
        <div className="flex items-center space-x-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-t border-sky-500/20 bg-[#061224]/80">
          {departamentos.map((depto) => (
            <button
              key={depto.codigo}
              title={depto.nombre}
              onClick={() => setSelectedDepto(depto.codigo)}
              className={`px-3 py-1 text-xs font-['Chakra_Petch'] font-extrabold uppercase tracking-wider rounded-full whitespace-nowrap transition-all ${
                selectedDepto === depto.codigo
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-[#0c2847]/80 text-sky-300 hover:text-white hover:bg-[#163a75] border border-sky-500/30'
              }`}
            >
              {depto.codigo}
            </button>
          ))}
        </div>
      </header>

      {/* Toast de Actividad Realtime en Vivo */}
      {toastMessage && (
        <div className="mx-3 mt-2 p-2.5 bg-blue-900/90 border border-blue-500/40 rounded-2xl flex items-center justify-between text-xs text-blue-200 shadow-xl animate-fade-in z-30">
          <div className="flex items-center space-x-2 truncate">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">{toastMessage.message}</span>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="p-1 text-blue-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main className="p-3 space-y-3 flex-1 max-w-md mx-auto w-full">

        {/* BANNER INFORMATIVO MODO SOLO LECTURA SI EL CAMIÓN ESTÁ FINALIZADO */}
        {isFinalizado && (
          <div className="p-3.5 bg-slate-900 border-2 border-amber-500/80 rounded-2xl text-amber-200 text-xs shadow-xl flex items-center space-x-3 animate-fade-in">
            <Lock className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h4 className="font-extrabold text-sm text-white">
                🔒 Auditoría Finalizada {camion?.fecha_fin_auditoria ? `el ${formatFechaHorario(camion.fecha_fin_auditoria)}` : ''}
              </h4>
              <p className="text-[11px] text-amber-200/90 mt-0.5 font-medium">
                Esta auditoría se encuentra en modo solo lectura. Puedes consultar productos e historial sin modificar cantidades.
              </p>
            </div>
          </div>
        )}

        {/* 2. INPUT DE ESCANEO Y BÚSQUEDA CON AUTO-FOCUS Y TECLADO NUMÉRICO */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-xl">
          {!isFinalizado && (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteScan(scanInput);
              }}
              className="flex items-center space-x-2"
            >
              <div className="relative flex-1">
                <Scan className="w-5 h-5 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputScanRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Escanear UPC / Código..."
                  disabled={isScanning}
                  className="w-full pl-10 pr-3 py-3 bg-slate-950 border-2 border-blue-500/80 focus:border-blue-400 text-white font-mono text-lg tracking-wider font-bold rounded-xl placeholder:text-slate-500 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                />
              </div>

              {/* Botón de Cámara Móvil */}
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-blue-400 rounded-xl border border-slate-700 shadow-md transition-colors"
                title="Escaneo por Cámara"
              >
                <Camera className="w-5 h-5" />
              </button>

              {/* Botón Enter / Enviar manual */}
              <button
                type="submit"
                disabled={!scanInput.trim() || isScanning}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50 transition-all"
              >
                {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Enter'}
              </button>
            </form>
          )}

          {/* Buscador secundario de catálogo local */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar lista por SKU, UPC o Descripción..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl focus:outline-none focus:border-slate-600"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchFocused(false);
                  setTimeout(() => {
                    if (inputScanRef.current) inputScanRef.current.focus();
                  }, 50);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 4. CARD DE ALERTA DINÁMICA (FEEDBACK DEL ÚLTIMO ESCANEO) */}
        {lastScan && lastScan.type !== 'DESCONOCIDO' && lastScan.type !== 'AGOTADO_TRANSITO' && (
          <div className={`p-4 rounded-2xl border shadow-2xl transition-all animate-fade-in ${
            lastScan.type === 'SOBRANTE_MAESTRO'
              ? 'bg-purple-950/90 border-purple-500 text-purple-100 shadow-purple-900/30'
              : lastScan.type === 'SOBRANTE_FACTURA'
              ? 'bg-yellow-950/90 border-yellow-500 text-yellow-100'
              : 'bg-emerald-950/90 border-emerald-500 text-emerald-100'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                {lastScan.type === 'SOBRANTE_MAESTRO' && <Zap className="w-6 h-6 text-purple-400 shrink-0" />}
                {lastScan.type === 'SOBRANTE_FACTURA' && <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0" />}
                {lastScan.type === 'OK' && <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />}
                <div>
                  <h3 className="font-extrabold text-sm leading-tight">{lastScan.title}</h3>
                  <p className="text-xs mt-0.5 opacity-90">{lastScan.subtitle}</p>
                </div>
              </div>
              <button 
                onClick={() => setLastScan(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {lastScan.item && (
              <div className="mt-2.5 pt-2.5 border-t border-white/10 text-xs flex justify-between items-center">
                <span className="font-bold truncate max-w-[220px]">{lastScan.item.descripcion}</span>
                <span className="font-mono bg-black/40 px-2 py-0.5 rounded text-[11px]">
                  UPC: {lastScan.item.upc}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. LISTA DE ÍTEMS AUDITADOS (SCROLL TÁCTIL) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-400">
            <span>Ítems en Auditoría ({filteredItems.length})</span>
            <button 
              onClick={() => refreshItems()} 
              className="flex items-center space-x-1 text-blue-400 hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Actualizar</span>
            </button>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500 text-xs">
              No se encontraron productos para los filtros seleccionados.
            </div>
          ) : (
            filteredItems.map((item) => {
              const esAgotado = item.es_agotado_transito;
              const esSobrante = item.es_sobrante_no_facturado;

              const bEsp = Number(item.bultos_esperados || 0);
              const uEsp = Number(item.unidades_esperadas || 0);
              const bEsc = Number(item.bultos_escaneados || 0);
              const uEsc = Number(item.unidades_escaneadas || 0);

              const unidadesPorBulto = bEsp > 0 ? (uEsp / bEsp) : 1;
              const totalUnidadesIngresadas = (bEsc * unidadesPorBulto) + uEsc;
              const totalUnidadesEsperadas = uEsp;

              // Consolidación matemática de bultos y unidades sueltas
              const bultosConsolidados = Math.floor(totalUnidadesIngresadas / unidadesPorBulto);
              const unidadesRemanentes = Math.round(totalUnidadesIngresadas % unidadesPorBulto);

              let textoAuditado = 'Auditado: 0 bultos';
              if (totalUnidadesIngresadas > 0) {
                if (unidadesRemanentes === 0) {
                  textoAuditado = `Auditado: ${bultosConsolidados} ${bultosConsolidados === 1 ? 'bulto' : 'bultos'}`;
                } else {
                  textoAuditado = `Auditado: ${bultosConsolidados} ${bultosConsolidados === 1 ? 'bulto' : 'bultos'} + ${unidadesRemanentes} un sueltas`;
                }
              }

              const esCompletado = !esSobrante && totalUnidadesEsperadas > 0 && totalUnidadesIngresadas === totalUnidadesEsperadas;
              const esSobreFactura = !esSobrante && totalUnidadesEsperadas > 0 && totalUnidadesIngresadas > totalUnidadesEsperadas;
              const esEnProgreso = !esSobrante && totalUnidadesEsperadas > 0 && totalUnidadesIngresadas > 0 && totalUnidadesIngresadas < totalUnidadesEsperadas;
              const esPendiente = !esSobrante && totalUnidadesIngresadas === 0;

              let cardBorderClass = 'border-sky-500/20 bg-[#051329]/90 hover:border-sky-400/50';
              if (esAgotado) {
                cardBorderClass = 'border-red-500/50 bg-red-950/30';
              } else if (esSobrante) {
                cardBorderClass = 'border-purple-500/50 bg-purple-950/30';
              } else if (esCompletado) {
                cardBorderClass = 'border-emerald-500/50 bg-emerald-950/30';
              } else if (esSobreFactura) {
                cardBorderClass = 'border-amber-500/50 bg-amber-950/30';
              } else if (esEnProgreso) {
                cardBorderClass = 'border-sky-400/60 bg-[#071733]/95';
              }

              return (
                <div 
                  key={item.id || item.upc}
                  onClick={() => {
                    setSobranteUpc(item.upc);
                    setSobranteDescripcion(item.descripcion);
                    setIsSobranteModalOpen(true);
                  }}
                  className={`border rounded-2xl p-3.5 space-y-2.5 shadow-md transition-all cursor-pointer hover:border-blue-500/50 active:scale-[0.99] ${cardBorderClass}`}
                >
                  {/* Fila 1: Badges y Departamento */}
                  <div className="flex items-center justify-between text-[10px] font-extrabold gap-1 flex-wrap">
                    <span className="px-2 py-0.5 bg-[#0c244d] border border-sky-500/30 text-sky-200 text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg shadow-sm">
                      {item.es_sobrante_no_facturado || item.depto_codigo === '999'
                        ? '999 - DESCONOCIDO'
                        : item.depto_codigo 
                        ? `${item.depto_codigo} - ${item.depto_nombre || 'GENERAL'}` 
                        : (item.depto_nombre || 'GENERAL')}
                    </span>

                    <div className="flex items-center space-x-1">
                      {esAgotado && (
                        <span className="px-2 py-0.5 bg-red-500 text-white rounded-md flex items-center space-x-1 animate-pulse">
                          <AlertOctagon className="w-3 h-3" />
                          <span>AGOTADO EN TRÁNSITO</span>
                        </span>
                      )}

                      {esSobrante && (
                        <span className="px-2 py-0.5 bg-purple-600 text-white rounded-md">
                          SOBRANTE NO FACTURADO
                        </span>
                      )}

                      {esCompletado && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md font-bold">
                          COMPLETADO
                        </span>
                      )}

                      {esSobreFactura && (
                        <span className="px-2 py-0.5 bg-amber-500 text-slate-950 rounded-md font-bold">
                          SOBRANTE FACTURA (+{totalUnidadesIngresadas - totalUnidadesEsperadas} un)
                        </span>
                      )}

                      {esEnProgreso && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md font-bold">
                          EN PROGRESO
                        </span>
                      )}

                      {esPendiente && (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-bold">
                          PENDIENTE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fila 2: Descripción del Producto y Códigos Prominentes */}
                  <div>
                    <h4 className="font-extrabold text-sm text-white leading-tight">
                      {item.descripcion}
                    </h4>
                    <div className="flex items-center space-x-3 text-xs sm:text-sm text-white font-mono font-bold mt-1">
                      <span>SKU: {item.sku}</span>
                      <span className="text-slate-500 font-normal">•</span>
                      <span>UPC: {item.upc}</span>
                    </div>
                  </div>

                  {/* Fila 3: Balance Unificado de Avance y Conteo Auditado Consolidado */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="space-y-0.5 text-xs">
                      {/* Línea Principal de Avance Unificado */}
                      <div className="text-white font-extrabold text-sm flex items-center space-x-1">
                        <span className="text-slate-400 font-medium text-xs">Progreso:</span>
                        <span className={
                          esCompletado
                            ? 'text-emerald-400 font-mono'
                            : esSobreFactura
                            ? 'text-amber-400 font-mono'
                            : esEnProgreso
                            ? 'text-blue-400 font-mono'
                            : 'text-slate-300 font-mono'
                        }>
                  {totalUnidadesIngresadas} / {totalUnidadesEsperadas} un
                        </span>
                      </div>

                      {/* Desglose Físico Consolidado */}
                      <div className="text-[11px] text-slate-400 font-medium">
                        {textoAuditado}
                      </div>
                    </div>

                    {/* Botón táctil rápido + (solo en modo activo) */}
                    {!isFinalizado && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAdjust(item, 1);
                          }}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1 shadow-md transition-transform active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Fila 4: Último colaborador que auditó */}
                  {item.ultimo_colaborador && (
                    <div className="text-[10px] text-slate-500 text-right italic">
                      Último escaneo por: {item.ultimo_colaborador}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* MODAL ENRIQUECIDO DE PERFIL DE OPERARIO */}
      <CollaboratorProfileModal
        isOpen={isUserModalOpen}
        currentName={collaborator}
        currentAvatar={collaboratorAvatar}
        onClose={() => setIsUserModalOpen(false)}
        onSave={(name, avatar) => {
          setCollaborator(name);
          setCollaboratorAvatar(avatar);
          localStorage.setItem('audimas_collaborator', name);
          localStorage.setItem('audimas_collaborator_avatar', avatar);
          setIsUserModalOpen(false);
        }}
      />

      {/* MODAL DE CÁMARA ESCÁNER */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={(scannedCode) => {
          handleExecuteScan(scannedCode);
        }}
      />

      {/* MODAL OBLIGATORIO DE INGRESO DE SOBRANTE Y AUDITORÍA ENRIQUECIDA */}
      <ModalIngresoSobrante
        isOpen={isSobranteModalOpen}
        upc={sobranteUpc}
        descripcion={sobranteDescripcion}
        item={items.find(it => (it.upc || '').trim() === (sobranteUpc || '').trim())}
        naeId={naeId}
        isFinalizado={isFinalizado}
        onClose={() => {
          setIsSobranteModalOpen(false);
          setSobranteUpc('');
          setSobranteDescripcion('');
          focusScanInput();
        }}
        onConfirm={handleConfirmSobrante}
      />

      {/* ESTRUCTURA VERTICAL SEPARADA (SIN ENCIMARSE) CENTRADA EN UNA SOLA COLUMNA */}
      <div className="fixed bottom-4 inset-x-0 mx-auto w-fit z-50 flex flex-col items-center space-y-3 pointer-events-none">
        {/* ARRIBA (PRIMER BLOQUE): BOTÓN VER RESUMEN INDEPENDIENTE */}
        {onOpenCierre && (
          <button
            type="button"
            onClick={onOpenCierre}
            className="pointer-events-auto px-6 py-2.5 bg-[#071733]/95 hover:bg-[#0e2a56] border border-sky-500/40 rounded-2xl flex items-center justify-center space-x-2 shadow-2xl text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider active:scale-95 transition-all backdrop-blur-md cursor-pointer whitespace-nowrap"
          >
            <PieChart className="w-4 h-4 text-sky-400" />
            <span>Ver Resumen</span>
          </button>
        )}

        {/* ABAJO (SEGUNDO BLOQUE): CÁPSULA DE NAVEGACIÓN FLOTANTE */}
        <BottomNavCapsule
          onBack={onBack}
          onHome={onHome}
          className="pointer-events-auto bg-[#061833]/95 backdrop-blur-md border border-sky-500/30 rounded-full px-4 py-2 flex items-center space-x-3.5 shadow-2xl animate-fade-in font-sans select-none"
        />
      </div>
    </div>
  );
};
