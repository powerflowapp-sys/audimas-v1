import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BottomNavCapsuleProps {
  onBack?: () => void;
  onHome?: () => void;
  showBack?: boolean;
  showHome?: boolean;
  className?: string;
}

export const BottomNavCapsule: React.FC<BottomNavCapsuleProps> = ({
  onBack,
  onHome,
  showBack = true,
  showHome = true,
  className
}) => {
  if (!showBack && !showHome) return null;

  const defaultClasses = "fixed bottom-4 inset-x-0 mx-auto w-fit z-50 pointer-events-auto bg-[#061833]/95 backdrop-blur-md border border-sky-500/30 rounded-full px-4 py-2 flex items-center space-x-3.5 shadow-2xl animate-fade-in font-sans select-none";

  return (
    <div className={className || defaultClasses}>
      
      {/* Botón Volver Atrás (w-12 h-12 / 48px) */}
      {showBack && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-12 h-12 rounded-full bg-[#0c2847] hover:bg-[#163a75] active:scale-95 border border-sky-400/30 flex items-center justify-center transition-all cursor-pointer shadow-md"
          title="Volver Atrás"
        >
          <ArrowLeft className="w-5 h-5 text-sky-400" />
        </button>
      )}

      {/* Botón Menú Principal / Home con SVG Clásico Sólido (w-12 h-12 / 48px) */}
      {showHome && onHome && (
        <button
          type="button"
          onClick={onHome}
          className="w-12 h-12 rounded-full bg-[#0c2847] hover:bg-[#163a75] active:scale-95 border border-sky-400/30 flex items-center justify-center transition-all cursor-pointer shadow-md"
          title="Ir al Inicio / Dashboard"
        >
          <svg 
            className="w-6 h-6 fill-sky-400 text-sky-400" 
            viewBox="0 0 24 24"
          >
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </button>
      )}

    </div>
  );
};
