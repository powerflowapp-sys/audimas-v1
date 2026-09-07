import { supabase } from './supabase';
import { ProfileColaborador, TiendaDinamica, SectorDinamico, EstadoColaborador } from '../types';
import { formatToTitleCase } from '../utils/formatUtils';

export const DEFAULT_MASTER_KEY = 'Jujuy1031';

export const DEFAULT_SECTORES: SectorDinamico[] = [
  { id: 'sec_1', nombre: 'Operaciones Back', activo: true },
  { id: 'sec_2', nombre: 'Recepción / Descarga', activo: true },
  { id: 'sec_3', nombre: 'Auditoría / Control', activo: true },
  { id: 'sec_4', nombre: 'Salón de Ventas', activo: true },
  { id: 'sec_5', nombre: 'Depósito / Logística', activo: true },
  { id: 'sec_6', nombre: 'Prevención de Pérdidas', activo: true },
  { id: 'sec_7', nombre: 'Administración / Gerencia', activo: true }
];

export const DEFAULT_TIENDAS: TiendaDinamica[] = [
  { id: '1031', codigo: '1031', nombre: '1031 - Tienda Jujuy', activa: true }
];

/**
 * Obtiene la clave maestra del SuperAdmin desde Supabase DB o fallback local
 */
export const getSuperAdminMasterKey = async (): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'superadmin_master_key')
      .maybeSingle();

    if (data && data.value) {
      return data.value;
    }
  } catch (err) {
    console.warn('⚠️ Error consultando app_settings en Supabase, utilizando fallback:', err);
  }

  const localKey = localStorage.getItem('audimas_superadmin_master_key');
  return localKey || DEFAULT_MASTER_KEY;
};

/**
 * Actualiza la clave maestra del SuperAdmin en DB y localStorage
 */
export const updateSuperAdminMasterKey = async (newKey: string): Promise<void> => {
  localStorage.setItem('audimas_superadmin_master_key', newKey);
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'superadmin_master_key',
        value: newKey,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      console.warn('⚠️ No se pudo guardar clave maestra en DB:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ Error al actualizar app_settings en DB:', err);
  }
};

/**
 * Obtiene la lista dinámica de Tiendas desde DB o fallback
 */
export const fetchTiendasDinamicas = async (): Promise<TiendaDinamica[]> => {
  try {
    const { data, error } = await supabase
      .from('tiendas')
      .select('*')
      .order('codigo');

    if (error) {
      console.warn('⚠️ Error consultando tiendas en DB:', error.message);
    } else if (data && data.length > 0) {
      const cleanData = data.filter(t => t.codigo !== '101' && t.codigo !== '102' && t.codigo !== '103' && !t.nombre?.includes('Casa Central'));
      const finalData = cleanData.length > 0 ? cleanData : data;
      localStorage.setItem('audimas_tiendas_cache', JSON.stringify(finalData));
      return finalData as TiendaDinamica[];
    }
  } catch (err) {
    console.warn('⚠️ Error cargando tiendas de DB, utilizando fallback:', err);
  }

  const cached = localStorage.getItem('audimas_tiendas_cache');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }

  localStorage.setItem('audimas_tiendas_cache', JSON.stringify(DEFAULT_TIENDAS));
  return DEFAULT_TIENDAS;
};

/**
 * Agrega una nueva Tienda en DB y caché
 */
export const addTiendaDinamica = async (codigo: string, nombre: string): Promise<TiendaDinamica> => {
  const cleanCodigo = codigo.trim();
  const rawNombre = nombre.trim();
  const nombreFormateado = rawNombre.startsWith(cleanCodigo) ? rawNombre : `${cleanCodigo} - ${rawNombre}`;

  const { data, error } = await supabase
    .from('tiendas')
    .insert({
      codigo: cleanCodigo,
      nombre: nombreFormateado,
      activa: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error al insertar tienda en DB:', error);
    throw new Error(error.message || 'No se pudo guardar la tienda en la base de datos');
  }

  const newTienda: TiendaDinamica = {
    id: data.id,
    codigo: data.codigo || cleanCodigo,
    nombre: data.nombre || nombreFormateado,
    activa: data.activa ?? true,
    created_at: data.created_at || new Date().toISOString()
  };

  const current = await fetchTiendasDinamicas();
  const updated = [...current.filter(t => t.id !== newTienda.id && t.codigo !== newTienda.codigo), newTienda];
  localStorage.setItem('audimas_tiendas_cache', JSON.stringify(updated));
  return newTienda;
};

/**
 * Actualiza o desactiva una Tienda
 */
export const updateTiendaDinamica = async (id: string, updates: Partial<TiendaDinamica>): Promise<void> => {
  try {
    await supabase
      .from('tiendas')
      .update(updates)
      .eq('id', id);
  } catch (err) {
    console.warn('⚠️ Error al actualizar tienda en DB:', err);
  }

  const current = await fetchTiendasDinamicas();
  const updated = current.map(t => t.id === id ? { ...t, ...updates } : t);
  localStorage.setItem('audimas_tiendas_cache', JSON.stringify(updated));
};

/**
 * Elimina una Tienda
 */
export const deleteTiendaDinamica = async (id: string): Promise<void> => {
  try {
    await supabase.from('tiendas').delete().eq('id', id);
  } catch (err) {
    console.warn('⚠️ Error al eliminar tienda en DB:', err);
  }

  const current = await fetchTiendasDinamicas();
  const updated = current.filter(t => t.id !== id);
  localStorage.setItem('audimas_tiendas_cache', JSON.stringify(updated));
};

/**
 * Obtiene la lista dinámica de Sectores desde DB o fallback
 */
export const fetchSectoresDinamicos = async (): Promise<SectorDinamico[]> => {
  try {
    const { data, error } = await supabase
      .from('sectores')
      .select('*')
      .order('nombre');

    if (error) {
      console.warn('⚠️ Error consultando sectores en DB:', error.message);
    } else if (data && data.length > 0) {
      localStorage.setItem('audimas_sectores_cache', JSON.stringify(data));
      return data as SectorDinamico[];
    }
  } catch (err) {
    console.warn('⚠️ Error cargando sectores de DB, utilizando fallback:', err);
  }

  const cached = localStorage.getItem('audimas_sectores_cache');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  localStorage.setItem('audimas_sectores_cache', JSON.stringify(DEFAULT_SECTORES));
  return DEFAULT_SECTORES;
};

/**
 * Agrega un nuevo Sector
 */
export const addSectorDinamico = async (nombre: string): Promise<SectorDinamico> => {
  const cleanNombre = nombre.trim();

  const { data, error } = await supabase
    .from('sectores')
    .insert({
      nombre: cleanNombre,
      activo: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error al insertar sector en DB:', error);
    throw new Error(error.message || 'No se pudo guardar el sector en la base de datos');
  }

  const newSector: SectorDinamico = {
    id: data.id,
    nombre: data.nombre || cleanNombre,
    activo: data.activo ?? true,
    created_at: data.created_at || new Date().toISOString()
  };

  const current = await fetchSectoresDinamicos();
  const updated = [...current.filter(s => s.id !== newSector.id), newSector];
  localStorage.setItem('audimas_sectores_cache', JSON.stringify(updated));
  return newSector;
};

/**
 * Actualiza o desactiva un Sector
 */
export const updateSectorDinamico = async (id: string, updates: Partial<SectorDinamico>): Promise<void> => {
  const { error } = await supabase
    .from('sectores')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error al actualizar sector en DB:', error);
    throw new Error(error.message || 'No se pudo actualizar el sector en la base de datos');
  }

  const current = await fetchSectoresDinamicos();
  const updated = current.map(s => s.id === id ? { ...s, ...updates } : s);
  localStorage.setItem('audimas_sectores_cache', JSON.stringify(updated));
};

/**
 * Elimina un Sector
 */
export const deleteSectorDinamico = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('sectores')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error al eliminar sector en DB:', error);
    throw new Error(error.message || 'No se pudo eliminar el sector de la base de datos');
  }

  const current = await fetchSectoresDinamicos();
  const updated = current.filter(s => s.id !== id);
  localStorage.setItem('audimas_sectores_cache', JSON.stringify(updated));
};

/**
 * Obtiene la lista completa de perfiles de colaboradores exclusivamente desde la tabla 'profiles'
 */
export const fetchProfilesColaboradores = async (): Promise<ProfileColaborador[]> => {
  const list: ProfileColaborador[] = [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      data.forEach((row: any) => {
        const realEmail = row.email || row.correo || '';
        if (realEmail && realEmail.includes('@audimas.local')) {
          // Descartar correos ficticios generados previamente
          return;
        }

        const origenReal: 'Google' | 'Nativo' = (row.origen === 'Google' || row.origen === 'google') ? 'Google' : 'Nativo';

        const rawEstado = row.estado || 'activo';
        const estadoReal: EstadoColaborador = (rawEstado === 'pendiente' || rawEstado === 'pendiente_aprobacion')
          ? 'pendiente_aprobacion'
          : (rawEstado as EstadoColaborador);

        const rawName = row.nombre_apellido || row.full_name || row.nombre || (realEmail ? realEmail.split('@')[0] : 'Colaborador');

        list.push({
          id: row.id,
          email: realEmail,
          nombre_apellido: formatToTitleCase(rawName),
          telefono: row.telefono || '',
          tienda_codigo: row.tienda_codigo || row.tienda_id || '1031',
          tienda_nombre: row.tienda_nombre || row.tienda || '1031 - Tienda Jujuy',
          sector: row.sector || row.sector_nombre || '',
          estado: estadoReal,
          origen: origenReal,
          requiere_onboarding: Boolean(row.requiere_onboarding),
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString()
        });
      });
    }
  } catch (err) {
    console.warn('⚠️ Error consultando perfiles de colaboradores en DB:', err);
  }

  if (list.length > 0) {
    return list;
  }

  const cached = localStorage.getItem('audimas_profiles_cache');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed.filter((p: any) => p.email && !p.email.includes('@audimas.local'));
      }
    } catch {}
  }

  return [];
};

/**
 * Actualiza el estado de un colaborador ('pendiente_aprobacion', 'activo', 'suspendido')
 */
export const updateColaboradorEstado = async (id: string, estado: EstadoColaborador): Promise<void> => {
  try {
    await supabase
      .from('profiles')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch (err) {
    console.warn('⚠️ Error al actualizar estado de colaborador en DB:', err);
  }

  const cached = localStorage.getItem('audimas_profiles_cache');
  if (cached) {
    try {
      const profiles: ProfileColaborador[] = JSON.parse(cached);
      const updated = profiles.map(p => p.id === id ? { ...p, estado } : p);
      localStorage.setItem('audimas_profiles_cache', JSON.stringify(updated));
    } catch {}
  }
};

/**
 * Actualiza datos de perfil de un colaborador (Nombre, Tienda, Sector, Estado)
 */
export const updateColaboradorProfile = async (id: string, updates: Partial<ProfileColaborador>): Promise<void> => {
  try {
    const dbPayload: any = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    if (updates.nombre_apellido) {
      dbPayload.full_name = updates.nombre_apellido;
    }

    await supabase
      .from('profiles')
      .update(dbPayload)
      .eq('id', id);
  } catch (err) {
    console.warn('⚠️ Error al actualizar perfil de colaborador en DB:', err);
  }

  const cached = localStorage.getItem('audimas_profiles_cache');
  if (cached) {
    try {
      const profiles: ProfileColaborador[] = JSON.parse(cached);
      const updated = profiles.map(p => p.id === id ? { ...p, ...updates } : p);
      localStorage.setItem('audimas_profiles_cache', JSON.stringify(updated));
    } catch {}
  }
};

/**
 * Elimina el perfil de un colaborador
 */
export const deleteColaboradorProfile = async (id: string): Promise<void> => {
  try {
    await supabase.from('profiles').delete().eq('id', id);
  } catch (err) {
    console.warn('⚠️ Error al eliminar colaborador de DB:', err);
  }

  const cached = localStorage.getItem('audimas_profiles_cache');
  if (cached) {
    try {
      const profiles: ProfileColaborador[] = JSON.parse(cached);
      const updated = profiles.filter(p => p.id !== id);
      localStorage.setItem('audimas_profiles_cache', JSON.stringify(updated));
    } catch {}
  }
};
