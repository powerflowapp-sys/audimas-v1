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
  Clock, 
  Filter, 
  Package, 
  Layers, 
  Building2, 
  FileSpreadsheet, 
  X,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { CamionNAE, AuditoriaItem, CamionManifiestoPreview } from '../types';
import { supabase } from '../services/supabase';
import { parseAgotadosAPv2, uploadCamionManifiesto, formatStoreDisplay } from '../services/excelParsers';
import { formatDateTimeArg } from '../services/reportService';
import { getBadgeClasificacionCarga } from '../utils/cargoUtils';

interface CamionesPlusViewProps {
  onBack: () => void;
  collaboratorName?: string;
  initialNaeId?: string | null;
}

type FilterStatus = 'TODOS' | 'COMPLETO' | 'EN_RECEPCION' | 'PENDIENTE';

export const CamionesPlusView: React.FC<CamionesPlusViewProps> = ({
  onBack,
  collaboratorName = 'OPERADOR 1',
  initialNaeId = null
}) => {
  // Lista de camiones consultables
  const [camiones, setCamiones] = useState<CamionNAE[]>([]);
  const [loadingCamiones, setLoadingCamiones] = useState<boolean>(true);
  const [selectedTruck, setSelectedTruck] = useState<CamionNAE | null>(null);

  // Ítems del camión seleccionado
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Búsqueda y Filtros en la vista de detalle
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDepto, setSelectedDepto] = useState<string>('TODOS');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('TODOS');
  const [soloAgotados, setSoloAgotados] = useState<boolean>(false);

  // Filtro en lista de camiones
  const [truckSearch, setTruckSearch] = useState<string>('');
  const [truckOriginFilter, setTruckOriginFilter] = useState<'TODOS' | 'CAMIONES_PLUS' | 'PERECEDEROS'>('TODOS');

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

  // Cargar camiones disponibles para Camiones+
  const fetchCamiones = async () => {
    setLoadingCamiones(true);
    try {
      const { data, error } = await supabase
        .from('camiones_nae')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list: CamionNAE[] = data || [];
      setCamiones(list);

      // Si había un camión seleccionado previamente, actualizar su referencia
      if (selectedTruck) {
        const updated = list.find(c => c.id === selectedTruck.id);
        if (updated) setSelectedTruck(updated);
      } else if (initialNaeId) {
        const found = list.find(c => c.id === initialNaeId);
        if (found) setSelectedTruck(found);
      }
    } catch (err) {
      console.error('Error al cargar camiones en Camiones+:', err);
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

      // Abrir directamente el camión precargado tras 1 segundo
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

  // Departamentos únicos para el filtro
  const departamentos = useMemo(() => {
    const deptos = new Set<string>();
    items.forEach(it => {
      const code = (it.depto_codigo || '').trim();
      const name = (it.depto_nombre || '').trim();
      if (code || name) {
        deptos.add(`${code ? code + ' - ' : ''}${name || 'GENERAL'}`);
      }
    });
    return Array.from(deptos).sort();
  }, [items]);

  // Ítems filtrados
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      // 1. Buscador texto
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const skuMatch = (it.sku || '').toLowerCase().includes(query);
        const upcMatch = (it.upc || '').toLowerCase().includes(query);
        const descMatch = (it.descripcion || '').toLowerCase().includes(query);
        const deptoMatch = (it.depto_nombre || '').toLowerCase().includes(query) || (it.depto_codigo || '').toLowerCase().includes(query);
        if (!skuMatch && !upcMatch && !descMatch && !deptoMatch) {
          return false;
        }
      }

      // 2. Filtro Departamento
      if (selectedDepto !== 'TODOS') {
        const deptoStr = `${(it.depto_codigo || '').trim() ? (it.depto_codigo || '').trim() + ' - ' : ''}${(it.depto_nombre || 'GENERAL').trim()}`;
        if (deptoStr !== selectedDepto) {
          return false;
        }
      }

      // 3. Solo Agotados en Tránsito
      if (soloAgotados && !it.es_agotado_transito) {
        return false;
      }

      // 4. Filtro por Estado de Recepción del Ítem
      const bEsp = Number(it.bultos_esperados || 0);
      const bAud = Number(it.bultos_escaneados || 0);
      const uEsp = Number(it.unidades_esperadas || 0);
      const uAud = Number(it.unidades_escaneadas || 0);

      const isComplete = (bEsp > 0 && bAud >= bEsp) || (uEsp > 0 && uAud >= uEsp);
      const isProgress = (bAud > 0 && bAud < bEsp) || (uAud > 0 && uAud < uEsp);
      const isPending = bAud === 0 && uAud === 0;

      if (statusFilter === 'COMPLETO' && !isComplete) return false;
      if (statusFilter === 'EN_RECEPCION' && !isProgress) return false;
      if (statusFilter === 'PENDIENTE' && !isPending) return false;

      return true;
    });
  }, [items, searchTerm, selectedDepto, soloAgotados, statusFilter]);

  // Filtrado de la lista de camiones
  const filteredCamiones = useMemo(() => {
    return camiones.filter(cam => {
      // Búsqueda por NAE o Tienda
      if (truckSearch.trim()) {
        const q = truckSearch.toLowerCase().trim();
        const naeMatch = (cam.numero_nae || '').toLowerCase().includes(q);
        const storeMatch = (cam.tienda_nombre || '').toLowerCase().includes(q) || (cam.tienda_codigo || '').toLowerCase().includes(q);
        if (!naeMatch && !storeMatch) return false;
      }

      // Filtro de Origen
      if (truckOriginFilter === 'CAMIONES_PLUS') {
        return cam.origen_carga === 'CAMIONES_PLUS' || cam.estado === 'EN_CONSULTA';
      }

      if (truckOriginFilter === 'PERECEDEROS') {
        const isCold = (cam.numero_nae || '').startsWith('5') || cam.origen_carga === 'CAMIONES_PLUS';
        return isCold;
      }

      return true;
    });
  }, [camiones, truckSearch, truckOriginFilter]);

  // Helper de Insignia de Recepción Global
  const renderReceptionBadge = (state: 'COMPLETO' | 'EN_RECEPCION' | 'PENDIENTE', className: string = '') => {
    if (state === 'COMPLETO') {
      return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>🟢 COMPLETO (100%)</span>
        </span>
      );
    }
    if (state === 'EN_RECEPCION') {
      return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>🟡 EN RECEPCIÓN</span>
        </span>
      );
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-slate-700/40 text-slate-300 border border-slate-600/40 flex items-center space-x-1 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>⚪ PENDIENTE</span>
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
      <span className="px-2 py-0.5 rounded-md text-[10px] font-['Chakra_Petch'] font-bold bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
        ⚪ Pendiente
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#02182b] via-[#021324] to-[#010914] text-white flex flex-col font-sans select-none pb-24">
      
      {/* 1. Header Principal Estilo Frío / Perecederos */}
      <header className="sticky top-0 z-40 bg-[#031428]/95 backdrop-blur-md border-b border-cyan-500/30 px-4 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              if (selectedTruck) {
                setSelectedTruck(null);
              } else {
                onBack();
              }
            }}
            className="p-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 rounded-xl text-cyan-300 transition-all cursor-pointer active:scale-95"
            title={selectedTruck ? 'Ver todos los camiones' : 'Volver al Menú'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-400/40">
                <Snowflake className="w-4 h-4 text-cyan-300 animate-spin-slow" />
              </div>
              <h1 className="font-['Chakra_Petch'] font-black text-base text-white tracking-wider flex items-center space-x-1.5">
                <span>CAMIONES</span>
                <span className="text-cyan-400">+</span>
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-900/60 text-cyan-200 border border-cyan-500/30 rounded-full font-bold">
                PERECEDEROS & AP2
              </span>
            </div>
            <p className="text-[10px] text-cyan-300/80 font-mono tracking-wide">
              CONSULTA OPERATIVA Y AVANCE DE RECEPCIÓN
            </p>
          </div>
        </div>

        {/* Acciones del Header */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              if (selectedTruck) {
                fetchItems(selectedTruck.id);
              }
              fetchCamiones();
            }}
            className="p-2 bg-[#06203d] hover:bg-[#0c315e] text-cyan-300 border border-cyan-500/30 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Refrescar datos en vivo"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCamiones || loadingItems ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-900/40 border border-cyan-400/40 flex items-center space-x-1.5 cursor-pointer transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cargar Camión AP2</span>
            <span className="sm:hidden">Cargar AP2</span>
          </button>
        </div>
      </header>

      {/* 2. Vista Detallada de Consulta de Ítems (si hay un camión seleccionado) */}
      {selectedTruck ? (
        <main className="flex-1 p-3 sm:p-4 max-w-5xl mx-auto w-full space-y-4">
          
          {/* Cabecera del Camión Seleccionado */}
          <div className="p-4 bg-[#041c38]/90 border border-cyan-500/30 rounded-2xl shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="font-['Chakra_Petch'] font-black text-lg text-cyan-300 tracking-wide">
                  NAE: {selectedTruck.numero_nae}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                  {selectedTruck.estado === 'EN_CONSULTA' ? '⚪ EN CONSULTA (PRECARGADO)' : `🟢 ${selectedTruck.estado}`}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {renderReceptionBadge(stats.receptionState)}
                <button
                  onClick={() => setSelectedTruck(null)}
                  className="text-xs text-cyan-300 hover:text-white px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 rounded-lg transition-all cursor-pointer"
                >
                  Cambiar camión
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-300 font-mono">
              <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{formatStoreDisplay(selectedTruck.tienda_codigo, selectedTruck.tienda_nombre, selectedTruck.numero_nae).fullDisplay}</span>
            </div>

            {/* Tarjetas KPI de Avance Físico (Bultos, Unidades, Agotados) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              
              {/* KPI 1: Avance Bultos */}
              <div className="p-3 bg-[#021124] border border-cyan-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                    <Package className="w-3 h-3 text-cyan-400" />
                    <span>Bultos Auditados</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-cyan-300">{stats.pctBultos}%</span>
                </div>
                <p className="text-sm font-['Chakra_Petch'] font-black text-white">
                  {stats.bultosAuditados} <span className="text-xs text-slate-400 font-normal">de {stats.bultosEsperados} bultos</span>
                </p>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${stats.pctBultos}%` }}
                  />
                </div>
              </div>

              {/* KPI 2: Avance Unidades */}
              <div className="p-3 bg-[#021124] border border-cyan-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                    <Layers className="w-3 h-3 text-emerald-400" />
                    <span>Unidades Físicas</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-300">{stats.pctUnidades}%</span>
                </div>
                <p className="text-sm font-['Chakra_Petch'] font-black text-white">
                  {stats.unidadesAuditadas} <span className="text-xs text-slate-400 font-normal">de {stats.unidadesEsperadas} un</span>
                </p>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-500"
                    style={{ width: `${stats.pctUnidades}%` }}
                  />
                </div>
              </div>

              {/* KPI 3: Agotados en Tránsito */}
              <div className={`p-3 bg-[#021124] border rounded-xl space-y-1 ${stats.agotadosCount > 0 ? 'border-amber-500/40' : 'border-cyan-500/20'}`}>
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Agotados en Tránsito</span>
                </span>
                <p className="text-base font-['Chakra_Petch'] font-black text-amber-300">
                  {stats.agotadosCount} <span className="text-xs text-slate-400 font-normal">SKUs sin stock</span>
                </p>
                <p className="text-[10px] text-slate-400 font-mono">Stock en tienda ≤ 0</p>
              </div>

              {/* KPI 4: Total Ítems / Estado */}
              <div className="p-3 bg-[#021124] border border-cyan-500/20 rounded-xl space-y-1">
                <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                  <span>Ítems Listados</span>
                </span>
                <p className="text-base font-['Chakra_Petch'] font-black text-white">
                  {stats.totalItems} <span className="text-xs text-slate-400 font-normal">productos</span>
                </p>
                <p className="text-[10px] text-cyan-300/80 font-mono">
                  {stats.itemsCompletos} completados • {stats.itemsEnRecepcion} en curso
                </p>
              </div>

            </div>
          </div>

          {/* Barra de Búsqueda y Filtros de Ítems */}
          <div className="p-3 bg-[#03172e]/80 border border-cyan-500/20 rounded-2xl space-y-2.5">
            
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Input de Búsqueda */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por SKU, UPC, Descripción, Departamento..."
                  className="w-full bg-[#020e1c] border border-cyan-500/30 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
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

              {/* Selector de Departamento */}
              <div className="w-full sm:w-56 shrink-0">
                <select
                  value={selectedDepto}
                  onChange={(e) => setSelectedDepto(e.target.value)}
                  className="w-full bg-[#020e1c] border border-cyan-500/30 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-mono cursor-pointer"
                >
                  <option value="TODOS">Todos los departamentos</option>
                  {departamentos.map((d, i) => (
                    <option key={i} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chips de Filtrado Rápido */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              
              {/* Botón Toggle Solo Agotados */}
              <button
                onClick={() => setSoloAgotados(!soloAgotados)}
                className={`px-2.5 py-1 rounded-lg text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-all cursor-pointer ${
                  soloAgotados
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                    : 'bg-[#021124] text-amber-300 hover:bg-[#06203d] border border-amber-500/30'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Solo Agotados en Tránsito ({stats.agotadosCount})</span>
              </button>

              <span className="text-slate-600 text-xs hidden sm:inline">|</span>

              {/* Estados de Recepción */}
              {(['TODOS', 'COMPLETO', 'EN_RECEPCION', 'PENDIENTE'] as FilterStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === st
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                      : 'bg-[#021124] text-slate-300 hover:text-white hover:bg-[#06203d] border border-cyan-500/20'
                  }`}
                >
                  {st === 'TODOS' && 'Todos los ítems'}
                  {st === 'COMPLETO' && '🟢 Completos'}
                  {st === 'EN_RECEPCION' && '🟡 En Recepción'}
                  {st === 'PENDIENTE' && '⚪ Pendientes'}
                </button>
              ))}

              <span className="text-[11px] text-slate-400 font-mono ml-auto">
                Mostrando {filteredItems.length} de {items.length} productos
              </span>
            </div>

          </div>

          {/* Lista de Ítems de Perecederos */}
          <div className="space-y-2">
            {loadingItems ? (
              <div className="p-12 text-center text-xs font-mono text-cyan-300 animate-pulse">
                Cargando ítems del camión NAE #{selectedTruck.numero_nae}...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center bg-[#03152b]/80 border border-cyan-500/20 rounded-2xl space-y-2">
                <Info className="w-8 h-8 text-cyan-400 mx-auto" />
                <p className="font-['Chakra_Petch'] font-bold text-sm text-cyan-200 uppercase">
                  No se encontraron productos con los filtros aplicados
                </p>
                <p className="text-xs text-slate-400">
                  Prueba cambiando la búsqueda o quitando el filtro de agotados en tránsito.
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
                    className={`p-3 sm:p-3.5 bg-[#031429]/90 border rounded-2xl transition-all space-y-2.5 shadow-md ${
                      item.es_agotado_transito 
                        ? 'border-amber-500/40 bg-gradient-to-r from-[#031429]/90 via-[#031429]/90 to-amber-950/20' 
                        : 'border-cyan-500/20 hover:border-cyan-400/50'
                    }`}
                  >
                    {/* Fila 1: SKU, UPC, Depto y Badge de Estado */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-xs text-cyan-400">
                            SKU: {item.sku}
                          </span>
                          <span className="font-mono text-xs text-slate-400">
                            UPC: {item.upc}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700">
                            DEPTO {item.depto_codigo || '00'} - {item.depto_nombre || 'GENERAL'}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-white uppercase tracking-wide truncate">
                          {item.descripcion}
                        </h4>
                      </div>

                      {/* Badge de Recepción del Ítem */}
                      {renderItemReceptionBadge(item)}
                    </div>

                    {/* Fila 2: Indicador de Agotado en Tránsito (Destacado) */}
                    {item.es_agotado_transito && (
                      <div className="p-2 bg-amber-950/70 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs text-amber-200 animate-fade-in">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                          <span className="font-['Chakra_Petch'] font-bold uppercase tracking-wider text-amber-300">
                            AGOTADO EN TRÁNSITO
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-amber-200/90 font-semibold">
                          Stock en tienda: {item.stock_disponible} un
                        </span>
                      </div>
                    )}

                    {/* Fila 3: Progreso de Bultos y Unidades Físicas */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-500/10">
                      
                      {/* Bultos */}
                      <div className="bg-[#020d1c] p-2 rounded-xl border border-cyan-500/15 flex items-center justify-between">
                        <span className="text-[10px] font-['Chakra_Petch'] font-semibold text-slate-400 uppercase">
                          Bultos:
                        </span>
                        <span className="font-mono text-xs font-bold text-cyan-300">
                          {bAud} <span className="text-slate-500 font-normal">de {bEsp}</span>
                        </span>
                      </div>

                      {/* Unidades */}
                      <div className="bg-[#020d1c] p-2 rounded-xl border border-cyan-500/15 flex items-center justify-between">
                        <span className="text-[10px] font-['Chakra_Petch'] font-semibold text-slate-400 uppercase">
                          Unidades:
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-300">
                          {uAud} <span className="text-slate-500 font-normal">de {uEsp} un</span>
                        </span>
                      </div>

                    </div>

                    {/* Mini Barra de Progreso del Ítem */}
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

        </main>
      ) : (
        /* 3. Vista de Lista de Camiones Consultables */
        <main className="flex-1 p-3 sm:p-4 max-w-4xl mx-auto w-full space-y-4">
          
          {/* Banner de Bienvenida a Camiones+ */}
          <div className="p-4 bg-gradient-to-r from-[#031d3d] via-[#042852] to-[#021833] border border-cyan-500/30 rounded-2xl shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Snowflake className="w-5 h-5 text-cyan-300" />
                <h2 className="font-['Chakra_Petch'] font-black text-sm text-cyan-200 uppercase tracking-wider">
                  Módulo Operativo de Perecederos
                </h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">OperaMás Suite</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Precarga camiones de frío y congelados en formato AP2 para consulta inmediata del personal de cámara y salón. Sigue el avance de recepción en bultos y unidades en tiempo real mientras se audita en AudiMAS.
            </p>
          </div>

          {/* Filtros de la Lista de Camiones */}
          <div className="p-3 bg-[#03172e]/80 border border-cyan-500/20 rounded-2xl flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
              <input
                type="text"
                value={truckSearch}
                onChange={(e) => setTruckSearch(e.target.value)}
                placeholder="Buscar por NAE o Tienda..."
                className="w-full bg-[#020e1c] border border-cyan-500/30 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setTruckOriginFilter('TODOS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  truckOriginFilter === 'TODOS'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'bg-[#021124] text-slate-300 hover:text-white border border-cyan-500/20'
                }`}
              >
                Todos ({camiones.length})
              </button>

              <button
                onClick={() => setTruckOriginFilter('CAMIONES_PLUS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  truckOriginFilter === 'CAMIONES_PLUS'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'bg-[#021124] text-slate-300 hover:text-white border border-cyan-500/20'
                }`}
              >
                Solo Camiones+
              </button>

              <button
                onClick={() => setTruckOriginFilter('PERECEDEROS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-['Chakra_Petch'] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  truckOriginFilter === 'PERECEDEROS'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'bg-[#021124] text-slate-300 hover:text-white border border-cyan-500/20'
                }`}
              >
                Frío / Congelado
              </button>
            </div>
          </div>

          {/* Listado de Camiones */}
          <div className="space-y-3">
            {loadingCamiones ? (
              <div className="p-12 text-center text-xs font-mono text-cyan-300 animate-pulse">
                Consultando camiones registrados...
              </div>
            ) : filteredCamiones.length === 0 ? (
              <div className="p-8 text-center bg-[#03152b]/80 border border-cyan-500/20 rounded-2xl space-y-3 shadow-xl">
                <Truck className="w-12 h-12 text-slate-500 mx-auto" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-sm text-cyan-200 uppercase tracking-wider">
                    No se encontraron camiones
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Carga un archivo en formato AP2 para precargar el primer camión de perecederos.
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl inline-flex items-center space-x-1.5 shadow-md shadow-cyan-900/40 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Precargar Camión AP2</span>
                </button>
              </div>
            ) : (
              filteredCamiones.map((cam) => {
                const clasif = getBadgeClasificacionCarga(cam);
                const isFromCamionesPlus = cam.origen_carga === 'CAMIONES_PLUS' || cam.estado === 'EN_CONSULTA';

                return (
                  <div
                    key={cam.id}
                    onClick={() => setSelectedTruck(cam)}
                    className="p-4 bg-[#031429]/90 border border-cyan-500/20 hover:border-cyan-400/60 rounded-2xl transition-all space-y-3 shadow-lg cursor-pointer hover:bg-[#041c38]/90 group active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-base text-cyan-300 group-hover:text-cyan-200">
                          NAE: {cam.numero_nae}
                        </span>
                        {isFromCamionesPlus && (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-400/40 rounded-full font-bold">
                            Camiones+
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold ${
                          cam.estado === 'EN_CONSULTA'
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : cam.estado === 'DISPONIBLE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : cam.estado === 'EN_PROCESO'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {cam.estado === 'EN_CONSULTA' ? '⚪ EN CONSULTA (PRECARGA)' : cam.estado}
                        </span>

                        <ChevronRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider ${clasif.className}`}>
                        {clasif.label}
                      </span>
                      {cam.tiene_reporte_ap && (
                        <span className="px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider bg-cyan-950/80 text-cyan-300 border border-cyan-400/30">
                          📊 Reporte AP Valorizado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                      <div className="flex items-center space-x-1.5">
                        <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{formatStoreDisplay(cam.tienda_codigo, cam.tienda_nombre, cam.numero_nae).fullDisplay}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {cam.fecha_arribo || formatDateTimeArg(cam.created_at)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-cyan-500/10 flex items-center justify-between text-xs font-['Chakra_Petch'] text-cyan-300">
                      <span className="flex items-center space-x-1">
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="uppercase font-bold tracking-wider">Ver ítems y avance en tiempo real</span>
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono">
                        Consulta sin escáner
                      </span>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </main>
      )}

      {/* 4. Modal de Precarga de Archivo AP2 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#031429] border border-cyan-500/40 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl shadow-cyan-950/80">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-400/30">
                  <Snowflake className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-['Chakra_Petch'] font-black text-sm text-white uppercase tracking-wider">
                    Precarga de Camión Perecederos
                  </h3>
                  <p className="text-[11px] text-cyan-300/80 font-mono">
                    FORMATO UNIFICADO AP v2 (.XLSX / .XLS)
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
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de Archivo AP2 */}
            <div className="space-y-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-cyan-500/40 hover:border-cyan-400/80 rounded-2xl p-6 text-center space-y-2.5 cursor-pointer bg-[#020e1c]/80 hover:bg-[#03172e] transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={isUploading || isParsing}
                />

                <FileSpreadsheet className="w-10 h-10 text-cyan-400 mx-auto group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider">
                    {selectedFile ? selectedFile.name : 'Haz clic o arrastra el archivo AP v2'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Excel con NAE, Depto, SKU, Descripción, Bultos, Unidades y Stock on Hand
                  </p>
                </div>
              </div>

              {isParsing && (
                <div className="p-3 bg-cyan-950/60 border border-cyan-500/30 rounded-xl text-center text-xs font-mono text-cyan-300 animate-pulse">
                  Analizando estructura del archivo AP2...
                </div>
              )}

              {/* Previsualización del Camión Analizado */}
              {previewData && (
                <div className="p-3.5 bg-[#020d1c] border border-cyan-500/30 rounded-2xl space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2">
                    <span className="font-['Chakra_Petch'] font-black text-sm text-cyan-300">
                      NAE #{previewData.numero_nae}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      {previewData.tienda_codigo} - {previewData.tienda_nombre}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 bg-[#041528] rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Total SKUs</span>
                      <span className="font-bold text-white font-mono">{previewData.totalSKUs}</span>
                    </div>
                    <div className="p-2 bg-[#041528] rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Bultos</span>
                      <span className="font-bold text-cyan-300 font-mono">{previewData.totalBultos}</span>
                    </div>
                    <div className="p-2 bg-[#041528] rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Unidades</span>
                      <span className="font-bold text-emerald-300 font-mono">{previewData.totalUnidades}</span>
                    </div>
                    <div className="p-2 bg-[#041528] rounded-xl">
                      <span className="text-[10px] text-amber-300 block">Agotados</span>
                      <span className="font-bold text-amber-400 font-mono">{previewData.agotadosTransitoCount}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-blue-950/60 border border-blue-500/30 rounded-xl text-[11px] text-blue-200 space-y-1">
                    <p className="font-bold flex items-center space-x-1">
                      <Info className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                      <span>Regla de Precarga en Camiones+:</span>
                    </p>
                    <p className="leading-tight text-slate-300">
                      Este camión se guardará en estado <strong className="text-cyan-300">EN_CONSULTA</strong> para ser visible únicamente en Camiones+. Cuando llegue físicamente y se suba en AudiMAS, se habilitará para escaneo sin perder la consulta aquí.
                    </p>
                  </div>
                </div>
              )}

              {/* Mensajes de Error y Progreso */}
              {uploadError && (
                <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-300 space-y-1">
                  <p className="font-bold flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Error en la carga:</span>
                  </p>
                  <p className="font-mono text-[11px]">{uploadError}</p>
                </div>
              )}

              {uploadSuccess && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 space-y-1">
                  <p className="font-bold flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>¡Carga exitosa!</span>
                  </p>
                  <p className="font-mono text-[11px]">{uploadSuccess}</p>
                </div>
              )}

              {isUploading && (
                <div className="space-y-1.5 p-3 bg-[#020e1c] border border-cyan-500/30 rounded-xl">
                  <div className="flex justify-between text-xs font-mono text-cyan-300">
                    <span>{uploadProgressText || 'Guardando camión en Camiones+...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setSelectedFile(null);
                  setPreviewData(null);
                  setUploadError(null);
                }}
                disabled={isUploading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmUpload}
                disabled={!previewData || isUploading || isParsing}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-900/40 flex items-center space-x-2 cursor-pointer transition-all active:scale-95"
              >
                {isUploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Confirmar Precarga</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
