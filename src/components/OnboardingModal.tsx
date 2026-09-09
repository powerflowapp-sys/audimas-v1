import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { fetchTiendasDinamicas, fetchSectoresDinamicos, DEFAULT_SECTORES } from '../services/superAdminService';
import { TiendaDinamica, SectorDinamico, ProfileColaborador } from '../types';
import { formatToTitleCase } from '../utils/formatUtils';
import { Lock, Store, Layers, UserCheck, AlertCircle, Loader2, Sparkles, Phone, LogOut } from 'lucide-react';

interface OnboardingModalProps {
  user: any;
  profile?: ProfileColaborador | null;
  onComplete: (updatedProfile: ProfileColaborador) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  profile,
  onComplete
}) => {
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  // Lista dinámica de Tiendas con fallback 1031 - Tienda Jujuy
  const [tiendas, setTiendas] = useState<TiendaDinamica[]>([
    { id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }
  ]);
  
  const [sectores, setSectores] = useState<SectorDinamico[]>(DEFAULT_SECTORES);
  const [selectedTiendaId, setSelectedTiendaId] = useState<string>('1031');
  const [selectedSectorId, setSelectedSectorId] = useState<string>(
    profile?.sector || 'sec_1'
  );
  const [nombreApellido, setNombreApellido] = useState<string>(
    profile?.nombre_apellido || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || ''
  );
  const [telefono, setTelefono] = useState<string>(profile?.telefono || '');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadSelects = async () => {
      setLoading(true);
      try {
        const [tList, sList] = await Promise.all([
          fetchTiendasDinamicas(),
          fetchSectoresDinamicos()
        ]);

        const activeTiendas = tList.filter(t => t.activa);
        const activeSectores = sList.filter(s => s.activo);

        if (activeTiendas.length > 0) {
          setTiendas(activeTiendas);
          const tienda1031 = activeTiendas.find(t => t.codigo === '1031');
          setSelectedTiendaId(tienda1031 ? tienda1031.id : activeTiendas[0].id);
        } else {
          setTiendas([{ id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }]);
          setSelectedTiendaId('1031');
        }

        if (activeSectores.length > 0) {
          setSectores(activeSectores);
          setSelectedSectorId(prev => prev || activeSectores[0].id);
        } else {
          setSectores(DEFAULT_SECTORES);
          setSelectedSectorId('sec_1');
        }
      } catch (err) {
        console.warn('Error cargando tiendas y sectores de onboarding:', err);
        setSectores(DEFAULT_SECTORES);
        setSelectedSectorId('sec_1');
      } finally {
        setLoading(false);
      }
    };

    loadSelects();
  }, []);

  const isGoogleUser = user?.app_metadata?.provider === 'google' || 
                      user?.user_metadata?.iss?.includes('google') ||
                      user?.identities?.some((i: any) => i.provider === 'google');

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error al cerrar sesión:', err);
    }
    localStorage.removeItem('audimas_user_profile');
    localStorage.removeItem('audimas_tienda');
    localStorage.removeItem('audimas_sector');
    localStorage.removeItem('audimas_user_name');
    localStorage.removeItem('audimas_telefono');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('audimas_collaborator');
    localStorage.removeItem('audimas_profile_cache');
    window.location.href = window.location.pathname;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nombreApellido.trim()) {
      setErrorMsg('Por favor ingresa tu Nombre y Apellido.');
      return;
    }

    if (!telefono.trim()) {
      setErrorMsg('Por favor ingresa tu Teléfono / WhatsApp.');
      return;
    }

    if (!isGoogleUser) {
      if (password.length < 6) {
        setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg('Las contraseñas no coinciden.');
        return;
      }
    }

    if (!selectedSectorId) {
      setErrorMsg('Debes seleccionar tu Sector de trabajo.');
      return;
    }

    setSaving(true);

    try {
      const activeUserId = user?.id || (await supabase.auth.getUser()).data.user?.id;
      
      const tiendaSel = tiendas.find(t => t.id === selectedTiendaId) || tiendas[0];
      const tiendaCodigoFinal = tiendaSel?.codigo || '1031';
      const tiendaNombreFinal = tiendaSel?.nombre || '1031 - Tienda Jujuy';

      const sectorSel = sectores.find(s => s.id === selectedSectorId || s.nombre === selectedSectorId);
      const sectorSeleccionado = sectorSel
        ? sectorSel.nombre
        : (selectedSectorId && selectedSectorId !== 'sec_1' ? selectedSectorId : (sectores[0]?.nombre || 'Operaciones Back'));

      const formattedName = formatToTitleCase(nombreApellido.trim());

      const finalEstado = isGoogleUser ? 'activo' : (profile?.estado && profile.estado !== 'pendiente_aprobacion' ? profile.estado : 'pendiente_aprobacion');
      const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || profile?.avatar_url || null;

      const updatedProfile: ProfileColaborador = {
        id: activeUserId || `usr_${Date.now()}`,
        email: user?.email || '',
        nombre_apellido: formattedName,
        telefono: telefono.trim(),
        tienda_codigo: tiendaCodigoFinal,
        tienda_nombre: tiendaNombreFinal,
        sector: sectorSeleccionado,
        avatar_url: googleAvatar || undefined,
        estado: finalEstado,
        origen: isGoogleUser ? 'Google' : 'Nativo',
        requiere_onboarding: false,
        updated_at: new Date().toISOString()
      };

      // 1. Guardar de forma inmediata en localStorage
      localStorage.setItem('audimas_tienda', tiendaCodigoFinal);
      localStorage.setItem('audimas_sector', sectorSeleccionado);
      localStorage.setItem('audimas_user_name', updatedProfile.nombre_apellido);
      localStorage.setItem('audimas_telefono', updatedProfile.telefono || '');
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('audimas_collaborator', updatedProfile.nombre_apellido);
      localStorage.setItem('audimas_profile_cache', JSON.stringify(updatedProfile));
      localStorage.setItem('audimas_user_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('audimas_current_view', 'HUB');

      // 2. Actualizar contraseña de Auth si es usuario nativo
      if (!isGoogleUser && password) {
        await supabase.auth.updateUser({ password }).catch(err => console.error('Error password:', err));
      }

      // 3. Upsert síncrono a la tabla 'profiles' en Supabase
      const profilePayload: any = {
        id: activeUserId,
        email: user?.email || '',
        full_name: formattedName,
        nombre_apellido: formattedName,
        telefono: telefono.trim(),
        tienda_codigo: tiendaCodigoFinal,
        tienda_nombre: tiendaNombreFinal,
        sector: sectorSeleccionado,
        estado: finalEstado,
        ...(googleAvatar ? { avatar_url: googleAvatar } : {}),
        requiere_onboarding: false,
        updated_at: new Date().toISOString()
      };

      let { error: profErr } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      // Fallback de seguridad: si la columna avatar_url o el cache de esquema da error, reintentar sin avatar_url
      if (profErr && (profErr.message.includes('avatar_url') || profErr.message.includes('schema cache') || profErr.message.includes('column'))) {
        console.warn('⚠️ Reintentando upsert sin avatar_url por falta de columna en esquema:', profErr.message);
        const fallbackPayload = { ...profilePayload };
        delete fallbackPayload.avatar_url;
        const retryRes = await supabase
          .from('profiles')
          .upsert(fallbackPayload, { onConflict: 'id' });
        profErr = retryRes.error;
      }

      const translateProfileError = (rawMsg: string): string => {
        if (!rawMsg) return 'No se pudo guardar la información del perfil. Contactá al Administrador.';
        const raw = rawMsg.toLowerCase();
        if (raw.includes('row-level security') || raw.includes('violates row-level')) {
          return 'No tenés permisos para guardar este perfil. Contactá al Administrador.';
        }
        if (raw.includes('rate limit') || raw.includes('too many requests')) {
          return 'Demasiados intentos seguidos. Por favor, aguardá unos instantes.';
        }
        if (raw.includes('duplicate key') || raw.includes('unique constraint')) {
          return 'Ya existe un registro con ese código o correo.';
        }
        if (raw.includes('network') || raw.includes('failed to fetch')) {
          return 'Error de conexión. Verificá tu red e intentá nuevamente.';
        }
        return 'No se pudo guardar la información del perfil. Contactá al Administrador.';
      };

      if (profErr) {
        console.error('Error al actualizar profiles:', profErr);
        setErrorMsg(translateProfileError(profErr.message));
        setSaving(false);
        return;
      }

      // 4. Actualizar metadatos del usuario en Supabase Auth
      await supabase.auth.updateUser({
        data: {
          full_name: updatedProfile.nombre_apellido,
          custom_name: updatedProfile.nombre_apellido,
          display_name: updatedProfile.nombre_apellido,
          tienda_nombre: tiendaNombreFinal,
          sector: sectorSeleccionado,
          requiere_onboarding: false
        }
      }).catch(err => console.error('Error user metadata:', err));

      // 5. Notificar a App.tsx para cerrar el modal y navegar limpiamente sin recargar la página
      onComplete(updatedProfile);
    } catch (err: any) {
      console.error('Error en onboarding:', err);
      const raw = err?.message ? String(err.message).toLowerCase() : '';
      let friendly = 'Error al completar el perfil. Por favor intentá nuevamente.';
      if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        friendly = 'No tenés permisos para guardar este perfil. Contactá al Administrador.';
      } else if (raw.includes('rate limit') || raw.includes('too many requests')) {
        friendly = 'Demasiados intentos seguidos. Por favor, aguardá unos instantes.';
      }
      setErrorMsg(friendly);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in overflow-y-auto">
      <div className="bg-[#061838] border border-sky-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-white relative">
        
        {/* Soft Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Encabezado */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-sky-500/30 border border-sky-300/40">
            <Sparkles className="w-7 h-7 text-white animate-pulse" />
          </div>
          <h2 className="font-['Chakra_Petch'] font-black text-xl text-white uppercase tracking-wider">
            Bienvenido a AudiMAS V1
          </h2>
          <p className="text-xs text-sky-300/90 font-medium">
            {isGoogleUser 
              ? 'Selecciona tu Tienda y Sector para completar la configuración de tu perfil.' 
              : 'Completa tu perfil y crea tu contraseña personal para migrar tu cuenta de forma segura.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-2xl flex items-center space-x-2 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-xs text-sky-400 font-mono flex flex-col items-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Cargando tiendas y sectores...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Nombre y Apellido */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1">
                Nombre y Apellido
              </label>
              <input
                type="text"
                value={nombreApellido}
                onChange={(e) => setNombreApellido(formatToTitleCase(e.target.value))}
                placeholder="Ej. Juan Pérez"
                required
                autoCapitalize="words"
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium capitalize"
              />
            </div>

            {/* Teléfono / WhatsApp */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Phone className="w-3 h-3 text-sky-400" />
                <span>Teléfono / WhatsApp</span>
              </label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 3881234567"
                required
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium"
              />
            </div>

            {/* Contraseña Personal (Solo usuarios nativos) */}
            {!isGoogleUser && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-sky-400" />
                    <span>Nueva Contraseña</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required={!isGoogleUser}
                    minLength={6}
                    className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1">
                    Confirmar Contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    required={!isGoogleUser}
                    minLength={6}
                    className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            )}

            {/* Selector de Tienda */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Store className="w-3 h-3 text-sky-400" />
                <span>Selecciona tu Tienda</span>
              </label>
              <select
                value={selectedTiendaId}
                onChange={(e) => setSelectedTiendaId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-sky-400 font-medium"
              >
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#061838] text-white">
                    {t.nombre.startsWith(t.codigo) ? t.nombre : `${t.codigo} - ${t.nombre}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Sector */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>Selecciona tu Sector</span>
              </label>
              <select
                value={selectedSectorId}
                onChange={(e) => setSelectedSectorId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-sky-400 font-medium"
              >
                {sectores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#061838] text-white">
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Botones de Acción: Guardar y Salir */}
            <div className="pt-3 space-y-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-['Chakra_Petch'] font-bold text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-blue-600/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Guardando Perfil...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-5 h-5" />
                    <span>Guardar y Comenzar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2.5 px-4 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 active:scale-95 text-slate-300 hover:text-white font-['Chakra_Petch'] font-semibold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span>Volver / Cerrar Sesión</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
