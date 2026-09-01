import React, { useState } from 'react';
import { 
  X, 
  ArrowLeft, 
  Send, 
  QrCode, 
  Copy, 
  Check, 
  Mail, 
  MessageCircle, 
  Share2,
  ChevronRight
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ShareViewMode = 'MAIN' | 'SEND_LINK' | 'SHOW_QR';

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  const [viewMode, setViewMode] = useState<ShareViewMode>('MAIN');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const appUrl = window.location.origin || window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    const text = `¡Hola! Te comparto el acceso a la aplicación de auditoría AudiMAS: ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = 'Acceso a aplicación AudiMAS';
    const body = `Hola,\n\nTe comparto el enlace directo para acceder a la aplicación de auditoría de camiones AudiMAS:\n${appUrl}\n\n¡Saludos!`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleClose = () => {
    setViewMode('MAIN');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00081d]/85 backdrop-blur-md p-4 animate-fade-in font-sans select-none">
      <div className="w-full max-w-[360px] bg-[#040e21]/95 border border-sky-500/30 rounded-3xl py-7 px-5 shadow-2xl shadow-blue-950/90 text-white relative animate-scale-up backdrop-blur-md">
        
        {/* VISTA 1: PRINCIPAL */}
        {viewMode === 'MAIN' && (
          <div className="space-y-4">
            
            {/* Encabezado del Modal */}
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <Share2 className="w-5 h-5 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white leading-tight truncate">
                    Compartir aplicación
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Invitá a un compañero a auditar
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-2 bg-[#0c2847]/60 hover:bg-[#163a75] active:bg-[#163a75] rounded-xl border border-sky-500/30 text-slate-300 transition-colors cursor-pointer shrink-0"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tarjetas de Opciones de Compartir */}
            <div className="space-y-3 pt-1">
              
              {/* Tarjeta 1: Enviar link */}
              <div
                onClick={() => setViewMode('SEND_LINK')}
                className="bg-[#061833]/80 hover:bg-[#0c2b5c]/90 border border-sky-500/30 hover:border-sky-400/60 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all shadow-lg text-left w-full group"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-cyan-400 to-sky-500 shadow-md shadow-cyan-500/30 shrink-0">
                    <Send className="w-6 h-6 text-[#020b18] fill-current" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors truncate">
                      Enviar link
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      WhatsApp, mail, o lo que uses
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0 ml-2" />
              </div>

              {/* Tarjeta 2: Mostrar QR */}
              <div
                onClick={() => setViewMode('SHOW_QR')}
                className="bg-[#061833]/80 hover:bg-[#0c2b5c]/90 border border-sky-500/30 hover:border-sky-400/60 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all shadow-lg text-left w-full group"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-sky-300 via-indigo-300 to-pink-400 shadow-md shadow-purple-500/30 shrink-0">
                    <QrCode className="w-6 h-6 text-[#020b18]" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors truncate">
                      Mostrar QR
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      Para escanear con el celular
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0 ml-2" />
              </div>

            </div>
          </div>
        )}

        {/* VISTA 2: ENVIAR LINK */}
        {viewMode === 'SEND_LINK' && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5">
              <button
                type="button"
                onClick={() => setViewMode('MAIN')}
                className="p-1.5 text-sky-300 hover:text-white rounded-lg hover:bg-sky-500/10 transition-colors flex items-center space-x-1 text-xs font-bold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>
              <h4 className="font-['Chakra_Petch'] font-bold text-xs text-sky-300 uppercase tracking-wider">
                Enviar enlace
              </h4>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Display de URL con botón de copiar */}
            <div className="p-3 bg-[#020b18] border border-sky-500/30 rounded-xl flex items-center justify-between space-x-2">
              <span className="text-xs font-mono text-slate-300 truncate text-left flex-1">
                {appUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] rounded-lg flex items-center space-x-1 shrink-0 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <div className="space-y-2 pt-2">
              {/* Opción WhatsApp */}
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Compartir por WhatsApp</span>
              </button>

              {/* Opción Email */}
              <button
                type="button"
                onClick={handleEmailShare}
                className="w-full py-2.5 px-4 bg-[#081f3d] hover:bg-[#0e2c56] border border-sky-400/30 text-sky-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4 text-sky-400" />
                <span>Enviar por Email</span>
              </button>
            </div>
          </div>
        )}

        {/* VISTA 3: MOSTRAR QR (ALINEACIÓN VERTICAL ESBELTA Y PROPORCIONADA) */}
        {viewMode === 'SHOW_QR' && (
          <div className="space-y-3 text-center">
            
            {/* Cabecera de Navegación Limpia (Atrás + Cerrar) */}
            <div className="flex items-center justify-between pb-1">
              <button
                type="button"
                onClick={() => setViewMode('MAIN')}
                className="p-2.5 bg-[#0c2447]/60 hover:bg-[#163a75] text-slate-300 rounded-xl border border-sky-500/20 transition-colors cursor-pointer"
                title="Volver"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="p-2.5 bg-[#0c2447]/60 hover:bg-[#163a75] text-slate-300 rounded-xl border border-sky-500/20 transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Título Central Grande en 2 Líneas (Estilo Tipografía Alta/Condensada) */}
            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-3xl leading-none uppercase tracking-tight flex flex-col items-center text-center">
                <span>
                  ESCANEÁ <span className="text-sky-400">Y</span>
                </span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-sky-200">
                  ACCEDÉ!
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-2 mb-3">
                Apuntá la cámara del celular al código
              </p>
            </div>

            {/* Enmarcado del Código QR y Efecto Scanner */}
            <div className="relative w-48 h-48 mx-auto my-3 flex items-center justify-center">
              {/* Halo/degradado difuso suave de fondo */}
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 via-purple-500/15 to-transparent blur-xl rounded-full" />

              {/* Marcos de Enfoque en Esquinas (Cian neón y Violeta) */}
              <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg pointer-events-none z-20" />
              <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg pointer-events-none z-20" />
              <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-purple-400 rounded-bl-lg pointer-events-none z-20" />
              <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-purple-400 rounded-br-lg pointer-events-none z-20" />

              {/* Tarjeta Blanca del QR */}
              <div className="rounded-3xl p-3.5 bg-white shadow-2xl w-full h-full flex items-center justify-center relative z-10">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(appUrl)}`}
                  alt="Código QR de Acceso"
                  className="w-full h-full object-contain rounded-2xl"
                />
              </div>
            </div>

            {/* Instrucciones en 2 Filas (1 y 2 arriba, 3 abajo) */}
            <div className="my-4 space-y-1.5 text-[11px] text-slate-300 font-medium">
              {/* Fila Superior (Pasos 1 y 2) */}
              <div className="flex items-center justify-center space-x-3">
                <div className="flex items-center space-x-1">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>Escaneá el QR</span>
                </div>

                <span className="text-slate-600 font-bold">•</span>

                <div className="flex items-center space-x-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>Carga tu usuario</span>
                </div>
              </div>

              {/* Fila Inferior (Paso 3) */}
              <div className="flex items-center justify-center space-x-1 text-[11px] text-slate-300 pt-0.5">
                <span className="w-5 h-5 rounded-full bg-fuchsia-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                  3
                </span>
                <span>¡Listo! A usar la app</span>
              </div>
            </div>

            {/* Botón Inferior Alargado tipo Píldora con Enlace */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full bg-[#061833] hover:bg-[#0c2b5c] border border-sky-500/30 rounded-full py-3 px-5 flex items-center justify-between text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer mt-4"
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <Send className="w-4 h-4 text-cyan-400 fill-current shrink-0" />
                <span className="truncate text-white font-bold text-xs">{appUrl}</span>
              </div>
              <span className="text-[10px] font-sans font-bold uppercase text-cyan-400 shrink-0 ml-2">
                {copied ? '¡Copiado!' : 'Copiar'}
              </span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
