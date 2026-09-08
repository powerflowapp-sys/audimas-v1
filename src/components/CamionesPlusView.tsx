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
  Layers
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
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('TODOS');
  const [soloAgotados, setSoloAgotados] = useState<boolean>(false);

  // Búsqueda en lista de camiones
  const [truckSearch, setTruckSearch] = useState<string>('');

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

      // REGLA ESTRICTA: Excluir por completo camiones secos (Moreno 15, Escobar 8/08/008)
      // Mostrar ÚNICAMENTE camiones de frío, congelado o precargados en Camiones+
      const perecederos = list.filter(cam => {
        const nae = (cam.numero_nae || '').trim();
        const isSecoMoreno = nae.startsWith('15');
        const isSecoEscobar = nae.startsWith('8') || nae.startsWith('08') || nae.startsWith('008');

        // Si es seco y no proviene de Camiones+, excluirlo rotundamente
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

      if (selectedDepto !== 'TODOS') {
        const deptoStr = `${(it.depto_codigo || '').trim() ? (it.depto_codigo || '').trim() + ' - ' : ''}${(it.depto_nombre || 'GENERAL').trim()}`;
        if (deptoStr !== selectedDepto) {
          return false;
        }
      }

      if (soloAgotados && !it.es_agotado_transito) {
        return false;
      }

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

  // Filtrado de lista de camiones con búsqueda de texto
  const filteredCamiones = useMemo(() => {
    return camiones.filter(cam => {
      if (truckSearch.trim()) {
        const q = truckSearch.toLowerCase().trim();
        const naeMatch = (cam.numero_nae || '').toLowerCase().includes(q);
        const storeMatch = (cam.tienda_nombre || '').toLowerCase().includes(q) || (cam.tienda_codigo || '').toLowerCase().includes(q);
        if (!naeMatch && !storeMatch) return false;
      }
      return true;
    });
  }, [camiones, truckSearch]);

  // Helper de Insignia de Recepción Global
  const renderReceptionBadge = (state: 'COMPLETO' | 'EN_RECEPCION' | 'PENDIENTE', className: string = '') => {
    if (state === 'COMPLETO') {
      return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 shrink-0 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>🟢 COMPLETO (100%)</span>
        </span>
      );
    }
    if (state === 'EN_RECEPCION') {
      return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1 shrink-0 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>🟡 EN RECEPCIÓN</span>
        </span>
      );
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-['Chakra_Petch'] font-bold bg-slate-700/40 text-slate-300 border border-slate-600/40 flex items-center space-x-1 shrink-0 ${className}`}>
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
    <div className="min-h-screen bg-slate-950 text-white p-3 md:p-4 select-none pb-28 font-sans">
      <div className="max-w-md md:max-w-lg mx-auto space-y-3.5">
        
        {/* 1. Header Compacto Mobile-First */}
        <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between shadow-xl">
          <div className="flex items-center space-x-2.5 min-w-0">
            <button
              onClick={() => {
                if (selectedTruck) {
                  setSelectedTruck(null);
                } else {
                  onBack();
                }
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 rounded-xl text-cyan-300 transition-all cursor-pointer active:scale-95 shrink-0"
              title={selectedTruck ? 'Volver a lista de camiones' : 'Volver al Menú'}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <Snowflake className="w-4 h-4 text-cyan-400 shrink-0 animate-spin-slow" />
                <h1 className="font-['Chakra_Petch'] font-black text-sm text-white tracking-wider flex items-center space-x-1 truncate">
                  <span>CAMIONES</span>
                  <span className="text-cyan-400">+</span>
                </h1>
                <span className="text-[9px] font-mono px-1.5 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-500/40 rounded-full font-bold shrink-0">
                  PERECEDEROS
                </span>
              </div>
              <p className="text-[10px] text-cyan-300/80 font-mono tracking-wide truncate">
                CONSULTA FRÍO Y AVANCE EN VIVO
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={() => {
                if (selectedTruck) {
                  fetchItems(selectedTruck.id);
                }
                fetchCamiones();
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all cursor-pointer active:scale-95"
              title="Refrescar datos en vivo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCamiones || loadingItems ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white font-['Chakra_Petch'] font-bold text-[11px] uppercase tracking-wider rounded-xl shadow-md shadow-cyan-950 border border-cyan-400/40 flex items-center space-x-1 cursor-pointer transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Cargar AP2</span>
            </button>
          </div>
        </header>

        {/* 2. Banner Superior Minimalista */}
        {!selectedTruck && (
          <div className="p-2.5 bg-gradient-to-r from-cyan-950/60 via-slate-900/90 to-blue-950/60 border border-cyan-500/30 rounded-2xl flex items-center justify-between shadow-md">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-400/30 shrink-0">
                <Snowflake className="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <p className="text-xs text-slate-200 font-medium truncate">
                Frío, Congelado y AP2 <span className="text-[10px] text-cyan-400 block font-mono">Sin escáner • Avance físico en tiempo real</span>
              </p>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold shrink-0">
              100% Perecederos
            </span>
          </div>
        )}

        {/* 3. VISTA DETALLADA DE CONSULTA DE ÍTEMS (Camión Seleccionado) */}
        {selectedTruck ? (
          <div className="space-y-3 animate-fade-in">
            
            {/* Cabecera del Camión Seleccionado */}
            <div className="p-3.5 bg-slate-900/90 border border-cyan-500/30 rounded-2xl shadow-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5">
                  <span className="font-['Chakra_Petch'] font-black text-base text-cyan-300 tracking-wide">
                    NAE: {selectedTruck.numero_nae}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                    {selectedTruck.estado === 'EN_CONSULTA' ? 'EN CONSULTA' : selectedTruck.estado}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedTruck(null)}
                  className="text-[11px] text-cyan-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 rounded-lg transition-all cursor-pointer font-['Chakra_Petch'] font-bold"
                >
                  Cambiar
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                <div className="flex items-center space-x-1.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{formatStoreDisplay(selectedTruck.tienda_codigo, selectedTruck.tienda_nombre, selectedTruck.numero_nae).fullDisplay}</span>
                </div>
                {renderReceptionBadge(stats.receptionState)}
              </div>

              {/* Grid 2x2 de KPIs de Avance Compacto */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-500/15">
                
                {/* KPI Bultos */}
                <div className="p-2.5 bg-slate-950/80 border border-cyan-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase flex items-center space-x-1">
                      <Package className="w-3 h-3 text-cyan-400" />
                      <span>Bultos</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-cyan-300">{stats.pctBultos}%</span>
                  </div>
                  <p className="text-xs font-['Chakra_Petch'] font-black text-white">
                    {stats.bultosAuditados} <span className="text-[10px] text-slate-400 font-normal">de {stats.bultosEsperados} bultos</span>
                  </p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${stats.pctBultos}%` }}
                    />
                  </div>
                </div>

                {/* KPI Unidades */}
                <div className="p-2.5 bg-slate-950/80 border border-cyan-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-emerald-400" />
                      <span>Unidades</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-300">{stats.pctUnidades}%</span>
                  </div>
                  <p className="text-xs font-['Chakra_Petch'] font-black text-white">
                    {stats.unidadesAuditadas} <span className="text-[10px] text-slate-400 font-normal">de {stats.unidadesEsperadas} un</span>
                  </p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${stats.pctUnidades}%` }}
                    />
                  </div>
                </div>

                {/* KPI Agotados */}
                <div className={`p-2 bg-slate-950/80 border rounded-xl flex items-center justify-between ${stats.agotadosCount > 0 ? 'border-amber-500/40 bg-amber-950/20' : 'border-cyan-500/20'}`}>
                  <span className="text-[10px] font-['Chakra_Petch'] font-bold text-amber-300 uppercase flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Agotados</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {stats.agotadosCount} SKUs
                  </span>
                </div>

                {/* KPI Total Ítems */}
                <div className="p-2 bg-slate-950/80 border border-cyan-500/20 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] font-['Chakra_Petch'] font-bold text-slate-400 uppercase flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                    <span>Total Ítems</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    {stats.totalItems} prod.
                  </span>
                </div>

              </div>
            </div>

            {/* Barra de Búsqueda y Filtros */}
            <div className="p-2.5 bg-slate-900/90 border border-cyan-500/20 rounded-2xl space-y-2">
              
              {/* Input de Búsqueda */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por SKU, UPC, Descripción..."
                  className="w-full bg-slate-950 border border-cyan-500/30 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 font-mono"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Selector de Departamento */}
              {departamentos.length > 0 && (
                <div>
                  <select
                    value={selectedDepto}
                    onChange={(e) => setSelectedDepto(e.target.value)}
                    className="w-full bg-slate-950 border border-cyan-500/30 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400 font-mono cursor-pointer"
                  >
                    <option value="TODOS">Todos los departamentos</option>
                    {departamentos.map((d, i) => (
                      <option key={i} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Chips de Filtrado Rápido */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => setSoloAgotados(!soloAgotados)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider flex items-center space-x-1 transition-all cursor-pointer ${
                    soloAgotados
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                      : 'bg-slate-950 text-amber-300 hover:bg-slate-800 border border-amber-500/30'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Agotados ({stats.agotadosCount})</span>
                </button>

                {(['TODOS', 'COMPLETO', 'EN_RECEPCION', 'PENDIENTE'] as FilterStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                        : 'bg-slate-950 text-slate-300 hover:text-white border border-cyan-500/20'
                    }`}
                  >
                    {st === 'TODOS' && 'Todos'}
                    {st === 'COMPLETO' && '🟢 100%'}
                    {st === 'EN_RECEPCION' && '🟡 Curso'}
                    {st === 'PENDIENTE' && '⚪ Pend.'}
                  </button>
                ))}

                <span className="text-[10px] text-slate-400 font-mono ml-auto">
                  {filteredItems.length}/{items.length}
                </span>
              </div>

            </div>

            {/* Listado de Ítems en Cards Verticales Compactas */}
            <div className="space-y-2">
              {loadingItems ? (
                <div className="p-8 text-center text-xs font-mono text-cyan-300 animate-pulse">
                  Cargando productos del camión NAE #{selectedTruck.numero_nae}...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-6 text-center bg-slate-900/80 border border-cyan-500/20 rounded-2xl space-y-1.5">
                  <Info className="w-6 h-6 text-cyan-400 mx-auto" />
                  <p className="font-['Chakra_Petch'] font-bold text-xs text-cyan-200 uppercase">
                    Sin coincidencias
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Prueba cambiando el texto o desactivando los filtros.
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
                      className={`p-3 bg-slate-900/90 border rounded-2xl transition-all space-y-2 shadow-md ${
                        item.es_agotado_transito 
                          ? 'border-amber-500/40 bg-gradient-to-r from-slate-900/95 via-slate-900/95 to-amber-950/20' 
                          : 'border-cyan-500/20'
                      }`}
                    >
                      {/* Fila 1: SKU, UPC y Badge de Estado */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center space-x-2 text-[11px] font-mono">
                            <span className="font-bold text-cyan-300">SKU: {item.sku}</span>
                            <span className="text-slate-400 truncate">UPC: {item.upc}</span>
                          </div>
                          <h4 className="font-bold text-xs text-white uppercase tracking-wide truncate">
                            {item.descripcion}
                          </h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700 inline-block">
                            DEPTO {item.depto_codigo || '00'} - {item.depto_nombre || 'GENERAL'}
                          </span>
                        </div>

                        {renderItemReceptionBadge(item)}
                      </div>

                      {/* Fila 2: Indicador Destacado de Agotado en Tránsito */}
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

                      {/* Fila 3: Bultos y Unidades */}
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5 border-t border-cyan-500/10 text-xs">
                        <div className="bg-slate-950 p-1.5 rounded-xl border border-cyan-500/15 flex items-center justify-between">
                          <span className="text-[10px] font-['Chakra_Petch'] text-slate-400 uppercase">
                            Bultos:
                          </span>
                          <span className="font-mono text-[11px] font-bold text-cyan-300">
                            {bAud} <span className="text-slate-500 font-normal">de {bEsp}</span>
                          </span>
                        </div>

                        <div className="bg-slate-950 p-1.5 rounded-xl border border-cyan-500/15 flex items-center justify-between">
                          <span className="text-[10px] font-['Chakra_Petch'] text-slate-400 uppercase">
                            Unidades:
                          </span>
                          <span className="font-mono text-[11px] font-bold text-emerald-300">
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
          /* 4. VISTA DE LISTA DE CAMIONES DE PERECEDEROS (Formato Compacto) */
          <div className="space-y-3">
            
            {/* Buscador de Camiones */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-400" />
              <input
                type="text"
                value={truckSearch}
                onChange={(e) => setTruckSearch(e.target.value)}
                placeholder="Buscar por NAE o Tienda..."
                className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 font-mono shadow-sm"
              />
            </div>

            <div className="px-1 flex items-center justify-between">
              <h3 className="text-xs font-['Chakra_Petch'] font-extrabold text-cyan-400 uppercase tracking-widest">
                CAMIONES DE PERECEDEROS ({filteredCamiones.length})
              </h3>
              <span className="text-[10px] font-mono text-slate-400">Frío y Congelado</span>
            </div>

            {/* Listado de Tarjetas de Camiones */}
            {loadingCamiones ? (
              <div className="p-8 text-center text-xs font-mono text-cyan-300 animate-pulse">
                Consultando camiones de perecederos...
              </div>
            ) : filteredCamiones.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/90 border border-cyan-500/20 rounded-2xl space-y-2.5 shadow-xl">
                <Truck className="w-10 h-10 text-slate-500 mx-auto" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-xs text-cyan-200 uppercase tracking-wider">
                    No hay camiones de perecederos registrados
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Carga un archivo AP2 para precargar el primer camión de frío/congelado.
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl inline-flex items-center space-x-1.5 shadow-md shadow-cyan-950 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
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
                    className="p-3.5 bg-slate-900/90 border border-cyan-500/20 hover:border-cyan-400/60 rounded-2xl transition-all space-y-2.5 shadow-lg cursor-pointer hover:bg-slate-800/90 active:scale-[0.99] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-sm text-cyan-300 group-hover:text-cyan-200">
                          NAE: {cam.numero_nae}
                        </span>
                        {isFromCamionesPlus && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-400/40 rounded-full font-bold">
                            Camiones+
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-['Chakra_Petch'] font-bold ${
                          cam.estado === 'EN_CONSULTA'
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : cam.estado === 'DISPONIBLE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : cam.estado === 'EN_PROCESO'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {cam.estado === 'EN_CONSULTA' ? 'EN CONSULTA' : cam.estado}
                        </span>

                        <ChevronRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[9px] uppercase tracking-wider ${clasif.className}`}>
                        {clasif.label}
                      </span>
                      {cam.tiene_reporte_ap && (
                        <span className="px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[9px] uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-400/30">
                          📊 Reporte AP
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{formatStoreDisplay(cam.tienda_codigo, cam.tienda_nombre, cam.numero_nae).fullDisplay}</span>
                      </div>
                      <span className="text-slate-400 text-[10px] shrink-0">
                        {cam.fecha_arribo || formatDateTimeArg(cam.created_at)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-cyan-500/10 flex items-center justify-between text-xs font-['Chakra_Petch'] text-cyan-300">
                      <span className="flex items-center space-x-1">
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="uppercase font-bold tracking-wider text-[11px]">Ver ítems y avance</span>
                      </span>
                      <span className="text-slate-400 text-[10px] font-mono">
                        Consulta sin escáner
                      </span>
                    </div>

                  </div>
                );
              })
            )}

          </div>
        )}

      </div>

      {/* 5. Modal de Precarga de Archivo AP2 (Compacto) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-sm sm:max-w-md w-full p-4 space-y-3.5 shadow-2xl shadow-cyan-950">
            
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-cyan-500/20 rounded-xl border border-cyan-400/30">
                  <Snowflake className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-['Chakra_Petch'] font-black text-xs text-white uppercase tracking-wider">
                    Precarga Camión Perecederos
                  </h3>
                  <p className="text-[10px] text-cyan-300/80 font-mono">
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
                className="border-2 border-dashed border-cyan-500/40 hover:border-cyan-400/80 rounded-2xl p-5 text-center space-y-2 cursor-pointer bg-slate-950/80 hover:bg-slate-950 transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={isUploading || isParsing}
                />

                <FileSpreadsheet className="w-8 h-8 text-cyan-400 mx-auto group-hover:scale-110 transition-transform" />
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
                <div className="p-3 bg-slate-950 border border-cyan-500/30 rounded-2xl space-y-2 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-cyan-500/15 pb-1.5">
                    <span className="font-['Chakra_Petch'] font-black text-xs text-cyan-300">
                      NAE #{previewData.numero_nae}
                    </span>
                    <span className="text-[11px] font-mono text-slate-300">
                      {previewData.tienda_codigo} - {previewData.tienda_nombre}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="p-1.5 bg-slate-900 rounded-xl">
                      <span className="text-[9px] text-slate-400 block">SKUs</span>
                      <span className="font-bold text-white font-mono">{previewData.totalSKUs}</span>
                    </div>
                    <div className="p-1.5 bg-slate-900 rounded-xl">
                      <span className="text-[9px] text-slate-400 block">Bultos</span>
                      <span className="font-bold text-cyan-300 font-mono">{previewData.totalBultos}</span>
                    </div>
                    <div className="p-1.5 bg-slate-900 rounded-xl">
                      <span className="text-[9px] text-slate-400 block">Unidades</span>
                      <span className="font-bold text-emerald-300 font-mono">{previewData.totalUnidades}</span>
                    </div>
                    <div className="p-1.5 bg-slate-900 rounded-xl">
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
                <div className="space-y-1 p-2.5 bg-slate-950 border border-cyan-500/30 rounded-xl">
                  <div className="flex justify-between text-[11px] font-mono text-cyan-300">
                    <span>{uploadProgressText || 'Guardando camión...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
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
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-950 flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
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
