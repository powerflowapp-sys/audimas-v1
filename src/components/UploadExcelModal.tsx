import React, { useState, useRef } from 'react';
import { 
  Truck, 
  Database, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet, 
  X, 
  RefreshCw,
  PackageCheck,
  Building2,
  Boxes,
  Layers
} from 'lucide-react';
import { 
  parseCamionManifiestoExcel, 
  uploadCamionManifiesto, 
  previewMaestroExcel,
  parseMaestroExcel,
  uploadMaestroProducts 
} from '../services/excelParsers';
import { CamionManifiestoPreview, MaestroPreview } from '../types';
import { supabase } from '../services/supabase';

interface UploadExcelModalProps {
  isOpen: boolean;
  initialTab?: 'NAE' | 'MAESTRO';
  onClose: () => void;
  onSuccess?: (type: 'NAE' | 'MAESTRO', payload?: { nae_id?: string; totalItems?: number }) => void;
}

export const UploadExcelModal: React.FC<UploadExcelModalProps> = ({
  isOpen,
  initialTab = 'NAE',
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'NAE' | 'MAESTRO'>(initialTab);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Previsualizaciones
  const [camionPreview, setCamionPreview] = useState<CamionManifiestoPreview | null>(null);
  const [maestroPreview, setMaestroPreview] = useState<MaestroPreview | null>(null);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);

  // Estados de carga y error
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCatalogCount = async () => {
    try {
      const { count, error } = await supabase
        .from('maestro_productos')
        .select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        setCatalogCount(count);
      }
    } catch (err) {
      console.error('Error fetching catalog count:', err);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchCatalogCount();
    }
  }, [isOpen, initialTab]);



  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setCamionPreview(null);
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

  const handleTabChange = (tab: 'NAE' | 'MAESTRO') => {
    setActiveTab(tab);
    resetState();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedFile(file);
    setIsProcessing(true);
    setProgressText('Analizando archivo Excel...');

    try {
      if (activeTab === 'NAE') {
        const preview = await parseCamionManifiestoExcel(file);
        setCamionPreview(preview);
      } else {
        const preview = await previewMaestroExcel(file);
        setMaestroPreview(preview);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el archivo Excel';
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
      if (activeTab === 'NAE' && camionPreview) {
        const res = await uploadCamionManifiesto(camionPreview, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });

        if (res.overwrittenFromCamionesPlus) {
          setSuccessMessage(`¡Camión NAE ${camionPreview.numero_nae} sincronizado desde Camiones+ y habilitado para auditoría con ${res.totalItems} ítems definitivos!`);
        } else {
          setSuccessMessage(`¡Camión NAE ${camionPreview.numero_nae} cargado exitosamente con ${res.totalItems} ítems!`);
        }
        if (onSuccess) {
          onSuccess('NAE', { nae_id: res.nae_id, totalItems: res.totalItems });
        }
      } else if (activeTab === 'MAESTRO') {
        setProgressText('Parseando catálogo completo...');
        const productos = await parseMaestroExcel(selectedFile);

        const res = await uploadMaestroProducts(productos, (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        });

        setSuccessMessage(`¡Catálogo maestro actualizado con ${res.totalUploaded} productos!`);
        if (onSuccess) {
          onSuccess('MAESTRO', { totalItems: res.totalUploaded });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error durante la sincronización';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/75 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] border border-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado del Modal */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/30 text-blue-400 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Importar Datos Excel</h2>
              <p className="text-xs text-slate-400">Procesamiento táctil directo a Supabase</p>
            </div>
          </div>
          <button 
            onClick={() => { resetState(); onClose(); }}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs de Selección */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleTabChange('NAE')}
            disabled={isProcessing}
            className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'NAE'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>📦 Camión NAE</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('MAESTRO')}
            disabled={isProcessing}
            className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'MAESTRO'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>🗃️ Catálogo Maestro</span>
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Tarjeta de Estado del Catálogo Actual (Solo en pestaña MAESTRO) */}
          {activeTab === 'MAESTRO' && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-['Chakra_Petch'] font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Database className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>📦 CATÁLOGO ACTIVO</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                  BASE GENERAL SIM
                </span>
              </div>

              <div className="flex items-baseline space-x-2 pt-1">
                <span className="font-['Chakra_Petch'] font-black text-2xl text-white tracking-tight">
                  {catalogCount !== null ? catalogCount.toLocaleString('es-AR') : '---'}
                </span>
                <span className="font-['Chakra_Petch'] font-extrabold text-xs text-sky-300 uppercase">
                  ARTÍCULOS
                </span>
              </div>

              <p className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800">
                Última actualización / Estado de la base general SIM
              </p>
            </div>
          )}

          {/* Instrucción según Tab */}
          {activeTab === 'NAE' && (
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start space-x-2">
              <span className="text-base">💡</span>
              <p>Carga el archivo manifiesto de camión CEDIS (ej: <code className="bg-slate-200 px-1 rounded">32 Agotado en transito *.xlsx</code>). Cabecera en fila 2.</p>
            </div>
          )}

          {/* Selector / Dropzone táctil */}
          {!selectedFile && !successMessage && (
            <div className="space-y-2">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 rounded-2xl p-6 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center"
              >
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                  <Upload className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-800 mb-1 uppercase tracking-wide">
                  Arrastrá y soltá tu archivo Excel acá o hacé clic para buscar
                </p>
                <p className="text-xs text-slate-500">
                  Formatos soportados: .xlsx, .xls
                </p>
              </div>

              {/* Mensaje de advertencia / aviso sutil de reemplazo total en pestaña MAESTRO */}
              {activeTab === 'MAESTRO' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2 text-[11px] text-amber-800 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Al importar un nuevo archivo, se reemplazará por completo el catálogo anterior.</span>
                </div>
              )}
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start justify-between space-x-3 text-xs sm:text-sm animate-fade-in transition-all">
              <div className="flex items-start space-x-3 min-w-0 flex-1">
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">Error en la lectura o carga</p>
                  <p className="mt-1">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={resetState}
                    className="mt-2 text-xs font-semibold underline hover:text-red-800 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Reintentar selección
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="p-1 text-red-400 hover:text-red-700 rounded-lg transition-colors shrink-0"
                title="Descartar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Mensaje de Éxito */}
          {successMessage && (
            <div className="relative p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-center space-y-3 animate-fade-in transition-all">
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="absolute right-3 top-3 p-1 text-emerald-500 hover:text-emerald-800 rounded-lg transition-colors"
                title="Descartar aviso"
              >
                <X className="w-4 h-4" />
              </button>
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div>
                <h3 className="font-bold text-base text-emerald-900">¡Sincronización Completada!</h3>
                <p className="text-xs text-emerald-700 mt-1">{successMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => { resetState(); onClose(); }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-colors"
              >
                Cerrar Ventana
              </button>
            </div>
          )}

          {/* PREVISUALIZACIÓN DE CAMIÓN NAE */}
          {activeTab === 'NAE' && camionPreview && !successMessage && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Previsualización Manifiesto</span>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full text-xs">
                  NAE: {camionPreview.numero_nae}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center space-x-2 shadow-2xs">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400 text-[10px]">Tienda Destino</p>
                    <p className="font-bold text-slate-800">{camionPreview.tienda_codigo} - {camionPreview.tienda_nombre}</p>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center space-x-2 shadow-2xs">
                  <Boxes className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400 text-[10px]">Total Bultos Esperados</p>
                    <p className="font-bold text-slate-800">{camionPreview.totalBultos.toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center space-x-2 shadow-2xs">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400 text-[10px]">Total SKUs</p>
                    <p className="font-bold text-slate-800">{camionPreview.totalSKUs.toLocaleString()} productos</p>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center space-x-2 shadow-2xs">
                  <PackageCheck className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400 text-[10px]">Total Unidades</p>
                    <p className="font-bold text-slate-800">{camionPreview.totalUnidades.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Badge destacado de Agotados en Tránsito */}
              {camionPreview.agotadosTransitoCount > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2 text-amber-800 text-xs font-bold shadow-2xs">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>🚨 {camionPreview.agotadosTransitoCount} productos marcados como AGOTADO EN TRÁNSITO</span>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Todos los ítems presentan stock disponible.</span>
                </div>
              )}
            </div>
          )}

          {/* PREVISUALIZACIÓN DE MAESTRO DE PRODUCTOS */}
          {activeTab === 'MAESTRO' && maestroPreview && !successMessage && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catálogo Maestro Detectado</span>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-xs">
                  {maestroPreview.totalRegistros.toLocaleString()} Productos
                </span>
              </div>

              {/* Muestra rápida de 5 registros */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-[11px] text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2">UPC</th>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maestroPreview.muestra.map((prod, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-blue-700 font-medium">{prod.upc}</td>
                        <td className="p-2 font-mono text-slate-600">{prod.sku}</td>
                        <td className="p-2 truncate max-w-[140px]">{prod.descripcion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BARRA DE PROGRESO DE CARGA */}
          {isProcessing && (
            <div className="space-y-2 py-2 animate-fade-in">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="truncate max-w-[220px]">{progressText || 'Procesando...'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer de Acciones */}
        {!successMessage && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => { resetState(); onClose(); }}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!selectedFile || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold shadow-md shadow-blue-600/20 flex items-center space-x-2 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Confirmar e Importar</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
