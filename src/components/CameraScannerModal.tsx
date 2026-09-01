import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, AlertCircle } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerContainerId = 'html5-qrcode-reader';
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);

    const timer = setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
          ],
          verbose: false
        });

        html5QrcodeRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: { ideal: "environment" } },
          {
            fps: 15,
            qrbox: { width: 260, height: 160 },
            videoConstraints: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          (decodedText) => {
            onScan(decodedText.trim());
            onClose();
          },
          () => {
            // Ignorar errores por frame no reconocido
          }
        );
      } catch (err) {
        console.error('Error al iniciar cámara trasera HD:', err);
        setErrorMsg('No se pudo acceder a la cámara trasera del dispositivo.');
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current
          .stop()
          .then(() => {
            html5QrcodeRef.current?.clear();
          })
          .catch((e) => console.warn('Error deteniendo cámara:', e));
      }
    };
  }, [isOpen, onScan, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 flex items-center justify-between border-b border-slate-700/60">
          <div className="flex items-center space-x-2 text-white">
            <Camera className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-sm">Cámara Trasera (HD)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
          {errorMsg ? (
            <div className="text-center text-red-400 space-y-3 p-4">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
              <p className="text-xs font-semibold">{errorMsg}</p>
              <p className="text-[11px] text-slate-400">Verifica los permisos de la cámara en el navegador.</p>
            </div>
          ) : (
            <div className="w-full rounded-2xl overflow-hidden border border-slate-700/50 bg-black">
              <div id={scannerContainerId} className="w-full text-white" />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3 text-center">
            Apunta el código de barras (EAN-13, UPC, Code-128) al recuadro.
          </p>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Cerrar Escáner
          </button>
        </div>
      </div>
    </div>
  );
};
