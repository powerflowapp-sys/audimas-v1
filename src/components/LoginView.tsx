import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import {
  getSuperAdminMasterKey,
  fetchTiendasDinamicas,
  fetchSectoresDinamicos,
  fetchProfilesColaboradores,
  DEFAULT_SECTORES
} from '../services/superAdminService';
import { TiendaDinamica, SectorDinamico, ProfileColaborador } from '../types';
import { formatToTitleCase, resolveUniqueCollaboratorName } from '../utils/formatUtils';
import {
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  User,
  Store,
  Layers,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Key,
  Phone
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: () => void;
  onSuperAdminAccess?: () => void;
}

type AuthMode = 'LOGIN' | 'SIGNUP';

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess, onSuperAdminAccess }) => {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  
  // Login Fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Sign Up Fields
  const [nombreApellido, setNombreApellido] = useState<string>('');
  const [signupEmail, setSignupEmail] = useState<string>('');
  const [signupTelefono, setSignupTelefono] = useState<string>('');
  const [signupPassword, setSignupPassword] = useState<string>('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState<string>('');
  const [selectedTiendaId, setSelectedTiendaId] = useState<string>('1031');
  const [selectedSectorId, setSelectedSectorId] = useState<string>('sec_1');

  // Dynamic Lists
  const [tiendas, setTiendas] = useState<TiendaDinamica[]>([
    { id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }
  ]);
  const [sectores, setSectores] = useState<SectorDinamico[]>(DEFAULT_SECTORES);

  // State flags
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(() => sessionStorage.getItem('audi_auth_error') || null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // SuperAdmin Modal State
  const [isSuperAdminModalOpen, setIsSuperAdminModalOpen] = useState<boolean>(false);
  const [superAdminKeyInput, setSuperAdminKeyInput] = useState<string>('');
  const [superAdminError, setSuperAdminError] = useState<string | null>(null);
  const [validatingMasterKey, setValidatingMasterKey] = useState<boolean>(false);

  useEffect(() => {
    if (sessionStorage.getItem('audi_auth_error')) {
      sessionStorage.removeItem('audi_auth_error');
    }
  }, []);

  useEffect(() => {
    const loadDropdowns = async () => {
      // Purgar caché obsoleta con tienda 101 / Casa Central si existiera
      const rawCache = localStorage.getItem('audimas_tiendas_cache');
      if (rawCache && (rawCache.includes('101') || rawCache.includes('Casa Central') || rawCache.includes('102') || rawCache.includes('103'))) {
        localStorage.setItem('audimas_tiendas_cache', JSON.stringify([{ id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }]));
      }

      try {
        const [tList, sList] = await Promise.all([
          fetchTiendasDinamicas(),
          fetchSectoresDinamicos()
        ]);
        const activeTiendas = tList.filter(t => t.activa && t.codigo !== '101' && t.codigo !== '102' && t.codigo !== '103' && !t.nombre?.includes('Casa Central'));
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
        console.warn('Error al cargar dropdowns de registro:', err);
        setTiendas([{ id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }]);
        setSelectedTiendaId('1031');
        setSectores(DEFAULT_SECTORES);
        setSelectedSectorId('sec_1');
      }
    };

    loadDropdowns();
  }, []);

  // Manejo de Iniciar Sesión con Google OAuth
  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) {
        throw error;
      }
    } catch (err: any) {
      console.error('Error al iniciar sesión con Google:', err);
      setErrorMsg(translateAuthError(err.message || 'Error al autenticar con Google'));
      setIsSubmitting(false);
    }
  };

  const translateAuthError = (rawMsg: string): string => {
    const msg = (rawMsg || '').toLowerCase();

    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return 'Demasiados intentos seguidos. Por favor, aguardá unos instantes.';
    }
    if (msg.includes('email not confirmed')) {
      return 'El correo electrónico no requiere confirmación pero tu cuenta debe ser aprobada por el Administrador.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (msg.includes('user not found') || msg.includes('no user found')) {
      return 'No existe una cuenta registrada con este correo.';
    }
    if (msg.includes('invalid email') || msg.includes('email address is invalid')) {
      return 'El formato de correo no es válido.';
    }
    if (msg.includes('password should be at least 6 characters') || msg.includes('password at least 6')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
      return 'Este correo ya se encuentra registrado.';
    }
    if (msg.includes('user cancelled') || msg.includes('cancelled') || msg.includes('popup_closed') || msg.includes('access_denied') || msg.includes('autenticar con google')) {
      return 'Se canceló el inicio de sesión con Google. Intentá nuevamente.';
    }
    if (msg.includes('row-level security') || msg.includes('violates row-level')) {
      return 'No tenés permisos para guardar este perfil. Contactá al Administrador.';
    }
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return 'Ya existe un registro con ese código o nombre.';
    }

    return rawMsg || 'Ocurrió un error en el proceso de autenticación.';
  };

  // Manejo de Login Tradicional (Email / Password)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Iniciar sesión en Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (authErr) {
        throw new Error(translateAuthError(authErr.message));
      }

      if (authData.user) {
        const userId = authData.user.id;

        // Consultar el perfil del usuario en DB
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profile) {
          if (profile.estado === 'pendiente_aprobacion') {
            const blockMsg = 'Tu cuenta aún está pendiente de aprobación por el Administrador. No podés ingresar hasta que sea autorizada.';
            sessionStorage.setItem('audi_auth_error', blockMsg);
            setErrorMsg(blockMsg);
            await supabase.auth.signOut();
            setErrorMsg(blockMsg);
            setIsSubmitting(false);
            return;
          }

          if (profile.estado === 'suspendido' || profile.estado === 'inactivo') {
            const blockMsg = 'Tu cuenta se encuentra suspendida o inactiva. Contactá al Administrador.';
            sessionStorage.setItem('audi_auth_error', blockMsg);
            setErrorMsg(blockMsg);
            await supabase.auth.signOut();
            setErrorMsg(blockMsg);
            setIsSubmitting(false);
            return;
          }

          // Perfil activo -> Guardar datos de colaborador localmente
          localStorage.setItem('audimas_collaborator', profile.nombre_apellido || profile.full_name || 'Operador');
          if (profile.avatar_url && profile.avatar_url.trim() !== '') {
            localStorage.setItem('audimas_collaborator_avatar', profile.avatar_url);
          } else {
            localStorage.removeItem('audimas_collaborator_avatar');
          }
          localStorage.setItem('audimas_profile_cache', JSON.stringify(profile));
        }

        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setErrorMsg(translateAuthError(err.message || 'Error al iniciar sesión.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejo de Registro de Nuevo Colaborador (Sign Up)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!nombreApellido.trim()) {
      setErrorMsg('Por favor ingresa tu Nombre y Apellido.');
      return;
    }

    if (!signupEmail.trim()) {
      setErrorMsg('Por favor ingresa tu Correo Electrónico.');
      return;
    }

    if (signupPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    if (!selectedTiendaId) {
      setErrorMsg('Selecciona tu Tienda asignada.');
      return;
    }

    if (!selectedSectorId) {
      setErrorMsg('Selecciona tu Sector.');
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanEmail = signupEmail.trim().toLowerCase();

      // Verificar si el correo ya existe en perfiles de DB
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        setErrorMsg('Este correo ya se encuentra registrado.');
        setIsSubmitting(false);
        return;
      }

      const tiendaSel = tiendas.find(t => t.id === selectedTiendaId) || tiendas[0];
      const sectorSel = sectores.find(s => s.id === selectedSectorId);

      // 1. Registro en Supabase Auth
      const formattedName = formatToTitleCase(nombreApellido.trim());

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: signupPassword,
        options: {
          data: {
            full_name: formattedName,
            custom_name: formattedName,
            tienda_nombre: tiendaSel?.nombre || '',
            sector_nombre: sectorSel?.nombre || ''
          }
        }
      });

      if (signUpErr) {
        throw new Error(translateAuthError(signUpErr.message));
      }

      const newUser = signUpData.user;
      if (newUser) {
        // Limpiar avatar obsoleto en almacenamiento local
        localStorage.removeItem('audimas_collaborator_avatar');
        sessionStorage.removeItem('audimas_collaborator_avatar');

        // Desambiguar nombre automáticamente (ej. JORGE FLORES (1))
        const uniqueName = await resolveUniqueCollaboratorName(formattedName, newUser.id);

        // 2. Insertar/Actualizar perfil en DB con estado 'pendiente_aprobacion' y avatar_url: null
        const newProfilePayload = {
          id: newUser.id,
          email: cleanEmail,
          full_name: uniqueName,
          nombre_apellido: uniqueName,
          telefono: signupTelefono.trim(),
          tienda_codigo: tiendaSel?.codigo || '',
          tienda_nombre: tiendaSel?.nombre || '',
          sector: sectorSel?.nombre || selectedSectorId || '',
          estado: 'pendiente_aprobacion',
          origen: 'Nativo',
          avatar_url: null,
          requiere_onboarding: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        let { error: profErr } = await supabase
          .from('profiles')
          .upsert(newProfilePayload, { onConflict: 'id' });

        if (profErr && (profErr.message.includes('avatar_url') || profErr.message.includes('schema cache') || profErr.message.includes('column'))) {
          console.warn('⚠️ Reintentando upsert de registro sin avatar_url por falta de columna en esquema:', profErr.message);
          const fallbackPayload = { ...newProfilePayload };
          delete (fallbackPayload as any).avatar_url;
          const retryRes = await supabase
            .from('profiles')
            .upsert(fallbackPayload, { onConflict: 'id' });
          profErr = retryRes.error;
        }

        if (profErr) {
          console.warn('⚠️ No se pudo registrar profile en DB:', profErr.message);
        }

        // Cierre de sesión preventivo para evitar ingreso no aprobado
        await supabase.auth.signOut();

        const okMsg = "Tu solicitud fue enviada y está en proceso de revisión. El Administrador del sistema debe autorizar tu cuenta para que puedas acceder a la suite.";
        setSuccessMsg(okMsg);
        setMode('LOGIN');
        setEmail(cleanEmail);
        setPassword('');
        
        // Reset form completamente para evitar reenvíos accidentales
        setNombreApellido('');
        setSignupEmail('');
        setSignupTelefono('');
        setSignupPassword('');
        setSignupConfirmPassword('');
      }
    } catch (err: any) {
      console.error('Error al registrar colaborador:', err);
      setErrorMsg(translateAuthError(err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validar Clave Maestra de SuperAdmin
  const handleValidateSuperAdminKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuperAdminError(null);
    setValidatingMasterKey(true);

    try {
      const masterKey = await getSuperAdminMasterKey();
      if (superAdminKeyInput.trim() === masterKey.trim()) {
        setIsSuperAdminModalOpen(false);
        setSuperAdminKeyInput('');
        if (onSuperAdminAccess) {
          onSuperAdminAccess();
        }
      } else {
        setSuperAdminError('Clave Maestra incorrecta. Inténtalo de nuevo.');
      }
    } catch (err) {
      setSuperAdminError('Error al verificar la Clave Maestra.');
    } finally {
      setValidatingMasterKey(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col justify-between font-sans select-none p-3 sm:p-6 relative overflow-y-auto">
      
      {/* Botón Acceso SuperAdmin Flotante en Pantallas Desktop (md:) */}
      {mode === 'LOGIN' && (
        <button
          type="button"
          onClick={() => {
            setSuperAdminError(null);
            setSuperAdminKeyInput('');
            setIsSuperAdminModalOpen(true);
          }}
          className="hidden md:flex fixed top-4 right-4 z-40 px-4 py-2 bg-[#061838]/90 hover:bg-[#0c244d] border border-amber-400/50 text-amber-300 hover:text-amber-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl items-center space-x-1.5 shadow-xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
          title="Acceso Administrador"
        >
          <Shield className="w-4 h-4 text-amber-400" />
          <span>Acceso SuperAdmin</span>
        </button>
      )}

      {/* Header Fijo (Solo visible en Iniciar Sesión para evitar duplicado en Registro) */}
      {mode === 'LOGIN' && (
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
      )}

      {/* Main Container - Card de Autenticación Native (my-auto equilibra el aire superior e inferior) */}
      <main className="my-auto max-w-md w-full mx-auto p-6 sm:p-7 bg-[#061838]/90 border border-sky-500/30 backdrop-blur-xl rounded-3xl shadow-2xl space-y-4 sm:space-y-5 text-center animate-fade-in relative overflow-hidden">
        
        {/* Soft Ambient Glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Logo Protagonista Original */}
        <div className="flex flex-col items-center justify-center space-y-2 pt-1">
          <img 
            src="/pwa-192x192.png?v=2" 
            alt="OperaMAS Logo" 
            className="w-20 h-20 rounded-3xl object-contain drop-shadow-2xl border-2 border-sky-400/30" 
          />
          <div>
            <h2 className="font-['Chakra_Petch'] font-black text-xl text-white uppercase tracking-wider leading-tight">
              {mode === 'LOGIN' ? 'Ingreso Colaboradores' : 'Registro de Colaborador'}
            </h2>
            <p className="text-xs text-sky-300/90 font-medium mt-0.5">
              Plataforma de Auditoría Logística y Operaciones
            </p>
          </div>
        </div>

        {/* Selector de Pestañas Login vs SignUp */}
        <div className="grid grid-cols-2 gap-1 bg-[#020b18] p-1 rounded-2xl border border-sky-500/20">
          <button
            type="button"
            onClick={() => {
              setMode('LOGIN');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              mode === 'LOGIN'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Iniciar Sesión</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('SIGNUP');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              mode === 'SIGNUP'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Registrarse</span>
          </button>
        </div>

        {/* Mensajes de Notificación */}
        {errorMsg && (
          <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-2xl flex items-center space-x-2 text-red-200 text-xs text-left shadow-md">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="leading-tight">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-950/90 border-2 border-emerald-500/50 rounded-2xl flex flex-col space-y-1.5 text-emerald-100 text-xs text-left shadow-xl backdrop-blur-md animate-fade-in">
            <div className="flex items-center space-x-2 text-emerald-400 font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>¡Registro recibido con éxito!</span>
            </div>
            <p className="text-emerald-200/90 text-xs leading-relaxed font-medium pl-7">
              "{successMsg}"
            </p>
          </div>
        )}

        {/* FORMA 1: INICIAR SESIÓN */}
        {mode === 'LOGIN' && (
          <div className="space-y-3.5">
            {/* Botón Prominente "Continuar con Google" */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-['Inter'] font-bold text-xs rounded-2xl flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl transition-all cursor-pointer border border-slate-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            {/* Separador Elegante */}
            <div className="relative flex items-center justify-center my-3 text-[11px] font-mono text-sky-300/70 uppercase">
              <div className="border-t border-sky-500/20 w-full" />
              <span className="bg-[#061838] px-2 shrink-0 text-[10px] font-semibold text-slate-400">
                o con tu correo y contraseña
              </span>
              <div className="border-t border-sky-500/20 w-full" />
            </div>

            <form onSubmit={handleLogin} autoComplete="on" className="space-y-3.5 text-left">
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Mail className="w-3 h-3 text-sky-400" />
                <span>Correo Electrónico</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                required
                autoComplete="username"
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Lock className="w-3 h-3 text-sky-400" />
                <span>Contraseña</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Ingresar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
        )}

        {/* FORMA 2: REGISTRO DE NUEVO COLABORADOR */}
        {mode === 'SIGNUP' && (
          <form onSubmit={handleSignUp} className="space-y-3 text-left">
            
            {/* Nombre y Apellido */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <User className="w-3 h-3 text-sky-400" />
                <span>Nombre y Apellido</span>
              </label>
              <input
                type="text"
                value={nombreApellido}
                onChange={(e) => setNombreApellido(formatToTitleCase(e.target.value))}
                placeholder="Ej. Carlos Gómez"
                required
                autoCapitalize="words"
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium capitalize"
              />
            </div>

            {/* Correo Electrónico */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Mail className="w-3 h-3 text-sky-400" />
                <span>Correo Electrónico</span>
              </label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                required
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium"
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
                value={signupTelefono}
                onChange={(e) => setSignupTelefono(e.target.value)}
                placeholder="Ej. 3881234567"
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400 font-medium"
              />
            </div>

            {/* Contraseña y Confirmar */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Mín. 6 min"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1">
                  Repetir Clave
                </label>
                <input
                  type="password"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  placeholder="Repetir"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            {/* Selector de Tienda */}
            <div>
              <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Store className="w-3 h-3 text-sky-400" />
                <span>Tienda Asignada</span>
              </label>
              <select
                value={selectedTiendaId}
                onChange={(e) => setSelectedTiendaId(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-sky-400"
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
                <span>Sector de Trabajo</span>
              </label>
              <select
                value={selectedSectorId}
                onChange={(e) => setSelectedSectorId(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-sky-400"
              >
                {sectores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#061838] text-white">
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando Registro...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Solicitar Registro</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer Seguridad */}
        <div className="pt-2 border-t border-sky-500/10 flex items-center justify-center space-x-1.5 text-[11px] text-sky-300/80 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Autenticación Nativa AudiMAS</span>
        </div>
      </main>

      {/* Bloque Inferior: Botón Acceso SuperAdmin (Solo Móviles) + Footer Copyright */}
      <div className="pt-2 pb-2 shrink-0 flex flex-col items-center justify-center space-y-2 mt-2">
        {/* Botón Acceso SuperAdmin en Móvil (md:hidden) */}
        {mode === 'LOGIN' && (
          <button
            type="button"
            onClick={() => {
              setSuperAdminError(null);
              setSuperAdminKeyInput('');
              setIsSuperAdminModalOpen(true);
            }}
            className="md:hidden px-4 py-2 bg-[#061838]/80 hover:bg-[#0c244d] border border-amber-400/40 text-amber-300 hover:text-amber-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1.5 shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Acceso SuperAdmin</span>
          </button>
        )}

        {/* Footer Copyright */}
        <footer className="text-center text-[10px] text-slate-400 font-mono">
          OperaMAS Suite • Auditoría Logística y Operaciones
        </footer>
      </div>

      {/* MODAL DE CLAVE MAESTRA SUPERADMIN */}
      {isSuperAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#061838] border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center relative">
            
            <div className="w-12 h-12 bg-amber-500/20 border border-amber-400/40 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-lg">
              <Key className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-['Chakra_Petch'] font-black text-lg text-white uppercase tracking-wider">
                Acceso SuperAdmin
              </h3>
              <p className="text-xs text-amber-300/80 font-medium mt-1">
                Ingresa la Clave Maestra de Seguridad para acceder a la Consola Central.
              </p>
            </div>

            {superAdminError && (
              <div className="p-2.5 bg-red-950/80 border border-red-500/40 rounded-xl flex items-center space-x-2 text-red-200 text-xs text-left">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{superAdminError}</span>
              </div>
            )}

            <form onSubmit={handleValidateSuperAdminKey} className="space-y-3">
              <input
                type="password"
                value={superAdminKeyInput}
                onChange={(e) => setSuperAdminKeyInput(e.target.value)}
                placeholder="Clave Maestra..."
                autoFocus
                required
                className="w-full px-3.5 py-2.5 bg-[#020b18] border border-amber-500/40 rounded-xl text-white text-center text-sm font-mono tracking-widest placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />

              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsSuperAdminModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={validatingMasterKey}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {validatingMasterKey ? 'Validando...' : 'Ingresar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
