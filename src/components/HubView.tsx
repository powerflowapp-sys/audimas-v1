import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Lock, 
  Menu, 
  Download, 
  X, 
  Sparkles,
  Plus
} from 'lucide-react';
import { getIniciales } from '../utils/formatUtils';

interface HubViewProps {
  onOpenAudiMas: () => void;
  onOpenBandeMas: () => void;
  collaboratorName?: string;
  collaboratorAvatar?: string;
  onOpenProfile?: () => void;
  onOpenDrawer?: () => void;
}

export const HubView: React.FC<HubViewProps> = ({
  onOpenAudiMas,
  onOpenBandeMas,
  collaboratorName = 'OPERADOR 1',
  collaboratorAvatar,
  onOpenProfile,
  onOpenDrawer
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* Encabezado Principal con Imagen del Logo */}
      <header className="sticky top-0 z-30 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <img 
            src="/pwa-192x192.png?v=2" 
            alt="OperaMAS" 
            className="w-11 h-11 rounded-2xl object-cover shadow-lg border border-sky-400/30 shrink-0" 
          />
          <div>
            <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-1">
              <span className="font-bold text-base text-sky-400">OPERA</span>
              <span className="font-black text-xl text-white">MAS</span>
            </h1>
            <p className="text-[10px] text-sky-300/80 font-mono tracking-widest uppercase">SUITE OPERATIVA</p>
          </div>
        </div>

        {/* Cápsula Perfil / Menú */}
        <div 
          onClick={onOpenDrawer}
          className="bg-[#061224]/80 border border-sky-500/30 rounded-full px-3 py-1.5 flex items-center space-x-2.5 shadow-md backdrop-blur-md cursor-pointer hover:bg-[#0c244d] transition-all select-none"
          title={`Operario: ${collaboratorName}`}
        >
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenProfile) onOpenProfile();
            }}
            className="w-7 h-7 rounded-full bg-[#020b18] overflow-hidden flex items-center justify-center border border-sky-400/40 shrink-0 hover:opacity-90 transition-opacity"
          >
            {collaboratorAvatar && collaboratorAvatar.trim() !== '' ? (
              <img src={collaboratorAvatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="font-['Chakra_Petch'] font-bold text-[10px] text-sky-300">
                {getIniciales(collaboratorName)}
              </span>
            )}
          </div>

          <span className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate max-w-[110px]">
            {collaboratorName}
          </span>

          <Menu className="w-4 h-4 text-sky-400 shrink-0 ml-0.5" />
        </div>
      </header>

      {/* Main Container - App Launcher Grid 2x2 Estilo Springboard */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-start pt-6 space-y-6">
        
        {/* Título de Sección del Hub */}
        <div className="px-1 flex items-center justify-between">
          <h2 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-widest flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>MÓDULOS DE OPERACIÓN</span>
          </h2>
          <span className="text-[10px] text-slate-400 font-mono">Hub Central</span>
        </div>

        {/* CUADRÍCULA TÁCTIL 2 COLUMNAS AMPLIAS (~30-35% MÁS GRANDES) */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 max-w-md mx-auto px-2 justify-items-center w-full pt-2">
          
          {/* APP 1: AudiMAS */}
          <div 
            onClick={onOpenAudiMas}
            className="flex flex-col items-center justify-center cursor-pointer group active:scale-95 transition-transform"
          >
            {/* Logo Oficial AudiMAS amplio */}
            <img 
              src="/logo-audimas.png?v=2" 
              alt="AudiMAS" 
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl object-contain drop-shadow-2xl transition-transform group-hover:scale-105" 
            />

            {/* Etiqueta e Indicador Centrado */}
            <div className="text-center mt-3">
              <h3 className="font-['Chakra_Petch'] font-black text-base sm:text-lg text-white uppercase tracking-wider group-hover:text-sky-300 transition-colors">
                AudiMAS
              </h3>
              <span className="text-xs sm:text-sm font-mono text-emerald-400 font-bold block mt-0.5">
                Auditoría
              </span>
            </div>
          </div>

          {/* APP 2: BandeMAS */}
          <div 
            onClick={onOpenBandeMas}
            className="flex flex-col items-center justify-center cursor-pointer group active:scale-95 transition-transform"
          >
            {/* Logo Oficial BandeMAS amplio */}
            <img 
              src="/logo-bandemas.png?v=2" 
              alt="BandeMAS" 
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl object-contain drop-shadow-2xl transition-transform group-hover:scale-105" 
            />

            {/* Etiqueta e Indicador Centrado */}
            <div className="text-center mt-3">
              <h3 className="font-['Chakra_Petch'] font-black text-base sm:text-lg text-white uppercase tracking-wider group-hover:text-purple-300 transition-colors">
                BandeMAS
              </h3>
              <span className="text-xs sm:text-sm font-mono text-purple-300 font-bold block mt-0.5">
                Cartelería
              </span>
            </div>
          </div>

          {/* APP 3: KardexMAS (Próximamente) */}
          <div className="flex flex-col items-center justify-center opacity-60 cursor-not-allowed">
            <div className="w-36 h-36 sm:w-44 sm:h-44 bg-slate-900/80 border border-slate-700/60 rounded-3xl flex items-center justify-center relative shadow-lg">
              <Boxes className="w-14 h-14 text-slate-500" />
              <div className="absolute top-2.5 right-2.5 bg-slate-800 p-1.5 rounded-full border border-slate-700">
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div className="text-center mt-3">
              <h3 className="font-['Chakra_Petch'] font-black text-base sm:text-lg text-slate-400 uppercase tracking-wider">
                KardexMAS
              </h3>
              <span className="text-xs sm:text-sm font-mono text-slate-500 block mt-0.5">
                Próximamente
              </span>
            </div>
          </div>

          {/* APP 4: Espacio Futuro */}
          <div className="flex flex-col items-center justify-center opacity-40">
            <div className="w-36 h-36 sm:w-44 sm:h-44 border-2 border-dashed border-slate-800/80 rounded-3xl flex items-center justify-center">
              <Plus className="w-12 h-12 text-slate-600" />
            </div>

            <div className="text-center mt-3">
              <h3 className="font-['Chakra_Petch'] font-black text-sm sm:text-base text-slate-500 uppercase tracking-wider">
                Módulo 4
              </h3>
              <span className="text-xs sm:text-sm font-mono text-slate-600 block mt-0.5">
                En desarrollo
              </span>
            </div>
          </div>

        </div>
      </main>

      {/* Modal / Toast Flotante no Intrusivo para "Instalar App" PWA */}
      {deferredPrompt && !isInstalled && !isDismissed && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 max-w-sm z-50 bg-[#061838]/95 border border-sky-400/50 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl shadow-blue-950/90 flex items-center justify-between space-x-3 animate-fade-in select-none">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 bg-sky-500/20 rounded-xl flex items-center justify-center shrink-0 border border-sky-400/30">
              <Download className="w-5 h-5 text-sky-300 animate-bounce" />
            </div>
            <p className="text-xs font-semibold text-white leading-tight truncate">
              ¿Deseas instalar OperaMAS en tu dispositivo?
            </p>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleInstallPWA}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Chakra_Petch'] font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Instalar
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
