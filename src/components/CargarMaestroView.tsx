import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Layers,
  AlertTriangle,
  Package,
  X,
  Trash2
} from 'lucide-react';
import { 
  previewMaestroExcel, 
  parseMaestroExcel, 
  uploadMaestroProducts,
  parseMaestroV8Excel,
  parseMaestroStock24Excel,
  uploadMaestroProductsV8,
  uploadMaestroProductsStock24
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
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  const [importType, setImportType] = useState<'V8' | 'STOCK24' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [maestroPreview, setMaestroPreview] = useState<MaestroPreview | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleVaciarCatalogo = async () => {
    setShowDeleteModal(false);
    setIsProcessing(true);
    setProgressText('Vaciando todos los artículos del catálogo maestro...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase
        .from('maestro_productos')
        .delete()
        .neq('upc', '000000000000_FORCE_DELETE_ALL');

      if (error) {
        throw new Error(`Error en base de datos al vaciar el catálogo maestro: ${error.message}`);
      }

      setCatalogCount(0);
      setSuccessMessage('Catálogo maestro vaciado exitosamente.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al vaciar el catálogo maestro';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };



  const fileInputV8Ref = useRef<HTMLInputElement>(null);
  const fileInputStock24Ref = useRef<HTMLInputElement>(null);

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
    setImportType(null);
    setProgressPercent(0);
    setProgressText('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(false);
    if (fileInputV8Ref.current) fileInputV8Ref.current.value = '';
    if (fileInputStock24Ref.current) fileInputStock24Ref.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'V8' | 'STOCK24') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedFile(file);
    setImportType(type);
    setIsProcessing(true);
    setProgressText(type === 'V8' ? 'Analizando Reporte V8...' : 'Analizando Reporte 24 Stock...');

    try {
      const productos = type === 'V8' 
        ? await parseMaestroV8Excel(file, (percent, _cur, _tot, msg) => {
            setProgressPercent(percent);
            setProgressText(msg);
          }) 
        : await parseMaestroStock24Excel(file, (percent, _cur, _tot, msg) => {
            setProgressPercent(percent);
            setProgressText(msg);
          });
      setMaestroPreview({
        totalRegistros: productos.length,
        muestra: productos.slice(0, 5)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar el catálogo Excel';
      setErrorMessage(msg);
      setSelectedFile(null);
      setImportType(null);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || !importType) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setProgressText('Parseando catálogo completo...');
      
      let totalUploaded = 0;
      if (importType === 'V8') {
        const productos = await parseMaestroV8Excel(selectedFile, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });
        const res = await uploadMaestroProductsV8(productos, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });
        totalUploaded = res.totalUploaded;
        setSuccessMessage(`¡Catálogo V8 sincronizado exitosamente con ${totalUploaded.toLocaleString('es-AR')} artículos!`);
      } else {
        const productos = await parseMaestroStock24Excel(selectedFile, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });
        const res = await uploadMaestroProductsStock24(productos, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });
        totalUploaded = res.totalUploaded;
        const totalProcesados = productos.length;
        const nuevosInsertados = res.nuevosInsertados ?? 0;
        const articulosActualizados = res.articulosActualizados ?? 0;

        setSuccessMessage(
          `Sincronización completada: De los ${totalProcesados.toLocaleString('es-AR')} artículos del Reporte 24, se incorporaron ${nuevosInsertados.toLocaleString('es-AR')} artículos nuevos (ej. Depto 81) y se actualizaron los costos de ${articulosActualizados.toLocaleString('es-AR')} artículos ya existentes.`
        );
      }

      fetchCatalogCount(); // Actualizar contador local
      onSuccess(totalUploaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error durante la sincronización del catálogo maestro';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* Header Fijo Estilo GDS */}
      <header className="sticky top-0 z-40 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
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

          {/* Botón de Vaciar Catálogo Maestro */}
          <div className="pt-2 border-t border-sky-500/10">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isProcessing || catalogCount === 0}
              className="w-full py-2.5 px-3 bg-red-950/40 hover:bg-red-900/60 disabled:opacity-50 text-red-300 hover:text-red-100 border border-red-500/40 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg active:scale-[0.98]"
            >
              <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
              <span>VACIAR CATÁLOGO MAESTRO</span>
            </button>
          </div>
        </div>

        {/* Selectores de Importación Dual: Reporte V8 + Reporte 24 Stock */}
        {!selectedFile && !successMessage && (
          <div className="space-y-3">
            {/* Opción 1: Reporte V8 (Principal con Unidades de Medida) */}
            <div 
              onClick={() => fileInputV8Ref.current?.click()}
              className="border-2 border-dashed border-emerald-500/50 hover:border-emerald-400 bg-[#061224]/90 hover:bg-[#0c244d] rounded-2xl p-5 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-2.5 shadow-2xl"
            >
              <input 
                ref={fileInputV8Ref}
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => handleFileSelect(e, 'V8')}
                className="hidden"
              />
              <div className="w-12 h-12 bg-[#0c244d] text-emerald-400 border border-emerald-500/40 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Upload className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                  1. Cargar Reporte V8 (Principal con Unidades de Medida)
                </p>
                <p className="text-[10px] text-emerald-300/80 mt-1 leading-snug">
                  Mapea SKU ID, Código SKU (UPC), Desc, Unidad de Medida (KG, EA, L, G), Depto ID, Costo Medio y Precio Retail. Reemplaza la base principal.
                </p>
              </div>
            </div>

            {/* Opción 2: Reporte 24 Stock (Complementario / Depto 81) */}
            <div 
              onClick={() => fileInputStock24Ref.current?.click()}
              className="border-2 border-dashed border-sky-500/50 hover:border-sky-400 bg-[#061224]/90 hover:bg-[#0c244d] rounded-2xl p-5 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-2.5 shadow-2xl"
            >
              <input 
                ref={fileInputStock24Ref}
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => handleFileSelect(e, 'STOCK24')}
                className="hidden"
              />
              <div className="w-12 h-12 bg-[#0c244d] text-sky-400 border border-sky-500/40 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Layers className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                  2. Cargar Reporte 24 Stock (Complementario / Depto 81)
                </p>
                <p className="text-[10px] text-sky-300/80 mt-1 leading-snug">
                  Ingesta complementaria: inserta únicamente los SKU no existentes (ej. Depto 81) sin sobrescribir las unidades de medida ya cargadas.
                </p>
              </div>
            </div>

            {/* Aviso informativo de comportamiento */}
            <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center space-x-2 text-[11px] text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>El Reporte V8 actualiza la base principal con unidades de medida; el Reporte 24 Stock agrega únicamente los artículos faltantes.</span>
            </div>
          </div>
        )}

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-2xl text-red-200 flex items-start justify-between space-x-3 text-xs sm:text-sm animate-fade-in shadow-xl transition-all">
            <div className="flex items-start space-x-3 min-w-0 flex-1">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
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
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 text-red-400 hover:text-white rounded-lg hover:bg-red-900/50 transition-colors shrink-0"
              title="Descartar aviso"
            >
              <X className="w-4 h-4" />
            </button>
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
          <div className="relative p-5 bg-emerald-950/90 border border-emerald-500/50 rounded-2xl text-emerald-200 text-center space-y-3.5 animate-fade-in shadow-2xl transition-all">
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="absolute right-3 top-3 p-1 text-emerald-400 hover:text-white rounded-lg hover:bg-emerald-900/50 transition-colors"
              title="Descartar aviso"
            >
              <X className="w-4 h-4" />
            </button>
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

        {/* Modal de Confirmación Explícita para Vaciar Catálogo */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#061224] border-2 border-red-500/50 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
              <div className="w-14 h-14 bg-red-950/80 border border-red-500/40 text-red-400 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <Trash2 className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <h3 className="font-['Chakra_Petch'] font-black text-lg text-white uppercase tracking-wider">
                  ¿Vaciar Catálogo Maestro?
                </h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  ¿Estás seguro de vaciar todos los artículos del catálogo maestro? Esta acción no se puede deshacer y eliminará todos los registros actuales de la base general SIM.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="py-3 px-4 bg-[#0c2847] hover:bg-[#163a75] text-slate-300 font-bold text-xs rounded-xl border border-sky-500/30 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleVaciarCatalogo}
                  className="py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-600/40 cursor-pointer"
                >
                  Sí, Vaciar
                </button>
              </div>
            </div>
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
      <BottomNavCapsule onBack={onBack} showScan={false} showHome={false} />

    </div>
  );
};
