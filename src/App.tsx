import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Truck, 
  Database, 
  CheckCircle, 
  Scan, 
  Plus, 
  PieChart,
  Building2,
  Lock,
  Trash2,
  Menu,
  UserCheck,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock, 
  Loader2,
  RotateCcw,
  Eye,
  Play,
  DollarSign
} from 'lucide-react';
import { supabase } from './services/supabase';
import { 
  reabrirCamionNae, 
  formatDateTimeArg, 
  fetchMaxLogDateForTruck, 
  resolveCamionFechas,
  fetchTrazabilidadCamion,
  obtenerEventosTrazabilidadOrdenados,
  EventoTrazabilidad,
  enriquecerCamionesConLogsParciales

} from './services/reportService';
import { purgeCamionPhotos } from './services/storageService';
import { eliminarCamionEnCascada, purgerCamionesFinalizadosMayores7Dias } from './services/historyService';
import { formatStoreDisplay } from './services/excelParsers';
import { isCamionCierreParcial, CamionNAE } from './types';
import { CargarCamionView } from './components/CargarCamionView';
import { CargarMaestroView } from './components/CargarMaestroView';
import { ScannerView } from './components/ScannerView';
import { CierreAuditoriaView } from './components/CierreAuditoriaView';
import { ConfirmModal } from './components/ConfirmModal';
import { SidebarDrawer } from './components/SidebarDrawer';
import { CollaboratorProfileModal } from './components/CollaboratorProfileModal';
import { HistorialReportesView } from './components/HistorialReportesView';
import { ShareModal } from './components/ShareModal';
import { HubView } from './components/HubView';
import { BandeMasView } from './components/BandeMasView';
import { BottomNavCapsule } from './components/BottomNavCapsule';
import { LoginView } from './components/LoginView';
import { ConfigModalidadView } from './components/ConfigModalidadView';
import { AdjuntarAPView } from './components/AdjuntarAPView';
import { ModalModalidadAuditoria } from './components/ModalModalidadAuditoria';
import { ReclamosMagmaView } from './components/ReclamosMagmaView';
import { DashboardView } from './components/DashboardView';
import { OnboardingModal } from './components/OnboardingModal';
import { SuperAdminView } from './components/SuperAdminView';
import { CamionesPlusView } from './components/CamionesPlusView';
import { ProfileColaborador } from './types';
import { getBadgeClasificacionCarga, getBadgeModalidadAuditoria } from './utils/cargoUtils';


type ViewMode = 'HUB' | 'LIST' | 'SCAN' | 'CIERRE' | 'UPLOAD_NAE' | 'UPLOAD_MAESTRO' | 'HISTORIAL' | 'BANDEMAS' | 'CONFIG_MODALIDAD' | 'ADJUNTAR_AP' | 'RECLAMOS_MAGMA' | 'DASHBOARD' | 'SUPERADMIN' | 'CAMIONES_PLUS';

const getInitialViewState = (): { view: ViewMode; naeId: string | null } => {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view') as ViewMode | null;
    const urlNae = params.get('nae');

    const storedView = (localStorage.getItem('audimas_current_view') || sessionStorage.getItem('audimas_current_view')) as ViewMode | null;
    const storedNae = localStorage.getItem('audimas_active_nae') || sessionStorage.getItem('audimas_active_nae');
    const isSuperAdminStored = localStorage.getItem('audimas_superadmin_active') === 'true';

    const validViews: ViewMode[] = ['HUB', 'LIST', 'SCAN', 'CIERRE', 'UPLOAD_NAE', 'UPLOAD_MAESTRO', 'HISTORIAL', 'BANDEMAS', 'CONFIG_MODALIDAD', 'ADJUNTAR_AP', 'RECLAMOS_MAGMA', 'DASHBOARD', 'SUPERADMIN', 'CAMIONES_PLUS'];
    
    let finalView: ViewMode = (urlView && validViews.includes(urlView))
      ? urlView 
      : (storedView && validViews.includes(storedView) ? storedView : (isSuperAdminStored ? 'SUPERADMIN' : 'HUB'));

    if (isSuperAdminStored) {
      finalView = 'SUPERADMIN';
    }

    let finalNae: string | null = urlNae || storedNae || null;

    if ((finalView === 'SCAN' || finalView === 'CIERRE' || finalView === 'CONFIG_MODALIDAD' || finalView === 'ADJUNTAR_AP') && !finalNae) {
      finalView = 'LIST';
    }

    return { view: finalView, naeId: finalNae };
  } catch {
    return { view: 'HUB', naeId: null };
  }
};

export const App: React.FC = () => {
  // Estado de Autenticación Supabase (Google OAuth PKCE)
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  
  const [activeNaeId, setActiveNaeId] = useState<string | null>(() => getInitialViewState().naeId);
  const [currentView, setCurrentView] = useState<ViewMode>(() => getInitialViewState().view);
  
  // Estado inicial de camiones recuperado al instante desde caché local
  const [camiones, setCamiones] = useState<CamionNAE[]>(() => {
    try {
      const cached = localStorage.getItem('audimas_camiones_cache');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [lastNotification, setLastNotification] = useState<string | null>(null);
  const [loadingCamiones, setLoadingCamiones] = useState<boolean>(() => {
    return !localStorage.getItem('audimas_camiones_cache');
  });

  const [expandedTruckIds, setExpandedTruckIds] = useState<Record<string, boolean>>({});

  // Estado del Colaborador Activo y Avatar (Persistencia localStorage)
  const [collaborator, setCollaborator] = useState<string>(() => {
    return (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
  });
  const [collaboratorAvatar, setCollaboratorAvatar] = useState<string>(() => {
    return localStorage.getItem('audimas_collaborator_avatar') || '';
  });
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [tempUser, setTempUser] = useState<string>(collaborator);

  // Estados de SuperAdmin y Perfil de Usuario para Onboarding Transparente
  const [isSuperAdminMode, setIsSuperAdminMode] = useState<boolean>(() => {
    const init = getInitialViewState();
    return init.view === 'SUPERADMIN' || localStorage.getItem('audimas_superadmin_active') === 'true';
  });
  const [userProfile, setUserProfile] = useState<ProfileColaborador | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const isProcessingOnboardingRef = useRef<boolean>(false);

  const handleEnterSuperAdmin = () => {
    setIsSuperAdminMode(true);
    localStorage.setItem('audimas_superadmin_active', 'true');
    localStorage.setItem('audimas_current_view', 'SUPERADMIN');
    sessionStorage.setItem('audimas_current_view', 'SUPERADMIN');
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('view', 'SUPERADMIN');
      window.history.replaceState({ view: 'SUPERADMIN' }, '', window.location.pathname + '?' + params.toString());
    } catch (e) {}
  };

  const handleExitSuperAdmin = () => {
    setIsSuperAdminMode(false);
    localStorage.removeItem('audimas_superadmin_active');
    navigateTo('HUB');
  };

  // Escucha en tiempo real del estado de autenticación de Supabase
  useEffect(() => {
    let isMounted = true;

    const processActiveUser = async (activeSession: any) => {
      if (!isMounted || isProcessingOnboardingRef.current) return;

      if (activeSession?.user) {
        setSession(activeSession);
        setUser(activeSession.user);

        const userObj = activeSession.user;
        const userEmail = userObj.email;

        // Consultar el perfil del usuario en DB para verificar estado y onboarding
        try {
          const isCompletedLocal = localStorage.getItem('onboarding_completed') === 'true';

          const { data: dbProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userObj.id)
            .maybeSingle();

          if (dbProfile) {
            if (dbProfile.estado === 'pendiente_aprobacion' || dbProfile.estado === 'suspendido' || dbProfile.estado === 'inactivo') {
              const blockMsg = dbProfile.estado === 'pendiente_aprobacion'
                ? 'Tu cuenta aún está pendiente de aprobación por el Administrador. No podés ingresar hasta que sea autorizada.'
                : 'Tu cuenta se encuentra suspendida o inactiva. Contactá al Administrador.';
              sessionStorage.setItem('audi_auth_error', blockMsg);
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setUserProfile(null);
              if (isMounted) setIsAuthChecking(false);
              return;
            }

            setUserProfile(dbProfile as ProfileColaborador);

            const sectorFinal = dbProfile.sector || '';
            const isSectorValid = Boolean(
              sectorFinal.trim() !== '' &&
              sectorFinal !== 'Sin Sector Asignado' &&
              sectorFinal !== 'Sin Sector'
            );

            const tiendaFinal = dbProfile.tienda_codigo || dbProfile.tienda_nombre || '';
            const isTiendaValid = Boolean(tiendaFinal.trim() !== '');

            const isTelefonoValid = Boolean(
              dbProfile.telefono &&
              dbProfile.telefono.trim() !== ''
            );

            const isProfileComplete = isTiendaValid && isSectorValid && isTelefonoValid && !dbProfile.requiere_onboarding;

            if (isProfileComplete) {
              setShowOnboardingModal(false);
            } else {
              setShowOnboardingModal(true);
            }

            const profileName = (dbProfile.full_name || dbProfile.nombre_apellido || '').trim();
            if (profileName) {
              const { data: duplicateUser } = await supabase
                .from('profiles')
                .select('id')
                .ilike('full_name', profileName)
                .neq('id', userObj.id)
                .limit(1)
                .maybeSingle();

              if (duplicateUser) {
                // Existe colisión de nombres con otro usuario
                const emailPrefix = userEmail ? userEmail.split('@')[0].toUpperCase() : 'DUP';
                const uniqueName = `${profileName} (${emailPrefix})`.toUpperCase();

                // 1. Actualizar estado local y localStorage
                setCollaborator(uniqueName);
                localStorage.setItem('audimas_collaborator', uniqueName);

                // 2. Persistir el nombre diferenciado en la base de datos
                await supabase
                  .from('profiles')
                  .update({ full_name: uniqueName, updated_at: new Date().toISOString() })
                  .eq('id', userObj.id);

                // 3. Forzar apertura del modal para que el colaborador elija su nombre distintivo
                setIsUserModalOpen(true);
              } else {
                const nameUp = profileName.toUpperCase();
                setCollaborator(nameUp);
                localStorage.setItem('audimas_collaborator', nameUp);
              }
            } else {
              // Asignación por primera vez del nombre de Google OAuth con verificación de duplicado en full_name
              const rawGoogleName = userObj.user_metadata?.full_name || userObj.user_metadata?.name || userEmail?.split('@')[0] || 'COLABORADOR';
              const candidateName = rawGoogleName.trim().toUpperCase();
              const emailPrefix = userEmail ? userEmail.split('@')[0].toUpperCase() : 'USER';

              const { data: duplicateNameUser } = await supabase
                .from('profiles')
                .select('id')
                .ilike('full_name', candidateName)
                .neq('id', userObj.id)
                .limit(1)
                .maybeSingle();

              let assignedName = candidateName;
              if (duplicateNameUser) {
                assignedName = `${candidateName} (${emailPrefix})`;
                setIsUserModalOpen(true);
              }

              setCollaborator(assignedName);
              localStorage.setItem('audimas_collaborator', assignedName);

              await supabase
                .from('profiles')
                .update({ full_name: assignedName, updated_at: new Date().toISOString() })
                .eq('id', userObj.id);
            }
          } else {
            setShowOnboardingModal(true);
          }

          // REGLA ESTRICTA DE PERSISTENCIA DE AVATAR:
          // 1. Primero leer profiles en Supabase: si dbProfile.avatar_url existe y NO es vacío, asignar collaboratorAvatar = dbProfile.avatar_url.
          // 2. Si no hay en DB, revisar localStorage.getItem('audimas_collaborator_avatar').
          // 3. ÚNICAMENTE si ambos están vacíos, utilizar como último recurso session.user.user_metadata.avatar_url / picture.
          const localAvatar = localStorage.getItem('audimas_collaborator_avatar') || '';
          const googleAvatar = userObj.user_metadata?.avatar_url || userObj.user_metadata?.picture || '';
          let resolvedAvatar = '';

          if (dbProfile?.avatar_url && typeof dbProfile.avatar_url === 'string' && dbProfile.avatar_url.trim().startsWith('http')) {
            resolvedAvatar = dbProfile.avatar_url.trim();
          } else if (dbProfile?.avatar_url && typeof dbProfile.avatar_url === 'string' && dbProfile.avatar_url.trim() !== '') {
            resolvedAvatar = dbProfile.avatar_url.trim();
          } else if (localAvatar && typeof localAvatar === 'string' && localAvatar.trim() !== '') {
            resolvedAvatar = localAvatar.trim();
          } else if (googleAvatar && typeof googleAvatar === 'string' && googleAvatar.trim() !== '') {
            resolvedAvatar = googleAvatar.trim();
          }

          if (resolvedAvatar && resolvedAvatar.trim() !== '') {
            setCollaboratorAvatar(resolvedAvatar);
            localStorage.setItem('audimas_collaborator_avatar', resolvedAvatar);
          } else {
            setCollaboratorAvatar('');
            localStorage.removeItem('audimas_collaborator_avatar');
          }
        } catch (e) {
          console.warn('Error al verificar perfil de usuario en DB:', e);
          setShowOnboardingModal(true);
        }

        // Limpieza del querystring de OAuth si existía code
        if (window.location.search.includes('code=') || window.location.hash) {
          const params = new URLSearchParams(window.location.search);
          params.delete('code');
          const cleanQuery = params.toString();
          const cleanUrl = window.location.pathname + (cleanQuery ? '?' + cleanQuery : '');
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } else {
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setCollaboratorAvatar('');
        localStorage.removeItem('audimas_collaborator_avatar');
      }
    };

    // 1. Suscribirse a los cambios de estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (currentSession?.user) {
        processActiveUser(currentSession);
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser(null);
          setSession(null);
          setUserProfile(null);
        }
      }
      if (isMounted) setIsAuthChecking(false);
    });

    // 2. Verificación de sesión persistente activa al recargar
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (activeSession?.user) {
        processActiveUser(activeSession);
      }
    }).catch(err => {
      console.warn('Error al verificar sesión inicial:', err);
    }).finally(() => {
      if (isMounted) {
        setIsAuthChecking(false);
      }
    });


    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Función unificada de navegación con sincronización URL, Storage y Browser History
  const navigateTo = (newView: ViewMode, naeId: string | null = activeNaeId, pushHistory: boolean = true) => {
    setCurrentView(newView);
    setActiveNaeId(naeId);

    try {
      localStorage.setItem('audimas_current_view', newView);
      sessionStorage.setItem('audimas_current_view', newView);

      if (naeId) {
        localStorage.setItem('audimas_active_nae', naeId);
        sessionStorage.setItem('audimas_active_nae', naeId);
      } else {
        localStorage.removeItem('audimas_active_nae');
        sessionStorage.removeItem('audimas_active_nae');
      }

      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) params.delete('code');

      params.set('view', newView);
      if (naeId && (newView === 'SCAN' || newView === 'CIERRE')) {
        params.set('nae', naeId);
      } else {
        params.delete('nae');
      }

      const queryString = params.toString();
      const newUrl = window.location.pathname + (queryString ? '?' + queryString : '');

      if (pushHistory) {
        window.history.pushState({ view: newView, naeId }, '', newUrl);
      } else {
        window.history.replaceState({ view: newView, naeId }, '', newUrl);
      }
    } catch (e) {
      console.warn('Error al sincronizar URL / storage:', e);
    }
  };

  // Restauración y sincronización al montar y escuchador del botón de retroceso (popstate)
  useEffect(() => {
    const initial = getInitialViewState();
    navigateTo(initial.view, initial.naeId, false);

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state && state.view) {
        setCurrentView(state.view);
        setActiveNaeId(state.naeId || null);
        localStorage.setItem('audimas_current_view', state.view);
        sessionStorage.setItem('audimas_current_view', state.view);
        if (state.naeId) {
          localStorage.setItem('audimas_active_nae', state.naeId);
          sessionStorage.setItem('audimas_active_nae', state.naeId);
        }
      } else {
        const restored = getInitialViewState();
        setCurrentView(restored.view);
        setActiveNaeId(restored.naeId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserProfile(null);
      setIsSuperAdminMode(false);
      localStorage.removeItem('audimas_superadmin_active');
      localStorage.removeItem('audimas_current_view');
      sessionStorage.removeItem('audimas_current_view');
      setShowOnboardingModal(false);
      setIsAuthChecking(false);
    } catch (e) {
      console.warn('Error al cerrar sesión:', e);
    }
  };


  // Estados para modal de eliminación de camión
  const [truckToDelete, setTruckToDelete] = useState<CamionNAE | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Estados para modal de reapertura de auditoría
  const [truckToReopen, setTruckToReopen] = useState<CamionNAE | null>(null);
  const [isReopening, setIsReopening] = useState<boolean>(false);

  // Estados para modal de inicio formal de auditoría
  const [truckToStart, setTruckToStart] = useState<CamionNAE | null>(null);
  // Modal para adjuntar tardíamente reporte AP
  const [truckToAttachAp, setTruckToAttachAp] = useState<CamionNAE | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const handleConfirmStartTruck = async () => {
    if (!truckToStart) return;
    setIsStarting(true);
    try {
      const now = new Date().toISOString();
      await supabase
        .from('camiones_nae')
        .update({ 
          estado: 'EN_PROCESO',
          fecha_inicio_auditoria: now,
          usuario_inicio_auditoria: collaborator
        })
        .eq('id', truckToStart.id);

      setCamiones(prev => prev.map(c => {
        if (c.id === truckToStart.id) {
          return {
            ...c,
            estado: 'EN_PROCESO',
            fecha_inicio_auditoria: now,
            usuario_inicio_auditoria: collaborator
          };
        }
        return c;
      }));

      const targetId = truckToStart.id;
      setTruckToStart(null);
      navigateTo('SCAN', targetId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al iniciar la auditoría');
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenDetail = (naeId: string) => {
    navigateTo('SCAN', naeId);
  };

  const handleConfirmReopenTruck = async () => {
    if (!truckToReopen) return;
    const targetId = truckToReopen.id;
    setIsReopening(true);
    try {
      const activeUser = collaborator || 'OPERADOR 1';
      await reabrirCamionNae(targetId, activeUser);
      setTruckToReopen(null);
      await fetchCamiones();
      navigateTo('SCAN', targetId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reabrir la auditoría');
    } finally {
      setIsReopening(false);
    }
  };

  // Helper para formatear fecha y hora de auditoría (GMT-3 Argentina)
  const formatAuditDateTime = (isoString?: string | null): string => {
    return formatDateTimeArg(isoString);
  };

  // Cargar lista de camiones desde Supabase (Optimizado con select de columnas livianas y caché local)
  const fetchCamiones = async () => {
    if (!localStorage.getItem('audimas_camiones_cache') && camiones.length === 0) {
      setLoadingCamiones(true);
    }

    try {
      await purgerCamionesFinalizadosMayores7Dias();

      const { data, error } = await supabase
        .from('camiones_nae')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const enriched = await Promise.all(
          (data as CamionNAE[]).map(async (cam) => {
            const estUpper = (cam.estado || '').trim().toUpperCase();
            const esCerrado = estUpper === 'FINALIZADO' || estUpper === 'CERRADO';
            
            let fechaFin = cam.fecha_fin_auditoria;
            if ((esCerrado || cam.fecha_reapertura) && !cam.fecha_fin_auditoria && !cam.fecha_fin) {
              const maxLog = await fetchMaxLogDateForTruck(cam.id);
              fechaFin = maxLog || cam.created_at;
            }

            let hasDepto91 = false;
            if ((cam.numero_nae || '').trim().startsWith('5')) {
              const { data: items91 } = await supabase
                .from('auditoria_items')
                .select('id')
                .eq('nae_id', cam.id)
                .or('depto_codigo.eq.91,depto_codigo.eq.091,depto_nombre.ilike.%congelado%')
                .limit(1);
              hasDepto91 = Boolean(items91 && items91.length > 0);
            }

            return {
              ...cam,
              fecha_fin_auditoria: fechaFin,
              has_depto_91: hasDepto91
            };
          })
        );

        const fullyEnriched = await enriquecerCamionesConLogsParciales(enriched);

        setCamiones(fullyEnriched);
        try {
          localStorage.setItem('audimas_camiones_cache', JSON.stringify(fullyEnriched));
        } catch (e) {
          console.warn('Error al guardar caché de camiones:', e);
        }
      }
    } catch (e) {
      console.warn('Error al consultar camiones desde Supabase:', e);
    } finally {
      setLoadingCamiones(false);
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      try {
        await supabase.rpc('purgar_camiones_antiguos', { p_dias: 7 });
      } catch (e) {
        console.warn('Purga silenciosa de camiones no ejecutada:', e);
      } finally {
        await fetchCamiones();
      }
    };

    initDashboard();
  }, []);



  const handleOpenScan = async (naeId: string) => {
    navigateTo('SCAN', naeId);

    const targetCamion = camiones.find(c => c.id === naeId);
    const estUpper = (targetCamion?.estado || '').trim().toUpperCase();
    const needsStart = estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE' || !targetCamion?.fecha_inicio_auditoria;

    if (needsStart) {
      const now = new Date().toISOString();
      try {
        await supabase
          .from('camiones_nae')
          .update({ 
            estado: 'EN_PROCESO',
            fecha_inicio_auditoria: now,
            usuario_inicio_auditoria: collaborator
          })
          .eq('id', naeId);

        setCamiones(prev => prev.map(c => {
          if (c.id === naeId) {
            return {
              ...c,
              estado: 'EN_PROCESO',
              fecha_inicio_auditoria: now,
              usuario_inicio_auditoria: collaborator
            };
          }
          return c;
        }));
      } catch (e) {
        console.warn('Error al actualizar estado del camión a EN_PROCESO:', e);
      }
    }
  };

  const handleOpenCierre = (naeId: string) => {
    navigateTo('CIERRE', naeId);
  };

  // Estados para acordeón de trazabilidad de tiempos
  const [trazabilidadMap, setTrazabilidadMap] = useState<Record<string, EventoTrazabilidad[]>>({});

  const toggleTruckTimes = async (naeId: string, camion?: CamionNAE) => {
    const isExpanding = !expandedTruckIds[naeId];
    setExpandedTruckIds(prev => ({ ...prev, [naeId]: isExpanding }));

    if (isExpanding && camion && !trazabilidadMap[naeId]) {
      try {
        const evts = await fetchTrazabilidadCamion(naeId, camion);
        setTrazabilidadMap(prev => ({ ...prev, [naeId]: evts }));
      } catch (e) {
        console.warn('Error al obtener trazabilidad acumulativa:', e);
      }
    }
  };

  // Renderizador de Badges de Estado para Tarjetas de Camión
  const renderEstadoBadge = (camionOrEstado: CamionNAE | string) => {
    const camionObj = typeof camionOrEstado === 'object' ? camionOrEstado : null;
    const estUpper = (typeof camionOrEstado === 'string' ? camionOrEstado : camionOrEstado?.estado || '').trim().toUpperCase();

    if (estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>{estUpper === 'DISPONIBLE' ? 'DISPONIBLE' : 'PENDIENTE'}</span>
        </span>
      );
    }
    if (estUpper === 'EN_PROCESO') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>EN PROCESO</span>
        </span>
      );
    }
    if (isCamionCierreParcial(camionObj || { estado: estUpper as any })) {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 flex items-center space-x-1">
          <Clock className="w-3 h-3 text-amber-400" />
          <span>FINALIZADO PARCIAL</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center space-x-1">
        <Lock className="w-3 h-3 text-purple-400" />
        <span>FINALIZADO</span>
      </span>
    );
  };

  // Confirmar eliminación del camión NAE desde la tarjeta
  const handleConfirmDeleteTruck = async () => {
    if (!truckToDelete) return;
    setIsDeleting(true);

    try {
      await eliminarCamionEnCascada(truckToDelete.id);
      setCamiones(prev => prev.filter(c => c.id !== truckToDelete.id));
      setLastNotification(`Camión NAE ${truckToDelete.numero_nae} y sus registros asociados fueron eliminados exitosamente de la base de datos.`);
    } catch (err) {
      console.error('Error al eliminar camión NAE:', err);
    } finally {
      setIsDeleting(false);
      setTruckToDelete(null);
    }
  };

  // 1. PANTALLA DE CARGA DE CREDENCIALES (Loading Gate para evitar "flashes" al recargar)
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col items-center justify-center space-y-4 font-sans select-none p-4 animate-fade-in">
        <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
        <div className="text-center space-y-1">
          <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">
            Verificando credenciales...
          </p>
          <p className="text-xs text-sky-300/70 font-mono">Sincronizando estado de navegación...</p>
        </div>
      </div>
    );
  }

  // 2. VISTA DE SUPERADMINISTRACIÓN EXCLUSIVA
  if (isSuperAdminMode) {
    return <SuperAdminView onExit={handleExitSuperAdmin} />;
  }

  // 3. VISTA DE LOGIN NATIVO Y ACCESO SUPERADMIN SI NO HAY USUARIO
  if (!user) {
    return (
      <LoginView
        onSuccess={() => {}}
        onSuperAdminAccess={handleEnterSuperAdmin}
      />
    );
  }


  // Renderizado del Dashboard de AudiMAS (Nivel 1)
  const renderAudiMasDashboard = () => {
    // REGLA ESTRICTA: Los camiones en estado 'EN_CONSULTA' son exclusivos de Camiones+ y NO deben listarse en AudiMAS
    const camionesAudiMas = camiones.filter(c => c.estado !== 'EN_CONSULTA');

    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-32">
        {/* Header Principal con Menú Hamburguesa */}
        <header className="sticky top-0 z-30 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2.5">
            <div 
              onClick={() => navigateTo('HUB')}
              className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-['Chakra_Petch'] font-black text-xl text-white shadow-lg shadow-blue-600/40 border border-sky-400/30 cursor-pointer hover:opacity-90 transition-opacity"
              title="Ir al Hub Central OperaMAS"
            >
              A
            </div>
            <div>
              <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-0.5">
                <span className="font-bold text-base text-sky-400">AUDI</span>
                <span className="font-black text-lg text-white">MAS</span>
                <span className="text-xs text-sky-300 font-bold ml-1">V1</span>
              </h1>
              <p className="text-[10px] text-sky-300/80 font-mono tracking-widest uppercase">GESTIÓN DE AUDITORÍA</p>
            </div>
          </div>

          {/* Cápsula de Usuario Discreta */}
          <div 
            onClick={() => setIsDrawerOpen(true)}
            className="bg-[#061224]/80 border border-sky-500/30 rounded-full px-3 py-1.5 flex items-center space-x-2.5 shadow-md backdrop-blur-md cursor-pointer hover:bg-[#0c244d] transition-all select-none"
            title={`Operario: ${collaborator} • Abrir Menú`}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsUserModalOpen(true);
              }}
              className="w-7 h-7 rounded-full bg-[#020b18] overflow-hidden flex items-center justify-center border border-sky-400/40 shrink-0 hover:opacity-90 transition-opacity"
              title="Cambiar Foto / Perfil"
            >
              {collaboratorAvatar ? (
                <img src={collaboratorAvatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="font-['Chakra_Petch'] font-bold text-[10px] text-sky-300">
                  {collaborator.substring(0, 2)}
                </span>
              )}
            </div>

            <span className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate max-w-[120px] sm:max-w-[160px]">
              {collaborator}
            </span>

            <Menu className="w-4 h-4 text-sky-400 shrink-0 ml-0.5" />
          </div>
        </header>

        {/* Main Container */}
        <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
          {/* Banner de Notificación */}
          {lastNotification && (
            <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl flex items-start space-x-3 text-emerald-300 text-xs animate-fade-in shadow-lg">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-['Chakra_Petch'] font-bold uppercase tracking-wider text-emerald-200">Sincronización Completada</p>
                <p className="mt-0.5 text-emerald-300/90 leading-relaxed">{lastNotification}</p>
              </div>
            </div>
          )}

          {/* Lista Principal de Camiones */}
          <div className="space-y-3">
            <div className="px-1 py-0.5">
              <h3 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-widest">
                CAMIONES NAE RECIBIDOS ({camionesAudiMas.length})
              </h3>
            </div>

            {loadingCamiones ? (
              <div className="p-8 text-center text-xs text-sky-400/80 font-mono">Cargando datos de camiones...</div>
            ) : camionesAudiMas.length === 0 ? (
              <div className="p-8 text-center bg-[#061224]/90 border border-sky-500/20 rounded-2xl space-y-3 shadow-xl">
                <Truck className="w-12 h-12 text-slate-600 mx-auto" />
                <div>
                  <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">No hay camiones registrados</p>
                  <p className="text-xs text-slate-400 mt-1">Abre el menú GDS o pulsa abajo para importar un manifiesto NAE.</p>
                </div>
                <button
                  onClick={() => setCurrentView('UPLOAD_NAE')}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl inline-flex items-center space-x-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cargar Camión NAE</span>
                </button>
              </div>
            ) : (
              camionesAudiMas.map((cam) => {
              const estUpper = (cam.estado || '').trim().toUpperCase();
              const esCierreParcial = isCamionCierreParcial(cam);
              const esCerrado = estUpper === 'FINALIZADO' || estUpper === 'CERRADO' || estUpper === 'FINALIZADO_PARCIAL' || estUpper === 'CERRADO_PARCIAL' || esCierreParcial;

              return (
                <div
                  key={cam.id}
                  className={`p-4 bg-[#051329]/90 border rounded-2xl transition-all space-y-3 shadow-xl ${
                    esCerrado ? 'border-sky-500/20 opacity-90' : 'border-sky-500/30 hover:border-sky-400/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-black text-sm text-sky-400">
                        NAE: {cam.numero_nae}
                      </span>
                      {esCerrado && <Lock className="w-3.5 h-3.5 text-red-400" />}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {renderEstadoBadge(cam)}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTruckToDelete(cam);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                        title="Eliminar Camión NAE"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Insignias de Clasificación de Carga y Modalidad Configurada */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {/* Badge 1: Origen y Tipo de Carga */}
                    {(() => {
                      const clasif = getBadgeClasificacionCarga(cam);
                      return (
                        <span className={`px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1 ${clasif.className}`}>
                          <span>{clasif.label}</span>
                        </span>
                      );
                    })()}

                    {/* Badge 2: Modalidad de Auditoría y Umbrales Aplicados */}
                    {(esCerrado || estUpper === 'EN_PROCESO' || cam.fecha_inicio_auditoria) && (() => {
                      const mod = getBadgeModalidadAuditoria(cam);
                      return (
                        <span className={`px-2 py-0.5 rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1 ${mod.className}`}>
                          <span>{mod.label}</span>
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <div className="flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>{formatStoreDisplay(cam.tienda_codigo, cam.tienda_nombre, cam.numero_nae).fullDisplay}</span>
                    </div>
                  </div>

                  {/* Cronología de Marcas de Tiempo en GMT-3 (Trazabilidad Acumulativa Completa de Múltiples Reaperturas) */}
                  {(!esCerrado || Boolean(expandedTruckIds[cam.id])) && (
                    <div className="text-[10px] sm:text-[11px] text-slate-300 font-mono flex items-start space-x-2 pt-1 border-t border-sky-500/10 animate-fade-in">
                      <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <div className="flex flex-col space-y-1.5 leading-tight w-full">
                        <span className="text-[10px] font-['Chakra_Petch'] font-bold text-sky-300 uppercase tracking-widest border-b border-sky-500/10 pb-1">
                          Trazabilidad Cronológica de Auditoría
                        </span>
                        {obtenerEventosTrazabilidadOrdenados(cam, trazabilidadMap[cam.id]).map((evt, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className={evt.tipo.includes('REAPERTURA') ? "text-amber-300 font-semibold" : evt.tipo.includes('CIERRE') ? "text-purple-300 font-medium" : "text-sky-200"}>
                              • {evt.titulo}
                            </span>
                            <span className="text-slate-400 font-mono">
                              {formatDateTimeArg(evt.fecha)}{evt.usuario ? ` • ${evt.usuario}` : ''}
                            </span>
                          </div>
                        ))}

                      </div>
                    </div>
                  )}

                  {/* Botón Acordeón de Trazabilidad para Camiones Finalizados/Cerrados */}
                  {esCerrado && (
                    <button
                      type="button"
                      onClick={() => toggleTruckTimes(cam.id, cam)}
                      className="w-full py-1.5 px-2.5 bg-[#020b18]/60 hover:bg-[#071938] border border-sky-500/20 hover:border-sky-500/40 text-slate-300 hover:text-sky-200 text-[11px] font-mono rounded-xl flex items-center justify-between transition-all active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>{expandedTruckIds[cam.id] ? 'Ocultar trazabilidad' : 'Ver tiempos de trazabilidad'}</span>
                      </div>
                      {expandedTruckIds[cam.id] ? (
                        <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
                      )}
                    </button>
                  )}

                  <div className={`grid gap-2 pt-2 border-t border-sky-500/10 ${esCerrado ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {!esCerrado && (estUpper === 'PENDIENTE' || estUpper === 'DISPONIBLE' || !cam.fecha_inicio_auditoria) ? (
                      <div className="col-span-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {/* Botón VER DETALLE (Modo Consulta) */}
                          <button
                            onClick={() => handleOpenDetail(cam.id)}
                            className="py-2.5 px-2 bg-[#0c2847] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                            title="Ver productos esperados en modo consulta"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                            <span>Ver Detalle</span>
                          </button>

                          {/* Botón INICIAR AUDITORÍA */}
                          <button
                            onClick={() => navigateTo('CONFIG_MODALIDAD', cam.id)}
                            className="py-2.5 px-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-600/30 cursor-pointer transition-all active:scale-95"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Iniciar Auditoría</span>
                          </button>
                        </div>

                        {/* Botón Adjuntar Reporte AP / Costos */}
                        {!cam.tiene_reporte_ap && (
                          <button
                            onClick={() => navigateTo('ADJUNTAR_AP', cam.id)}
                            className="w-full py-2 px-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-purple-500/40 flex items-center justify-center space-x-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                            <span>Adjuntar Reporte AP ($)</span>
                          </button>
                        )}
                      </div>
                    ) : !esCerrado ? (
                      <>
                        {/* Botón CONTINUAR AUDITORÍA */}
                        <button
                          onClick={() => handleOpenScan(cam.id)}
                          className="py-2.5 px-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1 shadow-md shadow-blue-600/30 cursor-pointer transition-all active:scale-95"
                        >
                          <Scan className="w-3.5 h-3.5" />
                          <span>Continuar</span>
                        </button>

                        {/* Botón REPORTE / CIERRE */}
                        <button
                          onClick={() => handleOpenCierre(cam.id)}
                          className="py-2.5 px-2 bg-[#0c2847] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1 shadow-md cursor-pointer transition-all active:scale-95"
                        >
                          <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Reporte</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Camión Finalizado / Cerrado */}
                        <button
                          onClick={() => handleOpenScan(cam.id)}
                          className="py-2.5 px-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1 shadow-md shadow-blue-600/30 cursor-pointer transition-all active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </button>

                        <button
                          onClick={() => handleOpenCierre(cam.id)}
                          className="py-2.5 px-2 bg-[#0c2847] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1 shadow-md cursor-pointer transition-all active:scale-95"
                        >
                          <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Reporte</span>
                        </button>

                        <button
                          onClick={() => setTruckToReopen(cam)}
                          className="py-2.5 px-2 bg-[#0c2847] hover:bg-[#163a75] text-amber-300 hover:text-amber-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-amber-500/30 flex items-center justify-center space-x-1 shadow-md cursor-pointer transition-all active:scale-95"
                          title="Reabrir Auditoría para continuar escaneando"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                          <span>Reabrir</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Cápsula Flotante en Nivel 1 (Dashboard de Camiones) */}
      <BottomNavCapsule
        onBack={() => navigateTo('HUB')}
        onHome={() => navigateTo('HUB')}
      />
      </div>
    );
  };

  // Selector de la vista activa según currentView
  const renderCurrentView = () => {
    switch (currentView) {
      case 'HUB':
        return (
          <HubView
            onOpenAudiMas={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onOpenBandeMas={() => navigateTo('BANDEMAS')}
            onOpenCamionesPlus={() => navigateTo('CAMIONES_PLUS')}
            collaboratorName={collaborator}
            collaboratorAvatar={collaboratorAvatar}
            onOpenProfile={() => setIsUserModalOpen(true)}
            onOpenDrawer={() => setIsDrawerOpen(true)}
          />
        );

      case 'CAMIONES_PLUS':
        return (
          <CamionesPlusView
            onBack={() => navigateTo('HUB')}
            collaboratorName={collaborator}
            initialNaeId={activeNaeId}
          />
        );

      case 'BANDEMAS':
        return (
          <BandeMasView
            onBack={() => navigateTo('HUB')}
            onHome={() => navigateTo('HUB')}
          />
        );

      case 'SCAN':
        if (!activeNaeId) return null;
        return (
          <div className="relative min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26]">
            <ScannerView
              naeId={activeNaeId}
              collaboratorName={collaborator}
              onBack={() => {
                fetchCamiones();
                navigateTo('LIST');
              }}
              onHome={() => navigateTo('HUB')}
              onOpenCierre={() => navigateTo('CIERRE', activeNaeId)}
              onOpenConfigModalidad={() => navigateTo('CONFIG_MODALIDAD', activeNaeId)}
            />
          </div>
        );

      case 'CIERRE':
        if (!activeNaeId) return null;
        return (
          <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26]">
            <CierreAuditoriaView
              naeId={activeNaeId}
              onBackToScan={() => navigateTo('SCAN', activeNaeId)}
              onHome={() => navigateTo('HUB')}
              onNaeClosed={() => fetchCamiones()}
            />
          </div>
        );

      case 'UPLOAD_NAE':
        return (
          <CargarCamionView
            onBack={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onHome={() => navigateTo('HUB')}
            onSuccess={async (_naeId, totalItems) => {
              await fetchCamiones();
              setLastNotification(`Camión NAE importado exitosamente (${totalItems ? totalItems.toLocaleString() : 'varios'} ítems) en estado PENDIENTE. Presiona "Escanear" para iniciar auditoría.`);
              navigateTo('LIST');
            }}
          />
        );

      case 'UPLOAD_MAESTRO':
        return (
          <CargarMaestroView
            onBack={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onHome={() => navigateTo('HUB')}
            onSuccess={(totalUploaded) => {
              fetchCamiones();
              setLastNotification(`Catálogo maestro actualizado exitosamente con ${totalUploaded.toLocaleString()} artículos.`);
              navigateTo('LIST');
            }}
          />
        );

      case 'CONFIG_MODALIDAD':
        return (
          <ConfigModalidadView
            naeId={activeNaeId || ''}
            onBack={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onConfirmSuccess={(naeId) => {
              fetchCamiones();
              navigateTo('SCAN', naeId);
            }}
          />
        );

      case 'ADJUNTAR_AP':
        return (
          <AdjuntarAPView
            naeId={activeNaeId || ''}
            onBack={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onStartAudit={(naeId) => {
              fetchCamiones();
              navigateTo('CONFIG_MODALIDAD', naeId);
            }}
          />
        );

      case 'HISTORIAL':
        return (
          <HistorialReportesView
            onBack={() => {
              fetchCamiones();
              navigateTo('LIST');
            }}
            onOpenScan={(naeId) => navigateTo('SCAN', naeId)}
            onOpenCierre={(naeId) => navigateTo('CIERRE', naeId)}
            onReopenAndScan={async (naeId) => {
              await fetchCamiones();
              navigateTo('SCAN', naeId);
            }}
          />
        );

      case 'RECLAMOS_MAGMA':
        return (
          <div className="pt-4 pb-20">
            <BottomNavCapsule
              onBack={() => navigateTo('LIST')}
              onHome={() => navigateTo('HUB')}
            />
            <ReclamosMagmaView camiones={camiones} onRefreshCamiones={fetchCamiones} />
          </div>
        );

      case 'DASHBOARD':
        return (
          <div className="pt-4 pb-20">
            <BottomNavCapsule
              onBack={() => navigateTo('HUB')}
              onHome={() => navigateTo('HUB')}
            />
            <DashboardView camiones={camiones} onRefresh={fetchCamiones} />
          </div>
        );

      case 'LIST':
      default:
        return renderAudiMasDashboard();
    }
  };

  // LAYOUT GENERAL PERSISTENTE CON MENÚ LATERAL Y PESTAÑA FLOTANTE SOBRE TODAS LAS VISTAS
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26]">
      {/* Pestaña Flotante Activadora del Drawer Lateral (Presente en TODAS las pantallas) */}
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        className="fixed top-20 right-0 z-40 bg-[#061224]/90 border-l border-y border-sky-500/40 text-sky-300 shadow-xl shadow-blue-950/80 rounded-l-xl p-2.5 backdrop-blur-md cursor-pointer hover:bg-[#0c244d] hover:text-white active:scale-95 transition-all flex items-center justify-center"
        title="Abrir Menú Principal"
      >
        <ChevronLeft className="w-5 h-5 text-sky-400 animate-pulse" />
      </button>

      {/* Renderizado de la Vista Actual */}
      {renderCurrentView()}

      {/* Sidebar Drawer Persistente en Toda la Aplicación */}
      <SidebarDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        collaboratorName={collaborator}
        collaboratorAvatar={collaboratorAvatar}
        userEmail={session?.user?.email}
        currentView={currentView}
        onGoHub={() => {
          navigateTo('HUB');
          setIsDrawerOpen(false);
        }}
        onGoDashboard={() => {
          fetchCamiones();
          navigateTo('LIST');
          setIsDrawerOpen(false);
        }}
        onOpenDashboardGerencial={() => {
          fetchCamiones();
          navigateTo('DASHBOARD');
          setIsDrawerOpen(false);
        }}
        onOpenCamionesPlus={() => {
          navigateTo('CAMIONES_PLUS');
          setIsDrawerOpen(false);
        }}
        onOpenCargarCamion={() => {
          navigateTo('UPLOAD_NAE');
          setIsDrawerOpen(false);
        }}
        onOpenCatalogoMaestro={() => {
          navigateTo('UPLOAD_MAESTRO');
          setIsDrawerOpen(false);
        }}
        onOpenHistorialReportes={() => {
          navigateTo('HISTORIAL');
          setIsDrawerOpen(false);
        }}
        onOpenReclamosMagma={() => {
          navigateTo('RECLAMOS_MAGMA');
          setIsDrawerOpen(false);
        }}
        onOpenBandeMas={() => {
          navigateTo('BANDEMAS');
          setIsDrawerOpen(false);
        }}
        onOpenShareApp={() => setIsShareModalOpen(true)}
        onChangeCollaborator={() => setIsUserModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Modales Persistentes */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      <CollaboratorProfileModal
        isOpen={isUserModalOpen}
        currentName={collaborator}
        currentAvatar={collaboratorAvatar}
        onClose={() => setIsUserModalOpen(false)}
        onSave={(name, avatar) => {
          setCollaborator(name);
          setCollaboratorAvatar(avatar);
          localStorage.setItem('audimas_collaborator', name);
          localStorage.setItem('audimas_collaborator_avatar', avatar);
          setIsUserModalOpen(false);
        }}
      />

      {/* Modal Onboarding Obligatorio para Migración / Perfil Incompleto */}
      {showOnboardingModal && user && (
        <OnboardingModal
          user={user}
          profile={userProfile}
          onComplete={async (updatedProfile) => {
            isProcessingOnboardingRef.current = true;

            if (updatedProfile.estado === 'pendiente_aprobacion') {
              sessionStorage.setItem('audi_auth_error', "¡Perfil completado! Tu cuenta está pendiente de aprobación por el Administrador antes de poder ingresar.");
              setShowOnboardingModal(false);
              setUserProfile(null);
              setUser(null);
              setSession(null);
              await supabase.auth.signOut();
              isProcessingOnboardingRef.current = false;
              return;
            }

            // 1. Forzar de inmediato el cierre del modal
            setShowOnboardingModal(false);

            // 2. Actualizar de forma directa y síncrona los estados globales
            setUserProfile(updatedProfile);

            const upperName = (updatedProfile.full_name || updatedProfile.nombre_apellido || '').toUpperCase();
            if (upperName) {
              setCollaborator(upperName);
              localStorage.setItem('audimas_collaborator', upperName);
            }

            const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
            const avatarUrl = updatedProfile.avatar_url || googleAvatar || '';
            setCollaboratorAvatar(avatarUrl);
            if (avatarUrl) {
              localStorage.setItem('audimas_collaborator_avatar', avatarUrl);
            } else {
              localStorage.removeItem('audimas_collaborator_avatar');
            }

            // 3. Establecer la vista activa directamente a HUB
            navigateTo('HUB');

            setTimeout(() => {
              isProcessingOnboardingRef.current = false;
            }, 1000);
          }}
        />
      )}


      {/* Modal Eliminar Camión */}
      <ConfirmModal
        isOpen={!!truckToDelete}
        title="Eliminar Camión NAE"
        message={`¿Estás seguro de que deseas eliminar el camión NAE "${truckToDelete?.numero_nae}" y toda su auditoría? Esta acción no se puede deshacer.`}
        confirmText="Sí, Eliminar"
        cancelText="Cancelar"
        isProcessing={isDeleting}
        onClose={() => setTruckToDelete(null)}
        onConfirm={handleConfirmDeleteTruck}
      />

      {/* Modal Reabrir Auditoría */}
      <ConfirmModal
        isOpen={!!truckToReopen}
        title="Reabrir Auditoría de Camión NAE"
        message={`¿Estás seguro de que deseas reabrir la auditoría del camión NAE "${truckToReopen?.numero_nae}"? El estado cambiará a EN PROCESO y el equipo podrá continuar escaneando conservando todos los datos.`}
        confirmText="Sí, Reabrir Auditoría"
        cancelText="Cancelar"
        isProcessing={isReopening}
        onClose={() => setTruckToReopen(null)}
        onConfirm={handleConfirmReopenTruck}
      />

      {/* Modal Seleccionar Modalidad e Iniciar Auditoría desde Tarjeta */}
      <ModalModalidadAuditoria
        isOpen={!!truckToStart}
        naeId={truckToStart?.id || ''}
        numeroNae={truckToStart?.numero_nae || ''}
        tieneReporteAp={truckToStart?.tiene_reporte_ap}
        montoTotalEsperado={truckToStart?.monto_total_esperado}
        currentModo={truckToStart?.modo_auditoria || 'TOTAL'}
        currentMetaMonto={truckToStart?.meta_monto}
        currentMetaUnidades={truckToStart?.meta_unidades}
        currentMetaPorcentaje={truckToStart?.meta_porcentaje}
        onClose={() => setTruckToStart(null)}
        onConfirm={(modo, metaMonto, metaUnidades, metaPorcentaje) => {
          if (truckToStart) {
            const targetId = truckToStart.id;
            const now = new Date().toISOString();
            setCamiones(prev => prev.map(c => {
              if (c.id === targetId) {
                return {
                  ...c,
                  estado: 'EN_PROCESO',
                  fecha_inicio_auditoria: c.fecha_inicio_auditoria || now,
                  modo_auditoria: modo,
                  meta_monto: metaMonto,
                  meta_unidades: metaUnidades,
                  meta_porcentaje: metaPorcentaje
                };
              }
              return c;
            }));
            setTruckToStart(null);
            navigateTo('SCAN', targetId);
          }
        }}
      />
    </div>
  );
};

export default App;
