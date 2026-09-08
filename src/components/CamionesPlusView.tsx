import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Snowflake, 
  Truck, 
  Search, 
  Upload, 
  RefreshCw, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  FileSpreadsheet, 
  X,
  ChevronRight,
  Eye,
  Info,
  Package,
  Layers,
  Lock,
  Clock,
  Trash2
} from 'lucide-react';
import { CamionNAE, AuditoriaItem, CamionManifiestoPreview, isCamionCierreParcial } from '../types';
import { supabase } from '../services/supabase';
import { parseAgotadosAPv2, uploadCamionManifiesto, formatStoreDisplay } from '../services/excelParsers';
import { formatDateTimeArg, enriquecerCamionesConLogsParciales } from '../services/reportService';
import { getBadgeClasificacionCarga, getBadgeModalidadAuditoria } from '../utils/cargoUtils';
import { BottomNavCapsule } from './BottomNavCapsule';

interface CamionesPlusViewProps {
  onBack: () => void;
  onHome?: () => void;
  collaboratorName?: string;
  initialNaeId?: string | null;
}

export const CamionesPlusView: React.FC<CamionesPlusViewProps> = ({
  onBack,
  onHome,
  collaboratorName = 'OPERADOR 1',
  initialNaeId = null
}) => {
  // Lista de camiones de perecederos
  const [camiones, setCamiones] = useState<CamionNAE[]>([]);
  const [loadingCamiones, setLoadingCamiones] = useState<boolean>(true);
  const [selectedTruck, setSelectedTruck] = useState<CamionNAE | null>(null);

  // Ítems del camión seleccionado
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Búsqueda y Filtros en la vista de detalle
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDepto, setSelectedDepto] = useState<string>('TODOS');
  const [soloAgotados, setSoloAgotados] = useState<boolean>(false);

  // Ocultamiento visual local exclusivo en Camiones+ (no borra de Supabase)
  const [hiddenTruckIds, setHiddenTruckIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('camiones_plus_hidden_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Conteo de SKUs por camión
  const [truckItemCounts, setTruckItemCounts] = useState<Record<string, number>>({});

  const handleHideTruck = (e: React.MouseEvent, truckId: string) => {
    e.stopPropagation();
    const updated = [...hiddenTruckIds, truckId];
    setHiddenTruckIds(updated);
    try {
      localStorage.setItem('camiones_plus_hidden_ids', JSON.stringify(updated));
    } catch (err) {
      console.warn('Error al guardar camiones_plus_hidden_ids:', err);
    }
  };

  // Modal de Carga AP2
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<CamionManifiestoPreview | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cargar camiones: FILTRADO ESTRICTO EXCLUSIVO DE FRÍO / CONGELADO / AP2
  const fetchCamiones = async () => {
    setLoadingCamiones(true);
    try {
      const { data, error } = await supabase
        .from('camiones_nae')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list: CamionNAE[] = data || [];

      // Enriquecer con Depto 91 y logs de cierres parciales de auditoría exactamente igual que en AudiMAS
      const withDept91 = await Promise.all(
        list.map(async (cam) => {
          let hasDepto91 = Boolean(cam.has_depto_91);
          if (!hasDepto91 && (cam.numero_nae || '').trim().startsWith('5')) {
            const { data: items91 } = await supabase
              .from('auditoria_items')
              .select('id')
              .eq('nae_id', cam.id)
              .or('depto_codigo.eq.91,depto_codigo.eq.091,depto_nombre.ilike.%congelado%')
              .limit(1);
            hasDepto91 = Boolean(items91 && items91.length > 0);
          }
          return {
            ...cam,
            has_depto_91: hasDepto91
          };
        })
      );

      const enrichedList = await enriquecerCamionesConLogsParciales(withDept91);

      // REGLA ESTRICTA: Excluir por completo camiones secos (Moreno 15, Escobar 8/08/008)
      // Mostrar ÚNICAMENTE camiones de frío, congelado o precargados en Camiones+
      const perecederos = enrichedList.filter(cam => {
        const nae = (cam.numero_nae || '').trim();
        const isSecoMoreno = nae.startsWith('15');
        const isSecoEscobar = nae.startsWith('8') || nae.startsWith('08') || nae.startsWith('008');

        if ((isSecoMoreno || isSecoEscobar) && cam.origen_carga !== 'CAMIONES_PLUS') {
          return false;
        }

        const isColdOrPerecedero = 
          cam.origen_carga === 'CAMIONES_PLUS' || 
          cam.estado === 'EN_CONSULTA' || 
          nae.startsWith('5') || 
          Boolean(cam.has_depto_91);

        return isColdOrPerecedero;
      });

      setCamiones(perecederos);

      // Obtener conteo de productos de cada camión
      if (perecederos.length > 0) {
        const truckIds = perecederos.map(c => c.id);
        const { data: countData } = await supabase
          .from('auditoria_items')
          .select('nae_id')
          .in('nae_id', truckIds);

        const skusByNae: Record<string, number> = {};
        if (countData) {
          countData.forEach((row: any) => {
            if (row.nae_id) {
              skusByNae[row.nae_id] = (skusByNae[row.nae_id] || 0) + 1;
            }
          });
        }
        setTruckItemCounts(skusByNae);
      }

      if (selectedTruck) {
        const updated = perecederos.find(c => c.id === selectedTruck.id);
        if (updated) setSelectedTruck(updated);
      } else if (initialNaeId) {
        const found = perecederos.find(c => c.id === initialNaeId);
        if (found) setSelectedTruck(found);
      }
    } catch (err) {
      console.error('Error al cargar camiones de perecederos:', err);
    } finally {
      setLoadingCamiones(false);
    }
  };

  useEffect(() => {
    fetchCamiones();
  }, []);

  // Cargar ítems del camión seleccionado
  const fetchItems = async (naeId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('auditoria_items')
        .select('*')
        .eq('nae_id', naeId)
        .order('es_agotado_transito', { ascending: false })
        .order('descripcion', { ascending: true });

      if (error) throw error;
      setItems((data as AuditoriaItem[]) || []);
    } catch (err) {
      console.error('Error al cargar items del camión:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Efecto cuando cambia el camión seleccionado
  useEffect(() => {
    if (selectedTruck?.id) {
      fetchItems(selectedTruck.id);

      // Suscripción Realtime para actualizar el progreso físico en vivo sin refrescar
      const channel = supabase
        .channel(`camiones_plus_items_${selectedTruck.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'auditoria_items',
            filter: `nae_id=eq.${selectedTruck.id}`
          },
          (payload) => {
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedItem = payload.new as AuditoriaItem;
              setItems(prev => prev.map(it => it.id === updatedItem.id ? { ...it, ...updatedItem } : it));
            } else if (payload.eventType === 'INSERT' && payload.new) {
              const newItem = payload.new as AuditoriaItem;
              setItems(prev => [...prev, newItem]);
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const oldId = (payload.old as any).id;
              setItems(prev => prev.filter(it => it.id !== oldId));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setItems([]);
    }
  }, [selectedTruck?.id]);

  // Selección de archivo AP2
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsParsing(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const parsed = await parseAgotadosAPv2(file);
      setPreviewData(parsed);
    } catch (err: any) {
      console.error('Error al parsear archivo AP2:', err);
      setUploadError(err instanceof Error ? err.message : 'Formato de archivo AP2 no válido');
      setPreviewData(null);
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Confirmar carga de archivo AP2 en Camiones+
  const handleConfirmUpload = async () => {
    if (!previewData) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await uploadCamionManifiesto(
        previewData,
        (percent, _cur, _tot, msg) => {
          setUploadProgress(percent);
          setUploadProgressText(msg);
        },
        {
          isCamionesPlus: true,
          origen_carga: 'CAMIONES_PLUS',
          estado: 'EN_CONSULTA',
          usuario_carga: collaboratorName
        }
      );

      setUploadSuccess(`¡Camión NAE #${previewData.numero_nae} precargado exitosamente en Camiones+ con ${res.totalItems} productos! Estado: EN CONSULTA.`);
      await fetchCamiones();

      setTimeout(() => {
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setPreviewData(null);
        setUploadSuccess(null);
        setUploadProgress(0);
        const newTruck = camiones.find(c => c.id === res.nae_id) || {
          id: res.nae_id,
          numero_nae: previewData.numero_nae,
          tienda_codigo: previewData.tienda_codigo,
          tienda_nombre: previewData.tienda_nombre,
          estado: 'EN_CONSULTA',
          origen_carga: 'CAMIONES_PLUS',
          tiene_reporte_ap: true,
          monto_total_esperado: previewData.monto_total_esperado
        } as CamionNAE;
        setSelectedTruck(newTruck);
      }, 1200);

    } catch (err: any) {
      console.error('Error al subir camión en Camiones+:', err);
      setUploadError(err instanceof Error ? err.message : 'Error inesperado al guardar camión en base de datos');
    } finally {
      setIsUploading(false);
    }
  };

  // Cálculo de totales del camión actual
  const stats = useMemo(() => {
    const totalItems = items.length;
    let bultosEsperados = 0;
    let bultosAuditados = 0;
    let unidadesEsperadas = 0;
    let unidadesAuditadas = 0;
    let agotadosCount = 0;
    let itemsCompletos = 0;
    let itemsEnRecepcion = 0;

    items.forEach(it => {
      const bEsp = Number(it.bultos_esperados || 0);
      const bAud = Number(it.bultos_escaneados || 0);
      const uEsp = Number(it.unidades_esperadas || 0);
      const uAud = Number(it.unidades_escaneadas || 0);

      bultosEsperados += bEsp;
      bultosAuditados += bAud;
      unidadesEsperadas += uEsp;
      unidadesAuditadas += uAud;

      if (it.es_agotado_transito) {
        agotadosCount++;
      }

      const isComplete = (bEsp > 0 && bAud >= bEsp) || (uEsp > 0 && uAud >= uEsp);
      const isProgress = (bAud > 0 && bAud < bEsp) || (uAud > 0 && uAud < uEsp);

      if (isComplete) {
        itemsCompletos++;
      } else if (isProgress) {
        itemsEnRecepcion++;
      }
    });

    const pctBultos = bultosEsperados > 0 ? Math.min(100, Math.round((bultosAuditados / bultosEsperados) * 100)) : 0;
    const pctUnidades = unidadesEsperadas > 0 ? Math.min(100, Math.round((unidadesAuditadas / unidadesEsperadas) * 100)) : 0;

    let receptionState: 'COMPLETO' | 'EN_RECEPCION' | 'PENDIENTE' = 'PENDIENTE';
    if (bultosEsperados > 0 && bultosAuditados >= bultosEsperados && unidadesAuditadas >= unidadesEsperadas) {
      receptionState = 'COMPLETO';
    } else if (bultosAuditados > 0 || unidadesAuditadas > 0) {
      receptionState = 'EN_RECEPCION';
    }

    return {
      totalItems,
      bultosEsperados,
      bultosAuditados,
      unidadesEsperadas,
      unidadesAuditadas,
      pctBultos,
      pctUnidades,
      agotadosCount,
      itemsCompletos,
      itemsEnRecepcion,
      receptionState
    };
  }, [items]);

  // Departamentos estructurados para el carrusel de tabs
  const departamentosTabs = useMemo(() => {
    let totalAuditados = 0;
    let totalAgotados = 0;

    const deptMap: Record<string, {
      code: string;
      name: string;
      auditados: number;
      total: number;
      agotados: number;
    }> = {};

    items.forEach(it => {
      const bEsp = Number(it.bultos_esperados || 0);
      const bAud = Number(it.bultos_escaneados || 0);
      const uEsp = Number(it.unidades_esperadas || 0);
      const uAud = Number(it.unidades_escaneadas || 0);

      const isAuditado = (bEsp > 0 && bAud >= bEsp) || (uEsp > 0 && uAud >= uEsp) || bAud > 0 || uAud > 0;
      const isAgotado = Boolean(it.es_agotado_transito);

      if (isAuditado) totalAuditados++;
      if (isAgotado) totalAgotados++;

      const rawCode = (it.depto_codigo || '').trim();
      const code = rawCode || 'GEN';
      const name = (it.depto_nombre || '').trim();

      if (!deptMap[code]) {
        deptMap[code] = {
          code: rawCode,
          name,
          auditados: 0,
          total: 0,
          agotados: 0
        };
      }

      deptMap[code].total++;
      if (isAuditado) deptMap[code].auditados++;
      if (isAgotado) deptMap[code].agotados++;
    });

    const tabs = [
      {
        key: 'TODOS',
        label: 'Todos',
        auditadosCount: totalAuditados,
        totalCount: items.length,
        agotadosCount: totalAgotados
      }
    ];

    const sortedDeptos = Object.values(deptMap).sort((a, b) => {
      const numA = parseInt(a.code, 10);
      const numB = parseInt(b.code, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return (a.code || a.name).localeCompare(b.code || b.name);
    });

    sortedDeptos.forEach(d => {
      tabs.push({
        key: d.code || d.name || 'GEN',
        label: d.code ? `Dpto ${d.code}` : (d.name ? `Dpto ${d.name}` : 'Dpto Gen'),
        auditadosCount: d.auditados,
        totalCount: d.total,
        agotadosCount: d.agotados
      });
    });

    return tabs;
  }, [items]);

  // Ítems filtrados
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      // 1. Filtro exclusivo de agotados en tránsito si está activo
      if (soloAgotados && !it.es_agotado_transito) {
        return false;
      }

      // 2. Filtro de departamento según tab del carrusel
      if (selectedDepto !== 'TODOS') {
        const itemCode = (it.depto_codigo || '').trim();
        const itemName = (it.depto_nombre || '').trim();
        const matchCode = itemCode === selectedDepto;
        const matchName = itemName === selectedDepto;
        const matchGen = !itemCode && selectedDepto === 'GEN';
        if (!matchCode && !matchName && !matchGen) {
          return false;
        }
      }

      // 3. Búsqueda por SKU, UPC o Descripción
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const skuMatch = (it.sku || '').toLowerCase().includes(query);
        const upcMatch = (it.upc || '').toLowerCase().includes(query);
        const descMatch = (it.descripcion || '').toLowerCase().includes(query);
        if (!skuMatch && !upcMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  }, [items, searchTerm, selectedDepto, soloAgotados]);

  // Filtrado de lista de camiones con exclusión de IDs ocultados localmente
  const filteredCamiones = useMemo(() => {
    return camiones.filter(cam => {
      if (hiddenTruckIds.includes(cam.id) || hiddenTruckIds.includes(cam.numero_nae)) {
        return false;
      }
      return true;
    });
  }, [camiones, hiddenTruckIds]);

  // Renderizador de Badges de Estado idéntico al de AudiMAS
  const renderEstadoBadge = (cam: CamionNAE) => {
    const estUpper = (cam?.estado || '').trim().toUpperCase();
    const esCierreParcial = isCamionCierreParcial(cam);

    if (estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>{estUpper === 'DISPONIBLE' ? 'DISPONIBLE' : 'PENDIENTE'}</span>
        </span>
      );
    }
    if (estUpper === 'EN_CONSULTA') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-cyan-500/20 text-cyan-300 border-cyan-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          <span>EN CONSULTA</span>
        </span>
      );
    }
    if (estUpper === 'EN_PROCESO') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>EN PROCESO</span>
        </span>
      );
    }
    if (esCierreParcial || estUpper === 'FINALIZADO_PARCIAL' || estUpper === 'CERRADO_PARCIAL') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 flex items-center space-x-1">
          <Clock className="w-3 h-3 text-amber-400" />
          <span>FINALIZADO PARCIAL</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center space-x-1">
        <Lock className="w-3 h-3 text-purple-400" />
        <span>FINALIZADO / CERRADO</span>
      </span>
    );
  };

  // Helper de Insignia de Recepción por Ítem
  const renderItemReceptionBadge = (item: AuditoriaItem) => {
    const bEsp = Number(item.bultos_esperados || 0);
    const bAud = Number(item.bultos_escaneados || 0);
    const uEsp = Number(item.unidades_esperadas || 0);
    const uAud = Number(item.unidades_escaneadas || 0);

    const isComplete = (bEsp > 0 && bAud >= bEsp) || (uEsp > 0 && uAud >= uEsp);
    const isProgress = (bAud > 0 && bAud < bEsp) || (uAud > 0 && uAud < uEsp);

    if (isComplete) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-['Chakra_Petch'] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
          🟢 Completo
        </span>
      );
    }
    if (isProgress) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-['Chakra_Petch'] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
          🟡 En Recepción
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-['Chakra_Petch'] font-bold bg-[#030e1f] text-slate-400 border border-slate-700 shrink-0">
        ⚪ Pendiente
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* 1. Header Principal Idéntico a AudiMAS */}
      <header className="sticky top-0 z-30 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div 
            onClick={() => {
              if (selectedTruck) {
                setSelectedTruck(null);
              } else if (onHome) {
                onHome();
              } else {
                onBack();
              }
            }}
            className="w-9 h-9 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-xl flex items-center justify-center font-['Chakra_Petch'] font-black text-xl text-white shadow-lg shadow-cyan-600/40 border border-cyan-400/30 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            title="Ir al Hub Central"
          >
            <Snowflake className="w-5 h-5 text-white animate-spin-slow" />
          </div>
          <div>
            <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-0.5">
              <span className="font-bold text-base text-cyan-400">CAMIONES</span>
              <span className="font-black text-lg text-white">+</span>
              <span className="text-xs text-sky-300 font-bold ml-1">V1</span>
            </h1>
            <p className="text-[10px] text-sky-300/80 font-mono tracking-widest uppercase">
              GESTIÓN DE PERECEDEROS (FRÍO Y AP2)
            </p>
          </div>
        </div>

        {/* Acciones de la Cabecera */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              if (selectedTruck) {
                fetchItems(selectedTruck.id);
              }
              fetchCamiones();
            }}
            className="p-2 bg-[#061e38] hover:bg-[#0a2e56] text-cyan-300 border border-sky-500/30 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Refrescar datos en vivo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCamiones || loadingItems ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-blue-600/30 border border-sky-400/30 flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Cargar AP2</span>
          </button>
        </div>
      </header>

      {/* 2. Contenedor Centralizado Idéntico a AudiMAS (max-w-md mx-auto w-full) */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        {/* 3. VISTA DETALLADA DEL CAMIÓN SELECCIONADO */}
        {selectedTruck ? (
          <div className="space-y-3.5 animate-fade-in">
            
            {/* Buscador y Filtros de Productos */}
            <div className="p-3 bg-[#051329]/90 border border-sky-500/30 rounded-2xl space-y-2.5">
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por SKU, UPC, Descripción..."
                  className="w-full bg-[#020b18] border border-sky-500/30 rounded-xl pl-9 pr-7 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-sky-400 font-mono"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Carrusel Horizontal de Departamentos (Scrollable X) */}
              <div className="space-y-1">
                <div className="overflow-x-auto flex items-center space-x-2 pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-sky-500/30 select-none">
                  {departamentosTabs.map((tab) => {
                    const isSelected = selectedDepto === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setSelectedDepto(tab.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider flex items-center space-x-1.5 shrink-0 border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/25 border-cyan-400 text-white shadow-md shadow-sky-950 scale-[1.02]'
                            : 'bg-[#030e1f] border-sky-500/30 text-slate-300 hover:bg-[#081f3d] hover:border-sky-400/50'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#020b18] text-sky-300 border border-sky-500/20">
                          {tab.auditadosCount}/{tab.totalCount}
                        </span>
                        {tab.agotadosCount > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-red-950/80 text-red-400 border border-red-500/40 flex items-center space-x-1 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            <span>{tab.agotadosCount}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botón de Alerta / Filtro de Agotados en Tránsito */}
              {stats.agotadosCount > 0 && (
                <button
                  onClick={() => setSoloAgotados(!soloAgotados)}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider flex items-center justify-center space-x-2 border transition-all cursor-pointer shadow-md active:scale-[0.99] ${
                    soloAgotados
                      ? 'bg-red-600 text-white border-red-400 shadow-red-950/50'
                      : 'bg-red-950/30 text-red-400 border-red-500/50 hover:bg-red-950/50 hover:border-red-400'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>
                    {soloAgotados
                      ? `Mostrando solo los ${stats.agotadosCount} agotados (Toca para ver todos)`
                      : `⚠️ Ver solo los ${stats.agotadosCount} agotados en tránsito`}
                  </span>
                </button>
              )}

            </div>

            {/* Listado de Ítems */}
            <div className="space-y-2.5">
              {loadingItems ? (
                <div className="p-8 text-center text-xs font-mono text-sky-400 animate-pulse">
                  Cargando productos del camión NAE #{selectedTruck.numero_nae}...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-6 text-center bg-[#051329]/90 border border-sky-500/20 rounded-2xl space-y-1.5">
                  <Info className="w-6 h-6 text-sky-400 mx-auto" />
                  <p className="font-['Chakra_Petch'] font-bold text-xs text-sky-200 uppercase">
                    Sin coincidencias
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Prueba cambiando el término de búsqueda o quitando los filtros.
                  </p>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const bEsp = Number(item.bultos_esperados || 0);
                  const bAud = Number(item.bultos_escaneados || 0);
                  const uEsp = Number(item.unidades_esperadas || 0);
                  const uAud = Number(item.unidades_escaneadas || 0);
                  const pct = bEsp > 0 ? Math.min(100, Math.round((bAud / bEsp) * 100)) : (uEsp > 0 ? Math.min(100, Math.round((uAud / uEsp) * 100)) : 0);

                  return (
                    <div
                      key={item.id || item.upc}
                      className={`p-3.5 bg-[#051329]/90 border rounded-2xl transition-all space-y-2 shadow-md ${
                        item.es_agotado_transito 
                          ? 'border-amber-500/40 bg-gradient-to-r from-[#051329]/90 to-amber-950/20' 
                          : 'border-sky-500/20'
                      }`}
                    >
                      {/* Cabecera Ítem */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center space-x-2 text-[11px] font-mono">
                            <span className="font-bold text-sky-300">SKU: {item.sku}</span>
                            <span className="text-slate-400 truncate">UPC: {item.upc}</span>
                          </div>
                          <h4 className="font-bold text-xs text-white uppercase tracking-wide truncate">
                            {item.descripcion}
                          </h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#020b18] text-slate-300 rounded border border-slate-700 inline-block">
                            DEPTO {item.depto_codigo || '00'} - {item.depto_nombre || 'GENERAL'}
                          </span>
                        </div>

                        {renderItemReceptionBadge(item)}
                      </div>

                      {/* Agotado en Tránsito Destacado */}
                      {item.es_agotado_transito && (
                        <div className="p-1.5 bg-amber-950/80 border border-amber-500/40 rounded-xl flex items-center justify-between text-[11px] text-amber-200">
                          <div className="flex items-center space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                            <span className="font-['Chakra_Petch'] font-bold uppercase tracking-wider text-amber-300">
                              AGOTADO EN TRÁNSITO
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-amber-200/90 font-semibold">
                            Stock tienda: {item.stock_disponible} un
                          </span>
                        </div>
                      )}

                      {/* Bultos y Unidades */}
                      <div className="grid grid-cols-2 gap-2 pt-0.5 border-t border-sky-500/10 text-xs">
                        <div className="bg-[#020b18] p-2 rounded-xl border border-sky-500/15 flex items-center justify-between">
                          <span className="text-[10px] font-['Chakra_Petch'] text-slate-400 uppercase">
                            Bultos:
                          </span>
                          <span className="font-mono text-xs font-bold text-sky-300">
                            {bAud} <span className="text-slate-500 font-normal">de {bEsp}</span>
                          </span>
                        </div>

                        <div className="bg-[#020b18] p-2 rounded-xl border border-sky-500/15 flex items-center justify-between">
                          <span className="text-[10px] font-['Chakra_Petch'] text-slate-400 uppercase">
                            Unidades:
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-300">
                            {uAud} <span className="text-slate-500 font-normal">de {uEsp} un</span>
                          </span>
                        </div>
                      </div>

                      {/* Mini Barra de Progreso */}
                      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-transparent'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                    </div>
                  );
                })
              )}
            </div>

          </div>
        ) : (
          /* 4. LISTADO PRINCIPAL DE CAMIONES DE PERECEDEROS (Ultra Limpio) */
          <div className="space-y-3">
            
            <div className="px-1 py-0.5 flex items-center justify-between">
              <h3 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-widest">
                CAMIONES ACTIVOS ({filteredCamiones.length})
              </h3>
              {hiddenTruckIds.length > 0 && (
                <button
                  onClick={() => {
                    setHiddenTruckIds([]);
                    localStorage.removeItem('camiones_plus_hidden_ids');
                  }}
                  className="text-[10px] text-sky-400/80 hover:text-sky-300 underline font-mono cursor-pointer"
                >
                  Restaurar ({hiddenTruckIds.length})
                </button>
              )}
            </div>

            {/* Listado de Tarjetas de Camión */}
            {loadingCamiones ? (
              <div className="p-8 text-center text-xs text-sky-400/80 font-mono">
                Consultando camiones de perecederos...
              </div>
            ) : filteredCamiones.length === 0 ? (
              <div className="p-8 text-center bg-[#061224]/90 border border-sky-500/20 rounded-2xl space-y-3 shadow-xl">
                <Truck className="w-12 h-12 text-slate-600 mx-auto" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">
                    No hay camiones de perecederos activos
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Carga un archivo en formato AP2 para precargar el primer camión de frío/congelado.
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl inline-flex items-center space-x-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Cargar Camión AP2</span>
                </button>
              </div>
            ) : (
              filteredCamiones.map((cam) => {
                const estUpper = (cam.estado || '').trim().toUpperCase();
                const esCierreParcial = isCamionCierreParcial(cam);
                const esCerrado = estUpper === 'FINALIZADO' || estUpper === 'CERRADO' || estUpper === 'FINALIZADO_PARCIAL' || estUpper === 'CERRADO_PARCIAL' || esCierreParcial;
                const clasif = getBadgeClasificacionCarga(cam);
                const totalSkus = truckItemCounts[cam.id] || 0;
                const formattedNae = cam.numero_nae.includes('-') ? cam.numero_nae : `${cam.numero_nae}-${cam.tienda_codigo || ''}`;

                return (
                  <div
                    key={cam.id}
                    onClick={() => setSelectedTruck(cam)}
                    className="p-4 bg-[#051329]/90 border border-sky-500/30 hover:border-cyan-400/80 rounded-2xl transition-all space-y-3 shadow-xl cursor-pointer active:scale-[0.99] group"
                  >
                    {/* Cabecera con NAE, Candado, Estado Simplificado y Botón de Tacho */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-sm text-sky-400 group-hover:text-cyan-300 transition-colors">
                          NAE: {formattedNae}
                        </span>
                        {esCerrado && <Lock className="w-3.5 h-3.5 text-red-400" />}
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Estado simplificado en 2 variantes claras */}
                        {esCerrado ? (
                          <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center space-x-1">
                            <Lock className="w-3 h-3 text-purple-400" />
                            <span>FINALIZADO / CERRADO</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                            <span>EN CURSO / PENDIENTE</span>
                          </span>
                        )}

                        {/* Botón de Basura (Ocultamiento Visual Exclusivo Local) */}
                        <button
                          type="button"
                          onClick={(e) => handleHideTruck(e, cam.id)}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/15 rounded-lg transition-colors cursor-pointer"
                          title="Ocultar camión de Camiones+ (no borra datos de AudiMAS ni BD)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Badges y Datos: Tipo de Carga, Total de Productos y Reporte AP */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {/* 1. Tipo de carga: Frío o Congelado */}
                      <span className={`px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1 ${clasif.className}`}>
                        <span>{clasif.label}</span>
                      </span>

                      {/* 2. Total de productos que contiene el camión */}
                      <span className="px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider bg-sky-950/80 text-sky-300 border border-sky-500/30">
                        📦 {totalSkus > 0 ? `${totalSkus} SKUs` : 'Perecederos'}
                      </span>

                      {cam.tiene_reporte_ap && (
                        <span className="px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-400/30">
                          📊 REPORTE AP
                        </span>
                      )}
                    </div>

                    {/* Tienda y Fecha de finalización / arribo */}
                    <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate">{formatStoreDisplay(cam.tienda_codigo, cam.tienda_nombre, cam.numero_nae).fullDisplay}</span>
                      </div>
                      <span className="text-slate-400 text-[11px] font-mono shrink-0">
                        {cam.fecha_fin_auditoria ? formatDateTimeArg(cam.fecha_fin_auditoria) : cam.fecha_arribo || formatDateTimeArg(cam.created_at)}
                      </span>
                    </div>

                  </div>
                );
              })
            )}

          </div>
        )}

      </main>

      {/* 5. Cápsula de Navegación Inferior Flotante (BottomNavCapsule con Home / Casita) */}
      <BottomNavCapsule
        onBack={selectedTruck ? () => setSelectedTruck(null) : onBack}
        onHome={onHome || onBack}
        showScan={false}
        showHome={true}
      />

      {/* 6. Modal de Precarga de Archivo AP2 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-[#051329] border border-sky-500/40 rounded-3xl max-w-sm sm:max-w-md w-full p-4 space-y-3.5 shadow-2xl shadow-blue-950">
            
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-cyan-500/20 rounded-xl border border-cyan-400/30">
                  <Snowflake className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">
                    Precarga Camión Perecederos
                  </h3>
                  <p className="text-[10px] text-sky-300/80 font-mono">
                    FORMATO AP v2 (.XLSX / .XLS)
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isUploading) {
                    setIsUploadModalOpen(false);
                    setSelectedFile(null);
                    setPreviewData(null);
                    setUploadError(null);
                  }
                }}
                disabled={isUploading}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-sky-500/40 hover:border-cyan-400/80 rounded-2xl p-5 text-center space-y-2 cursor-pointer bg-[#020b18] hover:bg-[#061838] transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={isUploading || isParsing}
                />

                <FileSpreadsheet className="w-8 h-8 text-sky-400 mx-auto group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate">
                    {selectedFile ? selectedFile.name : 'Toca para seleccionar archivo AP v2'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Excel con NAE, Depto, SKU, Bultos y Stock
                  </p>
                </div>
              </div>

              {isParsing && (
                <div className="p-2.5 bg-cyan-950/60 border border-cyan-500/30 rounded-xl text-center text-xs font-mono text-cyan-300 animate-pulse">
                  Analizando estructura del archivo AP2...
                </div>
              )}

              {previewData && (
                <div className="p-3 bg-[#020b18] border border-sky-500/30 rounded-2xl space-y-2 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-sky-500/15 pb-1.5">
                    <span className="font-['Chakra_Petch'] font-black text-xs text-sky-300">
                      NAE #{previewData.numero_nae}
                    </span>
                    <span className="text-[11px] font-mono text-slate-300">
                      {previewData.tienda_codigo} - {previewData.tienda_nombre}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="p-1.5 bg-[#051329] rounded-xl">
                      <span className="text-[9px] text-slate-400 block">SKUs</span>
                      <span className="font-bold text-white font-mono">{previewData.totalSKUs}</span>
                    </div>
                    <div className="p-1.5 bg-[#051329] rounded-xl">
                      <span className="text-[9px] text-slate-400 block">Bultos</span>
                      <span className="font-bold text-cyan-300 font-mono">{previewData.totalBultos}</span>
                    </div>
                    <div className="p-1.5 bg-[#051329] rounded-xl">
                      <span className="text-[9px] text-slate-400 block">Unidades</span>
                      <span className="font-bold text-emerald-300 font-mono">{previewData.totalUnidades}</span>
                    </div>
                    <div className="p-1.5 bg-[#051329] rounded-xl">
                      <span className="text-[9px] text-amber-300 block">Agotados</span>
                      <span className="font-bold text-amber-400 font-mono">{previewData.agotadosTransitoCount}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-blue-950/60 border border-blue-500/30 rounded-xl text-[10px] text-blue-200">
                    Se guardará en estado <strong className="text-cyan-300">EN_CONSULTA</strong> para consulta exclusiva en Camiones+.
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-2.5 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-300 space-y-0.5">
                  <p className="font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>Error:</span>
                  </p>
                  <p className="font-mono text-[11px]">{uploadError}</p>
                </div>
              )}

              {uploadSuccess && (
                <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 space-y-0.5">
                  <p className="font-bold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>¡Listo!</span>
                  </p>
                  <p className="font-mono text-[11px]">{uploadSuccess}</p>
                </div>
              )}

              {isUploading && (
                <div className="space-y-1 p-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl">
                  <div className="flex justify-between text-[11px] font-mono text-cyan-300">
                    <span>{uploadProgressText || 'Guardando camión...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-sky-500/20">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setSelectedFile(null);
                  setPreviewData(null);
                  setUploadError(null);
                }}
                disabled={isUploading}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmUpload}
                disabled={!previewData || isUploading || isParsing}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-950 flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
              >
                {isUploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Confirmar</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
