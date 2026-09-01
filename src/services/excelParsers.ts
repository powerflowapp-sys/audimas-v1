import * as XLSX from 'xlsx';
import { supabase } from './supabase';
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
  // Si viene como número científico o flotante en Excel (ej. UPC grande)
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

// =============================================================================
// PARSER 1: MAESTRO GENERAL DE PRODUCTOS (Reporte Stock V1 - *.xlsx)
// =============================================================================

/**
 * Lee y parsea el archivo Excel de Maestro de Productos (Cabecera en Fila 3, índice 2)
 */
export const parseMaestroExcel = async (file: File): Promise<ProductoMaestro[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Usar la primera hoja disponible
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    throw new Error('El archivo Excel de Maestro no contiene hojas válidas.');
  }

  // Convertir la hoja a matriz 2D (header: 1 devuelve filas como arrays)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // Fila 3 (índice 2) es la cabecera -> Las filas de datos inician en el índice 3
  const dataRows = rows.slice(3);
  const productosMap = new Map<string, ProductoMaestro>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    
    // Extracción según mapeo especificado:
    // Col C (índice 2): depto_codigo
    // Col D (índice 3): depto_nombre
    // Col G (índice 6): upc
    // Col H (índice 7): sku
    // Col I (índice 8): descripcion
    const depto_codigo = cleanString(row[2]);
    const depto_nombre = cleanString(row[3]);
    const upc = cleanString(row[6]);
    const sku = cleanString(row[7]);
    const descripcion = cleanString(row[8]);

    // Descarte: Ignorar filas donde UPC o SKU estén vacíos
    if (!upc || !sku) {
      continue;
    }

    // Evitar duplicados manteniendo la versión más reciente
    productosMap.set(upc, {
      upc,
      sku,
      descripcion: descripcion || 'SIN DESCRIPCIÓN',
      depto_codigo: depto_codigo || '00',
      depto_nombre: depto_nombre || 'GENERAL',
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
  // 1. Borrado completo (Overwrite Total) de la tabla maestro_productos
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

  const BATCH_SIZE = 500;
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
        `Sincronizando catálogo (${processed.toLocaleString('es-AR')}/${total.toLocaleString('es-AR')})...`
      );
    }
  }

  return { success: true, totalUploaded: processed };
};


// =============================================================================
// PARSER 2: MANIFIESTO DEL CAMIÓN CEDIS (32 Agotado en transito *.xlsx)
// =============================================================================

/**
 * Lee y parsea el archivo de Manifiesto de Camión NAE (Cabecera en Fila 2, índice 1)
 */
export const parseCamionManifiestoExcel = async (file: File): Promise<CamionManifiestoPreview> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Buscar hoja 'Detalle Items a Recibir' o usar la primera
  const sheetName = workbook.SheetNames.find(
    name => name.trim().toLowerCase() === 'detalle items a recibir'
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('El archivo no contiene la hoja esperada ("Detalle Items a Recibir").');
  }

  // Obtenemos las filas como matriz 2D
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // Los datos reales arrancan en la fila 3 (índice 3)
  const dataRows = rows.slice(3);

  if (dataRows.length === 0) {
    throw new Error('El archivo de manifiesto no contiene filas de datos.');
  }

  let numero_nae = '';
  let tienda_codigo = '';
  let tienda_nombre = '';
  
  const itemsMap = new Map<string, ItemManifiestoParsed>();
  let totalBultos = 0;
  let totalUnidades = 0;
  let agotadosTransitoCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    const rTiendaCodigo = cleanString(row[0]); // Col A (ej: 1031)
    const rTiendaNombre = cleanString(row[1]); // Col B (ej: Jujuy)
    const rNumeroNae = cleanString(row[2]);   // Col C (ej: 153828-1031)
    const depto_codigo = cleanString(row[3]);  // Col D
    const depto_nombre = cleanString(row[4]);  // Col E
    const sku = cleanString(row[5]);           // Col F
    const descripcion = cleanString(row[6]);   // Col G
    const upc = cleanString(row[7]);           // Col H
    const bultos_esperados = parseNumber(row[8]);    // Col I
    const unidades_esperadas = parseNumber(row[9]);  // Col J
    const stock_disponible = parseNumber(row[10]);   // Col K

    // Omitir filas residuales de cabecera o vacías
    if (!upc || !sku || upc.toUpperCase() === 'UPC' || sku.toUpperCase() === 'SKU') continue;

    if (!numero_nae && rNumeroNae && rNumeroNae.toUpperCase() !== 'NAE') {
      numero_nae = rNumeroNae;
      tienda_codigo = rTiendaCodigo || '1031';
      tienda_nombre = rTiendaNombre || 'Jujuy';
    }

    const es_agotado_transito = stock_disponible === 0;
    if (es_agotado_transito) agotadosTransitoCount++;

    totalBultos += bultos_esperados;
    totalUnidades += unidades_esperadas;

    itemsMap.set(upc, {
      upc,
      sku,
      descripcion: descripcion || 'SIN DESCRIPCIÓN',
      depto_codigo: depto_codigo || '00',
      depto_nombre: depto_nombre || 'GENERAL',
      bultos_esperados,
      unidades_esperadas,
      stock_disponible,
      es_agotado_transito
    });
  }

  const items = Array.from(itemsMap.values());

  if (items.length === 0) {
    throw new Error('No se encontraron ítems válidos en el manifiesto del camión.');
  }

  if (!numero_nae) {
    throw new Error('No se pudo detectar el Número NAE de la cabecera en el manifiesto.');
  }

  return {
    numero_nae,
    tienda_codigo: tienda_codigo || '0000',
    tienda_nombre: tienda_nombre || 'TIENDA DESCONOCIDA',
    totalSKUs: items.length,
    totalBultos,
    totalUnidades,
    agotadosTransitoCount,
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
  onProgress?: ProgressCallback
): Promise<{ success: boolean; nae_id: string; totalItems: number }> => {
  const { numero_nae, tienda_codigo, tienda_nombre, items } = preview;

  if (onProgress) {
    onProgress(5, 0, items.length, 'Registrando la cabecera del camión NAE...');
  }

  // 1. Obtener o crear la cabecera del camión NAE
  const { data: existingNae, error: fetchError } = await supabase
    .from('camiones_nae')
    .select('id, estado')
    .eq('numero_nae', numero_nae)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Error al consultar camión NAE: ${fetchError.message}`);
  }

  let naeId: string;

  if (existingNae) {
    naeId = existingNae.id;
  } else {
    const { data: newNae, error: insertNaeError } = await supabase
      .from('camiones_nae')
      .insert({
        numero_nae,
        tienda_codigo,
        tienda_nombre,
        fecha_arribo: new Date().toISOString().split('T')[0],
        estado: 'PENDIENTE',
        fecha_inicio_auditoria: null
      })
      .select('id')
      .single();

    if (insertNaeError || !newNae) {
      throw new Error(`Error al crear el camión NAE: ${insertNaeError?.message}`);
    }

    naeId = newNae.id;
  }

  // 2. Preparar los items vinculados al nae_id
  const dbItems = items.map(item => ({
    nae_id: naeId,
    upc: item.upc,
    sku: item.sku,
    descripcion: item.descripcion,
    depto_codigo: item.depto_codigo,
    depto_nombre: item.depto_nombre,
    bultos_esperados: item.bultos_esperados,
    unidades_esperadas: item.unidades_esperadas,
    stock_disponible: item.stock_disponible,
    es_agotado_transito: item.es_agotado_transito,
    bultos_escaneados: 0,
    unidades_escaneadas: 0,
    es_sobrante_no_facturado: false,
    updated_at: new Date().toISOString()
  }));

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
    // Calcular porcentaje entre 10% y 100%
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
