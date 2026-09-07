import { supabase } from './supabase';
import { purgeCamionPhotos } from './storageService';
import { 
  CamionNAE, 
  AuditoriaItem, 
  ProductividadColaborador 
} from '../types';
import { 
  exportarAuditoriaExcel, 
  calcularResumenAuditoria, 
  fetchProductividadColaboradores 
} from './reportService';

export interface ReporteSnapshot {
  nae: CamionNAE;
  items: AuditoriaItem[];
  productividad: ProductividadColaborador[];
  fechaGeneracion: string;
}

const LOCAL_SNAPSHOTS_KEY = 'audimas_report_snapshots_v1';

/**
 * Ejecuta la eliminación estricta en cascada de un camión NAE y sus registros hijos:
 * 1. DELETE FROM auditoria_logs WHERE nae_id = :naeId
 * 2. DELETE FROM auditoria_items WHERE nae_id = :naeId
 * 3. DELETE FROM reclamos_magma WHERE nae_id = :naeId
 * 4. Purga imágenes en Supabase Storage
 * 5. DELETE FROM camiones_nae WHERE id = :naeId
 */
export const eliminarCamionEnCascada = async (naeId: string): Promise<boolean> => {
  try {
    // Purga física de evidencias fotográficas en Supabase Storage
    await purgeCamionPhotos(naeId);

    // 1. Borrado estricto de auditoria_logs
    await supabase.from('auditoria_logs').delete().eq('nae_id', naeId);

    // 2. Borrado estricto de auditoria_items
    await supabase.from('auditoria_items').delete().eq('nae_id', naeId);

    // 3. Borrado estricto de reclamos_magma
    await supabase.from('reclamos_magma').delete().eq('nae_id', naeId);

    // Limpieza de cachés locales
    try {
      const recRaw = localStorage.getItem('audimas_reclamos_magma_cache');
      if (recRaw) {
        const recMap = JSON.parse(recRaw);
        delete recMap[naeId];
        delete recMap[`rec_${naeId}`];
        localStorage.setItem('audimas_reclamos_magma_cache', JSON.stringify(recMap));
      }
      const snapRaw = localStorage.getItem('audimas_report_snapshots_v1');
      if (snapRaw) {
        const snapMap = JSON.parse(snapRaw);
        delete snapMap[naeId];
        localStorage.setItem('audimas_report_snapshots_v1', JSON.stringify(snapMap));
      }
    } catch (e) {
      console.warn('Error al limpiar caché local:', e);
    }

    // 4. Borrado estricto de cabecera camiones_nae
    const { error: rpcError } = await supabase.rpc('eliminar_camion_nae', { p_nae_id: naeId });
    if (rpcError) {
      const { error: deleteError } = await supabase.from('camiones_nae').delete().eq('id', naeId);
      if (deleteError) {
        throw new Error(`Error al eliminar cabecera de camión NAE: ${deleteError.message}`);
      }
    }

    return true;
  } catch (err) {
    console.error('Error al ejecutar borrado en cascada del camión NAE:', err);
    throw err;
  }
};

/**
 * Ejecuta la eliminación explícita por numero_nae en todas las tablas para garantizar
 * que no quede ninguna fila previa que bloquee el constraint único "camiones_nae_numero_nae_key".
 */
export const eliminarCamionPorNumeroNae = async (numeroNae: string): Promise<boolean> => {
  try {
    const cleanNaeStr = numeroNae.trim();
    if (!cleanNaeStr) return false;

    // 1. Buscar todos los IDs asociados a este numero_nae en camiones_nae
    const { data: camiones } = await supabase
      .from('camiones_nae')
      .select('id')
      .eq('numero_nae', cleanNaeStr);

    if (camiones && camiones.length > 0) {
      for (const c of camiones) {
        await purgeCamionPhotos(c.id);
        await supabase.from('auditoria_logs').delete().eq('nae_id', c.id);
        await supabase.from('auditoria_items').delete().eq('nae_id', c.id);
        await supabase.from('reclamos_magma').delete().eq('nae_id', c.id);
        await supabase.from('camiones_nae').delete().eq('id', c.id);
      }
    }

    // 2. Limpieza directa de respaldo por numero_nae
    await supabase.from('reclamos_magma').delete().eq('nae_numero', cleanNaeStr);
    await supabase.from('camiones_nae').delete().eq('numero_nae', cleanNaeStr);

    // 3. Limpieza de cachés locales asociadas a este NAE
    try {
      const recRaw = localStorage.getItem('audimas_reclamos_magma_cache');
      if (recRaw) {
        const recMap = JSON.parse(recRaw);
        Object.keys(recMap).forEach(key => {
          if (recMap[key]?.nae_numero === cleanNaeStr || (camiones || []).some(c => c.id === recMap[key]?.nae_id)) {
            delete recMap[key];
          }
        });
        localStorage.setItem('audimas_reclamos_magma_cache', JSON.stringify(recMap));
      }
      const snapRaw = localStorage.getItem('audimas_report_snapshots_v1');
      if (snapRaw) {
        const snapMap = JSON.parse(snapRaw);
        (camiones || []).forEach(c => delete snapMap[c.id]);
        localStorage.setItem('audimas_report_snapshots_v1', JSON.stringify(snapMap));
      }
    } catch (e) {
      console.warn('Error al limpiar caché local por numero_nae:', e);
    }

    return true;
  } catch (err) {
    console.error(`Error al purgar camión NAE #${numeroNae}:`, err);
    throw err;
  }
};

/**
 * Guarda el snapshot permanente de un reporte de auditoría finalizado en localStorage (y Supabase como backup)
 */
export const guardarSnapshotReporte = async (
  nae: CamionNAE,
  items: AuditoriaItem[],
  productividad: ProductividadColaborador[]
) => {
  try {
    const estadoFinal = nae.estado || 'CERRADO';

    const naeClosed: CamionNAE = {
      ...nae,
      estado: estadoFinal,
      fecha_fin_auditoria: nae.fecha_fin_auditoria || new Date().toISOString()
    };

    const snapshot: ReporteSnapshot = {
      nae: naeClosed,
      items,
      productividad,
      fechaGeneracion: new Date().toISOString()
    };

    // Guardar en localStorage
    const existingsStr = localStorage.getItem(LOCAL_SNAPSHOTS_KEY);
    let snapshotsMap: Record<string, ReporteSnapshot> = {};
    if (existingsStr) {
      try {
        snapshotsMap = JSON.parse(existingsStr);
      } catch (e) {
        snapshotsMap = {};
      }
    }
    snapshotsMap[nae.id] = snapshot;
    localStorage.setItem(LOCAL_SNAPSHOTS_KEY, JSON.stringify(snapshotsMap));

  } catch (err) {
    console.warn('No se pudo guardar el snapshot en localStorage:', err);
  }
};

/**
 * Obtiene el snapshot guardado localmente de un camión
 */
export const getSnapshotLocal = (naeId: string): ReporteSnapshot | null => {
  try {
    const existingsStr = localStorage.getItem(LOCAL_SNAPSHOTS_KEY);
    if (!existingsStr) return null;
    const snapshotsMap: Record<string, ReporteSnapshot> = JSON.parse(existingsStr);
    return snapshotsMap[naeId] || null;
  } catch (e) {
    return null;
  }
};

/**
 * Descarga el archivo Excel para un camión consultando siempre los datos vivos de Supabase
 */
export const descargarExcelHistorial = async (camion: CamionNAE) => {
  // Consultar ítems y productividad vivos directamente en Supabase
  const { data: items } = await supabase
    .from('auditoria_items')
    .select('*')
    .eq('nae_id', camion.id);

  const productividad = await fetchProductividadColaboradores(camion.id);

  const itemsValidos = items || [];
  await exportarAuditoriaExcel(camion, itemsValidos, productividad);
};

/**
 * Política de Limpieza Automática a 7 Días:
 * Purga automáticamente de Supabase los registros de camiones con estado = 'FINALIZADO' / 'CERRADO'
 * que tengan más de 7 días transcurridos desde su fecha de cierre.
 * 
 * REGLAS ESTRICTAS DE INTEGRIDAD:
 * 1. NO borra fotos en Supabase Storage (preserva evidencias fotográficas).
 * 2. NO elimina filas en la tabla reclamos_magma.
 * 3. Elimina en cascada auditoria_logs, auditoria_items y camiones_nae para liberar espacio en DB.
 */
export const purgerCamionesFinalizadosMayores7Dias = async (): Promise<number> => {
  try {
    // 1. Intentar invocar primero la función RPC de Supabase si existe
    const { data: rpcCount, error: rpcError } = await supabase.rpc('purgar_camiones_7_dias');
    if (!rpcError && typeof rpcCount === 'number') {
      return rpcCount;
    }

    // 2. Fallback de cliente vía API REST si RPC no está desplegada en Supabase
    const { data: camionesAntiguos, error: selectError } = await supabase
      .from('camiones_nae')
      .select('id, numero_nae, fecha_fin_auditoria, fecha_fin')
      .or('estado.eq.FINALIZADO,estado.eq.CERRADO');

    if (selectError || !camionesAntiguos || camionesAntiguos.length === 0) {
      return 0;
    }

    let purgedCount = 0;
    const ahoraMs = Date.now();
    const msEn7Dias = 7 * 24 * 60 * 60 * 1000;

    for (const c of camionesAntiguos) {
      const fechaFinStr = c.fecha_fin_auditoria || c.fecha_fin;
      if (!fechaFinStr) continue;

      const fechaFinMs = new Date(fechaFinStr).getTime();
      if (isNaN(fechaFinMs)) continue;

      if ((ahoraMs - fechaFinMs) > msEn7Dias) {
        // Borrar exclusivamente logs e items de auditoría física (NO reclamos_magma y NO fotos en Storage)
        await supabase.from('auditoria_logs').delete().eq('nae_id', c.id);
        await supabase.from('auditoria_items').delete().eq('nae_id', c.id);
        await supabase.from('camiones_nae').delete().eq('id', c.id);
        purgedCount++;
      }
    }

    return purgedCount;
  } catch (err) {
    console.warn('Error al ejecutar purgerCamionesFinalizadosMayores7Dias:', err);
    return 0;
  }
};
