import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  ArrowLeft, 
  Search, 
  Building2, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  RefreshCw,
  Download
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { CamionNAE, AuditoriaItem } from '../types';
import { descargarExcelHistorial, getSnapshotLocal } from '../services/historyService';
import { calcularResumenAuditoria } from '../services/reportService';

interface HistorialReportesViewProps {
  onBack: () => void;
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

export const HistorialReportesView: React.FC<HistorialReportesViewProps> = ({ onBack }) => {
  const [reportes, setReportes] = useState<ReporteHistorialItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
        .in('estado', ['CERRADO', 'FINALIZADO'])
        .order('fecha_fin_auditoria', { ascending: false });

      if (error) {
        console.error('Error al cargar camiones cerrados:', error);
      }

      const camionesList: CamionNAE[] = camionesData || [];

      // Para cada camión, cargar resumen rápido desde snapshot local o Supabase
      const reportesCalculados: ReporteHistorialItem[] = await Promise.all(
        camionesList.map(async (cam) => {
          const snap = getSnapshotLocal(cam.id);
          let uEsc = 0;
          let uEsp = 0;
          let totalSkus = 0;
          let efectividad = 100;
          let auditor = 'AUDITOR A';

          if (snap && snap.items) {
            const res = calcularResumenAuditoria(snap.items);
            uEsc = res.unidadesEscaneadas;
            uEsp = res.unidadesEsperadas;
            totalSkus = res.totalSkus;
            efectividad = res.efectividadPorcentaje;
            if (snap.productividad && snap.productividad.length > 0) {
              auditor = snap.productividad[0].colaborador_nombre;
            }
          } else {
            // Consultar ítems directos en Supabase
            const { data: items } = await supabase
              .from('auditoria_items')
              .select('unidades_esperadas, unidades_escaneadas, bultos_esperados, bultos_escaneados, ultimo_colaborador')
              .eq('nae_id', cam.id);

            const list: AuditoriaItem[] = (items as any) || [];
            const res = calcularResumenAuditoria(list);
            uEsc = res.unidadesEscaneadas;
            uEsp = res.unidadesEsperadas;
            totalSkus = res.totalSkus;
            efectividad = res.efectividadPorcentaje;

            const ultColab = list.find(it => it.ultimo_colaborador)?.ultimo_colaborador;
            if (ultColab) auditor = ultColab;
          }

          return {
            camion: cam,
            totalSkus,
            unidadesEscaneadas: uEsc,
            unidadesEsperadas: uEsp,
            efectividadPorcentaje: efectividad,
            auditorResponsable: auditor
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

  const filteredReportes = reportes.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.camion.numero_nae.toLowerCase().includes(q) ||
      r.camion.tienda_nombre.toLowerCase().includes(q) ||
      r.camion.tienda_codigo.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col font-sans pb-10 select-none">
      
      {/* Header Fijo Estilo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 bg-[#0c2847] hover:bg-[#163a75] text-sky-300 rounded-xl border border-sky-500/30 transition-colors"
            title="Volver a Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
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
              const fechaCierreStr = cam.fecha_fin_auditoria
                ? new Date(cam.fecha_fin_auditoria).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) + ' hs'
                : 'Finalizado';

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
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-[10px] font-['Chakra_Petch'] font-bold">
                        CERRADO
                      </span>
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

                  {/* Botón de Descarga Destacado en Verde Esmeralda */}
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={isDownloading}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/30 w-full transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Generando Excel...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-white" />
                        <span>Descargar Excel</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
