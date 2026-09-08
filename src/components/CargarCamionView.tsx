import React, { useState, useRef, useEffect } from 'react';
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
  ArrowLeft,
  Lock,
  Edit3,
  Search,
  DollarSign,
  Save,
  Copy,
  Check,
  Zap,
  X
} from 'lucide-react';
import { 
  parseCamionManifiestoExcel, 
  parseReporteAPExcel,
  parseAgotadosAPv2,
  uploadCamionManifiesto 
} from '../services/excelParsers';
import { eliminarCamionPorNumeroNae } from '../services/historyService';
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
  const [uploadMode, setUploadMode] = useState<'ap_v2' | 'dual'>('ap_v2');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedApFile, setSelectedApFile] = useState<File | null>(null);
  const [selectedApV2File, setSelectedApV2File] = useState<File | null>(null);
  const [camionPreview, setCamionPreview] = useState<CamionManifiestoPreview | null>(null);
  const [apSummary, setApSummary] = useState<{ fileName: string; matchedCount: number; montoTotal: number } | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdNaeId, setCreatedNaeId] = useState<string | null>(null);



  // Estado para el modal de resolución de duplicados NAE
  const [duplicateNaeInfo, setDuplicateNaeInfo] = useState<{ id: string; estado: string; numeroNae: string } | null>(null);
  const [isReplacing, setIsReplacing] = useState<boolean>(false);

  // Estado para el modal de asignación manual de costos
  const [isCostModalOpen, setIsCostModalOpen] = useState<boolean>(false);
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [costSearchQuery, setCostSearchQuery] = useState<string>('');
  const [onlyPendingFilter, setOnlyPendingFilter] = useState<boolean>(true);
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  // Cruce inteligente de costos
  const totalSkus = camionPreview?.items.length || 0;
  const skusConCosto = camionPreview?.items.filter(it => (Number(it.costo_unitario) || 0) > 0) || [];
  const skusSinCosto = camionPreview?.items.filter(it => !it.costo_unitario || Number(it.costo_unitario) <= 0) || [];

  const handleOpenCostModal = () => {
    if (!camionPreview) return;
    const initialMap: Record<string, string> = {};
    camionPreview.items.forEach(it => {
      initialMap[it.sku] = (it.costo_unitario && Number(it.costo_unitario) > 0) ? String(it.costo_unitario) : '';
    });
    setCostInputs(initialMap);
    setCostSearchQuery('');
    setOnlyPendingFilter(true);
    setIsCostModalOpen(true);
  };

  const handleSaveManualCosts = () => {
    if (!camionPreview) return;

    const updatedItems = camionPreview.items.map(item => {
      const entered = costInputs[item.sku];
      if (entered !== undefined && entered !== '') {
        const parsedCost = parseFloat(entered.replace(',', '.'));
        if (!isNaN(parsedCost) && parsedCost >= 0) {
          const costo_unitario = parsedCost;
          const costo_total = parsedCost * (item.unidades_esperadas || 0);
          return {
            ...item,
            costo_unitario,
            costo_total
          };
        }
      }
      return item;
    });

    const nuevoMontoTotal = updatedItems.reduce((acc, it) => acc + (it.costo_total || 0), 0);
    const totalValorizados = updatedItems.filter(it => (Number(it.costo_unitario) || 0) > 0).length;

    setCamionPreview({
      ...camionPreview,
      items: updatedItems,
      monto_total_esperado: nuevoMontoTotal,
      tiene_reporte_ap: totalValorizados > 0
    });

    setIsCostModalOpen(false);
  };

  const pendingSkuSet = React.useMemo(() => {
    if (!camionPreview) return new Set<string>();
    return new Set(camionPreview.items.filter(it => !it.costo_unitario || Number(it.costo_unitario) <= 0).map(it => it.sku));
  }, [camionPreview]);

  const filteredModalItems = React.useMemo(() => {
    if (!camionPreview) return [];
    return camionPreview.items.filter(item => {
      if (onlyPendingFilter && !pendingSkuSet.has(item.sku)) {
        return false;
      }
      if (costSearchQuery.trim()) {
        const q = costSearchQuery.toLowerCase().trim();
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchDesc = item.descripcion.toLowerCase().includes(q);
        if (!matchSku && !matchDesc) return false;
      }
      return true;
    });
  }, [camionPreview, pendingSkuSet, onlyPendingFilter, costSearchQuery]);

  const calculatedModalTotal = React.useMemo(() => {
    if (!camionPreview) return 0;
    return camionPreview.items.reduce((acc, item) => {
      const val = costInputs[item.sku];
      let unitCost = item.costo_unitario || 0;
      if (val !== undefined && val !== '') {
        const parsed = parseFloat(val.replace(',', '.'));
        if (!isNaN(parsed) && parsed >= 0) {
          unitCost = parsed;
        }
      }
      return acc + (unitCost * (item.unidades_esperadas || 0));
    }, 0);
  }, [camionPreview, costInputs]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const apFileInputRef = useRef<HTMLInputElement>(null);
  const apV2FileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setSelectedApFile(null);
    setSelectedApV2File(null);
    setCamionPreview(null);
    setApSummary(null);
    setProgressPercent(0);
    setProgressText('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedNaeId(null);
    setIsProcessing(false);
    setIsCostModalOpen(false);
    setDuplicateNaeInfo(null);
    setCostInputs({});
    setCostSearchQuery('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (apFileInputRef.current) apFileInputRef.current.value = '';
    if (apV2FileInputRef.current) apV2FileInputRef.current.value = '';
  };

  const processApV2File = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(true);
    setProgressText('Analizando reporte unificado AP v2...');

    try {
      const preview = await parseAgotadosAPv2(file);
      setCamionPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar el archivo AP v2';
      setErrorMessage(msg);
      setSelectedApV2File(null);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleApV2FileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedApV2File(file);
    processApV2File(file);
  };

  const processFiles = async (manifestFile: File | null, apFile: File | null) => {
    if (!manifestFile) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(true);
    setProgressText('Analizando manifiesto y reporte AP...');

    try {
      const preview = await parseCamionManifiestoExcel(manifestFile, apFile || undefined);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    processFiles(file, selectedApFile);
  };

  const handleApFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedApFile(file);

    try {
      const mapCosts = await parseReporteAPExcel(file);
      let count = 0;
      let sum = 0;
      mapCosts.forEach((val) => {
        count++;
        sum += val.costo_total || val.costo_unitario;
      });
      const skus = Math.round(count / 2) || count;
      setApSummary({
        fileName: file.name,
        matchedCount: skus,
        montoTotal: sum
      });
    } catch (err) {
      console.warn('Error al previsualizar AP:', err);
    }

    if (selectedFile) {
      processFiles(selectedFile, file);
    }
  };

  const handleConfirmImport = async (overwrite: boolean = false) => {
    if ((!selectedFile && !selectedApV2File) || !camionPreview) return;

    setIsProcessing(true);
    if (overwrite) {
      setIsReplacing(true);
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (overwrite && duplicateNaeInfo) {
        setProgressText(`Eliminando camión previo #${duplicateNaeInfo.numeroNae}...`);
        await eliminarCamionPorNumeroNae(duplicateNaeInfo.numeroNae);
      }

      const activeUser = (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
      const res = await uploadCamionManifiesto(
        camionPreview, 
        (percent, _cur, _tot, msg) => {
          setProgressPercent(percent);
          setProgressText(msg);
        },
        {
          overwrite: Boolean(overwrite && duplicateNaeInfo),
          overwriteNaeId: overwrite && duplicateNaeInfo ? duplicateNaeInfo.id : undefined,
          usuario_carga: activeUser
        }
      );

      setDuplicateNaeInfo(null);
      setCreatedNaeId(res.nae_id);
      if (res.overwrittenFromCamionesPlus) {
        setSuccessMessage(`¡Camión NAE ${camionPreview.numero_nae} precargado en Camiones+ fue sincronizado y habilitado como DISPONIBLE para escaneo en AudiMAS con ${res.totalItems} productos definitivos!`);
      } else {
        setSuccessMessage(`¡Camión NAE ${camionPreview.numero_nae} cargado exitosamente con ${res.totalItems} productos${camionPreview.tiene_reporte_ap ? ' y reporte AP valorizado' : ''}!`);
      }
      onSuccess(res.nae_id, res.totalItems);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('DUPLICADO_PENDIENTE:') || err?.existingNaeId) {
        const parts = msg.split(':');
        const existingId = err?.existingNaeId || parts[1];
        const existingEstado = err?.existingEstado || parts[2] || 'PENDIENTE';
        const numeroNae = parts[3] || camionPreview.numero_nae;
        setDuplicateNaeInfo({ id: existingId, estado: existingEstado, numeroNae });
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsProcessing(false);
      setIsReplacing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
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
              CARGA DUAL DE MANIFIESTO Y REPORTE AP
            </p>
          </div>
        </div>
      </header>

      {/* Cuerpo Principal */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {/* Selector de Modalidad de Carga */}
        {!successMessage && !camionPreview && (
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#061224]/90 border border-sky-500/30 rounded-2xl shadow-lg">
            <button
              type="button"
              onClick={() => {
                setUploadMode('ap_v2');
                resetState();
              }}
              className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs transition-all flex flex-col items-center justify-center space-y-0.5 ${
                uploadMode === 'ap_v2'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/40 border border-emerald-400/40 scale-[1.02]'
                  : 'text-sky-300 hover:text-white hover:bg-sky-950/40'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300/30" />
                <span>Carga Directa AP v2</span>
              </div>
              <span className="text-[10px] font-normal opacity-85">Un solo archivo unificado</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadMode('dual');
                resetState();
              }}
              className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs transition-all flex flex-col items-center justify-center space-y-0.5 ${
                uploadMode === 'dual'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-900/40 border border-sky-400/40 scale-[1.02]'
                  : 'text-sky-300 hover:text-white hover:bg-sky-950/40'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-sky-300" />
                <span>Carga Dual</span>
              </div>
              <span className="text-[10px] font-normal opacity-85">2 Archivos (Manifiesto + AP)</span>
            </button>
          </div>
        )}

        {/* Dropzones segun modalidad */}
        {!successMessage && !camionPreview && (
          uploadMode === 'ap_v2' ? (
            <div className="space-y-3">
              {/* Instrucción Sutil AP v2 */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-950/80 via-[#061224]/90 to-[#061224]/90 border border-emerald-500/30 rounded-2xl flex items-start space-x-3 text-xs text-emerald-200 shadow-xl">
                <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 fill-amber-400/20" />
                <div className="leading-relaxed">
                  <p className="font-bold text-white mb-0.5">Carga Directa AP v2 (Un solo archivo)</p>
                  <p className="text-emerald-300/80">Importa Manifiesto, Costos y Agotados en tránsito desde el reporte unificado AP v2.</p>
                </div>
              </div>

              {/* Dropzone Único AP v2 */}
              <div 
                onClick={() => apV2FileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-3 shadow-xl ${
                  selectedApV2File 
                    ? 'border-emerald-400/80 bg-emerald-950/30' 
                    : 'border-emerald-500/40 hover:border-emerald-400 bg-[#061224]/80 hover:bg-[#092b3a]'
                }`}
              >
                <input 
                  ref={apV2FileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleApV2FileSelect}
                  className="hidden"
                />
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-900/60 to-teal-900/60 text-emerald-300 border border-emerald-500/40 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <FileSpreadsheet className="w-7 h-7 text-emerald-300" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center space-x-2">
                    <p className="text-xs font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                      Carga Directa AP v2 (Un solo archivo)
                    </p>
                    <span className="px-2 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 rounded-full">
                      UNIFICADO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 max-w-xs mx-auto">
                    Importa Manifiesto, Costos y Agotados en tránsito desde el reporte unificado AP v2.
                  </p>
                  <p className="text-[11px] text-emerald-400 font-mono pt-1">
                    {selectedApV2File ? `✓ Archivo seleccionado: ${selectedApV2File.name}` : 'Toca para seleccionar archivo (.xlsx / .xls)'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Instrucción Sutil Carga Dual */}
              <div className="p-3.5 bg-[#061224]/90 border border-sky-500/30 rounded-2xl flex items-start space-x-3 text-xs text-sky-200 shadow-xl">
                <span className="text-base leading-none">💡</span>
                <div className="leading-relaxed">
                  <p className="font-bold text-white mb-0.5">Carga Dual de Archivos Excel</p>
                  <p className="text-sky-300/80">Adjunta el manifiesto operativo obligatorio y, opcionalmente, el archivo AP para habilitar la auditoría por monto ($) y mixta.</p>
                </div>
              </div>

              {/* Dropzone 1: Manifiesto Principal (Obligatorio) */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-2 shadow-xl ${
                  selectedFile 
                    ? 'border-emerald-500/60 bg-emerald-950/20' 
                    : 'border-sky-500/40 hover:border-sky-400 bg-[#061224]/80 hover:bg-[#0c244d]'
                }`}
              >
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-12 h-12 bg-[#0c244d] text-sky-300 border border-sky-500/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <Upload className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <p className="text-xs font-['Chakra_Petch'] font-black uppercase tracking-wider text-white">
                    1. Manifiesto y Stock (Obligatorio)
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {selectedFile ? `File: ${selectedFile.name}` : 'Toca para seleccionar Excel NAE'}
                  </p>
                </div>
              </div>

              {/* Dropzone 2: Reporte AP Valorizado (Opcional) */}
              <div 
                onClick={() => apFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all active:scale-[0.99] group flex flex-col items-center justify-center space-y-1.5 shadow-xl ${
                  selectedApFile 
                    ? 'border-purple-500/60 bg-purple-950/20' 
                    : 'border-purple-500/30 hover:border-purple-400/60 bg-[#061224]/60 hover:bg-[#0e1d38]'
                }`}
              >
                <input 
                  ref={apFileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleApFileSelect}
                  className="hidden"
                />
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-['Chakra_Petch'] font-bold uppercase text-purple-300">
                    2. Reporte AP (Costos y Precios - Opcional)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {selectedApFile ? `File AP: ${selectedApFile.name}` : 'Toca para adjuntar reporte AP con costos ($)'}
                </p>
              </div>

              {/* Tarjeta de Confirmación e Indicador Visual del Reporte AP (Estilo AdjuntarAPView.tsx) */}
              {selectedApFile && (
                <div className="p-4 bg-gradient-to-br from-purple-950/90 via-[#071938] to-[#020b18] border border-purple-500/40 rounded-2xl space-y-3 shadow-2xl animate-fade-in">
                  <div className="flex items-center space-x-2.5 pb-2 border-b border-purple-500/30">
                    <div className="p-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-['Chakra_Petch'] font-black text-xs text-emerald-300 uppercase tracking-wider truncate">
                        Reporte AP Reconocido
                      </p>
                      <p className="text-[11px] text-purple-200/90 font-mono truncate">
                        {selectedApFile.name}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#020b18]/80 p-3 rounded-xl border border-purple-500/20 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">SKUs Valorizados</span>
                      <p className="font-mono font-bold text-white text-sm">
                        {apSummary?.matchedCount || 0} <span className="text-[10px] text-slate-400 font-normal">SKUs</span>
                      </p>
                    </div>

                    <div className="bg-[#020b18]/80 p-3 rounded-xl border border-purple-500/20 space-y-1">
                      <span className="text-[10px] text-purple-300 uppercase font-mono block">Monto Total Detectado</span>
                      <p className="font-mono font-bold text-purple-300 text-sm">
                        ${(apSummary?.montoTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-purple-950/60 border border-purple-500/30 rounded-xl flex items-center space-x-2 text-[11px] text-purple-200 font-bold">
                    <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Modalidades Por Monto ($) y Mixta listas para habilitarse</span>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="p-4 bg-red-950/80 border border-red-500/40 rounded-2xl text-red-200 flex items-start justify-between space-x-3 text-xs sm:text-sm animate-fade-in shadow-xl transition-all">
            <div className="flex items-start space-x-3 min-w-0 flex-1">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
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
              <span className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-wider">RESUMEN DE CARGA</span>
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
                  <p className="font-mono font-bold text-white">{totalSkus.toLocaleString()} ítems</p>
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

            {/* Badge de Validación y Cruce Inteligente de Costos */}
            {skusSinCosto.length === 0 ? (
              <div className="p-3 bg-purple-950/80 border border-purple-500/40 rounded-xl flex items-center justify-between text-purple-200 text-xs font-bold shadow-lg">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>✨ Reporte AP Vinculado (100% SKUs valorizados)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-purple-300">
                    ${(camionPreview.monto_total_esperado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenCostModal}
                    title="Ver o editar costos"
                    className="p-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded-lg transition-colors border border-purple-500/30"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#1e1503] border border-amber-500/50 rounded-xl space-y-2 text-xs font-bold shadow-lg">
                <div className="flex items-center justify-between text-amber-200">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>⚠️ Reporte AP: {skusConCosto.length} / {totalSkus} SKUs valorizados ({skusSinCosto.length} pendientes de costo)</span>
                  </div>
                  {camionPreview.monto_total_esperado ? (
                    <span className="font-mono text-amber-300">
                      ${camionPreview.monto_total_esperado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleOpenCostModal}
                  className="w-full py-2 px-3 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all active:scale-[0.98] shadow"
                >
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>📝 Completar / Ver SKUs sin costo</span>
                </button>
              </div>
            )}

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
                  Cambiar Files
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImport(false)}
                  disabled={!selectedFile && !selectedApV2File}
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

      {/* Vista Completa de Asignación Manual de Costos (Full Screen Centrado Institucional) */}
      {isCostModalOpen && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] h-screen max-h-screen overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden no-scrollbar text-white flex flex-col animate-fade-in select-none">
          
          {/* Cabecera Fija Superior */}
          <header className="sticky top-0 z-20 bg-[#000d26]/95 backdrop-blur-md border-b border-sky-500/30 px-4 py-3 shadow-xl">
            <div className="max-w-md mx-auto w-full flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCostModalOpen(false)}
                  className="p-2 bg-[#0c244d] hover:bg-[#163a75] text-sky-300 rounded-xl border border-sky-500/30 transition-colors active:scale-95"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="font-['Chakra_Petch'] font-black text-sm sm:text-base text-white uppercase tracking-wider leading-tight">
                    Asignación Manual de Costos
                  </h2>
                  <p className="text-[11px] text-amber-400 font-mono tracking-wide">
                    {skusSinCosto.length} SKUs PENDIENTES DE COSTO UNITARIO ($)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCostModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Barra de Búsqueda y Filtro de Estado */}
          <div className="p-3 bg-[#030d1c]/90 backdrop-blur-md border-b border-sky-500/20 shrink-0">
            <div className="max-w-md mx-auto w-full flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por SKU o descripción..."
                  value={costSearchQuery}
                  onChange={(e) => setCostSearchQuery(e.target.value)}
                  className="w-full bg-[#00122e] border border-cyan-500/30 focus:border-cyan-400 rounded-xl pl-9 pr-3 py-2 text-xs text-cyan-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-medium"
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyPendingFilter(!onlyPendingFilter)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 active:scale-95 ${
                  onlyPendingFilter
                    ? 'bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-md'
                    : 'bg-[#0c244d] text-sky-200 border-sky-500/30'
                }`}
              >
                {onlyPendingFilter ? `Pendientes (${skusSinCosto.length})` : `Todos (${totalSkus})`}
              </button>
            </div>
          </div>

          {/* Cuerpo con Scroll Vertical Fluido y Tarjetas de Productos */}
          <main className="flex-1 p-4 pb-36">
            <div className="max-w-md mx-auto w-full space-y-3">
              {filteredModalItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                  <p className="text-base">🔍</p>
                  <p className="font-semibold text-slate-300">No se encontraron SKUs</p>
                  <p className="text-[11px] text-slate-500">Intenta cambiando el filtro de búsqueda o alternando la vista entre Pendientes y Todos.</p>
                </div>
              ) : (
                filteredModalItems.map((item) => {
                  const val = costInputs[item.sku] ?? '';
                  const numVal = parseFloat(val.replace(',', '.')) || 0;
                  const totalItemCost = numVal * item.unidades_esperadas;

                  return (
                    <div key={item.sku} className="p-3.5 bg-[#0a1931]/80 backdrop-blur-md border border-blue-500/20 rounded-xl space-y-2.5 shadow-lg hover:border-cyan-400/50 transition-all">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-bold text-cyan-300 text-[11px] px-2 py-0.5 bg-[#00122e] border border-cyan-500/40 rounded-md">
                              SKU: {item.sku}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.sku);
                                setCopiedSku(item.sku);
                                setTimeout(() => setCopiedSku(null), 2000);
                              }}
                              className="p-1 bg-[#00122e] hover:bg-[#0c244d] active:bg-cyan-900/60 text-cyan-400 hover:text-cyan-200 rounded-md border border-cyan-500/40 transition-all text-[10px] flex items-center space-x-1 cursor-pointer"
                              title="Copiar SKU al portapapeles"
                            >
                              {copiedSku === item.sku ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-[9px] text-emerald-400 font-bold">Copiado</span>
                                </>
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {item.es_agotado_transito && (
                            <span className="text-[10px] bg-amber-950/90 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold">
                              Agotado en Tránsito
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-white leading-tight truncate">
                          {item.descripcion}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-sky-500/15">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-mono block">Unid. Esperadas</span>
                          <span className="text-xs font-mono font-bold text-sky-200">{item.unidades_esperadas.toLocaleString()} u.</span>
                        </div>

                        <div className="w-36 text-right space-y-1">
                          <label className="text-[10px] text-cyan-400 font-mono block font-bold">Costo Unit. ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={val}
                            onChange={(e) => {
                              const value = e.target.value;
                              setCostInputs(prev => ({ ...prev, [item.sku]: value }));
                            }}
                            className="w-full bg-[#00122e] border border-cyan-500/40 focus:border-cyan-400 text-cyan-300 focus:ring-1 focus:ring-cyan-400 rounded-lg px-2.5 py-1 text-xs text-right font-mono font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-inner placeholder-cyan-500/40"
                          />
                          {numVal > 0 && (
                            <p className="text-[10px] text-emerald-400 font-mono font-bold truncate">
                              Subtot: ${totalItemCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>

          {/* Barra Inferior Fija Centrada */}
          <footer className="p-4 bg-[#000d26]/95 backdrop-blur-md border-t border-sky-500/30 sticky bottom-0 z-20 shadow-2xl">
            <div className="max-w-md mx-auto w-full space-y-3">
              <div className="flex items-center justify-between text-xs font-mono px-1">
                <span className="text-slate-300 font-semibold">Total Recalculado:</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  ${calculatedModalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <button
                type="button"
                onClick={handleSaveManualCosts}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
              >
                <Save className="w-5 h-5" />
                <span>Guardar Costos</span>
              </button>
            </div>
          </footer>

        </div>
      )}

      {/* Modal / Alerta de Camión NAE Duplicado */}
      {duplicateNaeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#061833] border border-sky-500/40 rounded-2xl p-6 shadow-2xl max-w-md w-full text-white space-y-5">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-['Chakra_Petch'] font-black text-base text-amber-300 uppercase tracking-wider">
                  Camión NAE #{duplicateNaeInfo.numeroNae} Ya Existe
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Estado actual: <span className="font-bold text-amber-400">{duplicateNaeInfo.estado}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#020b18] p-3.5 rounded-xl border border-slate-800">
              El número NAE <strong className="text-white">#{duplicateNaeInfo.numeroNae}</strong> ya se encuentra registrado en el sistema. Selecciona la acción a realizar:
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={isReplacing || isProcessing}
                onClick={() => handleConfirmImport(true)}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isReplacing ? 'animate-spin' : ''}`} />
                <span>{isReplacing ? 'Eliminando y Reemplazando...' : 'Reemplazar Carga (Eliminar Previo)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetId = duplicateNaeInfo.id;
                  setDuplicateNaeInfo(null);
                  onSuccess(targetId, 0);
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>Ir a Auditoría del Camión</span>
              </button>

              <button
                type="button"
                onClick={() => setDuplicateNaeInfo(null)}
                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
