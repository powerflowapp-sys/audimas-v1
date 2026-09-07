import React, { useState } from 'react';
import { Camera, CheckCircle, AlertTriangle, X, Upload, RefreshCw } from 'lucide-react';
import { uploadFotoDesconocido } from '../utils/imageCompressor';

interface ModalRegistroProductoDesconocidoProps {
  upc: string;
  naeId: string;
  onConfirm: (data: {
    upc: string;
    cantidad: number;
    fotoUpcUrl: string;
    fotoFrenteUrl: string;
  }) => void;
  onCancel: () => void;
}

export const ModalRegistroProductoDesconocido: React.FC<ModalRegistroProductoDesconocidoProps> = ({
  upc,
  naeId,
  onConfirm,
  onCancel
}) => {
  const [cantidad, setCantidad] = useState<number>(1);

  const [fotoUpcFile, setFotoUpcFile] = useState<File | null>(null);
  const [fotoUpcPreview, setFotoUpcPreview] = useState<string | null>(null);

  const [fotoFrenteFile, setFotoFrenteFile] = useState<File | null>(null);
  const [fotoFrentePreview, setFotoFrentePreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectFotoUpc = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFotoUpcFile(file);
      const url = URL.createObjectURL(file);
      setFotoUpcPreview(url);
    }
  };

  const handleSelectFotoFrente = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFotoFrenteFile(file);
      const url = URL.createObjectURL(file);
      setFotoFrentePreview(url);
    }
  };

  const isFormValid = fotoUpcFile !== null && fotoFrenteFile !== null && cantidad >= 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !fotoUpcFile || !fotoFrenteFile) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Subir ambas fotos comprimidas en paralelo
      const [urlUpc, urlFrente] = await Promise.all([
        uploadFotoDesconocido(fotoUpcFile, naeId, upc, 'upc'),
        uploadFotoDesconocido(fotoFrenteFile, naeId, upc, 'frente')
      ]);

      if (!urlUpc || !urlFrente) {
        throw new Error('Error al procesar y subir una o ambas fotos.');
      }

      onConfirm({
        upc,
        cantidad,
        fotoUpcUrl: urlUpc,
        fotoFrenteUrl: urlFrente
      });
    } catch (err: any) {
      console.error('Error guardando producto desconocido:', err);
      setErrorMsg(err.message || 'Error al subir las imágenes. Intentá nuevamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Producto Sin Catalogar</h3>
              <p className="text-xs text-amber-400 font-medium">Registro con Evidencia Obligatoria</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Info UPC & Banner */}
          <div className="bg-slate-850 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Código de Barras</span>
              <p className="text-lg font-mono font-bold text-amber-400">{upc}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-md border border-amber-500/30">
              Sobrante No Facturado
            </span>
          </div>

          <div className="text-xs text-slate-300 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
            ⚠️ Este código no figura en la factura ni en la base maestra. Para habilitar la confirmación, debés capturar obligatoriamente las <strong>2 fotos de evidencia</strong>.
          </div>

          {/* Captura de Fotos */}
          <div className="grid grid-cols-2 gap-3">
            {/* Foto 1: UPC / Etiqueta */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>1. Foto UPC / Etiqueta</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative aspect-square rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 overflow-hidden flex flex-col items-center justify-center p-2 group hover:border-amber-500/50 transition-colors">
                {fotoUpcPreview ? (
                  <>
                    <img
                      src={fotoUpcPreview}
                      alt="UPC Etiqueta"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-xs text-slate-200 cursor-pointer">
                      <RefreshCw className="w-5 h-5 text-amber-400" />
                      <span>Cambiar foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleSelectFotoUpc}
                        className="hidden"
                        disabled={isSubmitting}
                      />
                    </label>
                    <div className="absolute top-2 right-2 p-1 bg-emerald-500 text-slate-950 rounded-full shadow-md">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer text-slate-400 hover:text-amber-400 transition-colors">
                    <div className="p-3 bg-slate-800 rounded-full group-hover:bg-amber-500/20 text-amber-400">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-center">Capturar Foto UPC</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleSelectFotoUpc}
                      className="hidden"
                      disabled={isSubmitting}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Foto 2: Frente del producto */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>2. Foto Frente Producto</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative aspect-square rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 overflow-hidden flex flex-col items-center justify-center p-2 group hover:border-amber-500/50 transition-colors">
                {fotoFrentePreview ? (
                  <>
                    <img
                      src={fotoFrentePreview}
                      alt="Frente Producto"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-xs text-slate-200 cursor-pointer">
                      <RefreshCw className="w-5 h-5 text-amber-400" />
                      <span>Cambiar foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleSelectFotoFrente}
                        className="hidden"
                        disabled={isSubmitting}
                      />
                    </label>
                    <div className="absolute top-2 right-2 p-1 bg-emerald-500 text-slate-950 rounded-full shadow-md">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer text-slate-400 hover:text-amber-400 transition-colors">
                    <div className="p-3 bg-slate-800 rounded-full group-hover:bg-amber-500/20 text-amber-400">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-center">Capturar Frente</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleSelectFotoFrente}
                      className="hidden"
                      disabled={isSubmitting}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Seleccionar Cantidad */}
          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-sm font-semibold text-slate-200">Cantidad Auditada</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCantidad((prev) => Math.max(1, prev - 1))}
                disabled={isSubmitting || cantidad <= 1}
                className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 font-bold disabled:opacity-40 transition-colors"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center font-mono font-bold text-lg bg-slate-900 border border-slate-700 text-amber-400 rounded-lg py-1 focus:outline-none focus:border-amber-500"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setCantidad((prev) => prev + 1)}
                disabled={isSubmitting}
                className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 font-bold transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="px-5 py-2.5 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Subiendo Fotos...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirmar y Guardar Sobrante</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
