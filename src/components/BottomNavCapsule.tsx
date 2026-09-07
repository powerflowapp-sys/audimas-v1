import React, { useState, useEffect } from 'react';
import { ArrowLeft, Barcode, ChevronsDown, ChevronsUp } from 'lucide-react';

interface BottomNavCapsuleProps {
  onBack?: () => void;
  onScan?: () => void;
  onHome?: () => void;
  onScrollHelper?: () => void;
  showBack?: boolean;
  showScan?: boolean;
  showHome?: boolean;
  showScrollHelper?: boolean;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export const BottomNavCapsule: React.FC<BottomNavCapsuleProps> = ({
  onBack,
  onScan,
  onHome,
  onScrollHelper,
  showBack = true,
  showScan = true,
  showHome = true,
  showScrollHelper = true,
  scrollContainerRef,
  className
}) => {
  const [isNearBottom, setIsNearBottom] = useState<boolean>(false);

  useEffect(() => {
    const checkScrollPosition = () => {
      const container = scrollContainerRef?.current || document.querySelector('.overflow-y-auto');
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        setIsNearBottom(scrollTop + clientHeight >= scrollHeight - 100);
      } else {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        setIsNearBottom(scrollTop + clientHeight >= scrollHeight - 100);
      }
    };

    checkScrollPosition();

    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    const container = scrollContainerRef?.current || document.querySelector('.overflow-y-auto');
    if (container) {
      container.addEventListener('scroll', checkScrollPosition, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', checkScrollPosition);
      if (container) {
        container.removeEventListener('scroll', checkScrollPosition);
      }
    };
  }, [scrollContainerRef]);

  const handleScrollClick = () => {
    if (onScrollHelper) {
      onScrollHelper();
      return;
    }

    const container = scrollContainerRef?.current || document.querySelector('.overflow-y-auto');
    if (container) {
      if (isNearBottom) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        container.scrollBy({ top: 350, behavior: 'smooth' });
      }
    } else {
      if (isNearBottom) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 350, behavior: 'smooth' });
      }
    }
  };

  const isScanAvailable = showScan && Boolean(onScan);
  // Ocultar scroll asistido cuando el botón central de escáner está activo para mantener exactamente 3 elementos simétricos
  const canShowScroll = showScrollHelper && !isScanAvailable;

  if (!showBack && !isScanAvailable && !showHome && !canShowScroll) return null;

  // Clases por defecto para la cápsula cuando no se proporciona className personalizada
  const defaultClasses = "fixed bottom-4 inset-x-0 mx-auto w-fit z-50 pointer-events-auto bg-[#061833]/95 backdrop-blur-md border border-sky-500/30 rounded-full px-4 py-2 flex items-center justify-center space-x-3 shadow-2xl animate-fade-in font-sans select-none";

  return (
    <div className={className || defaultClasses}>
      
      {/* 1. Botón Izquierda: Volver Atrás (w-12 h-12 / 48px) */}
      {showBack && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-12 h-12 rounded-full bg-[#0c2847] hover:bg-[#163a75] active:scale-95 border border-sky-400/30 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
          title="Volver Atrás"
        >
          <ArrowLeft className="w-5 h-5 text-sky-400" />
        </button>
      )}

      {/* 2. Botón Centro (Modo Escáner): FAB de Escaneo (w-[56px] h-[56px] centrado verticalmente) */}
      {isScanAvailable && (
        <button
          type="button"
          onClick={onScan}
          className="w-[56px] h-[56px] rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 hover:from-blue-500 hover:to-sky-300 active:scale-95 border-2 border-sky-200/60 flex items-center justify-center transition-all cursor-pointer shadow-xl shadow-blue-600/50 text-white group shrink-0"
          title="Escanear Código de Barras"
        >
          <Barcode className="w-7 h-7 text-white drop-shadow-md group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* 3. Botón Centro o Derecha: Inicio / Home (w-12 h-12 / 48px) */}
      {showHome && onHome && (
        <button
          type="button"
          onClick={onHome}
          className="w-12 h-12 rounded-full bg-[#0c2847] hover:bg-[#163a75] active:scale-95 border border-sky-400/30 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
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

      {/* 4. Botón Derecha (Modo Formulario / Sin Escáner): Scroll Asistido (w-12 h-12 / 48px) */}
      {canShowScroll && (
        <button
          type="button"
          onClick={handleScrollClick}
          className="w-12 h-12 rounded-full bg-[#0c2847] hover:bg-[#163a75] active:scale-95 border border-sky-400/30 flex items-center justify-center transition-all cursor-pointer shadow-md text-sky-400 shrink-0"
          title={isNearBottom ? "Subir al inicio" : "Bajar por la pantalla"}
        >
          {isNearBottom ? (
            <ChevronsUp className="w-5 h-5 animate-bounce" />
          ) : (
            <ChevronsDown className="w-5 h-5" />
          )}
        </button>
      )}

    </div>
  );
};
