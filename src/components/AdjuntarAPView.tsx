import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Upload, 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  Lock,
  Play,
  X
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { adjuntarReporteAPACamion } from '../services/excelParsers';
import { CamionNAE } from '../types';
import { BottomNavCapsule } from './BottomNavCapsule';

interface AdjuntarAPViewProps {
  naeId: string;
  onBack: () => void;
  onStartAudit: (naeId: string) => void;
}

export const AdjuntarAPView: React.FC<AdjuntarAPViewProps> = ({
  naeId,
  onBack,
  onStartAudit
}) => {
  const [camion, setCamion] = useState<CamionNAE | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apFile, setApFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ matchedCount: number; montoTotalEsperado: number } | null>(null);

  useEffect(() => {
    const fetchCamion = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('camiones_nae')
          .select('*')
          .eq('id', naeId)
          .single();

        if (error) throw error;
        setCamion(data);
      } catch (err) {
        console.error('Error al cargar camión para adjuntar AP:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCamion();
  }, [naeId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setApFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apFile || !camion) {
      setErrorMsg('Por favor selecciona el archivo de Reporte AP (.xlsx)');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await adjuntarReporteAPACamion(camion.id, apFile);
      setUploadResult({
        matchedCount: res.matchedCount,
        montoTotalEsperado: res.montoTotalEsperado
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar archivo AP');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col items-center justify-center space-y-4 font-sans select-none p-4">
        <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
        <p className="font-['Chakra_Petch'] font-bold text-sm text-purple-200 uppercase tracking-wider">
          Cargando datos del camión...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* 1. Header Pantalla Completa GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-purple-500/30 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div>
            <h1 className="font-['Chakra_Petch'] font-black text-sm text-purple-300 uppercase tracking-wider leading-tight flex items-center space-x-2">
              <span>Adjuntar Reporte AP</span>
            </h1>
            <p className="text-[11px] text-purple-400/90 font-mono tracking-wide">
              NAE #{camion?.numero_nae || '---'} • {camion?.tienda_nombre || 'Tienda Destino'}
            </p>
          </div>
        </div>

        <div className="px-3 py-1 bg-purple-600/30 border border-purple-400/40 rounded-xl font-['Chakra_Petch'] font-bold text-xs text-purple-200 flex items-center space-x-1.5">
          <DollarSign className="w-3.5 h-3.5 text-purple-300" />
          <span>Valorización</span>
        </div>
      </header>

      {/* 2. Área Central de Contenido */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {uploadResult ? (
          /* Estado de Éxito Integrado en la Misma Pantalla */
          <div className="space-y-4 animate-scale-up">
            
            {/* Header Badge Éxito */}
            <div className="p-4 bg-gradient-to-r from-emerald-950/90 to-[#061224] border border-emerald-500/40 rounded-2xl flex items-center space-x-3 shadow-xl">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-emerald-400 shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-['Chakra_Petch'] font-black text-sm text-emerald-300 uppercase tracking-wider">
                  Reporte AP Vinculado Exitosamente
                </h3>
                <p className="text-[11px] text-emerald-400/80 font-mono">
                  Manifiesto NAE #{camion?.numero_nae} valorizado en Supabase
                </p>
              </div>
            </div>

            {/* Panel de Métricas */}
            <div className="p-5 bg-gradient-to-br from-[#071938] to-[#020b18] border border-sky-500/30 rounded-2xl space-y-3.5 shadow-2xl">
              <h4 className="font-['Chakra_Petch'] font-bold text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-2">
                Resumen de Valorización
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#020b18]/80 p-3.5 rounded-xl border border-sky-500/20 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">SKUs Actualizados</span>
                  <p className="font-mono font-bold text-white text-base">
                    {uploadResult.matchedCount} <span className="text-xs text-slate-400 font-normal">SKUs</span>
                  </p>
                </div>

                <div className="bg-[#020b18]/80 p-3.5 rounded-xl border border-sky-500/20 space-y-1">
                  <span className="text-[10px] text-purple-300 uppercase font-mono block">Monto Total Valorizado</span>
                  <p className="font-mono font-bold text-purple-300 text-base">
                    ${uploadResult.montoTotalEsperado.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center space-x-2 text-xs text-purple-200 font-bold">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Modalidades Por Monto ($) y Mixta Desbloqueadas</span>
              </div>
            </div>

          </div>
        ) : (
          /* Formulario de Selección de Archivo */
          <>
            {/* Card Explicativa */}
            <div className="p-4 bg-[#061224]/90 border border-purple-500/30 rounded-2xl flex items-start space-x-3 text-xs text-purple-200 shadow-xl leading-relaxed">
              <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white mb-1">Cruce de Costos y Valorización de Carga</p>
                <p className="text-purple-300/80">
                  Sube el reporte de auditoría de precios AP (.xlsx) para asociar el costo unitario a cada SKU. Esto habilitará las modalidades de descarga <b>Por Monto ($)</b> y <b>Mixta</b> antes de iniciar el escaneo.
                </p>
              </div>
            </div>

            {/* Formulario & Dropzone Amplio */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-5 bg-gradient-to-br from-[#071938] to-[#020b18] border border-purple-500/40 rounded-2xl space-y-4 shadow-2xl">
                
                <label className="font-['Chakra_Petch'] font-bold text-xs text-purple-300 uppercase tracking-wider block">
                  Seleccionar Archivo de Reporte AP (.xlsx)
                </label>

                <div className="relative border-2 border-dashed border-purple-500/50 hover:border-purple-400 bg-[#020b18]/90 rounded-2xl p-8 text-center transition-all cursor-pointer group shadow-inner">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-purple-600/20 border border-purple-500/30 rounded-2xl group-hover:scale-105 transition-transform">
                      <FileSpreadsheet className="w-10 h-10 text-purple-400" />
                    </div>

                    {apFile ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-center space-x-1.5 text-emerald-400 font-mono text-sm font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{apFile.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {(apFile.size / 1024).toFixed(1)} KB • Archivo Listo
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-purple-200 block">
                          Haz clic o arrastra tu archivo Excel aquí
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Soporta reportes *.xlsx con columnas de SKU/UPC y Costos
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-950/80 border border-red-500/50 text-red-300 text-xs rounded-xl font-bold flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMsg(null)}
                      className="p-1 text-red-400 hover:text-white rounded-lg hover:bg-red-900/50 transition-colors shrink-0"
                      title="Descartar aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Botón Principal de Confirmación */}
              <button
                type="submit"
                disabled={!apFile || isProcessing}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-purple-600/30 flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-purple-200" />
                    <span>Procesando y cruzando costos masivos...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Cargar Reporte AP y Cruzar Costos</span>
                  </>
                )}
              </button>
            </form>
          </>
        )}

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
