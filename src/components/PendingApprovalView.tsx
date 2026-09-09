import React, { useState } from 'react';
import { Shield, Clock, LogOut, RefreshCw, AlertCircle, CheckCircle2, User, Mail, ShieldCheck } from 'lucide-react';
import { ProfileColaborador } from '../types';

interface PendingApprovalViewProps {
  user: any;
  profile: ProfileColaborador | null;
  onSignOut: () => Promise<void>;
  onCheckStatus: () => Promise<void>;
  onSuperAdminAccess?: () => void;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  user,
  profile,
  onSignOut,
  onCheckStatus,
  onSuperAdminAccess
}) => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const rawName = profile?.nombre_apellido || profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Colaborador';
  const email = profile?.email || user?.email || '';
  const origen = profile?.origen || (user?.app_metadata?.provider === 'google' ? 'Google' : 'Nativo');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMsg(null);
    try {
      await onCheckStatus();
      setRefreshMsg('Estado verificado.');
    } catch (e) {
      setRefreshMsg('Error al consultar estado.');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col justify-between font-sans select-none p-4 sm:p-6 relative overflow-y-auto">
      
      {/* Botón Acceso SuperAdmin Flotante */}
      {onSuperAdminAccess && (
        <button
          type="button"
          onClick={onSuperAdminAccess}
          className="fixed top-4 right-4 z-40 px-4 py-2 bg-[#061838]/90 hover:bg-[#0c244d] border border-amber-400/50 text-amber-300 hover:text-amber-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1.5 shadow-xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
          title="Acceso Administrador"
        >
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Acceso SuperAdmin</span>
        </button>
      )}

      {/* Header Fijo */}
      <header className="pt-2 px-2 flex items-center justify-center space-x-3 shrink-0">
        <img 
          src="/pwa-192x192.png?v=2" 
          alt="OperaMAS" 
          className="w-10 h-10 rounded-2xl object-cover shadow-lg border border-sky-400/30 shrink-0" 
        />
        <div>
          <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-1">
            <span className="font-bold text-base text-sky-400">OPERA</span>
            <span className="font-black text-xl text-white">MAS</span>
          </h1>
          <p className="text-[10px] text-sky-300/80 font-mono tracking-widest uppercase">SUITE OPERATIVA</p>
        </div>
      </header>

      {/* Tarjeta Informativa Elegante */}
      <main className="my-auto max-w-md w-full mx-auto p-6 sm:p-8 bg-[#061838]/90 border border-amber-400/30 backdrop-blur-xl rounded-3xl shadow-2xl space-y-6 text-center animate-fade-in relative overflow-hidden">
        
        {/* Ambient Glow Amber */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Icono Principal ⏳ */}
        <div className="flex flex-col items-center justify-center space-y-3 pt-2">
          <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-400/40 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/10 animate-pulse">
            <Clock className="w-10 h-10 text-amber-400" />
          </div>
          <div className="space-y-1">
            <span className="inline-block px-3 py-1 bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase tracking-widest rounded-full">
              ⏳ Cuenta en Proceso de Autorización
            </span>
            <h2 className="font-['Chakra_Petch'] font-black text-xl text-white uppercase tracking-wider pt-2">
              Solicitud de Registro Recibida
            </h2>
          </div>
        </div>

        {/* Mensaje Informativo */}
        <div className="bg-[#020b18]/80 border border-sky-500/20 p-4 rounded-2xl text-left space-y-3 shadow-inner">
          <p className="text-xs text-sky-100 leading-relaxed font-medium">
            Hola <span className="font-bold text-amber-300">{rawName}</span>, tu solicitud de registro ha sido recibida. El Administrador del sistema debe autorizar tu cuenta antes de que puedas acceder a la suite.
          </p>

          <div className="pt-2 border-t border-sky-500/10 space-y-1.5 text-[11px] font-mono text-sky-300/80">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center space-x-1">
                <Mail className="w-3 h-3 text-sky-400" />
                <span>Correo:</span>
              </span>
              <span className="text-white font-medium truncate max-w-[200px]">{email}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center space-x-1">
                <User className="w-3 h-3 text-sky-400" />
                <span>Origen:</span>
              </span>
              <span className="px-2 py-0.5 bg-sky-500/20 text-sky-300 rounded text-[10px] uppercase font-bold">
                {origen === 'Google' ? 'Google OAuth' : 'Registro Nativo'}
              </span>
            </div>
          </div>
        </div>

        {/* Notificación de refresco */}
        {refreshMsg && (
          <div className="p-2.5 bg-sky-950/80 border border-sky-500/30 rounded-xl text-sky-200 text-xs flex items-center justify-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{refreshMsg}</span>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-['Chakra_Petch'] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Verificando...' : 'Comprobar Estado de Aprobación'}</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-3 px-4 bg-[#020b18] hover:bg-[#0c244d] border border-sky-500/30 text-sky-300 hover:text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-95"
          >
            <LogOut className="w-4 h-4 text-sky-400" />
            <span>Cerrar Sesión / Volver al Inicio</span>
          </button>
        </div>

        {/* Footer de Seguridad */}
        <div className="pt-2 border-t border-sky-500/10 flex items-center justify-center space-x-1.5 text-[11px] text-sky-300/70 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Acceso Protegido por Administrador</span>
        </div>
      </main>

      {/* Footer General */}
      <footer className="py-2 text-center text-[10px] text-sky-300/50 font-mono">
        OperaMAS Suite • AudiMAS V1
      </footer>
    </div>
  );
};
