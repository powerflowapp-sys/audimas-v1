import React, { useState, useEffect } from 'react';
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
  Clock
} from 'lucide-react';
import { supabase } from './services/supabase';
import { CargarCamionView } from './components/CargarCamionView';
import { CargarMaestroView } from './components/CargarMaestroView';
import { ScannerView } from './components/ScannerView';
import { CierreAuditoriaView } from './components/CierreAuditoriaView';
import { ConfirmModal } from './components/ConfirmModal';
import { SidebarDrawer } from './components/SidebarDrawer';
import { CollaboratorProfileModal } from './components/CollaboratorProfileModal';
import { HistorialReportesView } from './components/HistorialReportesView';
import { ShareModal } from './components/ShareModal';
import { CamionNAE } from './types';

type ViewMode = 'LIST' | 'SCAN' | 'CIERRE' | 'UPLOAD_NAE' | 'UPLOAD_MAESTRO' | 'HISTORIAL';

export const App: React.FC = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [activeNaeId, setActiveNaeId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('LIST');
  
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

  // Estado del Colaborador Activo y Avatar (Persistencia localStorage)
  const [collaborator, setCollaborator] = useState<string>(() => {
    return (localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();
  });
  const [collaboratorAvatar, setCollaboratorAvatar] = useState<string>(() => {
    return localStorage.getItem('audimas_collaborator_avatar') || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos&backgroundColor=001040';
  });
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [tempUser, setTempUser] = useState<string>(collaborator);

  // Estados para modal de eliminación de camión
  const [truckToDelete, setTruckToDelete] = useState<CamionNAE | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Helper para formatear fecha y hora de auditoría (Inicio y Cierre)
  const formatAuditDateTime = (isoString?: string, shortYear = false): string => {
    if (!isoString) return '--/--/-- --:--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--/--/-- --:--';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = shortYear ? String(d.getFullYear()).slice(-2) : String(d.getFullYear());
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes} hs`;
  };

  // Cargar lista de camiones desde Supabase (Optimizado con select de columnas livianas y caché local)
  const fetchCamiones = async () => {
    // Si no hay datos cargados, mostramos spinner
    if (!localStorage.getItem('audimas_camiones_cache') && camiones.length === 0) {
      setLoadingCamiones(true);
    }

    try {
      const { data, error } = await supabase
        .from('camiones_nae')
        .select('id, numero_nae, tienda_codigo, tienda_nombre, estado, fecha_inicio_auditoria, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCamiones(data as CamionNAE[]);
        try {
          localStorage.setItem('audimas_camiones_cache', JSON.stringify(data));
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
    setActiveNaeId(naeId);
    setCurrentView('SCAN');

    const targetCamion = camiones.find(c => c.id === naeId);
    const estUpper = (targetCamion?.estado || '').trim().toUpperCase();
    const needsStart = estUpper === 'PENDIENTE' || !targetCamion?.fecha_inicio_auditoria;

    if (needsStart) {
      const now = new Date().toISOString();
      try {
        await supabase
          .from('camiones_nae')
          .update({ 
            estado: 'EN_PROCESO',
            fecha_inicio_auditoria: now 
          })
          .eq('id', naeId);

        // Actualizar el estado local para reflejar el cambio de badge e inicio inmediatamente
        setCamiones(prev => prev.map(c => {
          if (c.id === naeId) {
            return {
              ...c,
              estado: 'EN_PROCESO',
              fecha_inicio_auditoria: now
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
    setActiveNaeId(naeId);
    setCurrentView('CIERRE');
  };

  // Renderizador de Badges de Estado para Tarjetas de Camión
  const renderEstadoBadge = (estado: string) => {
    const estUpper = (estado || '').trim().toUpperCase();
    if (estUpper === 'PENDIENTE') {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-['Chakra_Petch'] font-extrabold uppercase rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/30 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>PENDIENTE</span>
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
    // FINALIZADO / CERRADO
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
      const { error } = await supabase.rpc('eliminar_camion_nae', { p_nae_id: truckToDelete.id });
      if (error) {
        await supabase.from('camiones_nae').delete().eq('id', truckToDelete.id);
      }
      setCamiones(prev => prev.filter(c => c.id !== truckToDelete.id));
      setLastNotification(`Camión NAE ${truckToDelete.numero_nae} eliminado de la base de datos.`);
    } catch (err) {
      console.error('Error al eliminar camión NAE:', err);
    } finally {
      setIsDeleting(false);
      setTruckToDelete(null);
    }
  };

  // VISTA 2: PANTALLA OPERATIVA DE ESCANEO REALTIME
  if (currentView === 'SCAN' && activeNaeId) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d]">
        <ScannerView
          naeId={activeNaeId}
          collaboratorName={collaborator}
          onBack={() => {
            fetchCamiones();
            setCurrentView('LIST');
          }}
          onHome={() => {
            fetchCamiones();
            setCurrentView('LIST');
          }}
          onOpenCierre={() => setCurrentView('CIERRE')}
        />
      </div>
    );
  }

  // VISTA 3: PANTALLA DE CIERRE, CONCILIACIÓN Y EXPORTACIÓN A EXCEL
  if (currentView === 'CIERRE' && activeNaeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d]">
        <CierreAuditoriaView
          naeId={activeNaeId}
          onBackToScan={() => setCurrentView('SCAN')}
          onHome={() => {
            fetchCamiones();
            setCurrentView('LIST');
          }}
          onNaeClosed={() => fetchCamiones()}
        />
      </div>
    );
  }

  // VISTA 4: PANTALLA COMPLETA PARA IMPORTAR CAMIÓN NAE
  if (currentView === 'UPLOAD_NAE') {
    return (
      <CargarCamionView
        onBack={() => {
          fetchCamiones();
          setCurrentView('LIST');
        }}
        onHome={() => {
          fetchCamiones();
          setCurrentView('LIST');
        }}
        onSuccess={async (_naeId, totalItems) => {
          await fetchCamiones();
          setLastNotification(`Camión NAE importado exitosamente (${totalItems ? totalItems.toLocaleString() : 'varios'} ítems) en estado PENDIENTE. Presiona "Escanear" para iniciar auditoría.`);
          setCurrentView('LIST');
        }}
      />
    );
  }

  // VISTA 5: PANTALLA COMPLETA PARA IMPORTAR CATÁLOGO MAESTRO
  if (currentView === 'UPLOAD_MAESTRO') {
    return (
      <CargarMaestroView
        onBack={() => {
          fetchCamiones();
          setCurrentView('LIST');
        }}
        onHome={() => {
          fetchCamiones();
          setCurrentView('LIST');
        }}
        onSuccess={(totalUploaded) => {
          fetchCamiones();
          setLastNotification(`Catálogo maestro actualizado exitosamente con ${totalUploaded.toLocaleString()} artículos.`);
          setCurrentView('LIST');
        }}
      />
    );
  }

  // VISTA 6: HISTORIAL DE REPORTES EXCEL
  if (currentView === 'HISTORIAL') {
    return (
      <HistorialReportesView
        onBack={() => {
          fetchCamiones();
          setCurrentView('LIST');
        }}
      />
    );
  }

  // VISTA 1: LISTA DE CAMIONES Y DASHBOARD ESTILO GDS
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001f7a] via-[#001040] to-[#00081d] text-white flex flex-col font-sans pb-10">
      
      {/* Pestaña Flotante Activadora del Drawer Lateral (Discreta Estilo GDS) */}
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        className="fixed top-1/3 right-0 z-40 bg-[#061224]/90 border-l border-y border-sky-500/40 text-sky-300 shadow-xl shadow-blue-950/80 rounded-l-xl p-2.5 backdrop-blur-md cursor-pointer hover:bg-[#0c244d] hover:text-white active:scale-95 transition-all flex items-center justify-center"
        title="Abrir Menú"
      >
        <ChevronLeft className="w-5 h-5 text-sky-400 animate-pulse" />
      </button>

      {/* Header Principal con Menú Hamburguesa */}
      <header className="sticky top-0 z-30 bg-[#061224]/95 backdrop-blur-md border-b border-sky-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-['Chakra_Petch'] font-black text-xl text-white shadow-lg shadow-blue-600/40 border border-sky-400/30">
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

        {/* Cápsula de Usuario Discreta e Integrada (Avatar + Nombre + Menú) */}
        <div 
          onClick={() => setIsDrawerOpen(true)}
          className="bg-[#061224]/80 border border-sky-500/30 rounded-full px-3 py-1.5 flex items-center space-x-2.5 shadow-md backdrop-blur-md cursor-pointer hover:bg-[#0c244d] transition-all select-none"
          title={`Operario: ${collaborator} • Abrir Menú`}
        >
          {/* Avatar Circular Limpio (Al tocarlo abre el modal de Perfil) */}
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

          {/* Nombre del Operario Sutil */}
          <span className="font-['Chakra_Petch'] font-bold text-xs text-white uppercase tracking-wider truncate max-w-[120px] sm:max-w-[160px]">
            {collaborator}
          </span>

          {/* Ícono de Menú Hamburguesa */}
          <Menu className="w-4 h-4 text-sky-400 shrink-0 ml-0.5" />
        </div>
      </header>

      {/* Main Container Limpio */}
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

        {/* Lista Principal Enfocada Exclusivamente en Camiones NAE Recibidos */}
        <div className="space-y-3">
          <div className="px-1 py-0.5">
            <h3 className="text-xs font-['Chakra_Petch'] font-extrabold text-sky-400 uppercase tracking-widest">
              CAMIONES NAE RECIBIDOS ({camiones.length})
            </h3>
          </div>

          {loadingCamiones ? (
            <div className="p-8 text-center text-xs text-sky-400/80 font-mono">Cargando datos de camiones...</div>
          ) : camiones.length === 0 ? (
            <div className="p-8 text-center bg-[#061224]/90 border border-sky-500/20 rounded-2xl space-y-3 shadow-xl">
              <Truck className="w-12 h-12 text-slate-600 mx-auto" />
              <div>
                <p className="font-['Chakra_Petch'] font-bold text-sm text-sky-200 uppercase tracking-wider">No hay camiones registrados</p>
                <p className="text-xs text-slate-400 mt-1">Abre el menú GDS o pulsa abajo para importar un manifiesto NAE.</p>
              </div>
              <button
                onClick={() => setCurrentView('UPLOAD_NAE')}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl inline-flex items-center space-x-1.5 shadow-md shadow-blue-600/30 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Cargar Camión NAE</span>
              </button>
            </div>
          ) : (
            camiones.map((cam) => {
              const estUpper = (cam.estado || '').trim().toUpperCase();
              const esCerrado = estUpper === 'FINALIZADO' || estUpper === 'CERRADO';

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
                      {renderEstadoBadge(cam.estado)}

                      {/* Botón de Acción Rápida: Eliminar Camión */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTruckToDelete(cam);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                        title="Eliminar Camión NAE"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <div className="flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>{cam.tienda_codigo} - {cam.tienda_nombre}</span>
                    </div>
                  </div>

                  {/* Registro Temporal de Auditoría (Inicio y Fin descarga en dos filas) */}
                  <div className="text-[10px] sm:text-[11px] text-slate-300 font-mono flex items-start space-x-2 pt-1 border-t border-sky-500/10">
                    <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col space-y-0.5 leading-tight">
                      {!cam.fecha_inicio_auditoria || estUpper === 'PENDIENTE' ? (
                        <span className="text-slate-400 font-medium">Descarga: Sin iniciar</span>
                      ) : (
                        <>
                          <span>Inicio descarga: {formatAuditDateTime(cam.fecha_inicio_auditoria, true)}</span>
                          {esCerrado && (
                            <span>Fin descarga: {formatAuditDateTime(cam.fecha_fin_auditoria, true)}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Botones de Acción rápida por Camión */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-500/10">
                    <button
                      onClick={() => handleOpenScan(cam.id)}
                      className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1 shadow-md shadow-blue-600/30"
                    >
                      <Scan className="w-3.5 h-3.5" />
                      <span>
                        {esCerrado
                          ? 'Ver Auditoría'
                          : estUpper === 'EN_PROCESO' || cam.fecha_inicio_auditoria
                          ? 'Continuar Auditoría'
                          : 'Iniciar Auditoría'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleOpenCierre(cam.id)}
                      className="py-2.5 px-3 bg-[#0c2847] hover:bg-[#163a75] text-sky-200 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl border border-sky-500/30 flex items-center justify-center space-x-1 shadow-md"
                    >
                      <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Reporte / Cierre</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Sidebar Drawer Lateral Desplegable */}
      <SidebarDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        collaboratorName={collaborator}
        collaboratorAvatar={collaboratorAvatar}
        currentView={currentView}
        onGoDashboard={() => {
          fetchCamiones();
          setCurrentView('LIST');
          setIsDrawerOpen(false);
        }}
        onOpenCargarCamion={() => {
          setCurrentView('UPLOAD_NAE');
          setIsDrawerOpen(false);
        }}
        onOpenCatalogoMaestro={() => {
          setCurrentView('UPLOAD_MAESTRO');
          setIsDrawerOpen(false);
        }}
        onOpenHistorialReportes={() => {
          setCurrentView('HISTORIAL');
          setIsDrawerOpen(false);
        }}
        onOpenShareApp={() => setIsShareModalOpen(true)}
        onChangeCollaborator={() => setIsUserModalOpen(true)}
      />

      {/* Modal Interactivo para Compartir la Aplicación (WhatsApp, Email, Enlace y Código QR) */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      {/* Modal Enriquecido de Perfil de Operario (Avatares y Captura WebP) */}
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

      {/* Modal Moderno de Confirmación para Eliminar Camión */}
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
    </div>
  );
};

export default App;
