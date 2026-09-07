import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Building2, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  RefreshCw,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
  Lock,
  Eye,
  Scan
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { 
  CamionNAE, 
  isCamionCierreParcial,
  AuditoriaItem
} from '../types';
import { 
  reabrirCamionNae, 
  formatDateTimeArg,
  fetchTrazabilidadCamion,
  obtenerEventosTrazabilidadOrdenados,
  EventoTrazabilidad,
  calcularResumenAuditoria,
  fetchMaxLogDateForTruck,
  enriquecerCamionesConLogsParciales
} from '../services/reportService';

import { eliminarCamionEnCascada, descargarExcelHistorial } from '../services/historyService';
import { BottomNavCapsule } from './BottomNavCapsule';
import { ConfirmModal } from './ConfirmModal';

interface HistorialReportesViewProps {
  onBack: () => void;
  onReopenAndScan?: (naeId: string) => void;
  onOpenScan?: (naeId: string) => void;
  onOpenCierre?: (naeId: string) => void;
}

interface ReporteHistorialItem {
  camion: CamionNAE;
  totalSkus: number;
  unidadesEscaneadas: number;
  unidadesEsperadas: number;
  efectividadPorcentaje: number;
  auditorResponsable: string;
  isDownloading?: boolean;
}

export const HistorialReportesView: React.FC<HistorialReportesViewProps> = ({ 
  onBack,
  onReopenAndScan,
  onOpenScan,
  onOpenCierre
}) => {
  const [reportes, setReportes] = useState<ReporteHistorialItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Estados para acordeón de trazabilidad de tiempos
  const [expandedTruckIds, setExpandedTruckIds] = useState<Record<string, boolean>>({});
  const [trazabilidadMap, setTrazabilidadMap] = useState<Record<string, EventoTrazabilidad[]>>({});

  const toggleTruckTimes = async (naeId: string, camion?: CamionNAE) => {
    const isExpanding = !expandedTruckIds[naeId];
    setExpandedTruckIds(prev => ({ ...prev, [naeId]: isExpanding }));
    
    if (isExpanding && camion && !trazabilidadMap[naeId]) {
      try {
        const evts = await fetchTrazabilidadCamion(naeId, camion);
        setTrazabilidadMap(prev => ({ ...prev, [naeId]: evts }));
      } catch (e) {
        console.warn('Error al cargar trazabilidad:', e);
      }
    }
  };

  // Estado para modal de confirmación de reapertura
  const [truckToReopen, setTruckToReopen] = useState<CamionNAE | null>(null);
  const [isReopening, setIsReopening] = useState<boolean>(false);

  // Estado para modal de confirmación de eliminación definitiva y purga de imágenes
  const [truckToDelete, setTruckToDelete] = useState<CamionNAE | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    setLoading(true);
    try {
      // Consultar camiones con estado FINALIZADO o CERRADO
      const { data: camionesData, error } = await supabase
        .from('camiones_nae')
        .select('*')
        .in('estado', ['CERRADO', 'FINALIZADO', 'CERRADO_PARCIAL', 'FINALIZADO_PARCIAL'])
        .order('fecha_fin_auditoria', { ascending: false });

      if (error) {
        console.error('Error al cargar camiones cerrados:', error);
      }

      const camionesList: CamionNAE[] = camionesData || [];
      const camionesEnriquecidos = await enriquecerCamionesConLogsParciales(camionesList);

      // Para cada camión, calcular resumen en tiempo real desde Supabase (datos vivos)
      const reportesCalculados: ReporteHistorialItem[] = await Promise.all(
        camionesEnriquecidos.map(async (cam) => {
          let updatedCamion = cam;
          if (!cam.fecha_fin_auditoria && !cam.fecha_fin) {
            const maxLogDate = await fetchMaxLogDateForTruck(cam.id);
            updatedCamion = {
              ...cam,
              fecha_fin_auditoria: maxLogDate || cam.created_at
            };
          }

          const { data: items } = await supabase
            .from('auditoria_items')
            .select('unidades_esperadas, unidades_escaneadas, bultos_esperados, bultos_escaneados, ultimo_colaborador, es_sobrante_no_facturado')
            .eq('nae_id', cam.id);

          const list: AuditoriaItem[] = (items as any) || [];
          const res = calcularResumenAuditoria(list);
          const uEsc = res.unidadesEscaneadas;
          const uEsp = res.unidadesEsperadas;
          const totalSkus = res.totalSkus;
          const efectividad = res.efectividadPorcentaje;

          const ultColab = list.find(it => it.ultimo_colaborador)?.ultimo_colaborador || 'AUDITOR';

          return {
            camion: updatedCamion,
            totalSkus,
            unidadesEscaneadas: uEsc,
            unidadesEsperadas: uEsp,
            efectividadPorcentaje: efectividad,
            auditorResponsable: ultColab
          };
        })
      );

      setReportes(reportesCalculados);
    } catch (err) {
      console.error('Error general al cargar historial:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (item: ReporteHistorialItem) => {
    setDownloadingId(item.camion.id);
    try {
      await descargarExcelHistorial(item.camion);
    } catch (err) {
      alert('Error al generar la descarga del informe Excel.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmReopenReport = async () => {
    if (!truckToReopen) return;
    setIsReopening(true);
    const targetId = truckToReopen.id;
    try {
      const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
      await reabrirCamionNae(targetId, activeUser);
      setTruckToReopen(null);
      if (onReopenAndScan) {
        onReopenAndScan(targetId);
      } else {
        await cargarHistorial();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reabrir la auditoría');
    } finally {
      setIsReopening(false);
    }
  };

  const handleConfirmDeleteReport = async () => {
    if (!truckToDelete) return;
    setIsDeleting(true);
    const naeId = truckToDelete.id;

    try {
      await eliminarCamionEnCascada(naeId);
      setTruckToDelete(null);
      await cargarHistorial();
    } catch (err) {
      console.error('Error al purgar el reporte y evidencias:', err);
      alert(err instanceof Error ? err.message : 'Error al eliminar el reporte');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDateTime = (dateStr?: string): string => {
    if (!dateStr) return '--/--/-- --:--';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '--/--/-- --:--';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(-2);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes} hs`;
    } catch {
      return dateStr;
    }
  };

  const filteredReportes = reportes.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.camion.numero_nae.toLowerCase().includes(q) ||
      r.camion.tienda_nombre.toLowerCase().includes(q) ||
      r.camion.tienda_codigo.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* Header Fijo Estilo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div>
            <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Historial de Reportes Excel</span>
            </h1>
            <p className="text-[10px] text-sky-400/80 font-mono tracking-widest uppercase">
              ARCHIVOS Y SNAPSHOTS DE AUDITORÍA
            </p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-3 space-y-4 max-w-md mx-auto w-full flex-1">
        
        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por NAE o Tienda..."
            className="w-full pl-9 pr-3 py-2.5 bg-[#05132d]/80 border border-sky-500/20 text-slate-200 text-xs rounded-xl focus:outline-none focus:border-sky-400 backdrop-blur-sm"
          />
        </div>

        {/* Listado de Tarjetas de Reportes */}
        {loading ? (
          <div className="p-12 text-center text-xs text-sky-400 font-mono flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <span>Cargando historial de reportes...</span>
          </div>
        ) : filteredReportes.length === 0 ? (
          <div className="p-8 text-center bg-[#05132d]/80 border border-sky-500/20 rounded-2xl space-y-3 shadow-xl backdrop-blur-sm">
            <FileSpreadsheet className="w-12 h-12 text-slate-500 mx-auto" />
            <div>
              <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">
                No hay reportes finalizados
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Los camiones con auditoría cerrada aparecerán en este historial para su descarga permanente en Excel.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReportes.map((item) => {
              const cam = item.camion;
              const isDownloading = downloadingId === cam.id;
              const fechaCierreStr = formatDateTimeArg(cam.fecha_fin_auditoria || cam.fecha_fin || cam.created_at);

              return (
                <div
                  key={cam.id}
                  className="bg-[#05132d]/80 border border-sky-500/20 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-sm transition-all hover:border-sky-500/40"
                >
                  {/* Fila NAE y Estado / Fecha */}
                  <div className="flex items-center justify-between border-b border-sky-500/10 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-black text-sm text-sky-400">
                        NAE: {cam.numero_nae}
                      </span>
                      {cam.estado === 'EN_PROCESO' ? (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span>EN PROCESO</span>
                        </span>
                      ) : isCamionCierreParcial(cam) ? (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>FINALIZADO PARCIAL</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-[10px] font-['Chakra_Petch'] font-bold flex items-center space-x-1">
                          <Lock className="w-3 h-3 text-purple-400" />
                          <span>FINALIZADO</span>
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] font-mono text-slate-300 flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span>{fechaCierreStr}</span>
                    </span>
                  </div>

                  {/* Tienda */}
                  <div className="flex items-center space-x-1.5 text-xs text-slate-200 font-medium">
                    <Building2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>{cam.tienda_codigo} - {cam.tienda_nombre}</span>
                  </div>

                  {/* Cronología de Marcas de Tiempo en GMT-3 (Trazabilidad Acumulativa Completa) */}
                  {Boolean(expandedTruckIds[cam.id]) && (
                    <div className="text-[10px] sm:text-[11px] text-slate-300 font-mono flex items-start space-x-2 p-2.5 bg-[#020b18]/80 border border-sky-500/20 rounded-xl animate-fade-in">
                      <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <div className="flex flex-col space-y-1.5 leading-tight w-full">
                        <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-widest border-b border-sky-500/10 pb-1">
                          Trazabilidad Cronológica de Auditoría
                        </span>
                        {obtenerEventosTrazabilidadOrdenados(cam, trazabilidadMap[cam.id]).map((evt, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className={evt.tipo.includes('REAPERTURA') ? "text-amber-300 font-semibold" : evt.tipo.includes('CIERRE') ? "text-purple-300 font-medium" : "text-sky-200"}>
                              • {evt.titulo}
                            </span>
                            <span className="text-slate-400 font-mono">
                              {formatDateTimeArg(evt.fecha)}{evt.usuario ? ` • ${evt.usuario}` : ''}
                            </span>
                          </div>
                        ))}

                      </div>
                    </div>
                  )}

                  {/* Métricas Rápidas */}
                  <div className="grid grid-cols-2 gap-2 p-2 bg-[#020b18]/60 border border-sky-500/10 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Unidades Físicas</span>
                      <span className="font-mono font-bold text-white text-xs">
                        {item.unidadesEscaneadas.toLocaleString()} / {item.unidadesEsperadas.toLocaleString()} u
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Efectividad</span>
                      <span className="font-mono font-bold text-emerald-400 text-xs flex items-center justify-end space-x-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        <span>{item.efectividadPorcentaje}%</span>
                      </span>
                    </div>
                  </div>

                  {/* Botón Acordeón Trazabilidad para Camiones Finalizados */}
                  <button
                    type="button"
                    onClick={() => toggleTruckTimes(cam.id, cam)}
                    className="w-full py-1.5 px-2.5 bg-[#020b18]/60 hover:bg-[#071938] border border-sky-500/20 hover:border-sky-500/40 text-slate-300 hover:text-sky-200 text-[11px] font-mono rounded-xl flex items-center justify-between transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>{expandedTruckIds[cam.id] ? 'Ocultar trazabilidad' : 'Ver tiempos de trazabilidad'}</span>
                    </div>
                    {expandedTruckIds[cam.id] ? (
                      <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
                    )}
                  </button>

                  {/* Botones de Acción: Ver/Continuar, Descargar Excel, Reabrir Auditoría y Eliminar Reporte */}
                  <div className={`grid gap-2 ${onOpenScan ? 'grid-cols-[1fr_1fr_1fr_auto]' : 'grid-cols-[1fr_1fr_auto]'}`}>
                    {onOpenScan && (
                      <button
                        type="button"
                        onClick={() => onOpenScan(cam.id)}
                        className="py-2.5 px-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1 shadow-md shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
                      >
                        {cam.estado === 'EN_PROCESO' ? (
                          <>
                            <Scan className="w-3.5 h-3.5 text-white" />
                            <span>Continuar</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-white" />
                            <span>Ver</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleDownload(item)}
                      disabled={isDownloading}
                      className="py-2.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-600/30 w-full transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isDownloading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>Excel...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 text-white" />
                          <span>Excel</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setTruckToReopen(cam)}
                      className="py-2.5 px-3 bg-[#0c2847] hover:bg-[#163a75] text-amber-300 hover:text-amber-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-amber-500/30 flex items-center justify-center space-x-1.5 shadow-md w-full transition-all active:scale-95 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reabrir</span>
                    </button>

                    <button
                      onClick={() => setTruckToDelete(cam)}
                      className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-400 hover:text-red-300 font-['Chakra_Petch'] font-bold text-xs rounded-xl flex items-center justify-center space-x-1 shadow-md transition-all active:scale-95 cursor-pointer"
                      title="Eliminar este reporte y sus fotos de evidencia definitivamente"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Confirmación de Reapertura */}
      <ConfirmModal
        isOpen={!!truckToReopen}
        title="Reabrir Auditoría de Camión NAE"
        message={`¿Estás seguro de que deseas reabrir la auditoría del camión NAE "${truckToReopen?.numero_nae}"? El estado cambiará a EN PROCESO y podrás continuar escaneando manteniendo todos los conteos previos.`}
        confirmText="Sí, Reabrir Auditoría"
        cancelText="Cancelar"
        isProcessing={isReopening}
        onClose={() => setTruckToReopen(null)}
        onConfirm={handleConfirmReopenReport}
      />

      {/* Modal Confirmación de Eliminación Definitiva y Purga de Evidencias */}
      <ConfirmModal
        isOpen={!!truckToDelete}
        title="Eliminar Reporte y Evidencias"
        message={`¿Eliminar definitivamente este reporte y sus evidencias? Esta acción purgará las fotos de evidencia de Storage y eliminará el registro del camión NAE "${truckToDelete?.numero_nae}".`}
        confirmText="Sí, Eliminar Definitivamente"
        cancelText="Cancelar"
        isProcessing={isDeleting}
        onClose={() => setTruckToDelete(null)}
        onConfirm={handleConfirmDeleteReport}
      />

      {/* Cápsula Flotante Inferior */}
      <BottomNavCapsule onBack={onBack} showScan={false} showHome={false} />
    </div>
  );
};
