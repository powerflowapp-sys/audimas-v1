import React, { useState, useRef } from 'react';
import { 
  Truck, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet, 
  RefreshCw,
  PackageCheck,
  Building2,
  Boxes,
  Layers,
  ArrowLeft
} from 'lucide-react';
import { 
  parseCamionManifiestoExcel, 
  uploadCamionManifiesto 
} from '../services/excelParsers';
import { CamionManifiestoPreview } from '../types';
import { BottomNavCapsule } from './BottomNavCapsule';
import { TruckLoadingOverlay } from './TruckLoadingOverlay';

interface CargarCamionViewProps {
  onBack: () => void;
  onHome: () => void;
  onSuccess: (naeId: string, totalItems: number) => void;
}

export const CargarCamionView: React.FC<CargarCamionViewProps> = ({
  onBack,
  onHome,
  onSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [camionPreview, setCamionPreview] = useState<CamionManifiestoPreview | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdNaeId, setCreatedNaeId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setCamionPreview(null);
    setProgressPercent(0);
    setProgressText('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedNaeId(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedFile(file);
    setIsProcessing(true);
    setProgressText('Analizando manifiesto Excel...');

    try {
      const preview = await parseCamionManifiestoExcel(file);
      setCamionPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar el archivo Excel del camión';
      setErrorMessage(msg);
      setSelectedFile(null);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || !camionPreview) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await uploadCamionManifiesto(camionPreview, (percent, _cur, _tot, msg) => {
        setProgressPercent(percent);
        setProgressText(msg);
      });

      setCreatedNaeId(res.nae_id);
      setSuccessMessage(`¡Camión NAE ${camionPreview.numero_nae} cargado exitosamente con ${res.totalItems} productos!`);
      onSuccess(res.nae_id, res.totalItems);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error durante la subida a Supabase';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col font-sans pb-28 select-none">
      
      {/* Header Fijo Estilo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-600/30 text-sky-300 rounded-xl border border-sky-500/30">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider leading-tight">
              Importar Camión NAE
            </h1>
            <p className="text-[11px] text-sky-400/80 font-mono tracking-wide">
              MANIFIESTO DE RECEPCIÓN CEDIS
            </p>
          </div>
        </div>
      </header>

      {/* Cuerpo Principal */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {/* Instrucción Sutil */}
        <div className="p-3.5 bg-[#061224]/90 border border-sky-500/30 rounded-2xl flex items-start space-x-3 text-xs text-sky-200 shadow-xl">
          <span className="text-base leading-none">💡</span>
          <div className="leading-relaxed">
            <p className="font-bold text-white mb-0.5">Archivo Manifiesto de Camión NAE</p>
            <p className="text-sky-300/80">Selecciona el archivo Excel generado por CEDIS (ej: <code className="bg-[#0c244d] text-sky-200 px-1.5 py-0.5 rounded font-mono">32 Agotado en transito *.xlsx</code>). Fila de cabecera en línea 2.</p>
          </div>
        </div>

        {/* Selector / Dropzone táctil */}
        {!selectedFile && !successMessage && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-sky-500/40 hover:border-sky-400 bg-[#061224]/80 hover:bg-[#0c244d] rounded-2xl p-8 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-3 shadow-2xl"
          >
            <input 
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="w-16 h-16 bg-[#0c244d] text-sky-300 border border-sky-500/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <Upload className="w-8 h-8 text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                Toca para Seleccionar Excel
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Archivos compatibles: .xlsx, .xls
              </p>
            </div>
          </div>
        )}

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-2xl text-red-200 flex items-start space-x-3 text-xs sm:text-sm animate-fade-in shadow-xl">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-white">Error al Leer o Cargar Archivo</p>
              <p className="mt-1 text-red-300/90 leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={resetState}
                className="mt-3 px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-100 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors border border-red-500/40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reintentar Selección</span>
              </button>
            </div>
          </div>
        )}

        {/* Mensaje de Éxito */}
        {successMessage && (
          <div className="p-5 bg-emerald-950/90 border border-emerald-500/50 rounded-2xl text-emerald-200 text-center space-y-3.5 animate-fade-in shadow-2xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-base text-white uppercase tracking-wider">¡Manifiesto Importado con Éxito!</h3>
              <p className="text-xs text-emerald-300 mt-1">{successMessage}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={onHome}
                className="py-2.5 px-3 bg-[#0c244d] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 transition-all shadow-md"
              >
                Volver al Inicio
              </button>
              <button
                type="button"
                onClick={resetState}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/30"
              >
                Cargar Otro Camión
              </button>
            </div>
          </div>
        )}

        {/* PREVISUALIZACIÓN DE CAMIÓN NAE */}
        {camionPreview && !successMessage && (
          <div className="bg-[#061224]/90 border border-sky-500/30 rounded-2xl p-4 space-y-3.5 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5">
              <span className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider">Resumen del Manifiesto</span>
              <span className="px-3 py-1 bg-blue-600/40 border border-sky-400/40 text-white font-mono font-black rounded-xl text-xs">
                NAE: {camionPreview.numero_nae}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#020b18] p-3 rounded-xl border border-sky-500/20 flex items-center space-x-2.5 shadow-inner">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="truncate">
                  <p className="text-slate-400 text-[10px] uppercase font-mono">Tienda Destino</p>
                  <p className="font-bold text-white truncate">{camionPreview.tienda_codigo} - {camionPreview.tienda_nombre}</p>
                </div>
              </div>

              <div className="bg-[#020b18] p-3 rounded-xl border border-sky-500/20 flex items-center space-x-2.5 shadow-inner">
                <Boxes className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-mono">Bultos Esperados</p>
                  <p className="font-mono font-bold text-white">{camionPreview.totalBultos.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-[#020b18] p-3 rounded-xl border border-sky-500/20 flex items-center space-x-2.5 shadow-inner">
                <Layers className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-mono">Total SKUs</p>
                  <p className="font-mono font-bold text-white">{camionPreview.totalSKUs.toLocaleString()} ítems</p>
                </div>
              </div>

              <div className="bg-[#020b18] p-3 rounded-xl border border-sky-500/20 flex items-center space-x-2.5 shadow-inner">
                <PackageCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-mono">Total Unidades</p>
                  <p className="font-mono font-bold text-white">{camionPreview.totalUnidades.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Warning Agotados en Tránsito */}
            {camionPreview.agotadosTransitoCount > 0 ? (
              <div className="p-3 bg-amber-950/80 border border-amber-500/50 rounded-xl flex items-center space-x-2.5 text-amber-200 text-xs font-bold shadow-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>🚨 {camionPreview.agotadosTransitoCount} productos vienen marcados como AGOTADO EN TRÁNSITO</span>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Todos los ítems del manifiesto registran disponibilidad.</span>
              </div>
            )}

            {/* BARRA DE PROGRESO DE CARGA */}
            {isProcessing && (
              <div className="space-y-2 py-2 animate-fade-in border-t border-sky-500/20 pt-3">
                <div className="flex justify-between text-xs font-mono font-bold text-sky-300">
                  <span className="truncate max-w-[220px]">{progressText || 'Cargando camión...'}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-[#020b18] rounded-full h-3 overflow-hidden border border-sky-500/30">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out shadow-lg shadow-blue-500/50"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* BOTONES DE ACCIÓN DE CARGA */}
            {!isProcessing && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-500/20">
                <button
                  type="button"
                  onClick={resetState}
                  className="py-2.5 px-3 bg-[#0c244d] hover:bg-[#163a75] text-slate-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 transition-colors"
                >
                  Cambiar File
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={!selectedFile}
                  className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>Confirmar Subida</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Barra de Navegación Flotante Inferior GDS */}
      <BottomNavCapsule
        onBack={onBack}
        onHome={onHome}
      />

      {/* Overlay de Carga con Animación Interactiva del Camión en Ruta */}
      <TruckLoadingOverlay
        isVisible={isProcessing}
        title="PROCESANDO MANIFIESTO NAE..."
        subtitle="Validando artículos y sincronizando con la base de datos..."
        progressText={progressText}
      />
    </div>
  );
};
