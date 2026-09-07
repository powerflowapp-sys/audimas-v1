import React, { useState, useEffect } from 'react';
import { AlertTriangle, Search, Check, X, ShieldAlert, ArrowRight, Scan } from 'lucide-react';
import { supabase } from '../services/supabase';
import { matchBarcode, sanitizeBarcode } from '../utils/barcodeUtils';
import { AuditoriaItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  naeId: string;
  scannedBarcode: string;
  itemsInTruck: AuditoriaItem[];
  onFoundInCatalog: (foundItemOrProduct: any, verifiedUpc: string) => void;
  onNotFoundInCatalog: (verifiedUpc: string) => void;
}

export const ModalValidacionUPC: React.FC<Props> = ({
  isOpen,
  onClose,
  naeId,
  scannedBarcode,
  itemsInTruck,
  onFoundInCatalog,
  onNotFoundInCatalog
}) => {
  const [typedUpc, setTypedUpc] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedUpc(scannedBarcode || '');
      setVerifyMessage(null);
    }
  }, [isOpen, scannedBarcode]);

  if (!isOpen) return null;

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUpc = sanitizeBarcode(typedUpc);
    if (!cleanUpc) {
      setVerifyMessage('Por favor ingresá un código de barras válido.');
      return;
    }

    setIsVerifying(true);
    setVerifyMessage(null);

    try {
      // 1. Buscar en los ítems de auditoría del camión actual
      const itemEnCamion = itemsInTruck.find(
        it => matchBarcode(cleanUpc, it.upc) || matchBarcode(cleanUpc, it.sku)
      );

      if (itemEnCamion) {
        setIsVerifying(false);
        onFoundInCatalog(itemEnCamion, cleanUpc);
        return;
      }

      // 2. Buscar en maestro_productos V8 de Supabase
      const { data: productoMaestro } = await supabase
        .from('maestro_productos')
        .select('*')
        .or(`upc.eq.${cleanUpc},sku.eq.${cleanUpc}`)
        .maybeSingle();

      if (productoMaestro) {
        setIsVerifying(false);
        onFoundInCatalog(productoMaestro, cleanUpc);
        return;
      }

      // 3. NO hallado en ningún catálogo -> Proceder al registro de desconocido con 2 fotos
      setIsVerifying(false);
      onNotFoundInCatalog(cleanUpc);
    } catch (err) {
      console.warn('Error verificando UPC en catálogo:', err);
      setIsVerifying(false);
      onNotFoundInCatalog(cleanUpc);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-amber-200">
        
        {/* Header de Advertencia */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/30 text-amber-100 rounded-2xl border border-amber-400/30">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Doble Validación de UPC</h3>
              <p className="text-xs text-amber-100">Paso 1: Verificación Manual</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-amber-200 hover:text-white hover:bg-amber-800/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleVerify} className="p-6 space-y-5">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Código no encontrado en catálogo</span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              El código escaneado <strong className="font-mono bg-amber-200/80 px-1.5 py-0.5 rounded text-amber-950 font-bold">{scannedBarcode || 'desconocido'}</strong> no figura en la factura NAE ni en la base maestra V8.
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Verificá o re-tipeá el código de barras manualmente para descartar errores de lectura del escáner antes de clasificarlo como sin catalogar.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Scan className="w-4 h-4 text-slate-400" /> Confirmar o Ingresar UPC Manualmente
            </label>
            <input
              type="text"
              value={typedUpc}
              onChange={(e) => setTypedUpc(e.target.value)}
              placeholder="Ingresá o escaneá el UPC aquí..."
              autoFocus
              className="w-full px-4 py-3 rounded-2xl border-2 border-amber-300 text-base font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:font-sans placeholder:text-slate-400 placeholder:text-xs uppercase"
            />
          </div>

          {verifyMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
              {verifyMessage}
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-2xl shadow-lg shadow-amber-600/25 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isVerifying ? (
                <span>Verificando...</span>
              ) : (
                <>
                  <span>Verificar Código</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
