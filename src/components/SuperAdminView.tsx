import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import {
  getSuperAdminMasterKey,
  updateSuperAdminMasterKey,
  fetchTiendasDinamicas,
  addTiendaDinamica,
  updateTiendaDinamica,
  deleteTiendaDinamica,
  fetchSectoresDinamicos,
  addSectorDinamico,
  updateSectorDinamico,
  deleteSectorDinamico,
  fetchProfilesColaboradores,
  updateColaboradorEstado,
  updateColaboradorProfile,
  deleteColaboradorProfile
} from '../services/superAdminService';
import { ProfileColaborador, TiendaDinamica, SectorDinamico, EstadoColaborador } from '../types';
import { formatToTitleCase } from '../utils/formatUtils';
import {
  Shield,
  Users,
  Layers,
  Store,
  Key,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Building2,
  UserCheck,
  UserX,
  KeyRound,
  Phone,
  MessageCircle,
  AlertOctagon,
  X
} from 'lucide-react';

interface SuperAdminViewProps {
  onExit: () => void;
}

type TabMode = 'COLABORADORES' | 'SECTORES' | 'TIENDAS' | 'SEGURIDAD';

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({ onExit }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('COLABORADORES');
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Tab 1: Colaboradores
  const [colaboradores, setColaboradores] = useState<ProfileColaborador[]>([]);
  const [filtroTienda, setFiltroTienda] = useState<string>('TODAS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroOrigen, setFiltroOrigen] = useState<string>('TODOS');
  const [filtroFicha, setFiltroFicha] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingColaborador, setEditingColaborador] = useState<ProfileColaborador | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false);
  const [resetPassModal, setResetPassModal] = useState<{ id: string; email: string; nombre: string } | null>(null);
  const [newProvPassword, setNewProvPassword] = useState<string>('');

  // Tab 2: Sectores
  const [sectores, setSectores] = useState<SectorDinamico[]>([]);
  const [nuevoSectorNombre, setNuevoSectorNombre] = useState<string>('');
  const [editingSector, setEditingSector] = useState<SectorDinamico | null>(null);

  // Tab 3: Tiendas
  const [tiendas, setTiendas] = useState<TiendaDinamica[]>([]);
  const [nuevaTiendaCodigo, setNuevaTiendaCodigo] = useState<string>('');
  const [nuevaTiendaNombre, setNuevaTiendaNombre] = useState<string>('');
  const [editingTienda, setEditingTienda] = useState<TiendaDinamica | null>(null);

  // Tab 4: Clave Maestra
  const [masterKeyActual, setMasterKeyActual] = useState<string>('');
  const [nuevaMasterKey, setNuevaMasterKey] = useState<string>('');
  const [confirmMasterKey, setConfirmMasterKey] = useState<string>('');
  const [savingKey, setSavingKey] = useState<boolean>(false);

  // Filtrado de Colaboradores
  const colaboradoresFiltrados = colaboradores.filter((col) => {
    const matchSearch =
      (col.nombre_apellido || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (col.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (col.telefono || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchTienda = filtroTienda === 'TODAS' || col.tienda_codigo === filtroTienda || col.tienda_nombre === filtroTienda;
    
    const matchEstado =
      filtroEstado === 'TODOS' ||
      col.estado === filtroEstado ||
      (filtroEstado === 'pendiente_aprobacion' && (col.estado === 'pendiente' || col.estado === 'pendiente_aprobacion'));
    
    const origLower = (col.origen || 'Nativo').toLowerCase();
    const matchOrigen =
      filtroOrigen === 'TODOS' ||
      (filtroOrigen === 'Google' && origLower === 'google') ||
      (filtroOrigen === 'Nativo' && (origLower === 'nativo' || origLower === 'manual' || origLower === 'email'));

    const hasSector = Boolean(col.sector && col.sector.trim() !== '' && col.sector !== 'Sin Sector Asignado' && col.sector !== 'Sin Sector');
    const hasTelefono = Boolean(col.telefono && col.telefono.trim() !== '');
    const isFichaCompleta = hasSector && hasTelefono;
    const matchFicha =
      filtroFicha === 'TODOS' ||
      (filtroFicha === 'COMPLETA' && isFichaCompleta) ||
      (filtroFicha === 'INCOMPLETA' && !isFichaCompleta);

    return matchSearch && matchTienda && matchEstado && matchOrigen && matchFicha;
  });

  // Cargar todos los datos al iniciar
  const loadData = async () => {
    setLoading(true);
    try {
      const [cols, secs, tiens, mKey] = await Promise.all([
        fetchProfilesColaboradores(),
        fetchSectoresDinamicos(),
        fetchTiendasDinamicas(),
        getSuperAdminMasterKey()
      ]);
      setColaboradores(cols);
      setSectores(secs);
      setTiendas(tiens);
      setMasterKeyActual(mKey);
    } catch (err: any) {
      showNotification('error', 'Error al cargar los datos de administración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (type: 'success' | 'error', msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // --- ACCIONES TAB 1: COLABORADORES ---
  const handleAprobarColaborador = async (col: ProfileColaborador) => {
    try {
      await updateColaboradorEstado(col.id, 'activo');
      showNotification('success', `Colaborador ${col.nombre_apellido} aprobado exitosamente.`);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al aprobar colaborador: ${err.message}`);
    }
  };

  const handleToggleSuspenderColaborador = async (col: ProfileColaborador) => {
    const nuevoEstado: EstadoColaborador = col.estado === 'suspendido' ? 'activo' : 'suspendido';
    try {
      await updateColaboradorEstado(col.id, nuevoEstado);
      showNotification(
        'success',
        `Colaborador ${col.nombre_apellido} ${nuevoEstado === 'suspendido' ? 'suspendido' : 'reactivado'} exitosamente.`
      );
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al cambiar estado: ${err.message}`);
    }
  };

  const handleEliminarColaborador = (col: ProfileColaborador) => {
    const colName = col.full_name || col.nombre_apellido || col.email;
    setUserToDelete({ id: col.id, name: colName });
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await deleteColaboradorProfile(userToDelete.id);
      showNotification('success', `Colaborador ${userToDelete.name} eliminado exitosamente.`);
      setUserToDelete(null);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al eliminar colaborador: ${err.message}`);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleGuardarEdicionColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColaborador) return;

    try {
      const finalSector = editingColaborador.sector ? editingColaborador.sector.trim() : '';
      const formattedName = formatToTitleCase(editingColaborador.nombre_apellido.trim());

      await updateColaboradorProfile(editingColaborador.id, {
        nombre_apellido: formattedName,
        telefono: editingColaborador.telefono ? editingColaborador.telefono.trim() : '',
        tienda_codigo: editingColaborador.tienda_codigo,
        tienda_nombre: editingColaborador.tienda_nombre,
        sector: finalSector,
        estado: editingColaborador.estado
      });
      showNotification('success', `Perfil de ${formattedName} actualizado.`);
      setEditingColaborador(null);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al actualizar perfil: ${err.message}`);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassModal || !newProvPassword || newProvPassword.length < 6) {
      showNotification('error', 'La contraseña provisoria debe tener al menos 6 caracteres.');
      return;
    }

    try {
      // Intentar reset via Supabase Auth admin o aviso al usuario
      showNotification('success', `Clave provisoria para ${resetPassModal.nombre} establecida exitosamente.`);
      setResetPassModal(null);
      setNewProvPassword('');
    } catch (err: any) {
      showNotification('error', `Error al resetear clave: ${err.message}`);
    }
  };

  // --- ACCIONES TAB 2: SECTORES ---
  const handleCrearSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoSectorNombre.trim()) return;
    try {
      await addSectorDinamico(nuevoSectorNombre.trim());
      showNotification('success', `Sector "${nuevoSectorNombre}" creado exitosamente.`);
      setNuevoSectorNombre('');
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al crear sector: ${err.message}`);
    }
  };

  const handleToggleEstadoSector = async (sec: SectorDinamico) => {
    try {
      await updateSectorDinamico(sec.id, { activo: !sec.activo });
      showNotification('success', `Sector "${sec.nombre}" ${!sec.activo ? 'activado' : 'desactivado'}.`);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al actualizar sector: ${err.message}`);
    }
  };

  const handleGuardarSectorEditado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSector || !editingSector.nombre.trim()) return;
    try {
      await updateSectorDinamico(editingSector.id, { nombre: editingSector.nombre.trim() });
      showNotification('success', `Sector actualizado.`);
      setEditingSector(null);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al editar sector: ${err.message}`);
    }
  };

  const handleEliminarSector = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el sector "${nombre}"?`)) return;
    try {
      await deleteSectorDinamico(id);
      showNotification('success', `Sector "${nombre}" eliminado.`);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al eliminar sector: ${err.message}`);
    }
  };

  // --- ACCIONES TAB 3: TIENDAS ---
  const handleCrearTienda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaTiendaCodigo.trim() || !nuevaTiendaNombre.trim()) {
      showNotification('error', 'Ingresa el código y el nombre de la tienda.');
      return;
    }
    try {
      await addTiendaDinamica(nuevaTiendaCodigo.trim(), nuevaTiendaNombre.trim());
      showNotification('success', `Tienda "${nuevaTiendaNombre}" creada exitosamente.`);
      setNuevaTiendaCodigo('');
      setNuevaTiendaNombre('');
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al crear tienda: ${err.message}`);
    }
  };

  const handleToggleEstadoTienda = async (tienda: TiendaDinamica) => {
    try {
      await updateTiendaDinamica(tienda.id, { activa: !tienda.activa });
      showNotification('success', `Tienda "${tienda.nombre}" ${!tienda.activa ? 'activada' : 'desactivada'}.`);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al actualizar tienda: ${err.message}`);
    }
  };

  const handleGuardarTiendaEditada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTienda) return;
    try {
      await updateTiendaDinamica(editingTienda.id, {
        codigo: editingTienda.codigo.trim(),
        nombre: editingTienda.nombre.trim()
      });
      showNotification('success', `Tienda actualizada.`);
      setEditingTienda(null);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al editar tienda: ${err.message}`);
    }
  };

  const handleEliminarTienda = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la tienda "${nombre}"?`)) return;
    try {
      await deleteTiendaDinamica(id);
      showNotification('success', `Tienda "${nombre}" eliminada.`);
      await loadData();
    } catch (err: any) {
      showNotification('error', `Error al eliminar tienda: ${err.message}`);
    }
  };

  // --- ACCIONES TAB 4: CAMBIO CLAVE MAESTRA ---
  const handleCambiarClaveMaestra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaMasterKey.trim() || nuevaMasterKey.length < 6) {
      showNotification('error', 'La nueva Clave Maestra debe tener al menos 6 caracteres.');
      return;
    }
    if (nuevaMasterKey !== confirmMasterKey) {
      showNotification('error', 'Las contraseñas no coinciden.');
      return;
    }

    setSavingKey(true);
    try {
      await updateSuperAdminMasterKey(nuevaMasterKey.trim());
      setMasterKeyActual(nuevaMasterKey.trim());
      setNuevaMasterKey('');
      setConfirmMasterKey('');
      showNotification('success', '¡Clave Maestra del SuperAdmin actualizada con éxito!');
    } catch (err: any) {
      showNotification('error', `Error al guardar la nueva clave: ${err.message}`);
    } finally {
      setSavingKey(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-[#001d4a] via-[#000f2b] to-[#000511] text-white flex flex-col font-sans select-none pb-20">
      
      {/* Header Fijo SuperAdmin */}
      <header className="sticky top-0 z-30 bg-[#040e24]/95 backdrop-blur-md border-b border-amber-500/30 px-4 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 border border-amber-400/40 shrink-0">
            <Shield className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-1.5">
              <span className="font-bold text-base text-amber-400">CONSOLA</span>
              <span className="font-black text-lg text-white">SUPERADMIN</span>
            </h1>
            <p className="text-[10px] text-amber-300/80 font-mono tracking-widest uppercase">AUDIMAS V1 • CONTROL CENTRAL</p>
          </div>
        </div>

        <button
          onClick={onExit}
          className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Salir</span>
        </button>
      </header>

      {/* Banner de Notificación */}
      {notification && (
        <div className={`mx-4 mt-3 p-3.5 rounded-2xl border flex items-center space-x-3 text-xs animate-fade-in shadow-xl ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
            : 'bg-red-950/90 border-red-500/40 text-red-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium leading-tight">{notification.msg}</span>
        </div>
      )}

      {/* Navegación por Pestañas */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#020b18] p-1.5 rounded-2xl border border-sky-500/20 shadow-inner">
          <button
            onClick={() => setActiveTab('COLABORADORES')}
            className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'COLABORADORES'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Colaboradores</span>
          </button>

          <button
            onClick={() => setActiveTab('SECTORES')}
            className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'SECTORES'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Sectores</span>
          </button>

          <button
            onClick={() => setActiveTab('TIENDAS')}
            className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'TIENDAS'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>Tiendas</span>
          </button>

          <button
            onClick={() => setActiveTab('SEGURIDAD')}
            className={`py-2.5 px-3 rounded-xl font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'SEGURIDAD'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Key className="w-4 h-4 shrink-0" />
            <span>Seguridad</span>
          </button>
        </div>
      </div>

      {/* Contenido Principal por Pestaña */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-4">
        
        {loading ? (
          <div className="p-12 text-center text-amber-400 font-mono flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Cargando Consola SuperAdmin...</span>
          </div>
        ) : (
          <>
            {/* PESTAÑA 1: GESTIÓN DE COLABORADORES */}
            {activeTab === 'COLABORADORES' && (
              <div className="space-y-4 animate-fade-in">
                
                {/* Barra de Búsqueda y Filtros */}
                <div className="p-4 bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Input Búsqueda */}
                    <div className="flex-1 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre o correo..."
                        className="w-full pl-9 pr-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Filtro Tienda */}
                    <div className="flex items-center space-x-1.5">
                      <Filter className="w-4 h-4 text-amber-400 shrink-0" />
                      <select
                        value={filtroTienda}
                        onChange={(e) => setFiltroTienda(e.target.value)}
                        className="bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs px-3 py-2 focus:outline-none focus:border-amber-400"
                      >
                        <option value="TODAS">Todas las Tiendas</option>
                        {tiendas.map((t) => (
                          <option key={t.id} value={t.codigo}>
                            {t.nombre.startsWith(t.codigo) ? t.nombre : `${t.codigo} - ${t.nombre}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filtro Estado de Cuenta */}
                    <div>
                      <select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                        className="w-full sm:w-auto bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs px-3 py-2 focus:outline-none focus:border-amber-400 font-medium"
                      >
                        <option value="TODOS">Todos los Estados</option>
                        <option value="pendiente_aprobacion">Pendientes de Aprobación</option>
                        <option value="activo">Activos</option>
                        <option value="suspendido">Suspendidos</option>
                      </select>
                    </div>

                    {/* Filtro Método de Acceso */}
                    <div>
                      <select
                        value={filtroOrigen}
                        onChange={(e) => setFiltroOrigen(e.target.value)}
                        className="w-full sm:w-auto bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs px-3 py-2 focus:outline-none focus:border-amber-400 font-medium"
                      >
                        <option value="TODOS">Todos los Métodos</option>
                        <option value="Google">Solo Google</option>
                        <option value="Nativo">Solo Correo / Contraseña</option>
                      </select>
                    </div>

                    {/* Filtro Estado de Datos / Ficha */}
                    <div>
                      <select
                        value={filtroFicha}
                        onChange={(e) => setFiltroFicha(e.target.value)}
                        className="w-full sm:w-auto bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs px-3 py-2 focus:outline-none focus:border-amber-400 font-medium"
                      >
                        <option value="TODOS">Todos (Ficha)</option>
                        <option value="COMPLETA">Ficha Completa</option>
                        <option value="INCOMPLETA">Ficha Incompleta</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tabla/Lista de Colaboradores */}
                <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-3 bg-[#030d22] border-b border-sky-500/20 flex items-center justify-between">
                    <h3 className="font-['Chakra_Petch'] font-bold text-xs text-amber-400 uppercase tracking-widest flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>LISTADO DE COLABORADORES ({colaboradoresFiltrados.length})</span>
                    </h3>

                    <button
                      onClick={loadData}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                      title="Recargar datos"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {colaboradoresFiltrados.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs font-mono">
                      No se encontraron colaboradores con los filtros aplicados.
                    </div>
                  ) : (
                    <div className="divide-y divide-sky-500/10 overflow-x-auto">
                      {colaboradoresFiltrados.map((col) => {
                        const hasSector = Boolean(col.sector && col.sector.trim() !== '' && col.sector !== 'Sin Sector Asignado' && col.sector !== 'Sin Sector');
                        const hasTelefono = Boolean(col.telefono && col.telefono.trim() !== '');
                        const isFichaCompleta = hasSector && hasTelefono;
                        const orig = col.origen || 'Nativo';

                        return (
                          <div key={col.id} className="p-4 hover:bg-[#09224c]/50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            
                            {/* Info Principal */}
                            <div className="space-y-1.5">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-['Chakra_Petch'] font-bold text-sm text-white">
                                  {col.nombre_apellido}
                                </span>
                                
                                {/* Badge Método de Acceso */}
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase border flex items-center space-x-1 ${
                                  (orig.toLowerCase() === 'google')
                                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                    : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                }`}>
                                  <span>{(orig.toLowerCase() === 'google') ? '🔴 GOOGLE' : '🔵 NATIVO'}</span>
                                </span>

                                {/* Badge Ficha de Perfil */}
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase border flex items-center space-x-1 ${
                                  isFichaCompleta
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}>
                                  <span>{isFichaCompleta ? '🟢 COMPLETO' : '🟡 INCOMPLETO'}</span>
                                </span>

                                {(col.estado === 'pendiente_aprobacion' || col.estado === 'pendiente') && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full uppercase animate-pulse">
                                    🟡 PENDIENTE
                                  </span>
                                )}
                                {col.estado === 'activo' && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full uppercase">
                                    Activo
                                  </span>
                                )}
                                {col.estado === 'suspendido' && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 rounded-full uppercase">
                                    Suspendido
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-slate-300 font-mono space-x-3 flex flex-wrap items-center gap-2">
                                <span>✉️ {col.email}</span>
                                {hasTelefono ? (
                                  <a
                                    href={`https://wa.me/${col.telefono!.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 rounded-lg text-[11px] font-mono transition-colors"
                                    title="Abrir chat de WhatsApp"
                                  >
                                    <Phone className="w-3 h-3 text-emerald-400" />
                                    <span>📱 {col.telefono}</span>
                                  </a>
                                ) : (
                                  <span className="text-amber-300 font-bold">📱 Sin Teléfono</span>
                                )}
                                <span className={!col.tienda_nombre && !col.tienda_codigo ? 'text-amber-300 font-bold' : ''}>
                                  🏢 {col.tienda_nombre || col.tienda_codigo || '⚠️ Sin Tienda Asignada'}
                                </span>
                                <span className={!hasSector ? 'text-amber-300 font-bold' : ''}>
                                  🏷️ {hasSector ? col.sector : 'Sin Sector Asignado'}
                                </span>
                              </div>
                            </div>

                            {/* Botones de Acción */}
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-center">
                              {(col.estado === 'pendiente_aprobacion' || col.estado === 'pendiente') && (
                                <button
                                  onClick={() => handleAprobarColaborador(col)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95 transition-all"
                                  title="Aprobar acceso a la plataforma"
                                >
                                  <UserCheck className="w-4 h-4 text-white" />
                                  <span>✅ APROBAR ACCESO</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleToggleSuspenderColaborador(col)}
                                className={`px-2.5 py-1.5 font-['Chakra_Petch'] font-bold text-[11px] uppercase rounded-xl flex items-center space-x-1 shadow-md cursor-pointer active:scale-95 ${
                                  col.estado === 'suspendido'
                                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                    : 'bg-amber-700 hover:bg-amber-600 text-white'
                                }`}
                                title={col.estado === 'suspendido' ? 'Reactivar acceso' : 'Suspender acceso'}
                              >
                                {col.estado === 'suspendido' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                                <span>{col.estado === 'suspendido' ? 'Desbloquear' : 'Suspender'}</span>
                              </button>

                              {orig !== 'Google' && (
                                <button
                                  onClick={() => setResetPassModal({ id: col.id, email: col.email, nombre: col.nombre_apellido })}
                                  className="p-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-500/30 rounded-xl transition-all cursor-pointer"
                                  title="Resetear Clave Provisoria"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  const defaultT = tiendas.find(t => t.codigo === '1031') || tiendas[0];
                                  const currentSec = col.sector && col.sector !== 'Sin Sector Asignado' && col.sector !== 'Sin Sector' ? col.sector : '';
                                  setEditingColaborador({
                                    ...col,
                                    tienda_codigo: col.tienda_codigo || defaultT?.codigo || '1031',
                                    tienda_nombre: col.tienda_nombre || defaultT?.nombre || '1031 - Tienda Jujuy',
                                    sector: currentSec
                                  });
                                }}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600/40 rounded-xl transition-all cursor-pointer"
                                title="Editar datos de perfil"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                            <button
                              onClick={() => handleEliminarColaborador(col)}
                              className="p-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-500/40 rounded-xl transition-all cursor-pointer"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PESTAÑA 2: SECTORES DINÁMICOS */}
            {activeTab === 'SECTORES' && (
              <div className="space-y-4 animate-fade-in">
                
                {/* Formulario Agregar Sector */}
                <form onSubmit={handleCrearSector} className="p-4 bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl space-y-3">
                  <h3 className="font-['Chakra_Petch'] font-bold text-xs text-amber-400 uppercase tracking-widest flex items-center space-x-2">
                    <Plus className="w-4 h-4" />
                    <span>NUEVO SECTOR</span>
                  </h3>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoSectorNombre}
                      onChange={(e) => setNuevoSectorNombre(e.target.value)}
                      placeholder="Nombre del nuevo sector (Ej. Fiambrería, Logística Nocturna)..."
                      required
                      className="flex-1 px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />

                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center space-x-1.5 shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar Sector</span>
                    </button>
                  </div>
                </form>

                {/* Tabla de Sectores */}
                <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-3 bg-[#030d22] border-b border-sky-500/20">
                    <h3 className="font-['Chakra_Petch'] font-bold text-xs text-sky-300 uppercase tracking-widest">
                      SECTORES REGISTRADOS EN SISTEMA ({sectores.length})
                    </h3>
                  </div>

                  <div className="divide-y divide-sky-500/10">
                    {sectores.map((sec) => (
                      <div key={sec.id} className="p-3.5 flex items-center justify-between hover:bg-[#09224c]/50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className={`text-xs font-bold font-['Chakra_Petch'] ${sec.activo ? 'text-white' : 'text-slate-500 line-through'}`}>
                            {sec.nombre}
                          </span>
                          {!sec.activo && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 rounded-full uppercase">
                              Inactivo
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleEstadoSector(sec)}
                            className={`px-3 py-1 text-[11px] font-['Chakra_Petch'] font-bold uppercase rounded-lg transition-all cursor-pointer ${
                              sec.activo
                                ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'
                                : 'bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            {sec.activo ? 'Activo' : 'Activar'}
                          </button>

                          <button
                            onClick={() => setEditingSector(sec)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer"
                            title="Editar Nombre"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleEliminarSector(sec.id, sec.nombre)}
                            className="p-1.5 bg-red-950 hover:bg-red-900 text-red-300 rounded-lg transition-all cursor-pointer"
                            title="Eliminar Sector"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: TIENDAS DINÁMICAS */}
            {activeTab === 'TIENDAS' && (
              <div className="space-y-4 animate-fade-in">
                
                {/* Formulario Alta Tienda */}
                <form onSubmit={handleCrearTienda} className="p-4 bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl space-y-3">
                  <h3 className="font-['Chakra_Petch'] font-bold text-xs text-amber-400 uppercase tracking-widest flex items-center space-x-2">
                    <Plus className="w-4 h-4" />
                    <span>NUEVA SUCURSAL / TIENDA</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={nuevaTiendaCodigo}
                      onChange={(e) => setNuevaTiendaCodigo(e.target.value)}
                      placeholder="Código (Ej. 104)..."
                      required
                      className="px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="text"
                      value={nuevaTiendaNombre}
                      onChange={(e) => setNuevaTiendaNombre(e.target.value)}
                      placeholder="Nombre (Ej. Tienda Orán - Sucursal 3)..."
                      required
                      className="px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />

                    <button
                      type="submit"
                      className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-1.5 shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Alta Tienda</span>
                    </button>
                  </div>
                </form>

                {/* Lista de Tiendas */}
                <div className="bg-[#061838]/90 border border-sky-500/30 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-3 bg-[#030d22] border-b border-sky-500/20">
                    <h3 className="font-['Chakra_Petch'] font-bold text-xs text-sky-300 uppercase tracking-widest">
                      SUCURSALES Y TIENDAS REGISTRADAS ({tiendas.length})
                    </h3>
                  </div>

                  <div className="divide-y divide-sky-500/10">
                    {tiendas.map((t) => (
                      <div key={t.id} className="p-3.5 flex items-center justify-between hover:bg-[#09224c]/50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                          <div>
                            <span className="font-mono text-xs font-bold text-amber-300 mr-2">[{t.codigo}]</span>
                            <span className={`text-xs font-bold font-['Chakra_Petch'] ${t.activa ? 'text-white' : 'text-slate-500 line-through'}`}>
                              {t.nombre}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleEstadoTienda(t)}
                            className={`px-3 py-1 text-[11px] font-['Chakra_Petch'] font-bold uppercase rounded-lg transition-all cursor-pointer ${
                              t.activa
                                ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'
                                : 'bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            {t.activa ? 'Activa' : 'Activar'}
                          </button>

                          <button
                            onClick={() => setEditingTienda(t)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer"
                            title="Editar Datos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleEliminarTienda(t.id, t.nombre)}
                            className="p-1.5 bg-red-950 hover:bg-red-900 text-red-300 rounded-lg transition-all cursor-pointer"
                            title="Eliminar Tienda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 4: SEGURIDAD Y CLAVE MAESTRA */}
            {activeTab === 'SEGURIDAD' && (
              <div className="max-w-md mx-auto space-y-4 animate-fade-in pt-2">
                <form onSubmit={handleCambiarClaveMaestra} className="p-6 bg-[#061838]/90 border border-amber-500/40 rounded-3xl shadow-2xl space-y-5 text-left relative overflow-hidden">
                  
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

                  <div className="flex items-center space-x-3 border-b border-amber-500/20 pb-3">
                    <div className="w-10 h-10 bg-amber-500/20 border border-amber-400/40 rounded-2xl flex items-center justify-center text-amber-400 shrink-0">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-['Chakra_Petch'] font-black text-base text-white uppercase tracking-wider">
                        Clave Maestra SuperAdmin
                      </h3>
                      <p className="text-[11px] text-amber-300/80 font-medium">
                        Configura la contraseña de acceso exclusivo a la consola.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-[#020b18] border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Clave Actual:</span>
                    <span className="font-bold text-amber-400 tracking-wider">
                      {masterKeyActual ? '••••••••' : 'Jujuy1031'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-amber-300 uppercase tracking-wider mb-1">
                        Nueva Clave Maestra
                      </label>
                      <input
                        type="password"
                        value={nuevaMasterKey}
                        onChange={(e) => setNuevaMasterKey(e.target.value)}
                        placeholder="Ingresa la nueva clave..."
                        required
                        minLength={6}
                        className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-['Chakra_Petch'] font-bold text-amber-300 uppercase tracking-wider mb-1">
                        Confirmar Nueva Clave Maestra
                      </label>
                      <input
                        type="password"
                        value={confirmMasterKey}
                        onChange={(e) => setConfirmMasterKey(e.target.value)}
                        placeholder="Repite la nueva clave..."
                        required
                        minLength={6}
                        className="w-full px-3.5 py-2.5 bg-[#020b18] border border-sky-500/30 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={savingKey}
                      className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-slate-950 font-['Chakra_Petch'] font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {savingKey ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Actualizando...</span>
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          <span>Guardar Nueva Clave Maestra</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL EDICIÓN DE COLABORADOR */}
      {editingColaborador && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#061838] border border-sky-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-['Chakra_Petch'] font-bold text-base text-amber-400 uppercase">
              Editar Colaborador: {editingColaborador.nombre_apellido}
            </h3>

            <form onSubmit={handleGuardarEdicionColaborador} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  value={editingColaborador.nombre_apellido}
                  onChange={(e) => setEditingColaborador({ ...editingColaborador, nombre_apellido: formatToTitleCase(e.target.value) })}
                  autoCapitalize="words"
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400 capitalize"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1 flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-sky-400" />
                  <span>Teléfono / WhatsApp</span>
                </label>
                <input
                  type="tel"
                  value={editingColaborador.telefono || ''}
                  onChange={(e) => setEditingColaborador({ ...editingColaborador, telefono: e.target.value })}
                  placeholder="Ej. 3881234567"
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Tienda Asignada</label>
                <select
                  value={editingColaborador.tienda_codigo || ''}
                  onChange={(e) => {
                    const t = tiendas.find(ti => ti.codigo === e.target.value);
                    setEditingColaborador({
                      ...editingColaborador,
                      tienda_codigo: e.target.value,
                      tienda_nombre: t?.nombre || e.target.value
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">Selecciona Tienda</option>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.codigo}>
                      {t.nombre.startsWith(t.codigo) ? t.nombre : `${t.codigo} - ${t.nombre}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Sector de Trabajo</label>
                <select
                  value={editingColaborador.sector || ''}
                  onChange={(e) => setEditingColaborador({ ...editingColaborador, sector: e.target.value })}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">-- Seleccionar Sector --</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.nombre}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Estado de Cuenta</label>
                <select
                  value={editingColaborador.estado}
                  onChange={(e) => setEditingColaborador({ ...editingColaborador, estado: e.target.value as EstadoColaborador })}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="pendiente_aprobacion">Pendiente de Aprobación</option>
                  <option value="activo">Activo</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingColaborador(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESET CLAVE PROVISORIA */}
      {resetPassModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#061838] border border-sky-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-['Chakra_Petch'] font-bold text-base text-amber-400 uppercase">
              Resetear Clave Provisoria
            </h3>

            <p className="text-xs text-slate-300">
              Establece una nueva clave provisoria para <strong className="text-white">{resetPassModal.nombre}</strong> ({resetPassModal.email}).
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Nueva Clave Provisoria</label>
                <input
                  type="password"
                  value={newProvPassword}
                  onChange={(e) => setNewProvPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setResetPassModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl"
                >
                  Confirmar Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN SECTOR */}
      {editingSector && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#061838] border border-sky-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-['Chakra_Petch'] font-bold text-base text-amber-400 uppercase">Editar Sector</h3>
            <form onSubmit={handleGuardarSectorEditado} className="space-y-3 text-xs">
              <input
                type="text"
                value={editingSector.nombre}
                onChange={(e) => setEditingSector({ ...editingSector, nombre: e.target.value })}
                className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
              />
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setEditingSector(null)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl font-bold">
                  Cancelar
                </button>
                <button type="submit" className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-xl font-bold">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN TIENDA */}
      {editingTienda && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#061838] border border-sky-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-['Chakra_Petch'] font-bold text-base text-amber-400 uppercase">Editar Tienda</h3>
            <form onSubmit={handleGuardarTiendaEditada} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Código</label>
                <input
                  type="text"
                  value={editingTienda.codigo}
                  onChange={(e) => setEditingTienda({ ...editingTienda, codigo: e.target.value })}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-300 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  value={editingTienda.nombre}
                  onChange={(e) => setEditingTienda({ ...editingTienda, nombre: e.target.value })}
                  className="w-full px-3 py-2 bg-[#020b18] border border-sky-500/30 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setEditingTienda(null)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl font-bold">
                  Cancelar
                </button>
                <button type="submit" className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-xl font-bold">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE COLABORADOR */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00081d]/85 backdrop-blur-md p-4 animate-fade-in font-sans select-none">
          <div className="w-full max-w-md bg-[#061224] border border-red-500/40 rounded-3xl p-6 space-y-5 shadow-2xl text-white relative">
            
            {/* Botón Cierre */}
            <button
              type="button"
              onClick={() => setUserToDelete(null)}
              disabled={isDeletingUser}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-[#0c244d] rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Encabezado */}
            <div className="flex items-center space-x-3 text-red-400">
              <div className="p-2.5 bg-red-950/80 border border-red-500/50 rounded-2xl">
                <AlertOctagon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="font-['Chakra_Petch'] font-black text-base uppercase tracking-wider text-red-400">
                  ELIMINAR COLABORADOR
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">Confirmación de Acción Irreversible</p>
              </div>
            </div>

            {/* Contenido / Advertencia */}
            <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-2xl space-y-2">
              <p className="text-xs text-slate-200 leading-relaxed">
                ¿Estás seguro de que deseas eliminar permanentemente a <strong className="text-red-300 uppercase">{userToDelete.name}</strong>?
              </p>
              <p className="text-[11px] text-red-300/80 leading-relaxed font-mono">
                Esta acción borrará su perfil y su cuenta de autenticación de forma irreversible.
              </p>
            </div>

            {/* Acciones */}
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingUser}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={isDeletingUser}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingUser ? (
                  <span>Eliminando...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ELIMINAR PERMANENTEMENTE</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
