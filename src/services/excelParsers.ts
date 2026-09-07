import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { eliminarCamionEnCascada, eliminarCamionPorNumeroNae } from './historyService';
import { 
  ProductoMaestro, 
  CamionManifiestoPreview, 
  ItemManifiestoParsed,
  MaestroPreview,
  ProgressCallback 
} from '../types';

/**
 * Sanitiza valores de celda a cadena limpia
 */
const cleanString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return val.toLocaleString('fullwide', { useGrouping: false }).trim();
  }
  return String(val).trim();
};

/**
 * Parse de números seguro con valor predeterminado 0
 */
const parseNumber = (val: unknown): number => {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  return isNaN(num) ? 0 : num;
};

/**
 * Normaliza las claves SKU y UPC eliminando espacios y caracteres no numéricos residuales.
 */
export const normalizeCodeKey = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'number'
    ? val.toLocaleString('fullwide', { useGrouping: false }).trim()
    : String(val).trim();
  if (!str) return '';
  return str.replace(/\.0$/, '').replace(/\s+/g, '').toUpperCase();
};

/**
 * Sanitiza un objeto de producto para mapear estrictamente las columnas reales de la tabla auditoria_items en Supabase.
 * Excluye campos calculados en cliente/UI como costo_unitario_ap, costo_unitario_aplicado, costo_total_reclamado, fotos_dano_urls.
 */
export const sanitizeAuditoriaItemForDb = (item: Record<string, any>): Record<string, any> => {
  const clean: Record<string, any> = {
    nae_id: item.nae_id,
    sku: String(item.sku || ''),
    upc: String(item.upc || ''),
    descripcion: String(item.descripcion || ''),
    bultos_esperados: Number(item.bultos_esperados || 0),
    unidades_esperadas: Number(item.unidades_esperadas || 0),
    stock_disponible: Number(item.stock_disponible || 0),
    bultos_escaneados: Number(item.bultos_escaneados || 0),
    unidades_escaneadas: Number(item.unidades_escaneadas || 0),
    cantidad_danada: Number(item.cantidad_danada || 0),
    es_agotado_transito: Boolean(item.es_agotado_transito),
    es_sobrante_no_facturado: Boolean(item.es_sobrante_no_facturado),
    updated_at: item.updated_at || new Date().toISOString()
  };

  if (item.id !== undefined && item.id !== null) clean.id = item.id;
  if (item.depto_codigo !== undefined && item.depto_codigo !== null) clean.depto_codigo = String(item.depto_codigo);
  if (item.depto_nombre !== undefined && item.depto_nombre !== null) clean.depto_nombre = String(item.depto_nombre);
  if (item.unidad_medida !== undefined && item.unidad_medida !== null) clean.unidad_medida = String(item.unidad_medida);
  if (item.costo_unitario !== undefined && item.costo_unitario !== null) clean.costo_unitario = Number(item.costo_unitario) || 0;
  if (item.costo_total !== undefined && item.costo_total !== null) clean.costo_total = Number(item.costo_total) || 0;
  if (item.precio_retail !== undefined && item.precio_retail !== null) clean.precio_retail = Number(item.precio_retail) || 0;
  if (item.caja_separada_transito !== undefined && item.caja_separada_transito !== null) clean.caja_separada_transito = Boolean(item.caja_separada_transito);
  if (item.foto_dano_url !== undefined && item.foto_dano_url !== null) clean.foto_dano_url = item.foto_dano_url;
  if (item.observacion_dano !== undefined && item.observacion_dano !== null) clean.observacion_dano = item.observacion_dano;
  if (item.ultimo_colaborador !== undefined && item.ultimo_colaborador !== null) clean.ultimo_colaborador = item.ultimo_colaborador;

  return clean;
};

/**
 * Catálogo / Diccionario de Mapeo de Sucursales
 */
export const STORE_CATALOG: Record<string, string> = {
  '1031': 'Jujuy',
  '1001': 'Central',
  '1002': 'Salta',
  '1032': 'Tucumán'
};

/**
 * Formatea y resuelve de forma segura tienda_codigo y tienda_nombre:
 * 1. Si el NAE tiene formato "139122-1031", la parte posterior al guión es tienda_codigo (ej: "1031").
 * 2. Si tienda_codigo es "1031", asigna automáticamente tienda_nombre: "Jujuy".
 * 3. Si no hay nombre explícito válido en Excel, NUNCA usar códigos de departamento o NAEs.
 */
export const formatStoreDisplay = (
  codigo?: string, 
  nombre?: string, 
  numeroNae?: string
): { tienda_codigo: string; tienda_nombre: string; fullDisplay: string } => {
  let cleanCode = (codigo || '').trim();
  let cleanName = (nombre || '').trim();
  const cleanNae = (numeroNae || '').trim();

  // 1. Extraer tienda_codigo desde el sufijo post guión si el código o NAE contiene guión
  if (cleanCode.includes('-')) {
    const parts = cleanCode.split('-');
    if (parts.length >= 2 && parts[1].trim()) {
      cleanCode = parts[1].trim();
    }
  }

  if ((!cleanCode || cleanCode === '0000' || cleanCode.length > 8) && cleanNae.includes('-')) {
    const parts = cleanNae.split('-');
    if (parts.length >= 2 && parts[1].trim()) {
      cleanCode = parts[1].trim();
    }
  }

  if (!cleanCode || cleanCode.length > 8) {
    cleanCode = '1031';
  }

  // 2. Validar tienda_nombre: descartar si es numérico (ej: "13"), o si es igual al NAE o ambiguo
  const isNameInvalid = !cleanName || 
    !isNaN(Number(cleanName)) || 
    cleanName.includes('-') || 
    cleanName.toUpperCase() === 'TIENDA' || 
    cleanName.toUpperCase() === 'NOMBRE' ||
    cleanName.toUpperCase() === 'GENERAL' ||
    cleanName.length > 30;

  if (isNameInvalid) {
    if (STORE_CATALOG[cleanCode]) {
      cleanName = STORE_CATALOG[cleanCode];
    } else if (cleanCode === '1031') {
      cleanName = 'Jujuy';
    } else {
      cleanName = 'Jujuy';
    }
  } else if (cleanCode === '1031' && cleanName !== 'Jujuy') {
    cleanName = 'Jujuy';
  }

  return {
    tienda_codigo: cleanCode,
    tienda_nombre: cleanName,
    fullDisplay: `${cleanCode} - ${cleanName}`
  };
};

/**
 * Normaliza nombres de encabezados de columnas:
 * Convertir a minúsculas, remover tildes/diacríticos y caracteres no alfanuméricos.
 */
const normalizeHeader = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
    .replace(/[^a-z0-9\s]/g, ' ')   // Reemplazar caracteres especiales por espacio
    .replace(/\s+/g, ' ')           // Unificar espacios múltiples
    .trim();
};

/**
 * Estructura de mapeo dinámico de índices de columna
 */
interface ColumnMap {
  numero_nae: number;
  tienda_codigo: number;
  tienda_nombre: number;
  depto_codigo: number;
  depto_nombre: number;
  sku: number;
  descripcion: number;
  upc: number;
  bultos_esperados: number;
  unidades_esperadas: number;
  stock_disponible: number;
  costo_unitario: number;
  costo_total: number;
  unidad_medida: number;
  precio_retail: number;
}

/**
 * Escanea las primeras N filas del Excel para identificar la fila real de cabecera
 * y resolver dinámicamente el índice de cada columna según coincidencias flexibles.
 */
const findHeaderRowAndMap = (rows: unknown[][]): { headerIndex: number; colMap: ColumnMap } => {
  const colMap: ColumnMap = {
    numero_nae: -1,
    tienda_codigo: -1,
    tienda_nombre: -1,
    depto_codigo: -1,
    depto_nombre: -1,
    sku: -1,
    descripcion: -1,
    upc: -1,
    bultos_esperados: -1,
    unidades_esperadas: -1,
    stock_disponible: -1,
    costo_unitario: -1,
    costo_total: -1,
    unidad_medida: -1,
    precio_retail: -1
  };

  const maxScanRows = Math.min(10, rows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = rows[r] || [];
    const normRow = rawRow.map(c => normalizeHeader(c));

    // Verificar si la fila contiene términos típicos de encabezado
    const hasSkuOrUpc = normRow.some(c => 
      c.includes('sku') || c.includes('upc') || c.includes('ean') || 
      c.includes('articulo') || c.includes('barra') || c.includes('material')
    );
    const hasDataKeys = normRow.some(c => 
      c.includes('descripcion') || c.includes('depto') || c.includes('departamento') || 
      c.includes('nae') || c.includes('bulto') || c.includes('unidad') || c.includes('stock')
    );

    if (hasSkuOrUpc || hasDataKeys) {
      const currentMap: ColumnMap = { ...colMap };

      normRow.forEach((cell, cIdx) => {
        if (!cell) return;

        // NAE / Remito / Camión
        if (currentMap.numero_nae === -1 && (
          cell === 'nae' || cell.includes('numero nae') || cell.includes('nro nae') || 
          cell.includes('num nae') || cell.includes('remito') || cell.includes('camion')
        )) {
          currentMap.numero_nae = cIdx;
        }

        // Tienda Código / Local
        if (currentMap.tienda_codigo === -1 && (
          cell.includes('tienda codigo') || cell.includes('cod tienda') || 
          cell.includes('codigo tienda') || cell.includes('tienda cod') || cell.includes('cod local')
        )) {
          currentMap.tienda_codigo = cIdx;
        }

        // Tienda Nombre / Local / Sucursal
        if (currentMap.tienda_nombre === -1 && (
          cell.includes('tienda nombre') || cell.includes('nombre tienda') || 
          cell.includes('nombre local') || cell === 'sucursal' || cell === 'tienda'
        )) {
          currentMap.tienda_nombre = cIdx;
        }

        // Depto Nombre vs Depto Código
        if (cell.includes('nombre depto') || cell.includes('depto nombre') || cell.includes('descripcion depto') || cell.includes('desc depto') || cell.includes('rubro') || cell.includes('seccion')) {
          if (currentMap.depto_nombre === -1) currentMap.depto_nombre = cIdx;
        } else if (cell.includes('cod depto') || cell.includes('codigo depto') || cell.includes('depto codigo') || cell.includes('depto cod') || cell.includes('cod departamento') || cell === 'departamento' || cell === 'depto') {
          if (currentMap.depto_codigo === -1) currentMap.depto_codigo = cIdx;
        }

        // SKU / Articulo / Material
        if (currentMap.sku === -1 && (
          cell === 'sku' || cell.includes('articulo') || cell.includes('cod articulo') || 
          cell.includes('codigo articulo') || cell.includes('material') || cell === 'item'
        )) {
          currentMap.sku = cIdx;
        }

        // Descripción / Detalle
        if (currentMap.descripcion === -1 && (
          cell.includes('descripcion') || cell.includes('detalle') || 
          cell === 'nombre' || cell.includes('nombre producto') || cell.includes('descripcion sku')
        )) {
          currentMap.descripcion = cIdx;
        }

        // UPC / EAN / Barcode
        if (currentMap.upc === -1 && (
          cell === 'upc' || cell === 'ean' || cell.includes('codigo de barras') || 
          cell.includes('codigo barras') || cell.includes('cod barra') || cell.includes('barra') || cell === 'barras'
        )) {
          currentMap.upc = cIdx;
        }

        // Bultos Esperados / Cajas
        if (currentMap.bultos_esperados === -1 && (
          cell.includes('bultos esperados') || cell.includes('cant bultos') || 
          cell.includes('bultos') || cell.includes('cajas esperadas') || cell.includes('cajas') || cell === 'bulto'
        )) {
          currentMap.bultos_esperados = cIdx;
        }

        // Unidades Esperadas / Piezas
        if (currentMap.unidades_esperadas === -1 && (
          cell.includes('unidades esperadas') || cell.includes('cant unidades') || 
          cell.includes('u esperadas') || cell.includes('unidades') || cell.includes('piezas') || cell === 'unid'
        )) {
          currentMap.unidades_esperadas = cIdx;
        }

        // Stock Disponible
        if (currentMap.stock_disponible === -1 && (
          cell.includes('stock disponible') || cell.includes('stock disp') || cell === 'stock'
        )) {
          currentMap.stock_disponible = cIdx;
        }

        // Costo Unitario
        if (currentMap.costo_unitario === -1 && (
          cell.includes('costo unitario') || cell.includes('costo unit') || 
          cell.includes('costo medio') || cell.includes('precio costo') || cell.includes('costo un') || cell.includes('costo_unit')
        )) {
          currentMap.costo_unitario = cIdx;
        }

        // Costo Total
        if (currentMap.costo_total === -1 && (
          cell.includes('costo total') || cell.includes('monto total') || 
          cell.includes('costo tot') || cell.includes('total costo')
        )) {
          currentMap.costo_total = cIdx;
        }

        // Unidad de Medida
        if (currentMap.unidad_medida === -1 && (
          cell === 'um' || cell === 'u m' || cell.includes('unidad medida') || 
          cell.includes('unidad de medida') || cell.includes('uom') || cell.includes('unid medida') || cell.includes('u_medida')
        )) {
          currentMap.unidad_medida = cIdx;
        }

        // Precio Retail
        if (currentMap.precio_retail === -1 && (
          cell.includes('precio retail') || cell.includes('precio venta') || 
          cell.includes('pvp') || cell.includes('precio público') || cell.includes('precio publico') || 
          cell === 'retail'
        )) {
          currentMap.precio_retail = cIdx;
        }
      });

      // Si se encontró departamento código y no se encontró depto_nombre pero la columna contigua a depto_codigo existe:
      if (currentMap.depto_codigo !== -1 && currentMap.depto_nombre === -1) {
        const nextCol = currentMap.depto_codigo + 1;
        if (nextCol < rawRow.length && nextCol !== currentMap.sku && nextCol !== currentMap.descripcion && nextCol !== currentMap.upc) {
          currentMap.depto_nombre = nextCol;
        }
      }

      // Si identificamos al menos SKU, UPC, Descripción o NAE, esta fila es la cabecera real
      if (currentMap.sku !== -1 || currentMap.upc !== -1 || currentMap.descripcion !== -1 || currentMap.numero_nae !== -1) {
        return { headerIndex: r, colMap: currentMap };
      }
    }
  }

  return { headerIndex: -1, colMap };
};

/**
 * Busca y extrae el número NAE en caso de venir en la cabecera o texto libre de celdas
 */
const extractNaeFromText = (text: string): string => {
  if (!text) return '';
  const clean = text.trim();
  
  // Formato habitual: 153828-1031 o números similares con guión
  const matchHyphen = clean.match(/\b\d{4,10}-\d{2,6}\b/);
  if (matchHyphen) return matchHyphen[0];

  // Formato tipo "NAE: 153828" o "NAE #153828"
  const matchNaePrefix = clean.match(/NAE\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  if (matchNaePrefix) return matchNaePrefix[1];

  return clean;
};

// =============================================================================
// =============================================================================
// PARSER 1: MAESTRO GENERAL DE PRODUCTOS (V8 / Stock 24 - *.xlsx)
// =============================================================================

/**
 * Escanea encabezados de V8 Excel detectando columnas de Monto Valorizado y Stock SIM para cálculo exacto de Costo Medio
 */
const findV8HeaderRowAndMap = (rows: unknown[][]) => {
  const colMap = {
    sku: -1,
    upc: -1,
    descripcion: -1,
    unidad_medida: -1,
    depto_codigo: -1,
    depto_nombre: -1,
    monto_valorizado: -1,
    stock_total_sim: -1,
    costo_unitario_directo: -1,
    precio_retail: -1
  };

  let uomDescFound = false;
  const maxScanRows = Math.min(15, rows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = rows[r] || [];
    const normRow = rawRow.map(c => normalizeHeader(c));

    normRow.forEach((cell, cIdx) => {
      if (!cell) return;

      // SKU ID -> sku
      if (colMap.sku === -1 && (
        cell === 'sku id' || cell === 'sku' || cell.includes('sku id') || cell.includes('articulo id')
      )) {
        colMap.sku = cIdx;
      }

      // Código SKU ID ID -> upc
      if (colMap.upc === -1 && (
        cell.includes('codigo sku id id') || cell.includes('cod sku id id') || cell.includes('codigo sku') ||
        cell === 'upc' || cell === 'ean' || cell.includes('codigo de barras') || cell.includes('codigo barras') || cell.includes('barra')
      )) {
        colMap.upc = cIdx;
      }

      // SKU DESC -> descripcion
      if (colMap.descripcion === -1 && (
        cell.includes('sku desc') || cell.includes('sku descripcion') || cell.includes('descripcion') || cell === 'detalle'
      )) {
        colMap.descripcion = cIdx;
      }

      // Unidad de Medida (UOM): Priorizar celdas que indiquen texto/descripción y NO columnas de ID o Factores
      const isUomDescHeader = 
        cell.includes('unidad de medida del paquete desc') || cell.includes('uom desc') ||
        cell.includes('unidad de medida desc') || cell.includes('unidad medida desc') ||
        cell === 'uom' || cell === 'um' || cell === 'u m' || cell === 'u_medida';

      const isUomGeneralHeader = 
        cell.includes('unidad de medida') || cell.includes('unidad medida') || cell.includes('unid medida');

      const isUomIdOrFactor = 
        cell.includes('unidad de medida del paquete id') || cell.includes('uom id') ||
        cell.includes('factor') || cell.includes('bulto') || cell.includes('caja');

      if (isUomDescHeader) {
        colMap.unidad_medida = cIdx;
        uomDescFound = true;
      } else if (!uomDescFound && isUomGeneralHeader && !isUomIdOrFactor) {
        colMap.unidad_medida = cIdx;
        uomDescFound = true;
      } else if (!uomDescFound && colMap.unidad_medida === -1 && isUomGeneralHeader) {
        colMap.unidad_medida = cIdx;
      }

      // Dept ID ID vs Dept ID DESC
      if (cell.includes('dept id desc') || cell.includes('depto desc') || cell.includes('desc depto') || cell.includes('nombre depto')) {
        if (colMap.depto_nombre === -1) colMap.depto_nombre = cIdx;
      } else if (cell.includes('dept id id') || cell.includes('depto id id') || cell.includes('dept id') || cell.includes('cod depto') || cell.includes('depto id')) {
        if (colMap.depto_codigo === -1) colMap.depto_codigo = cIdx;
      }

      // Monto Valorizado / Stock $$ SIM / Costo Total
      if (colMap.monto_valorizado === -1 && (
        cell.includes('monto valorizado') || cell.includes('stock $$ sim') || cell.includes('stock $$') ||
        cell.includes('costo total') || cell.includes('valorizacion') || cell.includes('monto stock') ||
        cell.includes('valorizado') || cell.includes('monto')
      )) {
        colMap.monto_valorizado = cIdx;
      }

      // Stock Total SIM / Physical Stock Quantity (columna AO o similar)
      if (colMap.stock_total_sim === -1 && (
        cell.includes('stock total sim') || cell.includes('stock sim') || cell.includes('total stock - sim') ||
        cell.includes('total stock sim') || cell.includes('total stock') || cell.includes('cantidad stock') ||
        cell.includes('stock fisico') || cell === 'stock'
      )) {
        colMap.stock_total_sim = cIdx;
      }

      // Costo Unitario Directo (si existiera columna explícita de costo unitario/medio sin requerir división)
      const isTotalOrStockMonetary = cell.includes('total') || cell.includes('monto') || cell.includes('valorizad') || cell.includes('stock $$') || cell.includes('dinero');
      if (colMap.costo_unitario_directo === -1 && !isTotalOrStockMonetary && (
        cell.includes('costo medio unitario') || cell.includes('costo unitario medio') ||
        cell.includes('costo unitario') || cell.includes('costo unit')
      )) {
        colMap.costo_unitario_directo = cIdx;
      }

      // Precio Venta Retail -> precio_retail
      if (colMap.precio_retail === -1 && (
        cell.includes('precio venta retail') || cell.includes('precio retail') || cell.includes('precio venta') || cell === 'retail'
      )) {
        colMap.precio_retail = cIdx;
      }
    });

    if (colMap.sku !== -1 || colMap.descripcion !== -1) {
      // Verificación inteligente de datos en la columna UOM seleccionada
      const dataSampleEnd = Math.min(rows.length, r + 10);
      let numericUomCount = 0;
      let sampleCount = 0;

      if (colMap.unidad_medida !== -1) {
        for (let sr = r + 1; sr < dataSampleEnd; sr++) {
          const val = cleanString(rows[sr]?.[colMap.unidad_medida]).toUpperCase();
          if (val) {
            sampleCount++;
            if (!isNaN(Number(val)) || /^\d+(\.\d+)?$/.test(val)) numericUomCount++;
          }
        }
      }

      if (sampleCount > 0 && numericUomCount / sampleCount > 0.4) {
        console.warn(`⚠️ [findV8HeaderRowAndMap] Columna UOM inicial (${colMap.unidad_medida}) contiene números. Buscando columna de texto UOM real...`);
        let textUomCol = -1;
        const knownUoms = ['KG', 'L', 'EA', 'UN', 'G', 'KILOS', 'LITROS', 'GRAMOS', 'UNIDADES'];
        
        for (let c = 0; c < (rawRow.length || 0); c++) {
          if (c === colMap.sku || c === colMap.upc || c === colMap.descripcion || c === colMap.monto_valorizado || c === colMap.stock_total_sim || c === colMap.precio_retail) continue;
          let textMatches = 0;
          for (let sr = r + 1; sr < dataSampleEnd; sr++) {
            const val = cleanString(rows[sr]?.[c]).toUpperCase();
            if (knownUoms.includes(val)) textMatches++;
          }
          if (textMatches > 0) {
            textUomCol = c;
            break;
          }
        }

        if (textUomCol !== -1) {
          colMap.unidad_medida = textUomCol;
          console.log(`✅ [findV8HeaderRowAndMap] Reasignada columna UOM a columna ${textUomCol} con datos de texto válidos.`);
        }
      }

      console.log(`📋 [findV8HeaderRowAndMap] Encabezados V8 detectados en fila ${r + 1}:`, rawRow);
      console.log('📍 [findV8HeaderRowAndMap] Mapa de Columnas V8:', colMap);
      return { headerIndex: r, colMap };
    }
  }

  return { headerIndex: -1, colMap };
};

/**
 * Reporte V8 (Principal con Unidades de Medida y Costo Medio)
 * Optimizado para archivos grandes (>33 MB) con bajo consumo de memoria RAM.
 */
export const parseMaestroV8Excel = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<ProductoMaestro[]> => {
  if (onProgress) {
    onProgress(5, 0, 0, 'Leyendo archivo Excel V8 en memoria...');
  }

  const arrayBuffer = await file.arrayBuffer();

  if (onProgress) {
    onProgress(15, 0, 0, 'Analizando estructura de celdas...');
  }

  // Carga ultra-eficiente de celdas con dense: true para minimizar asignaciones de objetos JS
  const workbook = XLSX.read(arrayBuffer, { 
    type: 'array',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellDates: false
  });
  
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('El archivo Excel V8 no contiene hojas válidas.');

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rawRows.length === 0) throw new Error('El archivo Excel V8 está vacío.');

  const { headerIndex, colMap } = findV8HeaderRowAndMap(rawRows);

  const skuIdx = colMap.sku !== -1 ? colMap.sku : 0;
  const upcIdx = colMap.upc !== -1 ? colMap.upc : (colMap.sku !== -1 ? colMap.sku : 1);
  const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 2;
  const uomIdx = colMap.unidad_medida;
  const deptoCodIdx = colMap.depto_codigo;
  const deptoNomIdx = colMap.depto_nombre;
  const montoValIdx = colMap.monto_valorizado;
  const stockSimIdx = colMap.stock_total_sim;
  const costoDirectoIdx = colMap.costo_unitario_directo;
  const retailIdx = colMap.precio_retail;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 1;
  const totalRows = rawRows.length - dataStart;
  
  const productosMap = new Map<string, ProductoMaestro>();
  const YIELD_INTERVAL = 2500;

  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i] || [];

    // Extraer ÚNICAMENTE las columnas requeridas
    const sku = cleanString(row[skuIdx]);
    let upc = upcIdx !== -1 ? cleanString(row[upcIdx]) : '';
    if (!upc) upc = sku;

    if (!sku && !upc) continue;
    const skuUpper = sku.toUpperCase();
    if (skuUpper === 'SKU' || skuUpper === 'UPC' || skuUpper === 'SKU ID' || skuUpper.includes('CODIGO')) continue;

    // Deduplicar usando String(sku).trim() normalizado como clave única
    const key = normalizeCodeKey(sku) || normalizeCodeKey(upc);
    if (!key) continue;

    const descripcion = cleanString(row[descIdx]);

    // PASO A: Extracción y Cálculo Inmediato por Fila
    // 1. rawUom: Texto de la columna de unidad desde Columna X (índice 23 0-based). Si es puramente numérica (ej. Columna W / idx 22 factor 1, 10, 20), se ignora ('')
    let rawUom = '';
    const colXVal = row[23] !== undefined && row[23] !== null ? String(row[23]).trim().toUpperCase() : '';
    if (colXVal && isNaN(Number(colXVal)) && !/^\d+(\.\d+)?$/.test(colXVal)) {
      rawUom = colXVal;
    } else if (uomIdx !== -1 && uomIdx !== 22) {
      const headerUomVal = String(row[uomIdx] || '').trim().toUpperCase();
      if (headerUomVal && isNaN(Number(headerUomVal)) && !/^\d+(\.\d+)?$/.test(headerUomVal)) {
        rawUom = headerUomVal;
      }
    }

    const depto_codigo = deptoCodIdx !== -1 ? cleanString(row[deptoCodIdx]) : '00';
    const depto_nombre = deptoNomIdx !== -1 ? cleanString(row[deptoNomIdx]) : 'GENERAL';
    const precio_retail = retailIdx !== -1 ? parseCleanFloat(row[retailIdx]) : 0;

    // 2. montoValorizado y stockTotalSIM
    const montoValorizado = montoValIdx !== -1 ? parseCleanFloat(row[montoValIdx]) : 0;
    const stockTotalSIM = stockSimIdx !== -1 ? parseCleanFloat(row[stockSimIdx]) : 0;

    // 3. Cálculo del Costo Unitario en esa fila:
    // Si montoValorizado > 0 y stockTotalSIM > 0: costoUnitarioCalculado = montoValorizado / stockTotalSIM
    let costoUnitarioCalculado = 0;
    if (montoValorizado > 0 && stockTotalSIM > 0) {
      costoUnitarioCalculado = Number((montoValorizado / stockTotalSIM).toFixed(2));
    } else if (costoDirectoIdx !== -1) {
      const directCost = parseCleanFloat(row[costoDirectoIdx]);
      if (precio_retail > 0 && directCost > precio_retail * 50) {
        costoUnitarioCalculado = 0;
      } else {
        costoUnitarioCalculado = directCost;
      }
    }

    const candidate: ProductoMaestro = {
      upc: upc || sku,
      sku: sku || upc,
      descripcion: descripcion || 'SIN DESCRIPCIÓN',
      depto_codigo: depto_codigo || '00',
      depto_nombre: depto_nombre || 'GENERAL',
      unidad_medida: rawUom,
      costo_unitario: costoUnitarioCalculado,
      precio_retail,
      updated_at: new Date().toISOString()
    };

    // PASO B: Consolidación Inteligente en Map<sku, ProductoMaestro>
    const existing = productosMap.get(key);

    if (!existing) {
      productosMap.set(key, candidate);
    } else {
      // REGLA DE ORO:
      // Si la fila nueva viene vacía, sin stock, sin costo calculado o sin UOM explícita,
      // NO permitir jamás que una fila incompleta pise a una fila que ya tiene KG o costo calculado > 0.
      const isExplicitUnit = (uom: string) => ['KG', 'KILO', 'KILOS', 'L', 'LITRO', 'LITROS', 'G', 'GR', 'GRAMO', 'GRAMOS'].includes(uom);
      
      const candidateHasExplicitUom = isExplicitUnit(candidate.unidad_medida || '');
      const candidateHasCost = (candidate.costo_unitario ?? 0) > 0;
      
      const existingHasExplicitUom = isExplicitUnit(existing.unidad_medida || '');
      const existingHasCost = (existing.costo_unitario ?? 0) > 0;

      // Si la fila existente ya tiene datos válidos (KG / costo > 0) y la nueva viene sin stock / sin costo / sin UOM explícita, IGNORAR la nueva fila completamente
      if ((existingHasExplicitUom || existingHasCost) && !candidateHasExplicitUom && !candidateHasCost) {
        // Ignorar fila nueva incompleta por completo
      } else if (!existingHasExplicitUom && candidateHasExplicitUom) {
        // La nueva fila trae unidad explícita (ej. KG) y la existente no la tenía: actualizar
        existing.unidad_medida = candidate.unidad_medida;
        if (candidateHasCost) existing.costo_unitario = candidate.costo_unitario;
        if (candidate.descripcion && candidate.descripcion !== 'SIN DESCRIPCIÓN') existing.descripcion = candidate.descripcion;
        if (candidate.depto_codigo && candidate.depto_codigo !== '00') existing.depto_codigo = candidate.depto_codigo;
        if (candidate.depto_nombre && candidate.depto_nombre !== 'GENERAL') existing.depto_nombre = candidate.depto_nombre;
      } else if (!existingHasCost && candidateHasCost) {
        // La nueva fila trae costo calculado > 0 y la existente no lo tenía: actualizar costo
        existing.costo_unitario = candidate.costo_unitario;
        if (candidate.unidad_medida && !existing.unidad_medida) existing.unidad_medida = candidate.unidad_medida;
        if (candidate.descripcion && candidate.descripcion !== 'SIN DESCRIPCIÓN') existing.descripcion = candidate.descripcion;
      } else if (candidateHasExplicitUom && candidateHasCost) {
        // La nueva fila viene completa (KG + costo) y es más reciente o mejor: actualizar
        existing.unidad_medida = candidate.unidad_medida;
        existing.costo_unitario = candidate.costo_unitario;
        if (candidate.descripcion && candidate.descripcion !== 'SIN DESCRIPCIÓN') existing.descripcion = candidate.descripcion;
        if (candidate.depto_codigo && candidate.depto_codigo !== '00') existing.depto_codigo = candidate.depto_codigo;
        if (candidate.depto_nombre && candidate.depto_nombre !== 'GENERAL') existing.depto_nombre = candidate.depto_nombre;
      }
    }

    const currentProcessed = i - dataStart + 1;
    if (currentProcessed % YIELD_INTERVAL === 0 || currentProcessed === totalRows) {
      if (onProgress && totalRows > 0) {
        const pct = Math.min(100, Math.round((currentProcessed / totalRows) * 100));
        onProgress(pct, currentProcessed, totalRows, `Calculando Costo Medio y filtrando V8 (${currentProcessed.toLocaleString('es-AR')}/${totalRows.toLocaleString('es-AR')} filas)...`);
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Fallback final a 'EA' únicamente para aquellos registros que mantengan unidad vacía
  productosMap.forEach(item => {
    if (!item.unidad_medida || !item.unidad_medida.trim()) {
      item.unidad_medida = 'EA';
    }
  });

  const productos = Array.from(productosMap.values());
  return productos;
};

/**
 * Alias exportado para compatibilidad con invocaciones como parseMaestroProductosV8
 */
export const parseMaestroProductosV8 = parseMaestroV8Excel;

/**
 * Escanea encabezados de Reporte 24 Stock identificando las columnas de Stock $$ SIM y Total Stock - SIM
 */
const findStock24HeaderRowAndMap = (rows: unknown[][]) => {
  const colMap = {
    sku: -1,
    upc: -1,
    descripcion: -1,
    unidad_medida: -1,
    depto_codigo: -1,
    depto_nombre: -1,
    stock_dinero: -1,
    total_stock: -1,
    precio_retail: -1
  };

  const maxScanRows = Math.min(15, rows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = rows[r] || [];
    const normRow = rawRow.map(c => normalizeHeader(c));

    normRow.forEach((cell, cIdx) => {
      if (!cell) return;

      // SKU ID -> sku
      if (colMap.sku === -1 && (
        cell === 'sku id' || cell === 'sku' || cell.includes('sku id') || cell.includes('articulo id')
      )) {
        colMap.sku = cIdx;
      }

      // Código SKU ID ID / UPC / EAN / Código de barras -> upc
      if (colMap.upc === -1 && (
        cell.includes('codigo sku id id') || cell.includes('cod sku id id') || cell.includes('codigo sku') ||
        cell === 'upc' || cell === 'ean' || cell.includes('codigo de barras') || cell.includes('codigo barras') || cell.includes('barra')
      )) {
        colMap.upc = cIdx;
      }

      // SKU DESC -> descripcion
      if (colMap.descripcion === -1 && (
        cell.includes('sku desc') || cell.includes('sku descripcion') || cell.includes('descripcion') || cell === 'detalle'
      )) {
        colMap.descripcion = cIdx;
      }

      // Unidad de Medida -> unidad_medida
      if (colMap.unidad_medida === -1 && (
        cell === 'um' || cell === 'u m' || cell.includes('unidad de medida del paquete id') ||
        cell.includes('unidad medida') || cell.includes('unidad de medida') || cell.includes('uom')
      )) {
        colMap.unidad_medida = cIdx;
      }

      // Dept ID ID vs Dept ID DESC
      if (cell.includes('dept id desc') || cell.includes('depto desc') || cell.includes('desc depto') || cell.includes('nombre depto')) {
        if (colMap.depto_nombre === -1) colMap.depto_nombre = cIdx;
      } else if (cell.includes('dept id id') || cell.includes('depto id id') || cell.includes('dept id') || cell.includes('cod depto') || cell.includes('depto id')) {
        if (colMap.depto_codigo === -1) colMap.depto_codigo = cIdx;
      }

      // Stock $$ SIM (Costo Medio) -> stock_dinero
      if (colMap.stock_dinero === -1 && (
        cell.includes('stock $$ sim') || cell.includes('stock $$') || cell.includes('costo medio') ||
        cell.includes('stock dinero') || cell.includes('stock $') || cell.includes('monto stock')
      )) {
        colMap.stock_dinero = cIdx;
      }

      // Total Stock - SIM -> total_stock
      if (colMap.total_stock === -1 && (
        cell.includes('total stock - sim') || cell.includes('total stock sim') || cell.includes('total stock') ||
        cell.includes('stock total') || cell === 'stock'
      )) {
        colMap.total_stock = cIdx;
      }

      // Precio Venta Retail -> precio_retail
      if (colMap.precio_retail === -1 && (
        cell.includes('precio venta retail') || cell.includes('precio retail') || cell.includes('precio venta') || cell === 'retail'
      )) {
        colMap.precio_retail = cIdx;
      }
    });

    if (colMap.sku !== -1 || colMap.upc !== -1 || colMap.descripcion !== -1) {
      return { headerIndex: r, colMap };
    }
  }

  return { headerIndex: -1, colMap };
};

/**
 * Parsea limpiando caracteres monetarios o de formato en valores numéricos de stock y dinero
 */
const parseCleanFloat = (val: unknown): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str) return 0;

  let cleaned = str.replace(/[^0-9.,-]+/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Reporte 24 Stock (Complementario / Depto 81)
 * Extrae stockDinero (de "Stock $$ SIM") y totalStock (de "Total Stock - SIM"),
 * y calcula el Costo Medio Unitario real:
 * costoMedioUnitario = (totalStock > 0 && stockDinero > 0) ? Number((stockDinero / totalStock).toFixed(2)) : 0
 */
export const parseMaestroStock24Excel = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<ProductoMaestro[]> => {
  if (onProgress) {
    onProgress(5, 0, 0, 'Leyendo archivo Excel Reporte 24 Stock...');
  }

  const arrayBuffer = await file.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, { 
    type: 'array',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellDates: false
  });
  
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('El archivo Excel Reporte 24 Stock no contiene hojas válidas.');

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rawRows.length === 0) throw new Error('El archivo Reporte 24 Stock está vacío.');

  const { headerIndex, colMap } = findStock24HeaderRowAndMap(rawRows);

  const deptoCodIdx = colMap.depto_codigo !== -1 ? colMap.depto_codigo : 2;
  const deptoNomIdx = colMap.depto_nombre !== -1 ? colMap.depto_nombre : 3;
  const upcIdx = colMap.upc !== -1 ? colMap.upc : 6;
  const skuIdx = colMap.sku !== -1 ? colMap.sku : 7;
  const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 8;
  const totalStockIdx = colMap.total_stock !== -1 ? colMap.total_stock : 13;
  const stockDineroIdx = colMap.stock_dinero !== -1 ? colMap.stock_dinero : 21;
  const uomIdx = colMap.unidad_medida;
  const retailIdx = colMap.precio_retail;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 3;
  const totalRows = rawRows.length - dataStart;
  const productosMap = new Map<string, ProductoMaestro>();

  const YIELD_INTERVAL = 2500;

  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i] || [];

    const upc = cleanString(row[upcIdx]);
    const sku = cleanString(row[skuIdx]);
    if (!upc && !sku) continue;

    const upcUpper = upc.toUpperCase();
    const skuUpper = sku.toUpperCase();
    if (upcUpper === 'UPC' || skuUpper === 'SKU' || skuUpper.includes('CODIGO')) continue;

    const key = normalizeCodeKey(sku) || normalizeCodeKey(upc);
    if (!key) continue;

    const descripcion = cleanString(row[descIdx]);
    const rawUom = uomIdx !== -1 ? cleanString(row[uomIdx]).toUpperCase() : '';
    const depto_codigo = deptoCodIdx !== -1 ? cleanString(row[deptoCodIdx]) : '00';
    const depto_nombre = deptoNomIdx !== -1 ? cleanString(row[deptoNomIdx]) : 'GENERAL';
    const precio_retail = retailIdx !== -1 ? parseNumber(row[retailIdx]) : 0;

    // Extraer stockDinero (Stock $$ SIM, col V / idx 21) y totalStock (Total Stock - SIM, col N / idx 13)
    const totalStock = parseCleanFloat(row[totalStockIdx]);
    const stockDinero = parseCleanFloat(row[stockDineroIdx]);

    // Fórmula exacta de conversión a costo medio unitario redondeado a 2 decimales:
    const costoMedioUnitario = (totalStock > 0 && stockDinero > 0)
      ? Number((stockDinero / totalStock).toFixed(2))
      : 0;

    const existing = productosMap.get(key);

    if (!existing) {
      productosMap.set(key, {
        upc: upc || sku,
        sku: sku || upc,
        descripcion: descripcion || 'SIN DESCRIPCIÓN',
        depto_codigo: depto_codigo || '00',
        depto_nombre: depto_nombre || 'GENERAL',
        unidad_medida: rawUom,
        costo_unitario: costoMedioUnitario,
        precio_retail,
        updated_at: new Date().toISOString()
      });
    } else {
      const existingUom = (existing.unidad_medida || '').trim().toUpperCase();
      const isExplicitUnit = (uom: string) => ['KG', 'KILO', 'KILOS', 'L', 'LITRO', 'LITROS', 'G', 'GR', 'GRAMO', 'GRAMOS'].includes(uom);

      if (rawUom) {
        if (!existingUom || existingUom === 'EA' || existingUom === 'UN') {
          if (isExplicitUnit(rawUom) || (rawUom !== 'EA' && rawUom !== 'UN')) {
            existing.unidad_medida = rawUom;
          } else if (!existingUom) {
            existing.unidad_medida = rawUom;
          }
        }
      }

      if ((existing.costo_unitario === undefined || existing.costo_unitario <= 0) && costoMedioUnitario > 0) {
        existing.costo_unitario = costoMedioUnitario;
      }

      if ((!existing.descripcion || existing.descripcion === 'SIN DESCRIPCIÓN') && descripcion && descripcion !== 'SIN DESCRIPCIÓN') {
        existing.descripcion = descripcion;
      }

      if ((!existing.depto_codigo || existing.depto_codigo === '00') && depto_codigo && depto_codigo !== '00') {
        existing.depto_codigo = depto_codigo;
      }
      if ((!existing.depto_nombre || existing.depto_nombre === 'GENERAL') && depto_nombre && depto_nombre !== 'GENERAL') {
        existing.depto_nombre = depto_nombre;
      }

      if ((existing.precio_retail === undefined || existing.precio_retail <= 0) && precio_retail > 0) {
        existing.precio_retail = precio_retail;
      }

      existing.updated_at = new Date().toISOString();
    }

    const currentProcessed = i - dataStart + 1;
    if (currentProcessed % YIELD_INTERVAL === 0 || currentProcessed === totalRows) {
      if (onProgress && totalRows > 0) {
        const pct = Math.min(100, Math.round((currentProcessed / totalRows) * 100));
        onProgress(pct, currentProcessed, totalRows, `Calculando Costo Medio Unitario en Reporte 24 (${currentProcessed.toLocaleString('es-AR')}/${totalRows.toLocaleString('es-AR')} filas)...`);
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  productosMap.forEach(p => {
    if (!p.unidad_medida || !p.unidad_medida.trim()) {
      p.unidad_medida = 'EA';
    }
  });

  const productos = Array.from(productosMap.values());
  if (productos.length === 0) {
    throw new Error('No se encontraron registros válidos de productos en el Reporte 24 Stock.');
  }

  return productos;
};

export const uploadMaestroProductsV8 = async (
  productos: ProductoMaestro[],
  onProgress?: ProgressCallback
): Promise<{ success: boolean; totalUploaded: number }> => {
  return uploadMaestroProducts(productos, onProgress);
};

export const uploadMaestroProductsStock24 = async (
  productos: ProductoMaestro[],
  onProgress?: ProgressCallback
): Promise<{ success: boolean; totalUploaded: number; nuevosInsertados: number; articulosActualizados: number }> => {
  if (onProgress) {
    onProgress(5, 0, productos.length, 'Consultando catálogo maestro actual para filtrar faltantes...');
  }

  const existingKeys = new Set<string>();

  try {
    const { data: existingItems, error: fetchErr } = await supabase
      .from('maestro_productos')
      .select('sku, upc');

    if (fetchErr) {
      console.warn('Advertencia al consultar catálogo existente:', fetchErr.message);
    } else if (existingItems) {
      existingItems.forEach(it => {
        if (it.sku) existingKeys.add(normalizeCodeKey(it.sku));
        if (it.upc) existingKeys.add(normalizeCodeKey(it.upc));
      });
    }
  } catch (e) {
    console.warn('Excepción al consultar catálogo existente:', e);
  }

  // REGLA DE SOLO FALTANTES: Filtrar productos del Reporte 24 que NO existan en el catálogo maestro
  const missingProducts = productos.filter(p => {
    const keySku = normalizeCodeKey(p.sku);
    const keyUpc = normalizeCodeKey(p.upc);
    return !existingKeys.has(keySku) && !existingKeys.has(keyUpc);
  });

  const nuevosInsertados = missingProducts.length;
  const articulosActualizados = 0; // REGLA: No hacer update ni sobrescribir datos cargados previamente por V8

  if (missingProducts.length === 0) {
    console.log('ℹ️ [uploadMaestroProductsStock24] Todos los artículos del Reporte 24 ya existen en el catálogo maestro. Sin faltantes por insertar.');
    if (onProgress) {
      onProgress(100, productos.length, productos.length, 'Sincronización completada: todos los artículos ya existían en el catálogo maestro.');
    }
    return { success: true, totalUploaded: 0, nuevosInsertados: 0, articulosActualizados: 0 };
  }

  if (onProgress) {
    onProgress(10, 0, missingProducts.length, `Insertando ${missingProducts.length.toLocaleString('es-AR')} productos faltantes (ej. Depto 81)...`);
  }

  const BATCH_SIZE = 1250;
  const total = missingProducts.length;
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = missingProducts.slice(i, i + BATCH_SIZE);
    
    // Inserción limpia de SOLO FALTANTES
    const { error } = await supabase
      .from('maestro_productos')
      .upsert(batch, { onConflict: 'upc', ignoreDuplicates: true });

    if (error) {
      console.error('Error al insertar lote faltantes Reporte 24 Stock:', error);
      throw new Error(`Error en base de datos al insertar lote faltante (${i + 1}-${i + batch.length}): ${error.message}`);
    }

    processed += batch.length;
    const percent = Math.min(100, Math.round((processed / total) * 100));

    if (onProgress) {
      onProgress(
        percent, 
        processed, 
        total, 
        `Insertando faltantes ${processed.toLocaleString('es-AR')} / ${total.toLocaleString('es-AR')} (${percent}%)...`
      );
    }
    await new Promise(r => setTimeout(r, 0));
  }

  return { success: true, totalUploaded: processed, nuevosInsertados: processed, articulosActualizados: 0 };
};

/**
 * Lee y parsea el archivo Excel de Maestro de Productos usando mapeo dinámico por encabezados
 */
export const parseMaestroExcel = async (file: File): Promise<ProductoMaestro[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    throw new Error('El archivo Excel de Maestro no contiene hojas válidas.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) {
    throw new Error('El archivo de Maestro de Productos está vacío.');
  }

  const { headerIndex, colMap } = findHeaderRowAndMap(rows);

  // Mapeos por defecto si no se detectó por encabezados
  const deptoCodIdx = colMap.depto_codigo !== -1 ? colMap.depto_codigo : 2;
  const deptoNomIdx = colMap.depto_nombre !== -1 ? colMap.depto_nombre : 3;
  const upcIdx = colMap.upc !== -1 ? colMap.upc : 6;
  const skuIdx = colMap.sku !== -1 ? colMap.sku : 7;
  const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 8;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 3;
  const dataRows = rows.slice(dataStart);
  const productosMap = new Map<string, ProductoMaestro>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];

    const upc = cleanString(row[upcIdx]);
    const sku = cleanString(row[skuIdx]);
    const descripcion = cleanString(row[descIdx]);
    const depto_codigo = cleanString(row[deptoCodIdx]);
    const depto_nombre = cleanString(row[deptoNomIdx]);

    const umIdx = colMap.unidad_medida;
    const costoIdx = colMap.costo_unitario;
    const retailIdx = colMap.precio_retail;

    const rawUom = umIdx !== -1 ? cleanString(row[umIdx]).toUpperCase() : '';
    const unidad_medida = rawUom || 'EA';
    const costo_unitario = costoIdx !== -1 ? parseNumber(row[costoIdx]) : 0;
    const precio_retail = retailIdx !== -1 ? parseNumber(row[retailIdx]) : 0;

    // Ignorar filas sin UPC o SKU o que repitan palabras clave de cabecera
    if (!upc || !sku) continue;
    if (upc.toUpperCase() === 'UPC' || sku.toUpperCase() === 'SKU') continue;

    productosMap.set(upc, {
      upc,
      sku,
      descripcion: descripcion || 'SIN DESCRIPCIÓN',
      depto_codigo: depto_codigo || '00',
      depto_nombre: depto_nombre || 'GENERAL',
      unidad_medida,
      costo_unitario,
      precio_retail,
      updated_at: new Date().toISOString()
    });
  }

  const productos = Array.from(productosMap.values());

  if (productos.length === 0) {
    throw new Error('No se encontraron registros válidos de productos con UPC y SKU en el archivo.');
  }

  return productos;
};

/**
 * Previsualización rápida del archivo Maestro de Productos
 */
export const previewMaestroExcel = async (file: File): Promise<MaestroPreview> => {
  const productos = await parseMaestroExcel(file);
  return {
    totalRegistros: productos.length,
    muestra: productos.slice(0, 5)
  };
};

/**
 * Carga e inserta/actualiza en Supabase el catálogo maestro en lotes (batch de 500).
 * Realiza una limpieza/vaciamiento completo previo para garantizar el reemplazo total (Overwrite).
 */
export const uploadMaestroProducts = async (
  productos: ProductoMaestro[],
  onProgress?: ProgressCallback
): Promise<{ success: boolean; totalUploaded: number }> => {
  if (onProgress) {
    onProgress(2, 0, productos.length, 'Reemplazando catálogo: vaciando registros anteriores...');
  }

  try {
    const { error: delErr } = await supabase
      .from('maestro_productos')
      .delete()
      .neq('upc', '000000000000_FORCE_DELETE_ALL');
      
    if (delErr) {
      console.warn('Advertencia al vaciar registros existentes de maestro_productos:', delErr.message);
    }
  } catch (e) {
    console.warn('Excepción al vaciar tabla maestro_productos:', e);
  }

  const BATCH_SIZE = 1250;
  const total = productos.length;
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = productos.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('maestro_productos')
      .upsert(batch, { onConflict: 'upc' });

    if (error) {
      console.error('Error al insertar lote en maestro_productos:', error);
      throw new Error(`Error en base de datos al sincronizar lote (${i + 1}-${i + batch.length}): ${error.message}`);
    }

    processed += batch.length;
    const percent = Math.min(100, Math.round((processed / total) * 100));

    if (onProgress) {
      onProgress(
        percent, 
        processed, 
        total, 
        `Procesando ${processed.toLocaleString('es-AR')} / ${total.toLocaleString('es-AR')} filas (${percent}%)...`
      );
    }

    // Ceder el hilo principal brevemente entre batches para mantener fluida la interfaz
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return { success: true, totalUploaded: processed };
};

/**
 * Filtra filas en memoria para procesar ÚNICAMENTE aquellas correspondientes a la Tienda 1031 (Jujuy).
 * Si el archivo no contiene ninguna columna de Tienda o NAE, permite la fila como fallback seguro.
 */
const isRowForStore1031 = (
  row: unknown[],
  tiendaColIdx: number,
  tiendaNomColIdx: number,
  naeColIdx: number
): boolean => {
  if (tiendaColIdx === -1 && tiendaNomColIdx === -1 && naeColIdx === -1) {
    return true;
  }

  const tiendaCodVal = tiendaColIdx !== -1 ? cleanString(row[tiendaColIdx]) : '';
  const tiendaNomVal = tiendaNomColIdx !== -1 ? cleanString(row[tiendaNomColIdx]) : '';
  const naeVal = naeColIdx !== -1 ? cleanString(row[naeColIdx]) : '';

  // 1. NAE que termine o contenga '-1031'
  if (naeVal && (naeVal.includes('-1031') || naeVal.endsWith('1031'))) {
    return true;
  }

  // 2. Código de Tienda contenga '1031'
  if (tiendaCodVal && tiendaCodVal.includes('1031')) {
    return true;
  }

  // 3. Nombre de Tienda contenga '1031' o 'JUJUY'
  if (tiendaNomVal) {
    const normNom = normalizeHeader(tiendaNomVal);
    if (normNom.includes('1031') || normNom.includes('jujuy')) {
      return true;
    }
  }

  return false;
};

// =============================================================================
// PARSER 2: REPORTE AP VALORIZADO (Costos y Precios)
// =============================================================================

/**
 * Lee y parsea el archivo Reporte AP usando mapeo dinámico para extraer costo_unitario y costo_total,
 * filtrando automáticamente en memoria para procesar ÚNICAMENTE las filas de la Tienda 1031 (Jujuy).
 */
export const parseReporteAPExcel = async (
  file: File
): Promise<Map<string, { costo_unitario: number; costo_total: number }>> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('El archivo de Reporte AP no contiene hojas válidas.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) {
    throw new Error('El archivo de Reporte AP está vacío.');
  }

  const { headerIndex, colMap } = findHeaderRowAndMap(rows);

  const skuCol = colMap.sku !== -1 ? colMap.sku : 0;
  const upcCol = colMap.upc !== -1 ? colMap.upc : 1;
  const costoUnitCol = colMap.costo_unitario !== -1 ? colMap.costo_unitario : (colMap.costo_total !== -1 ? -1 : 2);
  const costoTotalCol = colMap.costo_total !== -1 ? colMap.costo_total : 3;

  const tiendaCodCol = colMap.tienda_codigo;
  const tiendaNomCol = colMap.tienda_nombre;
  const naeCol = colMap.numero_nae;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 1;
  const dataRows = rows.slice(dataStart);
  const mapCosts = new Map<string, { costo_unitario: number; costo_total: number }>();

  let filteredCount = 0;
  let totalRows = dataRows.length;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];

    // Filtrar en memoria: procesar ÚNICAMENTE filas de la Tienda 1031 (Jujuy)
    if (!isRowForStore1031(row, tiendaCodCol, tiendaNomCol, naeCol)) {
      continue;
    }

    const skuKey = skuCol !== -1 ? normalizeCodeKey(row[skuCol]) : '';
    const upcKey = upcCol !== -1 ? normalizeCodeKey(row[upcCol]) : '';
    const cUnit = costoUnitCol !== -1 ? parseNumber(row[costoUnitCol]) : 0;
    const cTotal = costoTotalCol !== -1 ? parseNumber(row[costoTotalCol]) : 0;

    if (!skuKey && !upcKey) continue;
    if (skuKey === 'SKU' || upcKey === 'UPC') continue;

    filteredCount++;
    const data = { costo_unitario: cUnit, costo_total: cTotal };
    // Guardar preferentemente por SKU, y por UPC como fallback
    if (skuKey) mapCosts.set(`SKU_${skuKey}`, data);
    if (upcKey) mapCosts.set(`UPC_${upcKey}`, data);
  }

  console.log(`📊 [parseReporteAPExcel] Filas procesadas para Tienda 1031 (Jujuy): ${filteredCount} de ${totalRows} totales.`);

  return mapCosts;
};

/**
 * Procesa y vincula tardíamente un Reporte AP a un camión NAE en estado PENDIENTE.
 * Actualiza costo_unitario, costo_total en auditoria_items y marca tiene_reporte_ap = true.
 */
export const adjuntarReporteAPACamion = async (
  naeId: string,
  apFile: File
): Promise<{ matchedCount: number; montoTotalEsperado: number }> => {
  const mapCosts = await parseReporteAPExcel(apFile);
  if (mapCosts.size === 0) {
    throw new Error('El reporte AP no contiene registros de costos válidos.');
  }

  // Obtener ítems actuales del camión con todas las columnas
  const { data: items, error: itemsErr } = await supabase
    .from('auditoria_items')
    .select('*')
    .eq('nae_id', naeId);

  if (itemsErr || !items || items.length === 0) {
    throw new Error('No se encontraron ítems para el camión especificado.');
  }

  let matchedCount = 0;
  let montoTotalEsperado = 0;
  const updatedItemsToUpsert: any[] = [];

  for (const item of items) {
    const skuKey = normalizeCodeKey(item.sku);
    const upcKey = normalizeCodeKey(item.upc);
    const uEsp = Number(item.unidades_esperadas || 0);

    // Prioridad por SKU, luego UPC como fallback
    const costData = (skuKey ? mapCosts.get(`SKU_${skuKey}`) : undefined) ||
                     (upcKey ? mapCosts.get(`UPC_${upcKey}`) : undefined);
    if (costData) {
      matchedCount++;
      const cUnit = Number(costData.costo_unitario) || 0;
      const cTotal = costData.costo_total || (cUnit * uEsp);
      montoTotalEsperado += cTotal;

      const bEsp = Number(item.bultos_esperados || 0);
      const bEsc = Number(item.bultos_escaneados || 0);
      const uEscRaw = Number(item.unidades_escaneadas || 0);
      const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
      const uFisicas = (bEsc * factor) + uEscRaw;

      const isSobranteNoFact = item.es_sobrante_no_facturado || (item.depto_codigo && parseInt(item.depto_codigo, 10) === 999);
      const cantFaltante = (!isSobranteNoFact && uFisicas < uEsp) ? (uEsp - uFisicas) : 0;
      const cantDanada = Number(item.cantidad_danada || 0);
      const cTotalReclamado = Number(((cantFaltante + cantDanada) * cUnit).toFixed(2));

      updatedItemsToUpsert.push(sanitizeAuditoriaItemForDb({
        ...item,
        costo_unitario: cUnit,
        costo_total: cTotal,
        updated_at: new Date().toISOString()
      }));
    }
  }

  // Persistencia masiva en Supabase vía bulk upsert
  if (updatedItemsToUpsert.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < updatedItemsToUpsert.length; i += BATCH_SIZE) {
      const batch = updatedItemsToUpsert.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabase
        .from('auditoria_items')
        .upsert(batch, { onConflict: 'id' });

      if (upsertErr) {
        console.error('Error al actualizar costos masivamente en auditoria_items:', upsertErr);
        throw new Error(`Error al actualizar costos en base de datos: ${upsertErr.message}`);
      }
    }
  }

  // Actualizar camiones_nae
  const { error: camionErr } = await supabase
    .from('camiones_nae')
    .update({
      tiene_reporte_ap: true,
      monto_total_esperado: montoTotalEsperado
    })
    .eq('id', naeId);

  if (camionErr) {
    throw new Error(`Error al actualizar estado AP del camión: ${camionErr.message}`);
  }

  return { matchedCount, montoTotalEsperado };
};

// =============================================================================
// PARSER 3: MANIFIESTO DEL CAMIÓN CEDIS (32 Agotado en transito *.xlsx)
// =============================================================================

/**
 * Lee y parsea el archivo de Manifiesto de Camión NAE con mapeo dinámico de encabezados
 * y soporte opcional de Reporte AP
 */
export const parseCamionManifiestoExcel = async (
  file: File,
  apFile?: File
): Promise<CamionManifiestoPreview> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Buscar hoja 'Detalle Items a Recibir' o usar la primera disponible
  const sheetName = workbook.SheetNames.find(
    name => name.trim().toLowerCase() === 'detalle items a recibir'
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('El archivo no contiene la hoja esperada ("Detalle Items a Recibir").');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) {
    throw new Error('El archivo de manifiesto del camión está vacío.');
  }

  const { headerIndex, colMap } = findHeaderRowAndMap(rows);

  // Solo leer tienda_codigo y tienda_nombre si colMap los identificó explícitamente por nombre de cabecera
  const tiendaCodIdx = colMap.tienda_codigo;
  const tiendaNomIdx = colMap.tienda_nombre;
  const naeIdx = colMap.numero_nae !== -1 ? colMap.numero_nae : 2;
  const deptoCodIdx = colMap.depto_codigo !== -1 ? colMap.depto_codigo : 3;
  const deptoNomIdx = colMap.depto_nombre !== -1 ? colMap.depto_nombre : 4;
  const skuIdx = colMap.sku !== -1 ? colMap.sku : 5;
  const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 6;
  const upcIdx = colMap.upc !== -1 ? colMap.upc : 7;
  const bultosEspIdx = colMap.bultos_esperados !== -1 ? colMap.bultos_esperados : 8;
  const unidadesEspIdx = colMap.unidades_esperadas !== -1 ? colMap.unidades_esperadas : 9;
  const stockDispIdx = colMap.stock_disponible !== -1 ? colMap.stock_disponible : 10;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 3;
  const dataRows = rows.slice(dataStart);

  if (dataRows.length === 0) {
    throw new Error('El archivo de manifiesto no contiene filas de datos.');
  }

  // Parsea el reporte AP si fue adjuntado
  let mapCosts = new Map<string, { costo_unitario: number; costo_total: number }>();
  if (apFile) {
    try {
      mapCosts = await parseReporteAPExcel(apFile);
    } catch (e) {
      console.warn('⚠️ No se pudo procesar el archivo AP opcional:', e);
    }
  }

  let numero_nae = '';
  let tienda_codigo = '';
  let tienda_nombre = '';

  // Escaneo previo en celdas superiores para detectar NAE si viene en encabezados del reporte Excel
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const rCells = rows[r] || [];
    for (const cVal of rCells) {
      const strVal = cleanString(cVal);
      if (strVal.toUpperCase().includes('NAE') || strVal.includes('-')) {
        const extracted = extractNaeFromText(strVal);
        if (extracted && extracted.toUpperCase() !== 'NAE' && !numero_nae) {
          numero_nae = extracted;
          break;
        }
      }
    }
    if (numero_nae) break;
  }
  
  const itemsMap = new Map<string, ItemManifiestoParsed>();
  let totalBultos = 0;
  let totalUnidades = 0;
  let agotadosTransitoCount = 0;
  let montoTotalEsperado = 0;
  let matchedApCount = 0;

  // Consultar costos y unidad_medida del Catálogo Maestro para Priority 2 fallback
  const maestroCostMap = new Map<string, { costo_unitario: number; unidad_medida?: string; precio_retail?: number }>();
  try {
    const { data: maestroItems } = await supabase
      .from('maestro_productos')
      .select('sku, upc, costo_unitario, unidad_medida, precio_retail');

    maestroItems?.forEach(m => {
      const data = {
        costo_unitario: Number(m.costo_unitario) || 0,
        unidad_medida: m.unidad_medida,
        precio_retail: Number(m.precio_retail) || 0
      };
      if (m.sku) maestroCostMap.set(`SKU_${normalizeCodeKey(m.sku)}`, data);
      if (m.upc) maestroCostMap.set(`UPC_${normalizeCodeKey(m.upc)}`, data);
    });
  } catch (e) {
    console.warn('Advertencia al consultar costos del Catálogo Maestro:', e);
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    const rTiendaCodigo = tiendaCodIdx !== -1 ? cleanString(row[tiendaCodIdx]) : '';
    const rTiendaNombre = tiendaNomIdx !== -1 ? cleanString(row[tiendaNomIdx]) : '';
    const rNumeroNae = extractNaeFromText(cleanString(row[naeIdx]));
    const depto_codigo = cleanString(row[deptoCodIdx]);
    const depto_nombre = cleanString(row[deptoNomIdx]);
    const sku = cleanString(row[skuIdx]);
    const descripcion = cleanString(row[descIdx]);
    const upc = cleanString(row[upcIdx]);
    const bultos_esperados = parseNumber(row[bultosEspIdx]);
    const unidades_esperadas = parseNumber(row[unidadesEspIdx]);
    const stock_disponible = parseNumber(row[stockDispIdx]);

    // Omitir filas de cabecera repetidas o vacías
    if (!upc || !sku || upc.toUpperCase() === 'UPC' || sku.toUpperCase() === 'SKU') continue;

    if (!numero_nae && rNumeroNae && rNumeroNae.toUpperCase() !== 'NAE') {
      numero_nae = rNumeroNae;
    }
    if (!tienda_codigo && rTiendaCodigo && rTiendaCodigo.toUpperCase() !== 'TIENDA') {
      tienda_codigo = rTiendaCodigo;
    }
    if (!tienda_nombre && rTiendaNombre && rTiendaNombre.toUpperCase() !== 'NOMBRE') {
      tienda_nombre = rTiendaNombre;
    }

    const es_agotado_transito = stock_disponible === 0;
    if (es_agotado_transito) agotadosTransitoCount++;

    totalBultos += bultos_esperados;
    totalUnidades += unidades_esperadas;

    // Prioridad de Costos:
    // Prioridad 1: Reporte Operativo AP
    // Prioridad 2: Catálogo Maestro (fallback si en AP falta o es 0)
    // Prioridad 3: Manual (si no figura en ninguno, queda en 0 para ingreso manual)
    // REGLA ESTRICTA: NUNCA utilizar precio_retail para reclamos o desvíos monetarios
    const normSku = normalizeCodeKey(sku);
    const normUpc = normalizeCodeKey(upc);

    const apData = (normSku ? mapCosts.get(`SKU_${normSku}`) : undefined) ||
                   (normUpc ? mapCosts.get(`UPC_${normUpc}`) : undefined);

    const maestroData = (normSku ? maestroCostMap.get(`SKU_${normSku}`) : undefined) ||
                        (normUpc ? maestroCostMap.get(`UPC_${normUpc}`) : undefined);

    let costo_unitario = 0;
    let costo_total = 0;
    let unidad_medida = maestroData?.unidad_medida || '';
    let precio_retail = maestroData?.precio_retail || 0;

    if (apData && (Number(apData.costo_unitario) || 0) > 0) {
      matchedApCount++;
      costo_unitario = Number(apData.costo_unitario) || 0;
      costo_total = apData.costo_total || (costo_unitario * unidades_esperadas);
    } else if (maestroData && maestroData.costo_unitario > 0) {
      costo_unitario = maestroData.costo_unitario;
      costo_total = costo_unitario * unidades_esperadas;
    }

    montoTotalEsperado += (costo_total || (costo_unitario * unidades_esperadas));

    itemsMap.set(upc, {
      upc,
      sku,
      descripcion: descripcion || 'SIN DESCRIPCIÓN',
      depto_codigo: depto_codigo || '00',
      depto_nombre: depto_nombre || 'GENERAL',
      unidad_medida,
      bultos_esperados,
      unidades_esperadas,
      stock_disponible,
      es_agotado_transito,
      costo_unitario,
      costo_total,
      precio_retail
    });
  }

  const items = Array.from(itemsMap.values());

  if (items.length === 0) {
    throw new Error('No se encontraron ítems válidos en el manifiesto del camión.');
  }

  if (!numero_nae) {
    throw new Error('No se pudo detectar el Número NAE en el archivo de manifiesto.');
  }

  const storeInfo = formatStoreDisplay(tienda_codigo, tienda_nombre, numero_nae);
  const tiene_reporte_ap = matchedApCount > 0;

  return {
    numero_nae,
    tienda_codigo: storeInfo.tienda_codigo,
    tienda_nombre: storeInfo.tienda_nombre,
    totalSKUs: items.length,
    totalBultos,
    totalUnidades,
    agotadosTransitoCount,
    tiene_reporte_ap,
    monto_total_esperado: montoTotalEsperado,
    items
  };
};

/**
 * Persiste el manifiesto del camión en Supabase:
 * 1. Crea o recupera el camión en camiones_nae
 * 2. Inserta los auditoria_items asociados en lotes (batch de 500)
 */
export const uploadCamionManifiesto = async (
  preview: CamionManifiestoPreview,
  onProgress?: ProgressCallback,
  options?: { overwrite?: boolean; overwriteNaeId?: string; usuario_carga?: string }
): Promise<{ success: boolean; nae_id: string; totalItems: number }> => {
  const { numero_nae, tienda_codigo, tienda_nombre, tiene_reporte_ap, monto_total_esperado, items } = preview;

  if (onProgress) {
    onProgress(5, 0, items.length, 'Registrando la cabecera del camión NAE...');
  }

  if (options?.overwrite) {
    if (onProgress) {
      onProgress(10, 0, items.length, 'Reemplazando versión previa del camión NAE...');
    }
    await eliminarCamionPorNumeroNae(numero_nae);
    if (options.overwriteNaeId) {
      await eliminarCamionEnCascada(options.overwriteNaeId);
    }
    await supabase.from('camiones_nae').delete().eq('numero_nae', numero_nae);
  } else {
    // 1. Control Estricto de Camiones NAE Duplicados
    const { data: existingNae, error: fetchError } = await supabase
      .from('camiones_nae')
      .select('id, estado, numero_nae')
      .eq('numero_nae', numero_nae)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Error al consultar camión NAE: ${fetchError.message}`);
    }

    if (existingNae) {
      const estUpper = (existingNae.estado || '').trim().toUpperCase();
      if (estUpper === 'FINALIZADO' || estUpper === 'CERRADO') {
        throw new Error(`⚠️ El camión NAE #${numero_nae} ya fue auditado y cerrado con anterioridad.`);
      } else {
        const err: any = new Error(`DUPLICADO_PENDIENTE:${existingNae.id}:${existingNae.estado}:${numero_nae}`);
        err.existingNaeId = existingNae.id;
        err.existingEstado = existingNae.estado;
        throw err;
      }
    }
  }

  // 2. Insertar nueva cabecera del camión NAE
  const { data: newNae, error: insertNaeError } = await supabase
    .from('camiones_nae')
    .insert({
      numero_nae,
      tienda_codigo,
      tienda_nombre,
      fecha_arribo: new Date().toISOString().split('T')[0],
      estado: 'PENDIENTE',
      fecha_inicio_auditoria: null,
      tiene_reporte_ap: tiene_reporte_ap || false,
      monto_total_esperado: monto_total_esperado || 0,
      modo_auditoria: 'TOTAL',
      usuario_carga: options?.usuario_carga || 'OPERADOR 1'
    })
    .select('id')
    .single();

  if (insertNaeError || !newNae) {
    throw new Error(`Error al crear la cabecera del camión NAE: ${insertNaeError?.message}`);
  }

  const naeId = newNae.id;

  // 3. Preparar los items vinculados al nae_id sanitizados para DB
  const dbItems = items.map(item => {
    const cUnitAplicado = Number(item.costo_unitario || 0);

    return sanitizeAuditoriaItemForDb({
      nae_id: naeId,
      upc: item.upc,
      sku: item.sku,
      descripcion: item.descripcion,
      depto_codigo: item.depto_codigo,
      depto_nombre: item.depto_nombre,
      unidad_medida: item.unidad_medida,
      bultos_esperados: item.bultos_esperados,
      unidades_esperadas: item.unidades_esperadas,
      stock_disponible: item.stock_disponible,
      es_agotado_transito: item.es_agotado_transito,
      costo_unitario: cUnitAplicado,
      costo_total: item.costo_total || 0,
      precio_retail: item.precio_retail || 0,
      bultos_escaneados: 0,
      unidades_escaneadas: 0,
      cantidad_danada: 0,
      es_sobrante_no_facturado: false,
      caja_separada_transito: item.caja_separada_transito || false,
      foto_dano_url: item.foto_dano_url || null,
      observacion_dano: item.observacion_dano || null,
      ultimo_colaborador: item.ultimo_colaborador || null,
      updated_at: new Date().toISOString()
    });
  });

  const BATCH_SIZE = 500;
  const total = dbItems.length;
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = dbItems.slice(i, i + BATCH_SIZE);

    const { error: itemsError } = await supabase
      .from('auditoria_items')
      .upsert(batch, { onConflict: 'nae_id, upc' });

    if (itemsError) {
      console.error('Error al insertar items en auditoria_items:', itemsError);
      throw new Error(`Error al guardar productos del camión (${i + 1}-${i + batch.length}): ${itemsError.message}`);
    }

    processed += batch.length;
    const percent = Math.min(100, Math.round(10 + (processed / total) * 90));

    if (onProgress) {
      onProgress(
        percent, 
        processed, 
        total, 
        `Guardando ítems del camión NAE (${processed}/${total})...`
      );
    }
  }

  return { success: true, nae_id: naeId, totalItems: processed };
};

// =============================================================================
// PARSER 4: CARGA DIRECTA DE ARCHIVO UNIFICADO "AGOTADO EN TRÁNSITO AP v2"
// =============================================================================

/**
 * Parsea el reporte unificado "Agotado en Tránsito AP v2" (.xlsx / .xls)
 * Estructura del archivo:
 * - Fila 1 y Fila 2 de encabezado se saltean (los nombres de columnas inician en la Fila 3, index 2).
 * Extrae:
 * - numero_nae <- Columna 'NAE'
 * - departamento_id <- Columna 'Departamento'
 * - sku <- Columna 'TRF.SKU'
 * - descripcion <- Columna 'TRF.SKU_DESCRIPCION'
 * - upc <- Columna 'UPC'
 * - bultos_esperados <- Columna 'BULTOS_ESPERADOS'
 * - unidades_esperadas <- Columna 'UNIDADES_ESPERADAS'
 * - costo_unitario <- Columna 'Costo Medio'
 * - stock_on_hand <- Columna 'Stock on Hand'
 * Cálculo de factor_empaque: unidades_esperadas / bultos_esperados (si bultos > 0).
 * Agotados: stock_on_hand <= 0 -> es_agotado_transito = true.
 */
export const parseAgotadosAPv2 = async (file: File): Promise<CamionManifiestoPreview> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('El archivo AP v2 no contiene hojas válidas.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) {
    throw new Error('El archivo AP v2 está vacío.');
  }

  // Buscar fila de encabezados iniciando preferentemente en la Fila 3 (índice 2 0-based)
  let headerIndex = -1;
  let colMap = {
    numero_nae: -1,
    departamento_id: -1,
    sku: -1,
    descripcion: -1,
    upc: -1,
    bultos_esperados: -1,
    unidades_esperadas: -1,
    costo_unitario: -1,
    stock_on_hand: -1
  };

  const scanOrder = [2, 0, 1, 3, 4, 5];
  for (const r of scanOrder) {
    if (r >= rows.length) continue;
    const rawRow = rows[r] || [];
    const normRow = rawRow.map(c => normalizeHeader(c));

    const tempMap = { ...colMap };
    normRow.forEach((cell, cIdx) => {
      if (!cell) return;

      if (tempMap.numero_nae === -1 && (
        cell === 'nae' || cell.includes('numero nae') || cell.includes('nro nae') || cell.includes('remito') || cell.includes('camion')
      )) {
        tempMap.numero_nae = cIdx;
      }

      if (tempMap.departamento_id === -1 && (
        cell.includes('departamento') || cell.includes('depto') || cell.includes('rubro') || cell.includes('seccion')
      )) {
        tempMap.departamento_id = cIdx;
      }

      if (tempMap.sku === -1 && (
        cell === 'trf sku' || cell === 'trf.sku' || cell === 'sku' || cell.includes('articulo') || cell.includes('material')
      )) {
        tempMap.sku = cIdx;
      }

      if (tempMap.descripcion === -1 && (
        cell === 'trf sku descripcion' || cell === 'trf.sku_descripcion' || cell.includes('descripcion') || cell.includes('detalle') || cell === 'nombre'
      )) {
        tempMap.descripcion = cIdx;
      }

      if (tempMap.upc === -1 && (
        cell === 'upc' || cell === 'ean' || cell.includes('codigo de barras') || cell.includes('cod barra') || cell.includes('barra')
      )) {
        tempMap.upc = cIdx;
      }

      if (tempMap.bultos_esperados === -1 && (
        cell === 'bultos esperados' || cell === 'bultos_esperados' || cell.includes('bulto') || cell.includes('cajas')
      )) {
        tempMap.bultos_esperados = cIdx;
      }

      if (tempMap.unidades_esperadas === -1 && (
        cell === 'unidades esperadas' || cell === 'unidades_esperadas' || cell.includes('unidades') || cell.includes('piezas') || cell === 'unid'
      )) {
        tempMap.unidades_esperadas = cIdx;
      }

      if (tempMap.costo_unitario === -1 && (
        cell === 'costo medio' || cell === 'costo_medio' || cell.includes('costo unitario') || cell.includes('costo unit')
      )) {
        tempMap.costo_unitario = cIdx;
      }

      if (tempMap.stock_on_hand === -1 && (
        cell === 'stock on hand' || cell === 'stock_on_hand' || cell.includes('stock disponible') || cell.includes('stock disp') || cell === 'stock'
      )) {
        tempMap.stock_on_hand = cIdx;
      }
    });

    if (tempMap.sku !== -1 || tempMap.upc !== -1 || tempMap.numero_nae !== -1) {
      headerIndex = r;
      colMap = tempMap;
      break;
    }
  }

  // Fallback defaults si no se detectó por encabezados
  const naeIdx = colMap.numero_nae !== -1 ? colMap.numero_nae : 0;
  const deptoIdx = colMap.departamento_id !== -1 ? colMap.departamento_id : 1;
  const skuIdx = colMap.sku !== -1 ? colMap.sku : 2;
  const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 3;
  const upcIdx = colMap.upc !== -1 ? colMap.upc : 4;
  const bultosIdx = colMap.bultos_esperados !== -1 ? colMap.bultos_esperados : 5;
  const unidadesIdx = colMap.unidades_esperadas !== -1 ? colMap.unidades_esperadas : 6;
  const costoIdx = colMap.costo_unitario !== -1 ? colMap.costo_unitario : 7;
  const stockIdx = colMap.stock_on_hand !== -1 ? colMap.stock_on_hand : 8;

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 2; // Fila 3 en adelante
  const dataRows = rows.slice(dataStart);

  if (dataRows.length === 0) {
    throw new Error('El archivo AP v2 no contiene filas de datos.');
  }

  let numero_nae = '';
  const itemsMap = new Map<string, ItemManifiestoParsed>();
  let totalBultos = 0;
  let totalUnidades = 0;
  let agotadosTransitoCount = 0;
  let montoTotalEsperado = 0;

  // Escaneo inicial de NAE en celdas superiores (por si viene en título de reporte)
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const rCells = rows[r] || [];
    for (const cVal of rCells) {
      const strVal = cleanString(cVal);
      if (strVal.toUpperCase().includes('NAE') || strVal.includes('-')) {
        const extracted = extractNaeFromText(strVal);
        if (extracted && extracted.toUpperCase() !== 'NAE' && !numero_nae) {
          numero_nae = extracted;
          break;
        }
      }
    }
    if (numero_nae) break;
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    const rNumeroNae = extractNaeFromText(cleanString(row[naeIdx]));
    const depto_codigo = cleanString(row[deptoIdx]);
    const sku = cleanString(row[skuIdx]);
    const descripcion = cleanString(row[descIdx]);
    const upc = cleanString(row[upcIdx]);
    const bultos_esperados = parseNumber(row[bultosIdx]);
    const unidades_esperadas = parseNumber(row[unidadesIdx]);
    const costo_unitario = parseNumber(row[costoIdx]);
    const stock_on_hand = parseNumber(row[stockIdx]);

    // Omitir encabezados o celdas vacías
    if (!sku && !upc) continue;
    if (sku.toUpperCase() === 'SKU' || sku.toUpperCase() === 'TRF.SKU' || upc.toUpperCase() === 'UPC') continue;

    if (!numero_nae && rNumeroNae && rNumeroNae.toUpperCase() !== 'NAE') {
      numero_nae = rNumeroNae;
    }

    const itemKey = upc || sku;
    const es_agotado_transito = stock_on_hand <= 0;
    const costo_total = costo_unitario * unidades_esperadas;

    if (itemsMap.has(itemKey)) {
      const existing = itemsMap.get(itemKey)!;
      existing.bultos_esperados += bultos_esperados;
      existing.unidades_esperadas += unidades_esperadas;
      existing.costo_total = (existing.costo_total || 0) + costo_total;
      if (es_agotado_transito) existing.es_agotado_transito = true;
    } else {
      if (es_agotado_transito) agotadosTransitoCount++;
      totalBultos += bultos_esperados;
      totalUnidades += unidades_esperadas;
      montoTotalEsperado += costo_total;

      itemsMap.set(itemKey, {
        upc: upc || sku,
        sku,
        descripcion: descripcion || 'SIN DESCRIPCIÓN',
        depto_codigo: depto_codigo || '00',
        depto_nombre: 'GENERAL',
        bultos_esperados,
        unidades_esperadas,
        stock_disponible: stock_on_hand,
        es_agotado_transito,
        costo_unitario,
        costo_total
      });
    }
  }

  const items = Array.from(itemsMap.values());

  if (items.length === 0) {
    throw new Error('No se encontraron productos válidos en el reporte AP v2.');
  }

  if (!numero_nae) {
    throw new Error('No se pudo detectar el Número NAE en el reporte AP v2.');
  }

  const storeInfo = formatStoreDisplay('', '', numero_nae);

  return {
    numero_nae,
    tienda_codigo: storeInfo.tienda_codigo,
    tienda_nombre: storeInfo.tienda_nombre,
    totalSKUs: items.length,
    totalBultos,
    totalUnidades,
    agotadosTransitoCount,
    tiene_reporte_ap: true,
    monto_total_esperado: montoTotalEsperado,
    items
  };
};

/** Alias para compatibilidad con posibles variaciones tipográficas */
export const parseApotadosAPv2 = parseAgotadosAPv2;

