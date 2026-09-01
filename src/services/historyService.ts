import { supabase } from './supabase';
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
 * Guarda el snapshot permanente de un reporte de auditoría finalizado en localStorage (y Supabase como backup)
 */
export const guardarSnapshotReporte = async (
  nae: CamionNAE,
  items: AuditoriaItem[],
  productividad: ProductividadColaborador[]
) => {
  try {
    const naeClosed: CamionNAE = {
      ...nae,
      estado: 'CERRADO',
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
 * Descarga el archivo Excel para un camión cerrado, intentando usar el snapshot guardado o consultando Supabase
 */
export const descargarExcelHistorial = async (camion: CamionNAE) => {
  // 1. Intentar obtener el snapshot guardado localmente
  const snap = getSnapshotLocal(camion.id);
  if (snap && snap.items && snap.items.length > 0) {
    exportarAuditoriaExcel(snap.nae, snap.items, snap.productividad);
    return;
  }

  // 2. Si no hay snapshot local, consultar ítems de Supabase
  const { data: items } = await supabase
    .from('auditoria_items')
    .select('*')
    .eq('nae_id', camion.id);

  const productividad = await fetchProductividadColaboradores(camion.id);

  const itemsValidos = items || [];
  exportarAuditoriaExcel(camion, itemsValidos, productividad);
};
