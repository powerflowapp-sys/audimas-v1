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
  X,
  UserCheck,
  Zap,
  Sparkles,
  Trash2,
  Lock,
  PieChart,
  Menu,
  Eye,
  Play,
  ShieldCheck,
  Check,
  PackageX
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuditoriaRealtime } from '../hooks/useAuditoriaRealtime';
import { feedbackService, ScanFeedbackType } from '../utils/feedback';
import { matchBarcode, sanitizeBarcode } from '../utils/barcodeUtils';
import { CameraScannerModal } from './CameraScannerModal';
import { formatNumber, isItemPesable, getUomLabel, resolverUnidadMedidaItem, calcularUnidadesFisicasItem, getIniciales } from '../utils/formatUtils';
import { ModalIngresoSobrante } from './ModalIngresoSobrante';
import { CollaboratorProfileModal } from './CollaboratorProfileModal';
import { BottomNavCapsule } from './BottomNavCapsule';
import { ModalModalidadAuditoria } from './ModalModalidadAuditoria';
import { ModalValidacionUPC } from './ModalValidacionUPC';
import { ModalRegistroProductoDesconocido } from './ModalRegistroProductoDesconocido';
import { AuditoriaItem, CamionNAE, isItemInAuditScope } from '../types';

const IconPesableBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Producto Pesable (Kg)" className="inline-flex items-center justify-center shrink-0">
    <img src="/pesable.png" alt="Pesable" className={`${size} object-contain shrink-0`} />
  </span>
);

const IconLitroBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Producto Líquido / Litros" className="inline-flex items-center justify-center shrink-0">
    <img src="/litro.png" alt="Litro" className={`${size} object-contain shrink-0`} />
  </span>
);

const IconUnidadBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Unidad / Bulto Fijo" className="inline-flex items-center justify-center shrink-0">
    <img src="/unidad.png" alt="Unidad" className={`${size} object-contain shrink-0`} />
  </span>
);

const IconAgotadoBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Agotado en Tránsito (Stock <= 0)" className="inline-flex items-center justify-center shrink-0">
    <img src="/agotado.png" alt="Agotado" className={`${size} object-contain animate-pulse shrink-0`} />
  </span>
);

const IconDiferenciaBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Diferencias (Faltantes / Sobrantes)" className="inline-flex items-center justify-center shrink-0">
    <img src="/diferencia.png" alt="Diferencia" className={`${size} object-contain shrink-0`} />
  </span>
);

const IconPendienteBadge: React.FC<{ size?: string }> = ({ size = "w-5 h-5" }) => (
  <span title="Pendiente de Conteo" className="inline-flex items-center justify-center shrink-0">
    <img src="/pendiente.png" alt="Pendiente" className={`${size} object-contain shrink-0`} />
  </span>
);

interface ScannerViewProps {
  naeId: string;
  onBack?: () => void;
  onHome?: () => void;
  onOpenCierre?: () => void;
  onOpenConfigModalidad?: () => void;
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
  onOpenConfigModalidad,
  collaboratorName 
}) => {
  // Estado local del camión
  const [camion, setCamion] = useState<CamionNAE | null>(null);

  // Estado del Colaborador Activo y Avatar
  const [collaborator, setCollaborator] = useState<string>(() => {
    return (collaboratorName || localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
  });
  const [collaboratorAvatar, setCollaboratorAvatar] = useState<string>(() => {
    return localStorage.getItem('audimas_collaborator_avatar') || '';
  });

  // Sincronizar estado local de colaborador cuando cambia la prop recibida
  useEffect(() => {
    if (collaboratorName) {
      setCollaborator(collaboratorName.toUpperCase());
    }
  }, [collaboratorName]);

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
  type QuickFilterType = 'DIFERENCIAS' | 'PENDIENTES' | 'AGOTADOS' | null;
  const [statusFilter, setStatusFilter] = useState<QuickFilterType>(null);

  // Banner de Feedback del último escaneo
  const [lastScan, setLastScan] = useState<LastScanBanner | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  // Modal para ingreso obligatorio de sobrantes / no facturados / auditoría táctil
  const [isSobranteModalOpen, setIsSobranteModalOpen] = useState<boolean>(false);
  const [sobranteUpc, setSobranteUpc] = useState<string>('');
  const [sobranteDescripcion, setSobranteDescripcion] = useState<string>('');

  // Estados para Doble Validación de UPC y Registro de Productos Sin Catalogar (2 Fotos Obligatorias)
  const [isModalValidacionOpen, setIsModalValidacionOpen] = useState<boolean>(false);
  const [barcodeToValidate, setBarcodeToValidate] = useState<string>('');

  const [isModalDesconocidoOpen, setIsModalDesconocidoOpen] = useState<boolean>(false);
  const [desconocidoUpc, setDesconocidoUpc] = useState<string>('');

  // Modal para configuración de modalidad de auditoría (TOTAL, MONTO, UNIDADES, MIXTO)
  const [isModalidadModalOpen, setIsModalidadModalOpen] = useState<boolean>(false);


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

  const estUpper = (camion?.estado || '').trim().toUpperCase();
  const isFinalizado = ['FINALIZADO', 'CERRADO'].includes(estUpper);
  const esPendiente = estUpper === 'PENDIENTE' || (!camion?.fecha_inicio_auditoria && !isFinalizado);
  const isReadOnlyMode = esPendiente || isFinalizado;

  // Estados para modal de confirmación de inicio de auditoría desde el banner consulta
  const [isStartAuditConfirmOpen, setIsStartAuditConfirmOpen] = useState<boolean>(false);
  const [isStartingAudit, setIsStartingAudit] = useState<boolean>(false);

  const handleConfirmStartAuditFromScanner = async () => {
    setIsStartingAudit(true);
    try {
      const now = new Date().toISOString();
      const activeUser = (localStorage.getItem('audimas_collaborator') || collaboratorName || 'OPERADOR 1').toUpperCase();
      const { error } = await supabase
        .from('camiones_nae')
        .update({
          estado: 'EN_PROCESO',
          fecha_inicio_auditoria: now,
          usuario_inicio_auditoria: activeUser
        })
        .eq('id', naeId);

      if (!error && camion) {
        setCamion({
          ...camion,
          estado: 'EN_PROCESO',
          fecha_inicio_auditoria: now,
          usuario_inicio_auditoria: activeUser
        });
      }
      setIsStartAuditConfirmOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al iniciar la auditoría');
    } finally {
      setIsStartingAudit(false);
    }
  };

  // Manejo unificado de la navegación por niveles (Nivel 3 -> Nivel 2 -> Nivel 1)
  const handleBack = () => {
    // Nivel 3: Detalle / Edición manual de producto
    if (isSobranteModalOpen) {
      setIsSobranteModalOpen(false);
      setSobranteUpc('');
      setSobranteDescripcion('');
      return;
    }
    // Modales secundarios de la vista de auditoría
    if (isCameraOpen) {
      setIsCameraOpen(false);
      return;
    }
    if (isUserModalOpen) {
      setIsUserModalOpen(false);
      return;
    }
    // Nivel 2 -> Nivel 1: Regresar al Dashboard principal de camiones
    if (onBack) {
      onBack();
    }
  };

  const handleHome = () => {
    setIsSobranteModalOpen(false);
    setIsCameraOpen(false);
    setIsUserModalOpen(false);
    if (onHome) {
      onHome();
    }
  };

  // Sincronización con el botón de retroceso nativo del navegador / móvil (Nivel 3)
  useEffect(() => {
    if (isSobranteModalOpen || isCameraOpen || isUserModalOpen) {
      window.history.pushState({ level: 3 }, '');

      const handlePopState = () => {
        if (isSobranteModalOpen) {
          setIsSobranteModalOpen(false);
          setSobranteUpc('');
          setSobranteDescripcion('');
        } else if (isCameraOpen) {
          setIsCameraOpen(false);
        } else if (isUserModalOpen) {
          setIsUserModalOpen(false);
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isSobranteModalOpen, isCameraOpen, isUserModalOpen]);

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

  const isZeroCountSobrante = (it: AuditoriaItem) => {
    const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
    const uEsc = Number(it.unidades_escaneadas || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    return isSobranteNoFact && uEsc <= 0 && bEsc <= 0;
  };

  // Departamentos únicos para el carrusel de filtros (ordenados numéricamente, excluyendo sobrantes en 0)
  // Subconjunto estricto de ítems dentro de la modalidad activa (o con escaneo físico real)
  const scopedItems = useMemo(() => {
    return items.filter(it => {
      if (isZeroCountSobrante(it)) return false;

      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const tieneEscaneoFisico = uEscRaw > 0 || bEsc > 0 || Boolean(it.es_sobrante_no_facturado);

      return isItemInAuditScope(
        it,
        camion?.modo_auditoria,
        camion?.umbral_unidades || 0,
        camion?.umbral_monto || 0
      ) || tieneEscaneoFisico;
    });
  }, [items, camion]);

  // Departamentos presentes exclusivamente en el subconjunto de auditoría
  const departamentos = useMemo<DeptoFilterOption[]>(() => {
    const mapDeptos = new Map<string, string>();
    scopedItems.forEach(it => {
      if (isZeroCountSobrante(it)) return;
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
  }, [scopedItems]);

  // Conteos exactos para la barra de 3 accesos directos clave
  const filterCounts = useMemo(() => {
    let diferencias = 0;
    let pendientes = 0;
    let agotados = 0;

    scopedItems.forEach(it => {
      if (isZeroCountSobrante(it)) return;

      const uEsp = Number(it.unidades_esperadas || 0);
      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const uEscTotal = calcularUnidadesFisicasItem(it);
      const esSobrante = Boolean(it.es_sobrante_no_facturado);

      // Botón 1: DIFERENCIAS (unidades_escaneadas !== unidades_esperadas && (unidades_escaneadas > 0 || es_sobrante))
      const esDiferencia = uEscTotal !== uEsp && (uEscTotal > 0 || esSobrante);
      if (esDiferencia) diferencias++;

      // Botón 2: PENDIENTES (unidades_escaneadas === 0 && bultos_escaneados === 0)
      const esSinEscaneo = uEscRaw === 0 && bEsc === 0;
      if (esSinEscaneo) pendientes++;

      // Botón 3: AGOTADOS (es_agotado_transito === true || stock_on_hand <= 0)
      const stockVal = (it as any).stock_on_hand ?? it.stock_disponible;
      const esAgotado = Boolean(it.es_agotado_transito) || (stockVal !== undefined && stockVal !== null && Number(stockVal) <= 0);
      if (esAgotado) agotados++;
    });

    return {
      diferencias,
      pendientes,
      agotados
    };
  }, [scopedItems]);

  // Filtrado y ordenamiento dinámico de tarjetas de ítems por departamento, accesos directos y búsqueda
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // 1. Filtrar por departamento, acceso directo clave de estado y texto de búsqueda
    const matched = scopedItems.filter(it => {
      if (isZeroCountSobrante(it)) return false;

      const matchDepto = selectedDepto === 'TODOS' || (it.depto_codigo || '').trim() === selectedDepto;
      if (!matchDepto) return false;

      // Variables para los accesos directos clave
      const uEsp = Number(it.unidades_esperadas || 0);
      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const uEscTotal = calcularUnidadesFisicasItem(it);
      const esSobrante = Boolean(it.es_sobrante_no_facturado);

      if (statusFilter === 'DIFERENCIAS') {
        const esDiferencia = uEscTotal !== uEsp && (uEscTotal > 0 || esSobrante);
        if (!esDiferencia) return false;
      }

      if (statusFilter === 'PENDIENTES') {
        const esSinEscaneo = uEscRaw === 0 && bEsc === 0;
        if (!esSinEscaneo) return false;
      }

      if (statusFilter === 'AGOTADOS') {
        const stockVal = (it as any).stock_on_hand ?? it.stock_disponible;
        const esAgotado = Boolean(it.es_agotado_transito) || (stockVal !== undefined && stockVal !== null && Number(stockVal) <= 0);
        if (!esAgotado) return false;
      }

      if (!q) return true;

      if (!q) return true;

      const upcClean = (it.upc || '').toLowerCase().trim();
      const skuClean = (it.sku || '').toLowerCase().trim();
      const descClean = (it.descripcion || '').toLowerCase().trim();

      const matchQuery = 
        matchBarcode(q, it.upc) ||
        matchBarcode(q, it.sku) ||
        upcClean.includes(q) || 
        skuClean.includes(q) || 
        descClean.includes(q) ||
        upcClean.endsWith(q) ||
        skuClean.endsWith(q);

      return matchQuery;
    });

    // 2. Ordenamiento dinámico
    return [...matched].sort((a, b) => {
      const aTieneEscaneo = Number(a.bultos_escaneados || 0) > 0 || Number(a.unidades_escaneadas || 0) > 0 || Boolean(a.es_sobrante_no_facturado) || Boolean(a.updated_at);
      const bTieneEscaneo = Number(b.bultos_escaneados || 0) > 0 || Number(b.unidades_escaneadas || 0) > 0 || Boolean(b.es_sobrante_no_facturado) || Boolean(b.updated_at);

      if (aTieneEscaneo && bTieneEscaneo) {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA;
      }

      if (aTieneEscaneo && !bTieneEscaneo) return -1;
      if (!aTieneEscaneo && bTieneEscaneo) return 1;

      return 0;
    });
  }, [scopedItems, selectedDepto, statusFilter, searchQuery]);

  // Totales de avance unificados sobre los ítems dentro de la modalidad
  const stats = useMemo(() => {
    let esperados = 0;
    let escaneados = 0;
    let bultosEsperados = 0;
    let bultosEscaneados = 0;

    scopedItems.forEach(it => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const bEsp = Number(it.bultos_esperados || 0);
      const uEsc = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);

      const unTotalesItem = calcularUnidadesFisicasItem(it);

      esperados += uEsp;
      escaneados += unTotalesItem;
      bultosEsperados += bEsp;
      bultosEscaneados += bEsc;
    });

    const porcentajeUnidades = esperados > 0 ? Math.min(100, Math.round((escaneados / esperados) * 100)) : 0;
    const porcentajeBultos = bultosEsperados > 0 ? Math.min(100, Math.round((bultosEscaneados / bultosEsperados) * 100)) : 0;

    return { esperados, escaneados, bultosEsperados, bultosEscaneados, porcentajeUnidades, porcentajeBultos };
  }, [scopedItems]);

  // Estadísticas Dinámicas según Modalidad Elegida (TOTAL, MONTO, UNIDADES, MIXTO)
  const modoStats = useMemo(() => {
    let uEspTotal = 0;
    let bEspTotal = 0;
    let uEscTotal = 0;
    let bEscTotal = 0;
    let montoEscTotal = 0;
    const modo = camion?.modo_auditoria || 'TOTAL';
    const montoEsperadoTotal = camion?.monto_total_esperado || 0;

    scopedItems.forEach(it => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const bEsp = Number(it.bultos_esperados || 0);
      const uEsc = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const cUnit = Number(it.costo_unitario || 0);

      const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
      const uFisicas = calcularUnidadesFisicasItem(it);

      uEspTotal += uEsp;
      bEspTotal += bEsp;
      uEscTotal += uFisicas;
      bEscTotal += (bEsp > 0 && factor > 0 ? (bEsc + (uEsc / factor)) : bEsc);
      montoEscTotal += (uFisicas * cUnit);
    });

    let porcentaje = 0;
    let subtitle = '';
    let modoLabel = '100% TOTAL';
    let badgeColor = 'bg-[#0c244d] text-sky-300 border-sky-500/30';

    const uTh = camion?.umbral_unidades || 0;
    const mTh = camion?.umbral_monto || 0;

    if (modo === 'MONTO') {
      modoLabel = `MODO MONTO (≥ $${mTh.toLocaleString('es-AR')})`;
      badgeColor = 'bg-purple-600/30 text-purple-300 border-purple-500/30';
      const metaM = camion?.meta_monto || montoEsperadoTotal;
      porcentaje = metaM > 0 ? Math.min(100, Math.round((montoEscTotal / metaM) * 100)) : 100;
      subtitle = `$${montoEscTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / $${metaM.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } else if (modo === 'UNIDADES') {
      modoLabel = `MODO UNIDADES (≥ ${formatNumber(uTh)} un)`;
      badgeColor = 'bg-emerald-600/30 text-emerald-300 border-emerald-500/30';
      const metaU = camion?.meta_unidades || uEspTotal;
      porcentaje = metaU > 0 ? Math.min(100, Math.round((uEscTotal / metaU) * 100)) : 100;
      subtitle = `${formatNumber(uEscTotal)} / ${formatNumber(metaU)} un`;
    } else if (modo === 'MIXTO') {
      modoLabel = `MODO MIXTO (≥ ${formatNumber(uTh)} un / $${mTh.toLocaleString('es-AR')})`;
      badgeColor = 'bg-indigo-600/30 text-indigo-300 border-indigo-500/30';
      const metaM = camion?.meta_monto || montoEsperadoTotal;
      const metaU = camion?.meta_unidades || uEspTotal;
      const pctM = metaM > 0 ? Math.min(100, Math.round((montoEscTotal / metaM) * 100)) : 100;
      const pctU = metaU > 0 ? Math.min(100, Math.round((uEscTotal / metaU) * 100)) : 100;
      porcentaje = Math.round((pctM + pctU) / 2);
      subtitle = `$${Math.round(montoEscTotal).toLocaleString('es-AR')} ($) • ${formatNumber(uEscTotal)} un (${pctU}%)`;
    } else {
      // TOTAL (100%)
      modoLabel = '100% TOTAL';
      badgeColor = 'bg-[#0c244d] text-sky-300 border-sky-500/30';
      porcentaje = uEspTotal > 0 ? Math.min(100, Math.round((uEscTotal / uEspTotal) * 100)) : 100;
      subtitle = `${formatNumber(bEscTotal)} / ${formatNumber(bEspTotal)} bultos • ${formatNumber(uEscTotal)} / ${formatNumber(uEspTotal)} un`;
    }

    return {
      modo,
      modoLabel,
      badgeColor,
      porcentaje,
      subtitle
    };
  }, [scopedItems, camion]);

  // Avance de porcentaje específico por departamento seleccionado
  const deptoStats = useMemo(() => {
    if (selectedDepto === 'TODOS') return null;

    let esperados = 0;
    let escaneados = 0;

    items.forEach(it => {
      if ((it.depto_codigo || '').trim() === selectedDepto) {
        const uEsp = Number(it.unidades_esperadas || 0);
        const bEsp = Number(it.bultos_esperados || 0);
        const uEsc = Number(it.unidades_escaneadas || 0);
        const bEsc = Number(it.bultos_escaneados || 0);

        const unPorBulto = bEsp > 0 ? (uEsp / bEsp) : 1;
        const unTotalesItem = (bEsc * unPorBulto) + uEsc;

        esperados += uEsp;
        escaneados += unTotalesItem;
      }
    });

    const porcentaje = esperados > 0 
      ? Math.min(100, Math.round((escaneados / esperados) * 100)) 
      : (escaneados > 0 ? 100 : 0);
    const esCompleto = porcentaje >= 100;

    const deptoObj = departamentos.find(d => d.codigo === selectedDepto);
    const nombre = deptoObj ? deptoObj.nombre : `Depto ${selectedDepto}`;

    return {
      nombre,
      porcentaje,
      esCompleto
    };
  }, [items, selectedDepto, departamentos]);

  // Función interna para llamar a la RPC registrar_escaneo
  const procesarRegistroEscaneo = async (
    cleanUpc: string, 
    modo: 'BULTOS' | 'UNIDADES', 
    cantidad: number,
    cajaSeparada: boolean = false,
    danoInfo?: { cantidadDanada: number; observacionDano: string; fotoDanoUrl: string; fotosDanoUrls?: string[] }
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

      if (danoInfo && (danoInfo.cantidadDanada > 0 || danoInfo.observacionDano || danoInfo.fotoDanoUrl)) {
        await supabase
          .from('auditoria_items')
          .update({
            cantidad_danada: danoInfo.cantidadDanada,
            observacion_dano: danoInfo.observacionDano,
            foto_dano_url: danoInfo.fotoDanoUrl,
            updated_at: new Date().toISOString()
          })
          .eq('nae_id', naeId)
          .eq('upc', cleanUpc);
      }

      if (data && data.success) {
        const itemUpdated: AuditoriaItem | undefined = Array.isArray(data.data) ? data.data[0] : data.data;
        if (itemUpdated && danoInfo) {
          itemUpdated.cantidad_danada = danoInfo.cantidadDanada;
          itemUpdated.observacion_dano = danoInfo.observacionDano;
          itemUpdated.foto_dano_url = danoInfo.fotoDanoUrl;
        }
        let scanType: ScanFeedbackType = 'OK';
        let title = '';
        let subtitle = '';

        const esAgotado = itemUpdated?.es_agotado_transito ?? false;
        const descripcion = itemUpdated?.descripcion || '';
        const esSobranteNoFact = itemUpdated?.es_sobrante_no_facturado ?? false;
        const bEsc = Number(itemUpdated?.bultos_escaneados ?? 0);
        const bEsp = Number(itemUpdated?.bultos_esperados ?? 0);
        const uEsc = Number(itemUpdated?.unidades_escaneadas ?? 0);
        const uEsp = Number(itemUpdated?.unidades_esperadas ?? 0);

        if (esAgotado) {
          scanType = 'AGOTADO_TRANSITO';
          title = '🚨 AGOTADO EN TRÁNSITO REGISTRADO';
          subtitle = cajaSeparada ? 'Caja separada correctamente para góndola.' : 'Recuerda separar 1 caja a góndola.';
        } else if (descripcion.includes('⚠️ PRODUCTO NO ENCONTRADO')) {
          scanType = 'DESCONOCIDO';
          title = '⚠️ CÓDIGO FUERA DE CATÁLOGO';
          subtitle = '⚠️ PRODUCTO NO ENCONTRADO - BUSCAR DATOS EN SIM';
        } else if (esSobranteNoFact) {
          scanType = 'SOBRANTE_MAESTRO';
          title = '🟣 SOBRANTE NO FACTURADO';
          subtitle = `Producto "${descripcion}" no venía en el camión. Encontrado en Catálogo Maestro.`;
        } else if (
          (modo === 'BULTOS' && bEsc > bEsp) ||
          (modo === 'UNIDADES' && uEsc > uEsp)
        ) {
          scanType = 'SOBRANTE_FACTURA';
          title = '🟡 SOBRANTE SOBRE FACTURA';
          const ex = modo === 'BULTOS' 
            ? bEsc - bEsp 
            : uEsc - uEsp;
          subtitle = `Llevas +${ex} ${modo.toLowerCase()} por encima de lo esperado.`;
        } else {
          scanType = 'OK';
          title = '🟢 CONTEO REGISTRADO';
          subtitle = `Llevas ${modo === 'BULTOS' ? formatNumber(bEsc) : formatNumber(uEsc)} de ${modo === 'BULTOS' ? formatNumber(bEsp) : formatNumber(uEsp)} ${modo === 'BULTOS' ? 'bultos' : getUomLabel(itemUpdated?.unidad_medida)}.`;
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
        subtitle: 'No se pudo actualizar el conteo. Verificá la conexión.',
        timestamp: Date.now()
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Manejador del Escaneo Inicial con Coincidencia Elástica y Doble Validación
  const handleExecuteScan = async (upcToScan: string) => {
    const cleanUpc = sanitizeBarcode(upcToScan);
    if (!cleanUpc || isScanning) return;

    // Buscar si el producto ya está en la lista de auditoría del camión (coincidencia elástica de UPC / EAN / SKU)
    const itemEnCamion = items.find(it => matchBarcode(cleanUpc, it.upc) || matchBarcode(cleanUpc, it.sku));

    if (itemEnCamion) {
      const inScope = isItemInAuditScope(
        itemEnCamion,
        camion?.modo_auditoria,
        camion?.umbral_unidades || 0,
        camion?.umbral_monto || 0
      );

      if (!inScope) {
        setToastMessage({
          id: Date.now().toString(),
          message: `⚠️ Este producto no pertenece a la muestra de la modalidad configurada`,
          colaborador: collaborator,
          timestamp: new Date()
        });
      }

      setScanInput('');
      setSobranteUpc(itemEnCamion.upc);
      setSobranteDescripcion(itemEnCamion.descripcion);
      setIsSobranteModalOpen(true);
      return;
    }

    // SI NO PERTENECE AL CAMIÓN: Abrir Doble Validación de UPC (Paso 1)
    setScanInput('');
    setBarcodeToValidate(cleanUpc);
    setIsModalValidacionOpen(true);
  };

  // Callback de Doble Validación cuando el código se encuentra en camión o en maestro V8
  const handleFoundInCatalogFromValidation = (foundItemOrProduct: any, verifiedUpc: string) => {
    setIsModalValidacionOpen(false);
    
    // Si fue hallado en el camión
    if (foundItemOrProduct.nae_id || foundItemOrProduct.bultos_esperados !== undefined) {
      setSobranteUpc(foundItemOrProduct.upc);
      setSobranteDescripcion(foundItemOrProduct.descripcion);
      setIsSobranteModalOpen(true);
      return;
    }

    // Si fue hallado en maestro_productos V8
    const descripcionV8 = foundItemOrProduct.descripcion || foundItemOrProduct.nombre || '';
    setSobranteUpc(verifiedUpc);
    setSobranteDescripcion(descripcionV8 ? `[V8] ${descripcionV8}` : '');
    setIsSobranteModalOpen(true);
  };

  // Callback de Doble Validación cuando NO se encuentra en ningún catálogo -> Abrir Registro Desconocido (Paso 2)
  const handleNotFoundInCatalogFromValidation = (verifiedUpc: string) => {
    setIsModalValidacionOpen(false);
    setDesconocidoUpc(verifiedUpc);
    setIsModalDesconocidoOpen(true);
  };

  // Confirmación de Registro de Producto Desconocido con 2 Fotos Obligatorias
  const handleConfirmDesconocido = async (data: {
    upc: string;
    cantidad: number;
    fotoUpcUrl: string;
    fotoFrenteUrl: string;
  }) => {
    setIsModalDesconocidoOpen(false);
    setIsScanning(true);

    try {
      // 1. Ejecutar RPC registrar_escaneo para crear el registro básico
      const { error: rpcErr } = await supabase.rpc('registrar_escaneo', {
        p_nae_id: naeId,
        p_upc: data.upc,
        p_modo: 'UNIDADES',
        p_cantidad: data.cantidad,
        p_colaborador: collaborator,
        p_caja_separada: false
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      // 2. Forzar actualización con descripción fija, depto 999 DESCONOCIDO y 2 fotos obligatorias
      const descripcionDesconocido = '⚠️ NO HALLADO EN BASE DE DATOS (SIN DATOS)';
      await supabase
        .from('auditoria_items')
        .update({
          descripcion: descripcionDesconocido,
          depto_codigo: '999',
          depto_nombre: 'DESCONOCIDO',
          costo_unitario: 0,
          costo_unitario_aplicado: 0,
          es_sobrante_no_facturado: true,
          foto_upc_url: data.fotoUpcUrl,
          foto_frente_url: data.fotoFrenteUrl,
          updated_at: new Date().toISOString()
        })
        .eq('nae_id', naeId)
        .eq('upc', data.upc);

      // 3. Recargar ítems de auditoría
      await refreshItems();


      const scanType: ScanFeedbackType = 'DESCONOCIDO';
      feedbackService.trigger(scanType);

      setLastScan({
        type: scanType,
        title: '⚠️ CÓDIGO FUERA DE CATÁLOGO REGISTRADO',
        subtitle: `Registrado como Sobrante No Facturado (${data.cantidad} un) con 2 fotos adjuntas.`,
        upc: data.upc,
        modo: 'UNIDADES',
        cantidad: data.cantidad,
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error('Error al guardar producto desconocido con fotos:', err);
      feedbackService.trigger('ERROR');
      setLastScan({
        type: 'ERROR',
        title: '❌ ERROR AL REGISTRAR PRODUCTO DESCONOCIDO',
        subtitle: err.message || 'No se pudo completar el registro con fotos.',
        timestamp: Date.now()
      });
    } finally {
      setIsScanning(false);
    }
  };


  // Confirmar registro desde el Modal de Auditoría / Ingreso
  const handleConfirmSobrante = async (
    cantidad: number, 
    modo: 'BULTOS' | 'UNIDADES' = 'UNIDADES',
    cajaSeparada: boolean = false,
    danoInfo?: { cantidadDanada: number; observacionDano: string; fotoDanoUrl: string; fotosDanoUrls?: string[] }
  ) => {
    if (!sobranteUpc) return;
    const upcParaProcesar = sobranteUpc;
    setIsSobranteModalOpen(false);
    setSobranteUpc('');
    setSobranteDescripcion('');
    await procesarRegistroEscaneo(upcParaProcesar, modo, cantidad, cajaSeparada, danoInfo);
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
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-52 select-none">
      
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
              {collaboratorAvatar && collaboratorAvatar.trim() !== '' ? (
                <img src={collaboratorAvatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="font-['Chakra_Petch'] font-bold text-[10px] text-sky-300">
                  {getIniciales(collaborator)}
                </span>
              )}
            </div>

            <span className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate max-w-[100px] sm:max-w-[140px]">
              {collaborator}
            </span>

            <Menu className="w-4 h-4 text-sky-400 shrink-0 ml-0.5" />
          </div>
        </div>

        {/* Barra de Avance Dinámica según Modalidad */}
        <div className="px-3.5 pb-2.5 space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
              <div className="flex items-center space-x-1.5">
                {esPendiente ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenConfigModalidad) {
                        onOpenConfigModalidad();
                      } else {
                        setIsModalidadModalOpen(true);
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg border font-['Chakra_Petch'] text-[10px] font-bold uppercase flex items-center space-x-1 hover:brightness-125 transition-all cursor-pointer ${modoStats.badgeColor}`}
                    title="Configurar Modalidad y Umbrales de Auditoría"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>{modoStats.modoLabel}</span>
                  </button>
                ) : (
                  <div
                    className={`px-2 py-0.5 rounded-lg border font-['Chakra_Petch'] text-[10px] font-bold uppercase flex items-center space-x-1 select-none ${modoStats.badgeColor}`}
                    title="Modalidad fijada para esta auditoría (Solo Lectura)"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>{modoStats.modoLabel}</span>
                  </div>
                )}
              </div>

              <span className="font-mono text-sky-300">
                {modoStats.subtitle} ({modoStats.porcentaje}%)
              </span>
            </div>

            <div className="w-full bg-[#020b18] rounded-full h-2.5 overflow-hidden flex shadow-inner border border-sky-500/10">
              <div 
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${modoStats.porcentaje}%` }}
              />
            </div>
          </div>

          {/* Barra de Avance Específica por Departamento Seleccionado */}
          {selectedDepto !== 'TODOS' && deptoStats && (
            <div className="pt-2 border-t border-sky-500/15 space-y-1 animate-fade-in">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-['Chakra_Petch'] font-bold text-sky-200 truncate max-w-[240px]">
                  {deptoStats.nombre}: <span className="font-mono font-black text-white">{deptoStats.porcentaje}%</span>
                </span>
                {deptoStats.esCompleto && (
                  <span className="text-[10px] font-['Chakra_Petch'] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0 uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Auditado 100%</span>
                  </span>
                )}
              </div>

              <div className="w-full bg-[#020b18] rounded-full h-1.5 overflow-hidden flex shadow-inner border border-sky-500/10">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    deptoStats.esCompleto
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/40'
                      : 'bg-gradient-to-r from-cyan-500 to-sky-400 shadow-sm'
                  }`}
                  style={{ width: `${deptoStats.porcentaje}%` }}
                />
              </div>
            </div>
          )}
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

        {/* BANNER MODO CONSULTA PARA CAMIÓN PENDIENTE (SIN INICIAR) */}
        {esPendiente && (
          <div className="p-3.5 bg-[#061833] border-2 border-sky-500/80 rounded-2xl text-sky-200 text-xs shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-start space-x-3">
              <Eye className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-extrabold text-sm text-white flex items-center space-x-1.5">
                  <span>👁️ Modo Consulta (Auditoría Pendiente)</span>
                </h4>
                <p className="text-[11px] text-sky-200/90 mt-0.5 font-medium leading-relaxed">
                  Estás visualizando los {items.length} productos esperados. Las acciones de escaneo/conteo están en espera hasta presionar "Iniciar Auditoría".
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onOpenConfigModalidad) {
                  onOpenConfigModalidad();
                } else {
                  setIsModalidadModalOpen(true);
                }
              }}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-1.5 shrink-0 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Iniciar Auditoría</span>
            </button>
          </div>
        )}

        {/* 2. INPUT DE ESCANEO Y BÚSQUEDA CON AUTO-FOCUS Y TECLADO NUMÉRICO */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-xl">
          {!isFinalizado && !esPendiente && (
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
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Barra de 3 Accesos Directos Clave: DIFERENCIAS, PENDIENTES, AGOTADOS con Íconos Oficiales */}
          <div className="grid grid-cols-3 gap-1.5 w-full pt-1">
            {/* Botón 1: DIFERENCIAS */}
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'DIFERENCIAS' ? null : 'DIFERENCIAS')}
              className={`py-1.5 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold uppercase tracking-tight flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                statusFilter === 'DIFERENCIAS'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 border-2 border-amber-300 ring-2 ring-amber-500/40 font-bold'
                  : 'bg-[#020b18] text-slate-300 hover:text-white border border-sky-500/20 hover:border-amber-500/40'
              }`}
            >
              <IconDiferenciaBadge size="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>DIFERENCIAS</span>
              <span className={`px-1 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                statusFilter === 'DIFERENCIAS' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                ({filterCounts.diferencias})
              </span>
            </button>

            {/* Botón 2: PENDIENTES */}
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'PENDIENTES' ? null : 'PENDIENTES')}
              className={`py-1.5 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold uppercase tracking-tight flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                statusFilter === 'PENDIENTES'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-2 border-blue-300 ring-2 ring-blue-500/40 font-bold'
                  : 'bg-[#020b18] text-slate-300 hover:text-white border border-sky-500/20 hover:border-blue-500/40'
              }`}
            >
              <IconPendienteBadge size="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>PENDIENTES</span>
              <span className={`px-1 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                statusFilter === 'PENDIENTES' ? 'bg-slate-950 text-blue-300' : 'bg-blue-500/20 text-blue-300'
              }`}>
                ({filterCounts.pendientes})
              </span>
            </button>

            {/* Botón 3: AGOTADOS */}
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'AGOTADOS' ? null : 'AGOTADOS')}
              className={`py-1.5 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold uppercase tracking-tight flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                statusFilter === 'AGOTADOS'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 border-2 border-red-300 ring-2 ring-red-500/40 font-bold'
                  : 'bg-[#020b18] text-slate-300 hover:text-white border border-sky-500/20 hover:border-red-500/40'
              }`}
            >
              <IconAgotadoBadge size="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>AGOTADOS</span>
              <span className={`px-1 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                statusFilter === 'AGOTADOS' ? 'bg-slate-950 text-red-300' : 'bg-red-500/20 text-red-300'
              }`}>
                ({filterCounts.agotados})
              </span>
            </button>
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
              const esAgotado = item?.es_agotado_transito ?? false;
              const esSobrante = item?.es_sobrante_no_facturado ?? false;

              const bEsp = Number(item.bultos_esperados || 0);
              const uEsp = Number(item.unidades_esperadas || 0);
              const bEsc = Number(item.bultos_escaneados || 0);
              const uEsc = Number(item.unidades_escaneadas || 0);

              const unidadesPorBulto = bEsp > 0 ? (uEsp / bEsp) : 1;
              const totalUnidadesIngresadas = (bEsc * unidadesPorBulto) + uEsc;
              const totalUnidadesEsperadas = uEsp;

              // Consolidación matemática de bultos y unidades sueltas
              const bultosConsolidados = Math.floor(totalUnidadesIngresadas / unidadesPorBulto);
              const unidadesRemanentes = Number((totalUnidadesIngresadas % unidadesPorBulto).toFixed(3));

              let textoAuditado = 'Auditado: 0 bultos';
              if (totalUnidadesIngresadas > 0) {
                if (unidadesRemanentes === 0) {
                  textoAuditado = `Auditado: ${formatNumber(bultosConsolidados)} ${bultosConsolidados === 1 ? 'bulto' : 'bultos'}`;
                } else {
                  textoAuditado = `Auditado: ${formatNumber(bultosConsolidados)} ${bultosConsolidados === 1 ? 'bulto' : 'bultos'} + ${formatNumber(unidadesRemanentes)} un sueltas`;
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
                  {/* Fila 1: Badges y Departamento en línea horizontal única */}
                  <div className="flex items-center justify-between text-[10px] font-extrabold gap-1.5 w-full min-w-0">
                    <span className="px-2 py-0.5 bg-[#0c244d] border border-sky-500/30 text-sky-200 text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider rounded-lg shadow-sm truncate shrink">
                      {item.es_sobrante_no_facturado || item.depto_codigo === '999'
                        ? '999 - DESCONOCIDO'
                        : item.depto_codigo 
                        ? `${item.depto_codigo} - ${item.depto_nombre || 'GENERAL'}` 
                        : (item.depto_nombre || 'GENERAL')}
                    </span>

                    <div className="flex items-center space-x-1 shrink-0">
                      {/* Ícono UOM (Pesable, Litro o Unidad) */}
                      {(() => {
                        const uomType = resolverUnidadMedidaItem(item);
                        if (uomType === 'KG') return <IconPesableBadge />;
                        if (uomType === 'L') return <IconLitroBadge />;
                        return <IconUnidadBadge />;
                      })()}

                      {Number(item.cantidad_danada || 0) > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-950/90 text-red-200 border border-red-500/60 rounded-md font-extrabold flex items-center space-x-1 shadow-sm">
                          <PackageX className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>📦 {formatNumber(item.cantidad_danada)} {Number(item.cantidad_danada) === 1 ? 'Dañado' : 'Dañados'}</span>
                        </span>
                      )}

                      {esAgotado && (
                        <IconAgotadoBadge />
                      )}

                      {esSobrante && (
                        <span className="px-1.5 py-0.5 bg-purple-600 text-white rounded-md">
                          SOBRANTE NO FACTURADO
                        </span>
                      )}

                      {esSobreFactura && (
                        <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded-md font-bold">
                          SOBRANTE FACTURA (+{formatNumber(totalUnidadesIngresadas - totalUnidadesEsperadas)} un)
                        </span>
                      )}

                      {esEnProgreso && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-md font-bold">
                          EN PROGRESO
                        </span>
                      )}

                      {esPendiente && (
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-md font-bold">
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

                    {(item.foto_upc_url || item.foto_frente_url) && (
                      <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        {item.foto_upc_url && (
                          <a
                            href={item.foto_upc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-colors"
                          >
                            <span>📷 Foto UPC</span>
                          </a>
                        )}
                        {item.foto_frente_url && (
                          <a
                            href={item.foto_frente_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 hover:bg-sky-500/30 transition-colors"
                          >
                            <span>📷 Foto Frente</span>
                          </a>
                        )}
                      </div>
                    )}
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
                          {formatNumber(totalUnidadesIngresadas)} / {formatNumber(totalUnidadesEsperadas)} un
                        </span>
                      </div>

                      {/* Desglose Físico Consolidado */}
                      <div className="text-[11px] text-slate-400 font-medium">
                        {textoAuditado}
                      </div>
                    </div>

                    {/* Botón táctil rápido + e indicador de completado con tilde verde */}
                    <div className="flex items-center space-x-2">
                      {esCompletado && (
                        <div 
                          className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 text-white font-bold shrink-0 animate-scale-up" 
                          title="100% Auditado / Completado"
                        >
                          <Check className="w-5 h-5 stroke-[3]" />
                        </div>
                      )}

                      {!isFinalizado && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAdjust(item, 1);
                          }}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1 shadow-md transition-transform active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
        }}
        onHome={handleHome}
        onConfirm={handleConfirmSobrante}
      />

      {/* ESTRUCTURA VERTICAL SEPARADA (SIN ENCIMARSE) CENTRADA EN UNA SOLA COLUMNA */}
      {!isSobranteModalOpen && (
        <div className="fixed bottom-4 inset-x-0 z-50 flex flex-col items-center justify-center gap-2 pointer-events-none">
          {/* ARRIBA (PRIMER BLOQUE): BOTÓN VER RESUMEN SIEMPRE VISIBLE JUSTO ARRIBA DE LA CÁPSULA */}
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

          {/* DEBAJO (SEGUNDO BLOQUE): CÁPSULA DE NAVEGACIÓN CON 3 ELEMENTOS SIMÉTRICOS */}
          <BottomNavCapsule
            onBack={handleBack}
            onScan={!isReadOnlyMode ? () => setIsCameraOpen(true) : undefined}
            onHome={handleHome}
            className="pointer-events-auto bg-[#061833]/95 backdrop-blur-md border border-sky-500/30 rounded-full px-4 py-2 flex items-center justify-center space-x-3 shadow-2xl animate-fade-in font-sans select-none"
          />
        </div>
      )}

      {/* MODAL DE SELECCIÓN DE MODALIDAD DE AUDITORÍA CON CANDADOS */}
      <ModalModalidadAuditoria
        isOpen={isModalidadModalOpen}
        naeId={naeId}
        numeroNae={camion?.numero_nae || ''}
        tieneReporteAp={camion?.tiene_reporte_ap}
        montoTotalEsperado={camion?.monto_total_esperado}
        unidadesTotalesEsperadas={stats.esperados}
        currentModo={camion?.modo_auditoria}
        currentMetaMonto={camion?.meta_monto}
        currentMetaUnidades={camion?.meta_unidades}
        currentMetaPorcentaje={camion?.meta_porcentaje}
        onClose={() => setIsModalidadModalOpen(false)}
        onConfirm={(modo: any, metaMonto?: number, metaUnidades?: number, metaPorcentaje?: number) => {
          const now = new Date().toISOString();
          if (camion) {
            setCamion({
              ...camion,
              estado: 'EN_PROCESO',
              fecha_inicio_auditoria: camion.fecha_inicio_auditoria || now,
              modo_auditoria: modo,
              meta_monto: metaMonto,
              meta_unidades: metaUnidades,
              meta_porcentaje: metaPorcentaje
            });
          }
          setIsModalidadModalOpen(false);
        }}
      />

      {/* MODAL DE DOBLE VALIDACIÓN DE UPC (PASO 1) */}
      <ModalValidacionUPC
        isOpen={isModalValidacionOpen}
        onClose={() => setIsModalValidacionOpen(false)}
        naeId={naeId}
        scannedBarcode={barcodeToValidate}
        itemsInTruck={items}
        onFoundInCatalog={handleFoundInCatalogFromValidation}
        onNotFoundInCatalog={handleNotFoundInCatalogFromValidation}
      />

      {/* MODAL DE REGISTRO DE PRODUCTO DESCONOCIDO CON 2 FOTOS OBLIGATORIAS (PASO 2) */}
      {isModalDesconocidoOpen && (
        <ModalRegistroProductoDesconocido
          upc={desconocidoUpc}
          naeId={naeId}
          onConfirm={handleConfirmDesconocido}
          onCancel={() => setIsModalDesconocidoOpen(false)}
        />
      )}
    </div>
  );
};

