import React, { useState } from 'react';
import { X, DollarSign, Upload, FileSpreadsheet, RefreshCw, CheckCircle2 } from 'lucide-react';
import { adjuntarReporteAPACamion } from '../services/excelParsers';
import { CamionNAE } from '../types';

interface ModalAdjuntarAPProps {
  camion: CamionNAE;
  onClose: () => void;
  onSuccess: () => void;
}

export const ModalAdjuntarAP: React.FC<ModalAdjuntarAPProps> = ({
  camion,
  onClose,
  onSuccess
}) => {
  const [apFile, setApFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setApFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apFile) {
      setErrorMsg('Por favor selecciona el archivo de Reporte AP (.xlsx)');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await adjuntarReporteAPACamion(camion.id, apFile);
      alert(`Reporte AP adjuntado exitosamente. Se actualizaron los costos de ${res.matchedCount} SKUs. Monto total cargado: $${res.montoTotalEsperado.toLocaleString('es-AR')}`);
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar archivo AP');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-gradient-to-br from-[#061224] via-[#001040] to-[#00081d] border border-purple-500/40 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-scale-up text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-600/30 border border-purple-400/40 rounded-xl text-purple-300">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-sm text-white uppercase tracking-wider">
                Adjuntar Reporte AP (Costos)
              </h3>
              <p className="text-[11px] text-purple-300/80 font-mono">
                NAE #{camion.numero_nae} • {camion.tienda_nombre}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-sky-200/90 leading-relaxed bg-[#0c244d]/60 p-3 rounded-xl border border-sky-500/20">
            Sube el reporte valorizado AP (.xlsx) para asociar costos medios por SKU y habilitar las modalidades <b>Por Monto ($)</b> y <b>Mixta</b>.
          </p>

          <div className="relative border-2 border-dashed border-purple-500/40 hover:border-purple-400 bg-[#020b18]/80 rounded-2xl p-5 text-center transition-all cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-purple-400" />
              {apFile ? (
                <div className="flex items-center space-x-1.5 text-emerald-400 font-mono text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{apFile.name}</span>
                </div>
              ) : (
                <>
                  <span className="text-xs font-bold text-purple-200">Seleccionar Reporte AP (.xlsx)</span>
                  <span className="text-[10px] text-slate-400">Haz clic o arrastra tu archivo aquí</span>
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-500/40 text-red-300 text-xs rounded-xl font-bold flex items-center justify-between space-x-2">
              <span>⚠️ {errorMsg}</span>
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

          {/* Actions */}
          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-[#0c244d] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!apFile || isProcessing}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Cargar AP</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
