import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Layers,
  ArrowLeft,
  AlertTriangle,
  Package
} from 'lucide-react';
import { 
  previewMaestroExcel, 
  parseMaestroExcel, 
  uploadMaestroProducts 
} from '../services/excelParsers';
import { MaestroPreview } from '../types';
import { BottomNavCapsule } from './BottomNavCapsule';
import { TruckLoadingOverlay } from './TruckLoadingOverlay';
import { supabase } from '../services/supabase';

interface CargarMaestroViewProps {
  onBack: () => void;
  onHome: () => void;
  onSuccess: (totalUploaded: number) => void;
}

export const CargarMaestroView: React.FC<CargarMaestroViewProps> = ({
  onBack,
  onHome,
  onSuccess
}) => {
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState<boolean>(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [maestroPreview, setMaestroPreview] = useState<MaestroPreview | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consulta inicial del conteo real de artículos en la tabla maestro_productos
  const fetchCatalogCount = async () => {
    setLoadingCount(true);
    try {
      const { count, error } = await supabase
        .from('maestro_productos')
        .select('*', { count: 'exact', head: true });
        
      if (!error && count !== null) {
        setCatalogCount(count);
      }
    } catch (err) {
      console.error('Error consultando conteo del catálogo maestro:', err);
    } finally {
      setLoadingCount(false);
    }
  };

  useEffect(() => {
    fetchCatalogCount();
  }, []);

  const resetState = () => {
    setSelectedFile(null);
    setMaestroPreview(null);
    setProgressPercent(0);
    setProgressText('');
    setErrorMessage(null);
    setSuccessMessage(null);
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
    setProgressText('Analizando catálogo maestro Excel...');

    try {
      const preview = await previewMaestroExcel(file);
      setMaestroPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar el catálogo maestro Excel';
      setErrorMessage(msg);
      setSelectedFile(null);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setProgressText('Parseando catálogo completo...');
      const productos = await parseMaestroExcel(selectedFile);

      const res = await uploadMaestroProducts(productos, (percent, _cur, _tot, msg) => {
        setProgressPercent(percent);
        setProgressText(msg);
      });

      setSuccessMessage(`¡Catálogo maestro actualizado exitosamente con ${res.totalUploaded.toLocaleString('es-AR')} artículos!`);
      fetchCatalogCount(); // Actualizar contador local
      onSuccess(res.totalUploaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error durante la sincronización del catálogo maestro';
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
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 text-sky-300 hover:text-white rounded-xl hover:bg-sky-500/10 transition-colors cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-['Chakra_Petch'] font-black text-sm text-sky-300 uppercase tracking-wider leading-tight">
              Catálogo Maestro de Artículos
            </h1>
            <p className="text-[11px] text-sky-400/80 font-mono tracking-wide">
              BASE GENERAL DE PRODUCTOS RETAIL (SIM)
            </p>
          </div>
        </div>
      </header>

      {/* Cuerpo Principal */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {/* Tarjeta de Estado del Catálogo Actual */}
        <div className="p-4 bg-[#061224]/90 border border-sky-500/30 rounded-2xl space-y-2 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Package className="w-4 h-4 text-sky-400 shrink-0" />
              <span>CATÁLOGO ACTIVO</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
              BASE GENERAL SIM
            </span>
          </div>

          <div className="flex items-baseline space-x-2 pt-1">
            <span className="font-['Chakra_Petch'] font-black text-3xl text-white tracking-tight">
              {loadingCount ? '---' : catalogCount !== null ? catalogCount.toLocaleString('es-AR') : '0'}
            </span>
            <span className="font-['Chakra_Petch'] font-extrabold text-sm text-sky-300 uppercase">
              ARTÍCULOS
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-mono pt-1 border-t border-sky-500/10">
            Última actualización / Estado de la base general SIM
          </p>
        </div>

        {/* Selector / Dropzone táctil con Aviso de Overwrite */}
        {!selectedFile && !successMessage && (
          <div className="space-y-2.5">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 bg-[#061224]/80 hover:bg-[#0c244d] rounded-2xl p-7 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-3 shadow-2xl"
            >
              <input 
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="w-14 h-14 bg-[#0c244d] text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Upload className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                  TOCA PARA ACTUALIZAR CATÁLOGO EXCEL
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Formatos soportados: .xlsx, .xls
                </p>
              </div>
            </div>

            {/* Aviso de reemplazo por completo */}
            <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center space-x-2 text-[11px] text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Al importar un nuevo archivo, se reemplazará por completo el catálogo anterior.</span>
            </div>
          </div>
        )}

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-2xl text-red-200 flex items-start space-x-3 text-xs sm:text-sm animate-fade-in shadow-xl">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-white">Error en la Lectura o Carga</p>
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

        {/* Previsualización del archivo seleccionado */}
        {selectedFile && maestroPreview && !successMessage && (
          <div className="bg-[#061224]/90 border border-sky-500/30 rounded-2xl p-4 space-y-4 animate-fade-in shadow-xl">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div>
                <h3 className="font-['Chakra_Petch'] font-bold text-sm text-white uppercase tracking-wider">
                  Catálogo Excel Detectado
                </h3>
                <p className="text-xs text-sky-300/80 font-mono mt-0.5 truncate max-w-[220px]">
                  {selectedFile.name}
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold rounded-full text-xs font-mono">
                {maestroPreview.totalRegistros.toLocaleString('es-AR')} Regs
              </span>
            </div>

            {/* Muestra rápida de 5 registros */}
            <div className="space-y-2">
              <p className="text-[11px] text-sky-400 font-bold uppercase tracking-wider">
                Muestra de Productos a Importar:
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                {maestroPreview.muestra.map((prod, idx) => (
                  <div key={idx} className="p-2 bg-[#020b18] border border-sky-500/20 rounded-xl flex items-center justify-between">
                    <div className="truncate mr-2">
                      <p className="font-bold text-white truncate">{prod.descripcion}</p>
                      <p className="text-[10px] text-slate-400 font-mono">UPC: {prod.upc} | SKU: {prod.sku}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Botones de Confirmación o Cancelación */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-500/20">
              <button
                type="button"
                onClick={resetState}
                disabled={isProcessing}
                className="py-3 px-4 bg-[#0c2847] hover:bg-[#163a75] text-slate-300 font-bold text-xs rounded-xl border border-sky-500/30 transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isProcessing}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/30 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Confirmar y Reemplazar</span>
              </button>
            </div>
          </div>
        )}

        {/* Mensaje de Éxito */}
        {successMessage && (
          <div className="p-5 bg-emerald-950/90 border border-emerald-500/50 rounded-2xl text-emerald-200 text-center space-y-3.5 animate-fade-in shadow-2xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-base text-white uppercase tracking-wider">¡Catálogo Maestro Sincronizado!</h3>
              <p className="text-xs text-emerald-300 mt-1">{successMessage}</p>
            </div>
            
            <button
              type="button"
              onClick={onHome}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              Volver al Inicio
            </button>
          </div>
        )}

      </main>

      {/* Overlay de Carga en Proceso */}
      <TruckLoadingOverlay
        isVisible={isProcessing}
        title="PROCESANDO CATÁLOGO MAESTRO"
        progressText={progressText}
      />

      {/* Nav de Navegación Flotante */}
      <BottomNavCapsule onBack={onBack} onHome={onHome} />

    </div>
  );
};
