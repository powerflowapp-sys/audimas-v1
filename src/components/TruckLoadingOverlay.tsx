import React from 'react';
import { Truck, Building2, Sparkles } from 'lucide-react';

interface TruckLoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  progressText?: string;
}

export const TruckLoadingOverlay: React.FC<TruckLoadingOverlayProps> = ({
  isVisible,
  title = "PROCESANDO ARCHIVO...",
  subtitle = "Validando artículos y sincronizando con la base de datos...",
  progressText
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#00081d]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white animate-fade-in font-sans select-none pointer-events-auto">
      
      {/* Estilos CSS para animaciones infinitas de carretera, balanceo del camión y barra shimmer */}
      <style>{`
        @keyframes roadMove {
          0% { transform: translateX(0); }
          100% { transform: translateX(-32px); }
        }
        @keyframes truckBounce {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-2.5px) rotate(-1deg); }
        }
        @keyframes truckTravel {
          0% { left: 8%; opacity: 0.85; }
          75% { left: 70%; opacity: 1; }
          90% { left: 74%; opacity: 0.6; }
          100% { left: 8%; opacity: 0.85; }
        }
        @keyframes headlightGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes shimmerMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-road-move {
          animation: roadMove 0.5s linear infinite;
        }
        .animate-truck-bounce {
          animation: truckBounce 0.35s ease-in-out infinite;
        }
        .animate-truck-travel {
          animation: truckTravel 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-headlight {
          animation: headlightGlow 1.2s ease-in-out infinite;
        }
        .animate-shimmer {
          animation: shimmerMove 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <div className="w-full max-w-xs flex flex-col items-center space-y-5">
        
        {/* CIRCUITO ANIMADO DE CARRETERA Y CAMIÓN */}
        <div className="w-full h-24 relative overflow-hidden bg-[#061833] border border-sky-500/40 rounded-2xl flex items-center shadow-2xl shadow-blue-950/90 px-3">
          
          {/* Luz / Resplandor ambiental de fondo */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-sky-500/20 to-emerald-500/10 pointer-events-none" />

          {/* Asfalto / Carretera Punteada Animada Infinita */}
          <div className="absolute inset-x-0 bottom-6 h-7 bg-[#020d21] border-y border-sky-500/30 flex items-center overflow-hidden">
            <div className="flex w-[200%] animate-road-move">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-4 h-1 bg-sky-400/80 rounded-full mx-2 shrink-0 shadow-sm shadow-sky-400" />
              ))}
            </div>
          </div>

          {/* Meta / Destino: Almacén CEDIS en el extremo derecho */}
          <div className="absolute right-3.5 bottom-6 z-10 flex flex-col items-center space-y-1">
            <div className="p-1.5 bg-[#0c2847] border border-emerald-400/50 rounded-xl text-emerald-400 shadow-md shadow-emerald-950">
              <Building2 className="w-5 h-5 animate-pulse" />
            </div>
            <span className="text-[9px] font-['Chakra_Petch'] font-bold text-emerald-300 uppercase tracking-widest">
              DESTINO
            </span>
          </div>

          {/* CAMIÓN EN RUTA AVANZANDO INFINITAMENTE DE FORMA FLUIDA */}
          <div className="absolute bottom-6 z-20 animate-truck-travel flex items-center">
            <div className="relative animate-truck-bounce">
              
              {/* Haz de Luz Delantero del Camión */}
              <div className="absolute top-1 -right-6 w-7 h-5 bg-gradient-to-r from-amber-300/90 via-amber-200/40 to-transparent rounded-r-full animate-headlight blur-[1px]" />
              
              {/* Ícono Principal del Camión */}
              <div className="p-2 bg-gradient-to-br from-sky-400 to-blue-600 text-white rounded-xl shadow-lg shadow-sky-500/40 border border-sky-300/40 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>

              {/* Sombra Dinámica del Camión en el Asfalto */}
              <div className="w-8 h-1.5 bg-sky-950/80 rounded-full mx-auto mt-0.5 blur-[1px]" />
            </div>
          </div>

          {/* Partículas de destellos brillantes en el camino */}
          <div className="absolute top-2 left-4 flex items-center space-x-1 text-sky-400/70">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[9px] font-mono tracking-widest uppercase">EN RUTA REALTIME</span>
          </div>
        </div>

        {/* TEXTOS Y ESTADO DINÁMICO */}
        <div className="text-center space-y-1.5 w-full">
          <h3 className="font-['Chakra_Petch'] font-black text-sm text-white uppercase tracking-widest">
            {title}
          </h3>
          <p className="text-xs text-sky-300/90 leading-relaxed font-medium">
            {progressText || subtitle}
          </p>
        </div>

        {/* BARRA DE PROGRESO DE CARGA INFINITA CON EFECTO SHIMMER / RAYO DE LUZ */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between text-xs font-mono font-bold text-sky-300 px-0.5">
            <span>Sincronizando con la base de datos...</span>
          </div>
          <div className="w-full max-w-xs h-3 bg-[#061833] border border-sky-500/30 rounded-full overflow-hidden relative shadow-inner p-0.5">
            <div className="w-full h-full relative overflow-hidden rounded-full bg-[#020b18]">
              <div className="absolute inset-y-0 w-3/4 bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400 animate-shimmer rounded-full shadow-lg shadow-sky-400/60" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
