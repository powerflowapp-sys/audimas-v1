/**
 * Formatea un número para visualización limpia en la UI:
 * - Redondea como máximo a 3 decimales sin ceros innecesarios a la derecha.
 * - Elimina imprecisiones de coma flotante (ej: 5.999999999999805 -> 6, 1.006666666666667 -> 1.007).
 * - Si el valor es entero (ej: 1 o 6), se muestra como entero sin decimales.
 * - Si el valor es nulo, indefinido o no numérico, retorna "0".
 */
export const formatNumber = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  return Number(num.toFixed(3)).toString();
};

export const DEPTOS_AUDITABLES_UOM = ['21', '43', '93', '94', '98', 21, 43, 93, 94, 98];

/**
 * Resuelve estrictamente la Unidad de Medida del ítem según las reglas de Departamento:
 * - Regla 1 (Deptos Auditados UOM: 21, 43, 93, 94, 98): Evalúa obligatoriamente unidad_medida.
 * - Regla 2 (Resto de los Departamentos): Forzado automáticamente a 'UN'.
 */
export const resolverUnidadMedidaItem = (item: any): string => {
  if (!item) return 'UN';

  const depto = String(item.departamento_id || item.depto_codigo || '').trim();
  const esDeptoAuditado = DEPTOS_AUDITABLES_UOM.includes(depto) || DEPTOS_AUDITABLES_UOM.includes(Number(depto));
  
  // Caso A: Si el departamento NO está en la lista blanca -> Retornar SIEMPRE 'UN'
  if (!esDeptoAuditado) {
    return 'UN';
  }

  // Caso B: Si el departamento SÍ está en la lista blanca (21, 43, 93, 94, 98):
  // Evaluar únicamente el campo unidad_medida del archivo maestro
  const rawUom = String(item.unidad_medida || '').toUpperCase().trim();
  if (rawUom.includes('KG') || rawUom.includes('KGS') || rawUom.includes('G') || rawUom === 'KILO' || rawUom === 'KILOS') {
    return 'KG';
  }
  if (rawUom.includes('L') || rawUom.includes('LT') || rawUom === 'LITRO' || rawUom === 'LITROS') {
    return 'L';
  }
  return 'UN';
};

/**
 * Determina si un artículo es pesable / balanza por departamento auditado (21, 43, 93, 94, 98) y su unidad de medida ('KG').
 */
export const isItemPesable = (item: any): boolean => {
  return resolverUnidadMedidaItem(item) === 'KG';
};

/**
 * Calcula el total de unidades físicas de un ítem contemplando si es pesable
 * o por bultos/unidades discretas.
 * Para pesables: si posee unidades escaneadas > 0 (kilos acumulados), ese valor representa el neto físico total.
 */
export const calcularUnidadesFisicasItem = (item: {
  unidades_esperadas?: number;
  bultos_esperados?: number;
  unidades_escaneadas?: number;
  bultos_escaneados?: number;
  unidad_medida?: string;
  depto_codigo?: string;
  departamento_id?: string;
}): number => {
  const uEsp = Number(item.unidades_esperadas || 0);
  const bEsp = Number(item.bultos_esperados || 0);
  const uEscRaw = Number(item.unidades_escaneadas || 0);
  const bEsc = Number(item.bultos_escaneados || 0);
  const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;

  if (isItemPesable(item)) {
    return uEscRaw > 0 ? uEscRaw : (bEsc * factor);
  }

  return (bEsc * factor) + uEscRaw;
};

/**
 * Retorna la etiqueta corta de la unidad de medida ('kg', 'L', 'un')
 */
export const getUomLabel = (uomOrItem?: any, itemContext?: any): string => {
  if (!uomOrItem && !itemContext) return 'un';

  const itemObj = (typeof uomOrItem === 'object' && uomOrItem !== null)
    ? uomOrItem
    : (typeof itemContext === 'object' && itemContext !== null)
    ? itemContext
    : null;

  if (itemObj) {
    const resolved = resolverUnidadMedidaItem(itemObj);
    if (resolved === 'KG') return 'kg';
    if (resolved === 'L') return 'L';
    return 'un';
  }

  const cleanUom = String(uomOrItem || '').toUpperCase().trim();
  if (cleanUom === 'KG' || cleanUom === 'KILO' || cleanUom === 'KILOS' || cleanUom === 'KGS') return 'kg';
  if (cleanUom === 'L' || cleanUom === 'LITRO' || cleanUom === 'LITROS' || cleanUom === 'LT') return 'L';
  if (cleanUom === 'G' || cleanUom === 'GR' || cleanUom === 'GRAMO' || cleanUom === 'GRAMOS') return 'g';
  return 'un';
};

/**
 * Retorna el texto para el botón de la unidad de conteo en la interfaz:
 * - KG -> 'POR KILOS (KG)'
 * - L -> 'POR LITROS (L)'
 * - UN / otra -> 'POR UNIDADES (UN)'
 */
export const getUomButtonLabel = (uomOrItem?: any, itemContext?: any): string => {
  if (!uomOrItem && !itemContext) return 'POR UNIDADES';

  const itemObj = (typeof uomOrItem === 'object' && uomOrItem !== null)
    ? uomOrItem
    : (typeof itemContext === 'object' && itemContext !== null)
    ? itemContext
    : null;

  if (itemObj) {
    const resolved = resolverUnidadMedidaItem(itemObj);
    if (resolved === 'KG') return 'POR KILOS (KG)';
    if (resolved === 'L') return 'POR LITROS (L)';
    return 'POR UNIDADES (UN)';
  }

  const cleanUom = String(uomOrItem || '').toUpperCase().trim();
  if (cleanUom === 'KG' || cleanUom === 'KILO' || cleanUom === 'KILOS' || cleanUom === 'KGS') return 'POR KILOS (KG)';
  if (cleanUom === 'L' || cleanUom === 'LITRO' || cleanUom === 'LITROS' || cleanUom === 'LT') return 'POR LITROS (L)';
  return 'POR UNIDADES';
};

/**
 * Retorna la etiqueta formateada para los ítems del historial de escaneos:
 * - Si modo === 'BULTOS' -> 'Bulto' o 'Bultos'
 * - Si modo === 'UNIDADES' -> 'kg', 'L', 'g', 'un'
 */
export const getScanLogUomLabel = (modo: string | undefined, cant: number, uomOrItem?: any, itemContext?: any): string => {
  if (modo === 'BULTOS') {
    return Math.abs(cant) === 1 ? 'Bulto' : 'Bultos';
  }
  return getUomLabel(uomOrItem, itemContext);
};

/**
 * Determina el Costo Unitario Referencial aplicando la Jerarquía Estricta:
 * - Prioridad 1 (Principal): Costo extraído del Reporte Agotados AP (costo_unitario_ap o costo_unitario con AP).
 * - Prioridad 2 (Fallback / Respaldo): Costo desde Catálogo Maestro (maestro_productos / Costo Medio).
 * - Prioridad 3: 0.00.
 */
export const getItemCostoReferencial = (
  item: {
    sku?: string;
    upc?: string;
    costo_unitario_ap?: number;
    costo_unitario?: number;
  },
  maestroMap?: Map<string, number>,
  tieneReporteAp?: boolean
): number => {
  // Prioridad 1: AP
  if (item.costo_unitario_ap && Number(item.costo_unitario_ap) > 0) {
    return Number(item.costo_unitario_ap);
  }
  if (tieneReporteAp && item.costo_unitario && Number(item.costo_unitario) > 0) {
    return Number(item.costo_unitario);
  }

  // Prioridad 2: Catálogo Maestro
  const cleanSku = (item.sku || '').trim().toUpperCase();
  const cleanUpc = (item.upc || '').trim().toUpperCase();

  if (maestroMap) {
    const maestroCost = (cleanSku ? maestroMap.get(cleanSku) : undefined) ||
                        (cleanUpc ? maestroMap.get(cleanUpc) : undefined);
    if (maestroCost && maestroCost > 0) {
      return maestroCost;
    }
  }

  if (item.costo_unitario && Number(item.costo_unitario) > 0) {
    return Number(item.costo_unitario);
  }

  // Prioridad 3: 0.00
  return 0.00;
};

/**
 * Formatea una cadena a Nombre Propio (Title Case / Capitalize por palabra):
 * - Cada palabra separada por espacios tiene su primer carácter en mayúscula y el resto en minúsculas.
 * - Preserva correctamente espacios en blanco mientras el usuario escribe.
 * Ejemplos:
 * "juan manuel pérez" -> "Juan Manuel Pérez"
 * "JORGE FLORES" -> "Jorge Flores"
 */
export const formatToTitleCase = (str: string): string => {
  if (!str) return '';
  return str
    .split(' ')
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

/**
 * Obtiene las iniciales (ej: "DM" para "Dante Mamani") de un nombre completo.
 * Si no hay nombre o no es válido, retorna 'OP'.
 */
export const getIniciales = (nombre?: string | null): string => {
  if (!nombre || !nombre.trim()) return 'OP';
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
  }
  return nombre.trim().substring(0, 2).toUpperCase();
};



