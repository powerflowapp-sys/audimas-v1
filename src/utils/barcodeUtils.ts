/**
 * Utilitario centralizado de normalización y coincidencia elástica de códigos de barras (UPC / EAN / SKU)
 */

/**
 * Sanitiza un código de barras eliminando espacios, guiones y caracteres invisibles o de control.
 */
export const sanitizeBarcode = (rawCode?: string | null): string => {
  if (!rawCode) return '';
  return String(rawCode)
    .replace(/[\u0000-\u001F\u007F-\u009F\s-]/g, '')
    .trim();
};

/**
 * Genera el conjunto completo de variantes posibles para un código:
 * 1. Código limpio tal cual.
 * 2. Código sin ceros a la izquierda (ej. 07791234 -> 7791234).
 * 3. Código rellenado a 12, 13 y 14 dígitos con ceros iniciales (padStart).
 */
export const getBarcodeVariants = (rawCode?: string | null): string[] => {
  const clean = sanitizeBarcode(rawCode);
  if (!clean) return [];

  const variants = new Set<string>();

  // 1. Código limpio original
  variants.add(clean);

  // 2. Sin ceros a la izquierda
  const noZeros = clean.replace(/^0+/, '');
  if (noZeros) {
    variants.add(noZeros);

    // 3. Variantes con padding de ceros si contiene sólo números
    if (/^\d+$/.test(noZeros)) {
      if (noZeros.length <= 12) variants.add(noZeros.padStart(12, '0'));
      if (noZeros.length <= 13) variants.add(noZeros.padStart(13, '0'));
      if (noZeros.length <= 14) variants.add(noZeros.padStart(14, '0'));
    }
  }

  return Array.from(variants);
};

/**
 * Realiza una coincidencia elástica entre dos códigos de barras (escaneado vs catálogo/manifiesto).
 * Retorna true si cualquiera de las variantes generadas por ambos códigos coincide.
 */
export const matchBarcode = (scannedCode?: string | null, itemCode?: string | null): boolean => {
  if (!scannedCode || !itemCode) return false;

  const scannedClean = sanitizeBarcode(scannedCode);
  const itemClean = sanitizeBarcode(itemCode);

  if (scannedClean === itemClean) return true;

  const scannedVariants = getBarcodeVariants(scannedClean);
  const itemVariants = getBarcodeVariants(itemClean);

  return scannedVariants.some(sv => itemVariants.includes(sv));
};
