import React from 'react';
import { 
  X, 
  Truck, 
  Database, 
  Building2, 
  UserCheck, 
  FileSpreadsheet,
  Share2
} from 'lucide-react';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  collaboratorName: string;
  collaboratorAvatar?: string;
  tiendaInfo?: string;
  currentView?: string;
  onGoDashboard: () => void;
  onOpenCargarCamion: () => void;
  onOpenCatalogoMaestro: () => void;
  onOpenHistorialReportes?: () => void;
  onOpenShareApp?: () => void;
  onChangeCollaborator: () => void;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  collaboratorName,
  collaboratorAvatar,
  tiendaInfo = '1031 - Jujuy',
  currentView = 'LIST',
  onGoDashboard,
  onOpenCargarCamion,
  onOpenCatalogoMaestro,
  onOpenHistorialReportes,
  onOpenShareApp,
  onChangeCollaborator
}) => {
  if (!isOpen) return null;

  const getIniciales = (nombre: string) => {
    if (!nombre) return 'OP';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  };

  const isDashboardActive = currentView === 'LIST';
  const isHistorialActive = currentView === 'HISTORIAL';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans select-none animate-fade-in">
      {/* Backdrop oscuro translúcido con Blur */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-[#00081d]/80 backdrop-blur-sm transition-opacity cursor-pointer"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xs bg-[#030d1e]/98 backdrop-blur-md border-l border-sky-500/20 text-white flex flex-col justify-between shadow-2xl shadow-blue-950/90 animate-slide-left">
          
          {/* Top Content */}
          <div className="space-y-3">
            
            {/* Encabezado de Usuario Compacto */}
            <div className="p-4 flex items-center justify-between border-b border-sky-500/20">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#020b18] border border-sky-400/40 flex items-center justify-center font-['Chakra_Petch'] font-black text-white text-sm shrink-0 overflow-hidden shadow-md">
                  {collaboratorAvatar ? (
                    <img src={collaboratorAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    getIniciales(collaboratorName)
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-white uppercase tracking-wide truncate">
                    {collaboratorName}
                  </h4>
                  <p className="text-xs text-sky-300/80 font-mono truncate flex items-center space-x-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="truncate">{tiendaInfo}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-sky-500/10 transition-colors cursor-pointer shrink-0"
                title="Cerrar Menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Botón de Acción Superior: Cambiar Operario */}
            <div className="px-4 pt-1 space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onChangeCollaborator();
                }}
                className="w-full bg-[#081f3d] hover:bg-[#0e2c56] border border-sky-400/30 rounded-xl py-2.5 px-3.5 flex items-center justify-between text-sky-300 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="truncate">Cambiar Operario</span>
                </div>
              </button>

              {/* Botón Destacado: Compartir aplicación */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenShareApp) onOpenShareApp();
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl py-2.5 px-3.5 flex items-center justify-between shadow-md shadow-blue-600/30 transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <Share2 className="w-4 h-4 text-white shrink-0" />
                  <span className="truncate">Compartir aplicación</span>
                </div>
              </button>
            </div>

            {/* Secciones y Lista de Menú Plana */}
            <nav className="px-3 pt-2 space-y-1.5">
              <p className="font-bold text-[11px] text-sky-400 uppercase tracking-widest border-b border-sky-500/20 pb-1 px-2 mb-2">
                AUDITORÍA
              </p>

              {/* 1. Dashboard / Camiones */}
              <button
                type="button"
                onClick={() => {
                  onGoDashboard();
                  onClose();
                }}
                className={`w-full text-xs font-bold px-3 py-2.5 transition-all text-left cursor-pointer flex items-center space-x-3 ${
                  isDashboardActive
                    ? 'bg-[#0c2e59] text-white rounded-r-xl rounded-l-none border-l-4 border-sky-400 shadow-md'
                    : 'rounded-xl text-slate-300 hover:text-white hover:bg-sky-500/10 font-semibold'
                }`}
              >
                <svg 
                  className={`w-4 h-4 shrink-0 ${isDashboardActive ? 'fill-sky-400 text-sky-400' : 'fill-slate-400 text-slate-400'}`} 
                  viewBox="0 0 24 24"
                >
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                <span>Dashboard / Camiones</span>
              </button>

              {/* 2. Cargar Camión NAE */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCargarCamion();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-sky-500/10 transition-all font-semibold text-xs cursor-pointer text-left"
              >
                <Truck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Cargar Camión NAE</span>
              </button>

              {/* 3. Catálogo Maestro */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCatalogoMaestro();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-sky-500/10 transition-all font-semibold text-xs cursor-pointer text-left"
              >
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Catálogo Maestro (SIM)</span>
              </button>

              {/* 4. Historial de Reportes (Excel) */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenHistorialReportes) {
                    onOpenHistorialReportes();
                  }
                }}
                className={`w-full text-xs font-bold px-3 py-2.5 transition-all text-left cursor-pointer flex items-center space-x-3 ${
                  isHistorialActive
                    ? 'bg-[#0c2e59] text-white rounded-r-xl rounded-l-none border-l-4 border-sky-400 shadow-md'
                    : 'rounded-xl text-slate-300 hover:text-white hover:bg-sky-500/10 font-semibold'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Historial de Reportes (Excel)</span>
              </button>
            </nav>
          </div>

          {/* Footer del Sidebar */}
          <div className="p-4 border-t border-sky-500/20 text-center space-y-0.5 bg-[#020b18]/60">
            <p className="text-xs font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider">
              AudiMAS Retail V1
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              Auditoría Concurrente de Camiones
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
