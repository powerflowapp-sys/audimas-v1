export interface ProductoMaestro {
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo?: string;
  depto_nombre?: string;
  unidad_medida?: string;
  costo_unitario?: number;
  precio_retail?: number;
  updated_at?: string;
}

export interface CamionNAE {
  id: string;
  numero_nae: string;
  tienda_codigo: string;
  tienda_nombre: string;
  fecha_arribo?: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'FINALIZADO' | 'CERRADO' | 'CERRADO_PARCIAL' | 'FINALIZADO_PARCIAL';
  es_parcial?: boolean;
  tipo_cierre?: 'TOTAL' | 'PARCIAL';
  has_log_parcial?: boolean;
  has_log_cierre_parcial?: boolean;
  fecha_inicio_auditoria?: string;
  fecha_fin_auditoria?: string;
  fecha_fin?: string;
  fecha_reapertura?: string;
  fecha_fin_reapertura?: string;
  tiene_reporte_ap?: boolean;
  monto_total_esperado?: number;
  modo_auditoria?: 'TOTAL' | 'MONTO' | 'UNIDADES' | 'MIXTO';
  meta_monto?: number;
  meta_unidades?: number;
  meta_porcentaje?: number;
  umbral_unidades?: number;
  umbral_monto?: number;
  has_depto_91?: boolean;
  usuario_carga?: string;
  usuario_inicio_auditoria?: string;
  usuario_fin_auditoria?: string;
  usuario_reapertura?: string;
  usuario_cierre_reapertura?: string;
  created_at?: string;
}

/**
 * Determina de forma unificada y resiliente si un camión fue cerrado de forma PARCIAL.
 * Valida estado (FINALIZADO_PARCIAL / CERRADO_PARCIAL), es_parcial, tipo_cierre o cruce de logs (has_log_parcial).
 * Si el camión fue reabierto y está actualmente EN_PROCESO, retorna false.
 */
export const isCamionCierreParcial = (camion?: Partial<CamionNAE> | null): boolean => {
  if (!camion) return false;
  const est = (camion.estado || '').trim().toUpperCase();
  if (est === 'EN_PROCESO') return false;

  return Boolean(camion.es_parcial) || 
    camion.tipo_cierre === 'PARCIAL' || 
    est === 'FINALIZADO_PARCIAL' || 
    est === 'CERRADO_PARCIAL' ||
    Boolean(camion.has_log_parcial) ||
    Boolean(camion.has_log_cierre_parcial);
};

export const isItemInAuditScope = (
  item: { unidades_esperadas: number; costo_total?: number; costo_unitario?: number },
  modo?: string,
  umbralUnidades: number = 0,
  umbralMonto: number = 0
): boolean => {
  const mUpper = (modo || 'TOTAL').toUpperCase();
  if (mUpper === 'TOTAL') return true;

  const uEsp = Number(item.unidades_esperadas || 0);
  const cTotal = Number(item.costo_total || ((item.costo_unitario || 0) * uEsp));

  if (mUpper === 'UNIDADES') {
    return uEsp >= umbralUnidades;
  }
  if (mUpper === 'MONTO') {
    return cTotal >= umbralMonto;
  }
  if (mUpper === 'MIXTO') {
    return (uEsp >= umbralUnidades) || (cTotal >= umbralMonto);
  }
  return true;
};

export interface AuditoriaItem {
  id?: string;
  nae_id: string;
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo?: string;
  depto_nombre?: string;
  unidad_medida?: string;
  bultos_esperados: number;
  unidades_esperadas: number;
  stock_disponible: number;
  es_agotado_transito: boolean;
  bultos_escaneados: number;
  unidades_escaneadas: number;
  es_sobrante_no_facturado: boolean;
  caja_separada_transito?: boolean;
  ultimo_colaborador?: string;
  costo_unitario?: number;
  costo_total?: number;
  costo_unitario_ap?: number;
  costo_unitario_aplicado?: number;
  costo_total_reclamado?: number;
  precio_retail?: number;
  cantidad_danada?: number;
  observacion_dano?: string;
  foto_dano_url?: string;
  fotos_dano_urls?: string[];
  updated_at?: string;
}

export interface AuditoriaLog {
  id?: string;
  nae_id: string;
  upc: string;
  colaborador_nombre: string;
  modo_conteo: 'BULTOS' | 'UNIDADES';
  cantidad: number;
  created_at?: string;
}

export interface ItemAPParsed {
  sku: string;
  upc: string;
  costo_unitario: number;
  costo_total: number;
}

export interface ItemManifiestoParsed {
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo: string;
  depto_nombre: string;
  unidad_medida?: string;
  bultos_esperados: number;
  unidades_esperadas: number;
  stock_disponible: number;
  es_agotado_transito: boolean;
  costo_unitario?: number;
  costo_total?: number;
  precio_retail?: number;
  caja_separada_transito?: boolean;
  foto_dano_url?: string;
  observacion_dano?: string;
  ultimo_colaborador?: string;
}

export interface CamionManifiestoPreview {
  numero_nae: string;
  tienda_codigo: string;
  tienda_nombre: string;
  totalSKUs: number;
  totalBultos: number;
  totalUnidades: number;
  agotadosTransitoCount: number;
  tiene_reporte_ap?: boolean;
  monto_total_esperado?: number;
  items: ItemManifiestoParsed[];
}

export interface MaestroPreview {
  totalRegistros: number;
  muestra: ProductoMaestro[];
}

export interface ResumenAuditoria {
  totalSkus: number;
  skusAuditados: number;
  skusManifiesto: number;
  skusAuditadosManifiesto: number;
  unidadesEsperadas: number;
  unidadesEscaneadas: number;
  bultosEsperados: number;
  bultosEscaneados: number;
  efectividadPorcentaje: number;
  skusConFaltante: number;
  unidadesFaltantes: number;
  skusConSobrante: number;
  unidadesSobrantes: number;
  skusNoFacturados: number;
  unidadesNoFacturadas: number;
  skusAgotadosTransito: number;
  skusNoContados: number;
}

export interface ProductividadColaborador {
  colaborador_nombre: string;
  totalUnidades: number;
  totalBultos: number;
  totalEscaneos: number;
  porcentajeParticipacion: number;
}

export type EstadoReclamoMagma = 'PENDIENTE' | 'RECLAMADO' | 'ACEPTADO' | 'RECHAZADO';

export interface ReclamoMagma {
  id: string;
  nae_id: string;
  nae_numero: string;
  tienda_codigo: string;
  tienda_nombre: string;
  estado: EstadoReclamoMagma;
  ticket_magma?: string;
  monto_total_reclamado: number;
  monto_discrepancias_total?: number;
  items_seleccionados?: string[];
  seleccion_manual?: boolean;
  monto_liquidado?: number;
  observaciones?: string;
  cant_skus_afectados?: number;
  cant_unidades_afectadas?: number;
  fecha_cierre_auditoria?: string;
  fecha_ultima_exportacion?: string;
  fecha_reclamado_magma?: string;
  fecha_resolucion?: string;
  created_at?: string;
  updated_at?: string;
}

export type ProgressCallback = (percent: number, current: number, total: number, message: string) => void;

export type EstadoColaborador = 'pendiente_aprobacion' | 'pendiente' | 'activo' | 'suspendido';

export interface ProfileColaborador {
  id: string;
  email: string;
  nombre_apellido: string;
  full_name?: string;
  telefono?: string;
  tienda_codigo?: string;
  tienda_nombre?: string;
  sector?: string;
  avatar_url?: string;
  estado: EstadoColaborador;
  origen?: 'Google' | 'Nativo';
  requiere_onboarding?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TiendaDinamica {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  created_at?: string;
}

export interface SectorDinamico {
  id: string;
  nombre: string;
  activo: boolean;
  created_at?: string;
}

export interface AppSetting {
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
}


