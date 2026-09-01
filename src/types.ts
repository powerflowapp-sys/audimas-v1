export interface ProductoMaestro {
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo?: string;
  depto_nombre?: string;
  updated_at?: string;
}

export interface CamionNAE {
  id: string;
  numero_nae: string;
  tienda_codigo: string;
  tienda_nombre: string;
  fecha_arribo?: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'FINALIZADO' | 'CERRADO';
  fecha_inicio_auditoria?: string;
  fecha_fin_auditoria?: string;
  created_at?: string;
}

export interface AuditoriaItem {
  id?: string;
  nae_id: string;
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo?: string;
  depto_nombre?: string;
  bultos_esperados: number;
  unidades_esperadas: number;
  stock_disponible: number;
  es_agotado_transito: boolean;
  bultos_escaneados: number;
  unidades_escaneadas: number;
  es_sobrante_no_facturado: boolean;
  caja_separada_transito?: boolean;
  ultimo_colaborador?: string;
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

export interface ItemManifiestoParsed {
  upc: string;
  sku: string;
  descripcion: string;
  depto_codigo: string;
  depto_nombre: string;
  bultos_esperados: number;
  unidades_esperadas: number;
  stock_disponible: number;
  es_agotado_transito: boolean;
}

export interface CamionManifiestoPreview {
  numero_nae: string;
  tienda_codigo: string;
  tienda_nombre: string;
  totalSKUs: number;
  totalBultos: number;
  totalUnidades: number;
  agotadosTransitoCount: number;
  items: ItemManifiestoParsed[];
}

export interface MaestroPreview {
  totalRegistros: number;
  muestra: ProductoMaestro[];
}

export interface ResumenAuditoria {
  totalSkus: number;
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
}

export interface ProductividadColaborador {
  colaborador_nombre: string;
  totalUnidades: number;
  totalBultos: number;
  totalEscaneos: number;
  porcentajeParticipacion: number;
}

export type ProgressCallback = (percent: number, current: number, total: number, message: string) => void;
