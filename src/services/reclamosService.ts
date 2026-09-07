import ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { AuditoriaItem, CamionNAE, ReclamoMagma, EstadoReclamoMagma, isCamionCierreParcial } from '../types';
import { getItemCostoReferencial, getUomLabel, calcularUnidadesFisicasItem } from '../utils/formatUtils';
import { evaluarDiscrepanciasCamion, enriquecerCamionesConLogsParciales } from './reportService';

const LOCAL_RECLAMOS_KEY = 'audimas_reclamos_magma_cache';

/**
 * Obtiene reclamos cacheados localmente en localStorage (fallback resiliente)
 */
const getLocalReclamosMap = (): Record<string, ReclamoMagma> => {
  try {
    const raw = localStorage.getItem(LOCAL_RECLAMOS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

/**
 * Guarda reclamos en localStorage
 */
const saveLocalReclamosMap = (map: Record<string, ReclamoMagma>) => {
  try {
    localStorage.setItem(LOCAL_RECLAMOS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('⚠️ Error guardando caché local de reclamos:', e);
  }
};

/**
 * Orden jerárquico de categorías de desvío para Magma
 */
const MOTIVO_ORDER: Record<string, number> = {
  'FALTANTE': 1,
  'SOBRANTE': 2,
  'NO FACTURADO': 3,
  'DAÑADO / ROTURA': 4
};

/**
 * Calcula el resumen de discrepancias reclamables para un camión (Faltantes, Sobrantes, No Facturados, Dañados)
 * Si esParcial = true, excluye del reclamo los artículos sin conteo ni rotura.
 */
export const calcularDiscrepanciasReclamo = (
  items: AuditoriaItem[], 
  camion: CamionNAE,
  esParcialInput?: boolean
) => {
  const esParcial = esParcialInput !== undefined ? esParcialInput : isCamionCierreParcial(camion);
  let totalMontoReclamado = 0;
  let cantUnidadesAfectadas = 0;
  const skuSet = new Set<string>();

  const itemsDiscrepantes: Array<{
    itemKey: string;
    item: AuditoriaItem;
    motivo: 'FALTANTE' | 'SOBRANTE' | 'NO FACTURADO' | 'DAÑADO / ROTURA';
    cantidadAfectada: number;
    costoUnitario: number;
    totalReclamado: number;
  }> = [];

  items.forEach(it => {
    const uEsp = Number(it.unidades_esperadas || 0);
    const uFisicas = calcularUnidadesFisicasItem(it);

    const isSobranteNoFact = Boolean(it.es_sobrante_no_facturado) || 
      (it.depto_codigo ? parseInt(it.depto_codigo, 10) === 999 : false) || 
      (uEsp === 0 && uFisicas > 0);

    const cantDanada = Number((Number(it.cantidad_danada || 0)).toFixed(3));
    const costoUnitarioRef = Number(it.costo_unitario_aplicado || it.costo_unitario_ap || it.costo_unitario || 0);

    // EN CIERRE PARCIAL: ignorar productos sin interacción real (conteo === 0 y rotura === 0)
    if (esParcial && uFisicas === 0 && cantDanada === 0 && !isSobranteNoFact) {
      return;
    }

    // 1. NO FACTURADOS: es_sobrante_no_facturado || depto 999 || uEsp === 0 con unidades escaneadas
    if (isSobranteNoFact && uFisicas > 0) {
      const cantNoFact = Number(uFisicas.toFixed(3));
      const totNoFact = Number((cantNoFact * costoUnitarioRef).toFixed(2));
      totalMontoReclamado += totNoFact;
      skuSet.add(it.sku);
      cantUnidadesAfectadas += cantNoFact;
      itemsDiscrepantes.push({
        itemKey: `${it.sku}_NO_FACTURADO`,
        item: it,
        motivo: 'NO FACTURADO',
        cantidadAfectada: cantNoFact,
        costoUnitario: costoUnitarioRef,
        totalReclamado: totNoFact
      });
    } else if (!isSobranteNoFact) {
      // 2. FALTANTES: uFisicas < uEsp sobre lo auditado
      if (uFisicas < uEsp) {
        const cantFaltante = Number((uEsp - uFisicas).toFixed(3));
        if (cantFaltante > 0) {
          const totFaltante = Number((cantFaltante * costoUnitarioRef).toFixed(2));
          totalMontoReclamado += totFaltante;
          skuSet.add(it.sku);
          cantUnidadesAfectadas += cantFaltante;
          itemsDiscrepantes.push({
            itemKey: `${it.sku}_FALTANTE`,
            item: it,
            motivo: 'FALTANTE',
            cantidadAfectada: cantFaltante,
            costoUnitario: costoUnitarioRef,
            totalReclamado: totFaltante
          });
        }
      } 
      // 3. SOBRANTES: uFisicas > uEsp (cuando uEsp > 0)
      else if (uFisicas > uEsp && uEsp > 0) {
        const cantSobrante = Number((uFisicas - uEsp).toFixed(3));
        if (cantSobrante > 0) {
          const totSobrante = Number((cantSobrante * costoUnitarioRef).toFixed(2));
          totalMontoReclamado += totSobrante;
          skuSet.add(it.sku);
          cantUnidadesAfectadas += cantSobrante;
          itemsDiscrepantes.push({
            itemKey: `${it.sku}_SOBRANTE`,
            item: it,
            motivo: 'SOBRANTE',
            cantidadAfectada: cantSobrante,
            costoUnitario: costoUnitarioRef,
            totalReclamado: totSobrante
          });
        }
      }
    }

    // 4. DAÑADOS / ROTURAS / MERMAS: cantidad_danada > 0
    if (cantDanada > 0) {
      const totDanada = Number((cantDanada * costoUnitarioRef).toFixed(2));
      totalMontoReclamado += totDanada;
      skuSet.add(it.sku);
      cantUnidadesAfectadas += cantDanada;
      itemsDiscrepantes.push({
        itemKey: `${it.sku}_DAÑADO`,
        item: it,
        motivo: 'DAÑADO / ROTURA',
        cantidadAfectada: cantDanada,
        costoUnitario: costoUnitarioRef,
        totalReclamado: totDanada
      });
    }
  });

  // Ordenamiento: 1° Faltantes, 2° Sobrantes, 3° No Facturados, 4° Dañados/Roturas.
  // Dentro de cada grupo, de mayor a menor impacto monetario ($).
  itemsDiscrepantes.sort((a, b) => {
    const orderA = MOTIVO_ORDER[a.motivo] || 99;
    const orderB = MOTIVO_ORDER[b.motivo] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return b.totalReclamado - a.totalReclamado;
  });

  return {
    totalMontoReclamado: Number(totalMontoReclamado.toFixed(2)),
    cantSkusAfectados: skuSet.size,
    cantUnidadesAfectadas: Number(cantUnidadesAfectadas.toFixed(3)),
    itemsDiscrepantes
  };
};

/**
 * Consulta la lista completa de Reclamos Magma desde Supabase y sincroniza con camiones cerrados.
 */
export const fetchReclamosMagma = async (camiones: CamionNAE[]): Promise<ReclamoMagma[]> => {
  const localMap = getLocalReclamosMap();

  // Cruce preventivo con auditoria_logs para detectar si el último cierre fue PARCIAL
  const camionesEnriquecidos = await enriquecerCamionesConLogsParciales(camiones);

  // 1. Consultar tabla reclamos_magma en Supabase
  let dbReclamos: ReclamoMagma[] = [];
  try {
    const { data, error } = await supabase
      .from('reclamos_magma')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      dbReclamos = data as ReclamoMagma[];
    }
  } catch (err) {
    console.warn('⚠️ Nota: No se pudo consultar la tabla reclamos_magma en Supabase, utilizando caché local:', err);
  }

  // 2. Identificar camiones CERRADOS, FINALIZADOS, CERRADO_PARCIAL o FINALIZADO_PARCIAL
  const camionesCerrados = camionesEnriquecidos.filter(c => {
    const est = (c.estado || '').trim().toUpperCase();
    return est.includes('CERRADO') || est.includes('FINALIZADO') || isCamionCierreParcial(c);
  });

  const resultReclamos: ReclamoMagma[] = [];
  const updatedLocalMap = { ...localMap };

  for (const camion of camionesCerrados) {
    const esParcial = isCamionCierreParcial(camion);

    // Buscar reclamo existente por nae_id O por nae_numero
    let reclamo = dbReclamos.find(r => 
      (r.nae_id && r.nae_id === camion.id) || 
      (r.nae_numero && camion.numero_nae && r.nae_numero.trim() === camion.numero_nae.trim())
    ) || Object.values(localMap).find(r => 
      (r.nae_id && r.nae_id === camion.id) || 
      (r.nae_numero && camion.numero_nae && r.nae_numero.trim() === camion.numero_nae.trim())
    );

    try {
      const { data: items } = await supabase
        .from('auditoria_items')
        .select('*')
        .eq('nae_id', camion.id);

      const itemsList = items || [];
      const discEval = evaluarDiscrepanciasCamion(itemsList, esParcial);

      // Si el camión es 100% conforme (o en parcial no tiene desvíos sobre lo auditado), OMITIR reclamo Magma
      if (discEval.es100Conforme) {
        if (reclamo) {
          try {
            await supabase.from('reclamos_magma').delete().eq('id', reclamo.id);
            await supabase.from('reclamos_magma').delete().eq('nae_id', camion.id);
            if (camion.numero_nae) {
              await supabase.from('reclamos_magma').delete().eq('nae_numero', camion.numero_nae.trim());
            }
          } catch (e) {}
          delete updatedLocalMap[reclamo.id];
          delete updatedLocalMap[`rec_${camion.id}`];
          if (camion.numero_nae) {
            Object.keys(updatedLocalMap).forEach(k => {
              if (updatedLocalMap[k]?.nae_numero === camion.numero_nae.trim()) {
                delete updatedLocalMap[k];
              }
            });
          }
        }
        continue;
      }

      const disc = calcularDiscrepanciasReclamo(itemsList, camion, esParcial);

      // Si de lo auditado no resultan discrepancias monetarias ni de SKUs, asegurar borrado
      if (disc.cantSkusAfectados === 0 && disc.totalMontoReclamado === 0) {
        if (reclamo) {
          try {
            await supabase.from('reclamos_magma').delete().eq('id', reclamo.id);
            await supabase.from('reclamos_magma').delete().eq('nae_id', camion.id);
          } catch (e) {}
          delete updatedLocalMap[reclamo.id];
          delete updatedLocalMap[`rec_${camion.id}`];
        }
        continue;
      }

      if (reclamo) {
        // SIEMPRE recalcular métricas del reclamo existente para reflejar el cierre actual (sea parcial o total)
        reclamo = {
          ...reclamo,
          monto_total_reclamado: disc.totalMontoReclamado,
          cant_skus_afectados: disc.cantSkusAfectados,
          cant_unidades_afectadas: disc.cantUnidadesAfectadas,
          updated_at: new Date().toISOString()
        };
        try {
          await supabase.from('reclamos_magma').upsert([reclamo], { onConflict: 'id' });
        } catch (e) {}
        resultReclamos.push(reclamo);
        updatedLocalMap[reclamo.id] = reclamo;
        continue;
      }

      // Si no existía reclamo registrado y tiene desvíos (cantFaltantes > 0 || cantSobrantes > 0 || cantDaniados > 0 || cantSinContar > 0)
      if (disc.cantSkusAfectados > 0 || disc.totalMontoReclamado > 0) {
        const fechaCierre = camion.fecha_fin_auditoria || camion.fecha_fin || camion.created_at || new Date().toISOString();
        
        const newReclamo: ReclamoMagma = {
          id: `rec_${camion.id}`,
          nae_id: camion.id,
          nae_numero: camion.numero_nae,
          tienda_codigo: camion.tienda_codigo,
          tienda_nombre: camion.tienda_nombre,
          estado: 'PENDIENTE',
          monto_total_reclamado: disc.totalMontoReclamado,
          cant_skus_afectados: disc.cantSkusAfectados,
          cant_unidades_afectadas: disc.cantUnidadesAfectadas,
          fecha_cierre_auditoria: fechaCierre,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        try {
          await supabase.from('reclamos_magma').upsert([newReclamo], { onConflict: 'id' });
        } catch (e) {
          console.warn('⚠️ No se pudo guardar el nuevo reclamo en Supabase (usando local storage):', e);
        }

        resultReclamos.push(newReclamo);
        updatedLocalMap[newReclamo.id] = newReclamo;
      }
    } catch (err) {
      console.warn(`Error al verificar items para reclamo del camión NAE ${camion.numero_nae}:`, err);
    }
  }

  saveLocalReclamosMap(updatedLocalMap);

  return resultReclamos.sort((a, b) => {
    const dateA = a.fecha_cierre_auditoria ? new Date(a.fecha_cierre_auditoria).getTime() : 0;
    const dateB = b.fecha_cierre_auditoria ? new Date(b.fecha_cierre_auditoria).getTime() : 0;
    return dateB - dateA;
  });
};

/**
 * Actualiza un reclamo existente (Estado, Ticket Magma, Monto Liquidado, Timestamps)
 */
export const updateReclamoMagma = async (
  reclamoId: string, 
  updates: Partial<ReclamoMagma>
): Promise<ReclamoMagma> => {
  const localMap = getLocalReclamosMap();
  const current = localMap[reclamoId] || {};

  const updated: ReclamoMagma = {
    ...current,
    ...updates,
    id: reclamoId,
    updated_at: new Date().toISOString()
  } as ReclamoMagma;

  // Actualizar en localStorage
  localMap[reclamoId] = updated;
  saveLocalReclamosMap(localMap);

  // Intentar actualizar en Supabase
  try {
    const { error } = await supabase
      .from('reclamos_magma')
      .upsert([updated], { onConflict: 'id' });

    if (error) {
      console.warn('⚠️ Advertencia al guardar reclamo en Supabase:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ No se pudo conectar a Supabase para actualizar el reclamo:', err);
  }

  return updated;
};

/**
 * Genera y descarga la Planilla Resumen de Apoyo para Magma en formato Excel (.xlsx)
 * Si se pasa selectedKeys, exporta exclusivamente los ítems seleccionados por el usuario.
 */
export const exportarPlanillaReclamoMagmaExcel = async (
  reclamo: ReclamoMagma,
  items: AuditoriaItem[],
  selectedKeys?: string[],
  camionInput?: CamionNAE
) => {
  let camion: CamionNAE = camionInput || {
    id: reclamo.nae_id,
    numero_nae: reclamo.nae_numero,
    tienda_codigo: reclamo.tienda_codigo,
    tienda_nombre: reclamo.tienda_nombre,
    estado: 'CERRADO'
  };

  const enrichedList = await enriquecerCamionesConLogsParciales([camion]);
  camion = enrichedList[0] || camion;

  const disc = calcularDiscrepanciasReclamo(items, camion);
  const activeKeys = selectedKeys || reclamo.items_seleccionados;

  let itemsAExportar = disc.itemsDiscrepantes;
  if (activeKeys && activeKeys.length > 0) {
    const setKeys = new Set(activeKeys);
    itemsAExportar = disc.itemsDiscrepantes.filter(d => setKeys.has(d.itemKey));
  }

  const skusSet = new Set(itemsAExportar.map(d => d.item.sku));
  const cantSkusExportados = skusSet.size;
  const cantUnidadesExportadas = Number(itemsAExportar.reduce((sum, d) => sum + d.cantidadAfectada, 0).toFixed(3));
  const montoTotalExportado = Number(itemsAExportar.reduce((sum, d) => sum + d.totalReclamado, 0).toFixed(2));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OperaMAS Suite';
  workbook.lastModifiedBy = 'OperaMAS';
  workbook.created = new Date();

  const BORDER_GREY = {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
  };

  // =========================================================================
  // HOJA 1: RESUMEN RECLAMO MAGMA
  // =========================================================================
  const wsResumen = workbook.addWorksheet('Resumen Reclamo Magma');

  // Banner
  wsResumen.mergeCells('A1:E1');
  const bannerCell = wsResumen.getCell('A1');
  bannerCell.value = 'PLANILLA DE APOYO PARA RECLAMO MAGMA';
  bannerCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsResumen.getRow(1).height = 36;

  wsResumen.getRow(2).height = 12;

  // Metadatos
  const metaRows = [
    ['Número NAE / Camión:', reclamo.nae_numero],
    ['Tienda Destino:', `${reclamo.tienda_codigo} - ${reclamo.tienda_nombre}`],
    ['Estado del Reclamo:', reclamo.estado],
    ['N° Ticket Magma:', reclamo.ticket_magma || 'No asignado'],
    ['Monto Total Reclamado ($):', montoTotalExportado],
    ['Monto Liquidado ($):', reclamo.monto_liquidado ?? 'Pendiente de resolución'],
    ['SKUs Reclamados Exportados:', cantSkusExportados],
    ['Unidades Faltantes / Dañadas:', cantUnidadesExportadas],
    ['Fecha Cierre Auditoría:', reclamo.fecha_cierre_auditoria ? new Date(reclamo.fecha_cierre_auditoria).toLocaleString('es-AR') : 'Sin registro'],
    ['Fecha Exportación Planilla:', new Date().toLocaleString('es-AR')]
  ];

  metaRows.forEach((meta, idx) => {
    const rowNum = idx + 3;
    const row = wsResumen.getRow(rowNum);
    row.values = [meta[0], meta[1]];
    row.height = 20;

    const cellLbl = row.getCell(1);
    cellLbl.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
    cellLbl.alignment = { horizontal: 'left', vertical: 'middle' };

    const cellVal = row.getCell(2);
    cellVal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellVal.alignment = { horizontal: 'left', vertical: 'middle' };
    if (idx === 4 && typeof meta[1] === 'number') {
      cellVal.numFmt = '"$"#,##0.00';
    }
  });

  const fixedWidthsHoja1 = [32, 38, 16, 16, 22];
  wsResumen.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja1.length) {
      col.width = fixedWidthsHoja1[cIdx];
    }
  });

  // =========================================================================
  // HOJA 2: DETALLE DISCREPANCIAS (SKUs)
  // =========================================================================
  const wsDetalle = workbook.addWorksheet('Detalle Discrepancias Magma');

  // Banner
  wsDetalle.mergeCells('A1:I1');
  const bannerDetCell = wsDetalle.getCell('A1');
  bannerDetCell.value = `DETALLE DE ITEMS RECLAMADOS - NAE ${reclamo.nae_numero}`;
  bannerDetCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerDetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerDetCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsDetalle.getRow(1).height = 32;

  wsDetalle.getRow(2).height = 12;

  // Header tabla
  const headerRow = wsDetalle.getRow(3);
  headerRow.values = [
    'Departamento',
    'SKU',
    'UPC / Código de Barras',
    'Descripción del Producto',
    'Motivo Discrepancia',
    'Cantidad Afectada',
    'UOM',
    'Costo Unit. Ref. ($)',
    'Total Reclamado ($)'
  ];
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_GREY;
  });

  itemsAExportar.forEach((d, idx) => {
    const rowNum = idx + 4;
    const it = d.item;

    let deptoNum = 999;
    if (it.depto_codigo) {
      const parsed = parseInt(it.depto_codigo, 10);
      if (!isNaN(parsed) && parsed > 0) deptoNum = parsed;
    }

    let deptoNombre = (it.depto_nombre || '').trim();
    if (deptoNum === 999 || !deptoNombre) {
      deptoNombre = 'DESCONOCIDO';
    }

    const deptoDisplay = (deptoNum !== 999 && deptoNombre !== 'DESCONOCIDO')
      ? `${deptoNum} - ${deptoNombre}`
      : deptoNombre;

    const uomLabel = getUomLabel(it).toUpperCase();

    const dataRow = wsDetalle.addRow([
      deptoDisplay,
      it.sku,
      it.upc,
      it.descripcion,
      d.motivo,
      d.cantidadAfectada,
      uomLabel,
      d.costoUnitario,
      { formula: `F${rowNum}*H${rowNum}`, result: d.totalReclamado }
    ]);
    dataRow.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';

    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;

      if (colNum === 8 || colNum === 9) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 6) {
        // MÁSCARA EXPLICITA DE 3 DECIMALES PARA PESABLES / CANTIDAD AFECTADA
        cell.numFmt = '#,##0.000';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        const isLeft = colNum === 1 || colNum === 4;
        cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
      }
    });
  });

  const lastRowIndex = 3 + itemsAExportar.length;
  if (itemsAExportar.length > 0) {
    const totalsRowNum = lastRowIndex + 1;
    const rTotal = wsDetalle.addRow([
      'TOTAL GENERAL ($)',
      '',
      '',
      '',
      '',
      { formula: `SUM(F4:F${lastRowIndex})` },
      '',
      '',
      { formula: `SUM(I4:I${lastRowIndex})` }
    ]);
    rTotal.height = 26;

    wsDetalle.mergeCells(`A${totalsRowNum}:E${totalsRowNum}`);

    rTotal.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
      cell.border = BORDER_GREY;

      if (colNum >= 1 && colNum <= 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNum === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '#,##0.000';
      } else if (colNum === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '"$"#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    wsDetalle.autoFilter = `A3:I${lastRowIndex}`;
  }

  const fixedWidthsHoja2 = [24, 14, 18, 40, 18, 16, 12, 20, 22];
  wsDetalle.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja2.length) {
      col.width = fixedWidthsHoja2[cIdx];
    }
  });

  // Generar buffer y descargar archivo
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fechaStr = new Date().toISOString().split('T')[0];
  const filename = `Planilla_Magma_NAE_${reclamo.nae_numero}_${fechaStr}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);

  // Actualizar timestamp fecha_ultima_exportacion en DB y estado
  const nowIso = new Date().toISOString();
  await updateReclamoMagma(reclamo.id, {
    fecha_ultima_exportacion: nowIso,
    estado: reclamo.estado === 'PENDIENTE' ? 'EXPORTADO' : reclamo.estado,
    monto_total_reclamado: montoTotalExportado,
    items_seleccionados: activeKeys
  });
};
