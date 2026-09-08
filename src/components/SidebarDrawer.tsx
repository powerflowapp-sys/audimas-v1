import React from 'react';
import { 
  X, 
  Truck, 
  Database, 
  Building2, 
  UserCheck, 
  FileSpreadsheet,
  Share2,
  LogOut,
  Mail,
  RefreshCw,
  Tag,
  Home,
  Smartphone,
  PieChart,
  Snowflake
} from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  collaboratorName: string;
  collaboratorAvatar?: string;
  userEmail?: string;
  tiendaInfo?: string;
  currentView?: string;
  onGoHub?: () => void;
  onGoDashboard: () => void;
  onOpenDashboardGerencial?: () => void;
  onOpenCamionesPlus?: () => void;
  onOpenCargarCamionPerecedero?: () => void;
  onOpenCargarCamion: () => void;
  onOpenCatalogoMaestro: () => void;
  onOpenHistorialReportes?: () => void;
  onOpenReclamosMagma?: () => void;
  onOpenBandeMas?: () => void;
  onOpenShareApp?: () => void;
  onChangeCollaborator: () => void;
  onSignOut?: () => void;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  collaboratorName,
  collaboratorAvatar,
  userEmail,
  tiendaInfo = '1031 - Tienda Jujuy',
  currentView = 'LIST',
  onGoHub,
  onGoDashboard,
  onOpenDashboardGerencial,
  onOpenCamionesPlus,
  onOpenCargarCamionPerecedero,
  onOpenCargarCamion,
  onOpenCatalogoMaestro,
  onOpenHistorialReportes,
  onOpenReclamosMagma,
  onOpenBandeMas,
  onOpenShareApp,
  onChangeCollaborator,
  onSignOut
}) => {
  const { installPwa } = usePwaInstall();

  if (!isOpen) return null;

  const getIniciales = (nombre: string) => {
    if (!nombre) return 'OP';
    const partes = nombre.trim().split(/\s+/).filter(Boolean);
    if (partes.length >= 2) {
      return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  };

  const handleReloadApp = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      localStorage.removeItem('audimas_camiones_cache');
    } catch (e) {
      console.warn('Error al limpiar caché:', e);
    } finally {
      window.location.reload();
    }
  };

  const isDashboardActive = currentView === 'LIST';
  const isDashboardGerencialActive = currentView === 'DASHBOARD';
  const isCamionesPlusActive = currentView === 'CAMIONES_PLUS';
  const isHistorialActive = currentView === 'HISTORIAL';
  const isReclamosActive = currentView === 'RECLAMOS_MAGMA';
  const isBandeMasActive = currentView === 'BANDEMAS';
  const isCargarCamionActive = currentView === 'UPLOAD_NAE';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans select-none animate-fade-in">
      {/* Backdrop oscuro translúcido con Blur */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-[#00081d]/80 backdrop-blur-sm transition-opacity cursor-pointer"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xs bg-[#030d1e]/98 backdrop-blur-md border-l border-sky-500/20 text-white flex flex-col justify-between shadow-2xl shadow-blue-950/90 animate-slide-left">
          
          {/* Top & Navigation Scrollable Container */}
          <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-70px)]">
            
            {/* 1. Encabezado de Usuario Compacto */}
            <div className="p-4 flex items-center justify-between border-b border-sky-500/20">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#020b18] border border-sky-400/40 flex items-center justify-center font-['Chakra_Petch'] font-black text-white text-sm shrink-0 overflow-hidden shadow-md">
                  {collaboratorAvatar && collaboratorAvatar.trim() !== '' ? (
                    <img src={collaboratorAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    getIniciales(collaboratorName)
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-white uppercase tracking-wide truncate">
                    {collaboratorName}
                  </h4>
                  {userEmail && (
                    <p className="text-[11px] text-sky-300/80 font-mono truncate flex items-center space-x-1 mt-0.5">
                      <Mail className="w-3 h-3 text-sky-400 shrink-0" />
                      <span className="truncate">{userEmail}</span>
                    </p>
                  )}
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

            {/* Botón Destacado Único: Compartir aplicación */}
            <div className="px-3 pt-1">
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

            {/* 2. Módulo AUDIMÁS */}
            <nav className="px-3 pt-2 space-y-1">
              <div className="font-['Chakra_Petch'] font-black text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-1 px-2 mb-1.5 flex items-center justify-between">
                <span>AUDIMÁS</span>
              </div>

              {/* [ 🏠 Camiones ] */}
              <button
                type="button"
                onClick={() => {
                  onGoDashboard();
                  onClose();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isDashboardActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-sky-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <Home className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Camiones</span>
              </button>

              {/* [ 📊 Dashboard Gerencial ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenDashboardGerencial) onOpenDashboardGerencial();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isDashboardGerencialActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-sky-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <PieChart className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Dashboard Gerencial</span>
              </button>

              {/* [ 🚚 Cargar Camión NAE / AP ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCargarCamion();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isCargarCamionActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-sky-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <Truck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Cargar Camión NAE / AP</span>
              </button>

              {/* [ 📄 Historial de Reportes ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenHistorialReportes) onOpenHistorialReportes();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isHistorialActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-sky-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Historial de Reportes</span>
              </button>

              {/* [ 📋 Reclamos Magma ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenReclamosMagma) onOpenReclamosMagma();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isReclamosActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-emerald-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Reclamos Magma</span>
              </button>
            </nav>

            {/* 3. Módulo BANDEMÁS */}
            <nav className="px-3 pt-1 space-y-1">
              <div className="font-['Chakra_Petch'] font-black text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-1 px-2 mb-1.5 flex items-center justify-between">
                <span>BANDEMÁS</span>
              </div>

              {/* [ 🏷️ Cargar Banderas ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenBandeMas) onOpenBandeMas();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isBandeMasActive
                    ? 'bg-[#0c2e59] text-white font-bold border-l-4 border-purple-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-sky-500/10'
                }`}
              >
                <Tag className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Cargar Banderas</span>
              </button>
            </nav>

            {/* 4. Módulo CAMIONES MÁS */}
            <nav className="px-3 pt-1 space-y-1">
              <div className="font-['Chakra_Petch'] font-black text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-1 px-2 mb-1.5 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <img src="/camiones-mas-icon.png" alt="Camiones Más" className="w-4 h-4 rounded-md object-cover shadow-sm border border-cyan-400/40" />
                  <span>CAMIONES MÁS</span>
                </div>
              </div>

              {/* [ ❄️ Consultar Camiones Perecederos ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenCamionesPlus) onOpenCamionesPlus();
                }}
                className={`w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl ${
                  isCamionesPlusActive
                    ? 'bg-[#042852] text-white font-bold border-l-4 border-cyan-400 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-cyan-500/10'
                }`}
              >
                <Snowflake className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Consultar Camiones Perecederos</span>
              </button>

              {/* [ 📥 Cargar Camión Perecedero (Subida AP2) ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenCargarCamionPerecedero) {
                    onOpenCargarCamionPerecedero();
                  } else if (onOpenCamionesPlus) {
                    onOpenCamionesPlus();
                  }
                }}
                className="w-full text-xs font-semibold px-3 py-2 transition-all text-left cursor-pointer flex items-center space-x-3 rounded-xl text-slate-300 hover:text-white hover:bg-cyan-500/10"
              >
                <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Cargar Camión Perecedero</span>
              </button>
            </nav>

            {/* 5. OPCIONES DE SISTEMA */}
            <nav className="px-3 pt-1 space-y-1">
              <div className="font-['Chakra_Petch'] font-black text-xs text-sky-300 uppercase tracking-wider border-b border-sky-500/20 pb-1 px-2 mb-1.5 flex items-center justify-between">
                <span>OPCIONES DE SISTEMA</span>
              </div>

              {/* [ 🔄 Recargar app (limpia caché) ] */}
              <button
                type="button"
                onClick={handleReloadApp}
                className="w-full text-slate-300 hover:text-white hover:bg-sky-500/10 rounded-xl px-3 py-2 flex items-center space-x-3 text-xs font-semibold text-left transition-all cursor-pointer"
                title="Borra caché y fuerza recarga del bundle más reciente"
              >
                <RefreshCw className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Recargar app (limpia caché)</span>
              </button>

              {/* [ 📲 Instalar Aplicación ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  installPwa();
                }}
                className="w-full text-slate-300 hover:text-white hover:bg-sky-500/10 rounded-xl px-3 py-2 flex items-center space-x-3 text-xs font-semibold text-left transition-all cursor-pointer"
                title="Instalar aplicación en dispositivo"
              >
                <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Instalar Aplicación</span>
              </button>

              {/* [ 👤 Cambiar Nombre Operario ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onChangeCollaborator();
                }}
                className="w-full text-slate-300 hover:text-white hover:bg-sky-500/10 rounded-xl px-3 py-2 flex items-center space-x-3 text-xs font-semibold text-left transition-all cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Cambiar Nombre Operario</span>
              </button>

              {/* [ 🗄️ Catálogo Maestro (SIM) ] */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCatalogoMaestro();
                }}
                className="w-full text-slate-300 hover:text-white hover:bg-sky-500/10 rounded-xl px-3 py-2 flex items-center space-x-3 text-xs font-semibold text-left transition-all cursor-pointer"
              >
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Catálogo Maestro (SIM)</span>
              </button>

              {/* [ 🚪 Cerrar Sesión ] */}
              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl px-3 py-2 flex items-center space-x-3 text-xs font-semibold text-left transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Cerrar Sesión</span>
                </button>
              )}
            </nav>

          </div>

          {/* 5. Pie del Sidebar */}
          <div className="p-3 border-t border-sky-500/20 text-center space-y-0.5 bg-[#020b18]/80 shrink-0">
            <p className="text-xs font-['Chakra_Petch'] font-black text-sky-300 uppercase tracking-wider">
              OperaMás
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              Suite Operativa v1.0
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
