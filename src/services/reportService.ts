import ExcelJS from 'exceljs';
import { supabase } from './supabase';
import { 
  AuditoriaItem, 
  CamionNAE, 
  ResumenAuditoria, 
  ProductividadColaborador 
} from '../types';
import { parseFotoUrls } from '../utils/imageCompressor';
import { getItemCostoReferencial, getUomLabel, calcularUnidadesFisicasItem } from '../utils/formatUtils';
import { sanitizeAuditoriaItemForDb } from './excelParsers';

/**
 * Calcula las métricas generales de resumen de la auditoría
 */
export const calcularResumenAuditoria = (items: AuditoriaItem[]): ResumenAuditoria => {
  const totalSkus = items.length;
  let skusAuditados = 0;
  let skusManifiesto = 0;
  let skusAuditadosManifiesto = 0;

  let unidadesEsperadas = 0;
  let unidadesEscaneadas = 0;
  let bultosEsperados = 0;
  let bultosEscaneados = 0;
  
  let skusConFaltante = 0;
  let unidadesFaltantes = 0;
  let skusConSobrante = 0;
  let unidadesSobrantes = 0;
  let skusNoFacturados = 0;
  let unidadesNoFacturadas = 0;
  let skusAgotadosTransito = 0;

  items.forEach((it) => {
    const uEsp = Number(it.unidades_esperadas || 0);
    const uEsc = Number(it.unidades_escaneadas || 0);
    const bEsp = Number(it.bultos_esperados || 0);
    const bEsc = Number(it.bultos_escaneados || 0);

    const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
    const totalUnidadesFisicasItem = calcularUnidadesFisicasItem(it);

    const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);

    // OMITIR completamente sobrantes no facturados que quedaron en 0 (por anulación/corrección)
    if (isSobranteNoFact && totalUnidadesFisicasItem === 0 && bEsc === 0 && uEsc === 0) {
      return;
    }

    // Cálculo unificado de bultos equivalentes:
    const totalBultosEquivalentesItem = (bEsp > 0 && factor > 0)
      ? (bEsc + (uEsc / factor))
      : bEsc;

    unidadesEsperadas += uEsp;
    unidadesEscaneadas += totalUnidadesFisicasItem;
    bultosEsperados += bEsp;
    bultosEscaneados += totalBultosEquivalentesItem;

    // Criterio unificado: SKU auditado si tiene bultos o unidades escaneadas > 0
    const isAuditado = uEsc > 0 || bEsc > 0;

    if (isAuditado) {
      skusAuditados++;
    }

    if (!isSobranteNoFact) {
      skusManifiesto++;
      if (isAuditado) {
        skusAuditadosManifiesto++;
      }
    }

    if (it.es_agotado_transito) {
      skusAgotadosTransito++;
    }

    if (isSobranteNoFact) {
      skusNoFacturados++;
      unidadesNoFacturadas += totalUnidadesFisicasItem;
    } else if (totalUnidadesFisicasItem < uEsp) {
      skusConFaltante++;
      unidadesFaltantes += (uEsp - totalUnidadesFisicasItem);
    } else if (totalUnidadesFisicasItem > uEsp && uEsp > 0) {
      skusConSobrante++;
      unidadesSobrantes += (totalUnidadesFisicasItem - uEsp);
    }
  });

  const efectividadPorcentaje = unidadesEsperadas > 0 
    ? Math.min(100, Math.round((unidadesEscaneadas / unidadesEsperadas) * 100)) 
    : 100;

  return {
    totalSkus,
    skusAuditados,
    skusManifiesto,
    skusAuditadosManifiesto,
    unidadesEsperadas: Math.round(unidadesEsperadas),
    unidadesEscaneadas: Math.round(unidadesEscaneadas),
    bultosEsperados: Math.round(bultosEsperados),
    bultosEscaneados: Math.round(bultosEscaneados),
    efectividadPorcentaje,
    skusConFaltante,
    unidadesFaltantes: Math.round(unidadesFaltantes),
    skusConSobrante,
    unidadesSobrantes: Math.round(unidadesSobrantes),
    skusNoFacturados,
    unidadesNoFacturadas: Math.round(unidadesNoFacturadas),
    skusAgotadosTransito,
    skusNoContados: Math.max(0, skusManifiesto - skusAuditadosManifiesto)
  };
};

/**
 * Normaliza y consolida nombres de colaboradores removiendo corchetes/paréntesis y textos adicionales.
 */
export const normalizeCollaboratorName = (rawName?: string | null): string => {
  if (!rawName) return 'DESCONOCIDO';
  let cleaned = rawName.replace(/\s*\(.*?\)/g, '').trim().toUpperCase();
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned || 'DESCONOCIDO';
};

/**
 * Consulta la tabla auditoria_logs (y fallback en auditoria_items) para calcular el aporte de unidades físicas por colaborador
 */
export const fetchProductividadColaboradores = async (
  naeId: string
): Promise<ProductividadColaborador[]> => {
  const { data: items } = await supabase
    .from('auditoria_items')
    .select('upc, bultos_esperados, unidades_esperadas, bultos_escaneados, unidades_escaneadas, ultimo_colaborador')
    .eq('nae_id', naeId);

  const upcFactorMap = new Map<string, number>();
  (items || []).forEach(it => {
    const bEsp = Number(it.bultos_esperados || 0);
    const uEsp = Number(it.unidades_esperadas || 0);
    const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
    upcFactorMap.set((it.upc || '').trim(), factor);
  });

  const { data: logs, error } = await supabase
    .from('auditoria_logs')
    .select('colaborador_nombre, modo_conteo, cantidad, upc')
    .eq('nae_id', naeId);

  const mapColab = new Map<string, { totalUnidades: number; totalBultos: number; totalEscaneos: number }>();

  if (!error && logs && logs.length > 0) {
    logs.forEach((log) => {
      const colabRaw = normalizeCollaboratorName(log.colaborador_nombre);
      const cant = Number(log.cantidad || 0);
      const cleanUpc = (log.upc || '').trim();
      const factor = upcFactorMap.get(cleanUpc) || 1;

      const actual = mapColab.get(colabRaw) || { totalUnidades: 0, totalBultos: 0, totalEscaneos: 0 };
      actual.totalEscaneos += 1;

      if (log.modo_conteo === 'BULTOS') {
        actual.totalBultos += cant;
        actual.totalUnidades += (cant * factor);
      } else {
        actual.totalUnidades += cant;
      }

      mapColab.set(colabRaw, actual);
    });
  } else if (items && items.length > 0) {
    items.forEach(it => {
      if (!it.ultimo_colaborador) return;
      const colabRaw = normalizeCollaboratorName(it.ultimo_colaborador);
      const bEsc = Number(it.bultos_escaneados || 0);
      const uEsc = Number(it.unidades_escaneadas || 0);
      const bEsp = Number(it.bultos_esperados || 0);
      const uEsp = Number(it.unidades_esperadas || 0);
      const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;

      const totalUnidadesFisicas = (bEsc * factor) + uEsc;
      if (totalUnidadesFisicas > 0 || bEsc > 0) {
        const actual = mapColab.get(colabRaw) || { totalUnidades: 0, totalBultos: 0, totalEscaneos: 0 };
        actual.totalBultos += bEsc;
        actual.totalUnidades += totalUnidadesFisicas;
        actual.totalEscaneos += 1;
        mapColab.set(colabRaw, actual);
      }
    });
  }

  let totalOverallUnits = 0;
  mapColab.forEach((val) => {
    totalOverallUnits += Math.max(0, val.totalUnidades);
  });

  const resultado: ProductividadColaborador[] = [];
  mapColab.forEach((val, key) => {
    const unFisicas = Math.max(0, Math.round(val.totalUnidades));
    const escaneos = val.totalEscaneos;
    if (unFisicas <= 0 && escaneos <= 0) return; // Filtrar colaboradores sin actividad

    const pct = totalOverallUnits > 0 
      ? Math.min(100, Math.round((unFisicas / totalOverallUnits) * 100)) 
      : 0;

    resultado.push({
      colaborador_nombre: key,
      totalUnidades: unFisicas,
      totalBultos: Math.max(0, Math.round(val.totalBultos)),
      totalEscaneos: escaneos,
      porcentajeParticipacion: pct
    });
  });

  return resultado.sort((a, b) => b.totalUnidades - a.totalUnidades);
};

/**
 * Calcula la duración transcurrida de la auditoría en formato legible (ej: 1h 25m, 15m 30s)
 */
export const calcularDuracionAuditoria = (inicioStr?: string, finStr?: string): string => {
  if (!inicioStr) return 'Sin registrar';
  const inicio = new Date(inicioStr);
  const fin = finStr ? new Date(finStr) : new Date();
  const diffMs = Math.max(0, fin.getTime() - inicio.getTime());

  const totalMinutos = Math.floor(diffMs / (1000 * 60));
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  const segundos = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (horas > 0) {
    return `${horas}h ${minutos}m`;
  }
  if (minutos > 0) {
    return `${minutos}m ${segundos}s`;
  }
  return `${segundos}s`;
};

/**
 * Formatea cualquier marca de tiempo ISO o Date a la zona horaria explícita de Argentina (America/Argentina/Buenos_Aires - GMT-3).
 * Formato de salida: DD/MM/YY HH:mm hs (ej: 02/09/26 12:15 hs)
 */
export const formatDateTimeArg = (dateStr?: string | null): string => {
  if (!dateStr) return '--/--/-- --:-- hs';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--/--/-- --:-- hs';

    const formatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(d);
    const map = new Map(parts.map(p => [p.type, p.value]));

    const day = map.get('day');
    const month = map.get('month');
    const year = map.get('year');
    const hour = map.get('hour');
    const minute = map.get('minute');

    return `${day}/${month}/${year} ${hour}:${minute} hs`;
  } catch {
    return String(dateStr);
  }
};

/**
 * Consulta la marca de tiempo MÁXIMA registrada en auditoria_logs para un camión NAE.
 */
export const fetchMaxLogDateForTruck = async (naeId: string): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('auditoria_logs')
      .select('created_at')
      .eq('nae_id', naeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.created_at || null;
  } catch (e) {
    return null;
  }
};

/**
 * Resuelve y devuelve las marcas de tiempo en orden cronológico garantizando zona horaria GMT-3.
 * Para camiones cerrados/finalizados sin timestamp de 1° cierre, obtiene la fecha MÁXIMA de auditoria_logs.
 */
export const resolveCamionFechas = (camion: CamionNAE, lastLogDate?: string | null) => {
  const estUpper = (camion.estado || '').trim().toUpperCase();
  const esCerrado = estUpper === 'FINALIZADO' || estUpper === 'CERRADO';

  const fechaInicioRaw = camion.fecha_inicio_auditoria || camion.created_at;

  // 1° cierre original (preservado sin sobreescribir)
  let fechaPrimerCierreRaw = camion.fecha_fin_auditoria || camion.fecha_fin;
  if (!fechaPrimerCierreRaw && (esCerrado || camion.fecha_reapertura)) {
    fechaPrimerCierreRaw = lastLogDate || camion.created_at || new Date().toISOString();
  }

  // Garantizar que 1° cierre nunca sea inferior a la hora de inicio
  if (fechaInicioRaw && fechaPrimerCierreRaw) {
    const timeInicio = new Date(fechaInicioRaw).getTime();
    const timeFin = new Date(fechaPrimerCierreRaw).getTime();
    if (!isNaN(timeInicio) && !isNaN(timeFin) && timeFin < timeInicio) {
      fechaPrimerCierreRaw = fechaInicioRaw;
    }
  }

  const fechaReaperturaRaw = camion.fecha_reapertura;
  const fechaFinReaperturaRaw = camion.fecha_fin_reapertura;

  return {
    fechaInicioFormatted: fechaInicioRaw ? formatDateTimeArg(fechaInicioRaw) : null,
    fechaPrimerCierreFormatted: fechaPrimerCierreRaw ? formatDateTimeArg(fechaPrimerCierreRaw) : null,
    fechaReaperturaFormatted: fechaReaperturaRaw ? formatDateTimeArg(fechaReaperturaRaw) : null,
    fechaFinReaperturaFormatted: fechaFinReaperturaRaw ? formatDateTimeArg(fechaFinReaperturaRaw) : null,
    fechaInicioRaw,
    fechaPrimerCierreRaw,
    fechaReaperturaRaw,
    fechaFinReaperturaRaw,
    esCerrado,
    estUpper
  };
};

/**
 * Recalcula y persiste los valores de costo_unitario_aplicado y costo_total_reclamado
 * en auditoria_items aplicando la jerarquía estricta (AP > Maestro > 0.00)
 * para dejar la estructura lista para el futuro Módulo Reclamos Magma.
 */
export const persisitirCostosReclamoMagma = async (naeId: string): Promise<void> => {
  try {
    const { data: camion } = await supabase
      .from('camiones_nae')
      .select('tiene_reporte_ap')
      .eq('id', naeId)
      .single();

    const { data: items } = await supabase
      .from('auditoria_items')
      .select('*')
      .eq('nae_id', naeId);

    if (!items || items.length === 0) return;

    // Mapa de costos desde Catálogo Maestro para Prioridad 2
    const maestroCostMap = new Map<string, number>();
    const { data: maestroItems } = await supabase
      .from('maestro_productos')
      .select('sku, upc, costo_unitario');

    maestroItems?.forEach(m => {
      const c = Number(m.costo_unitario) || 0;
      if (c > 0) {
        if (m.sku) maestroCostMap.set(m.sku.trim().toUpperCase(), c);
        if (m.upc) maestroCostMap.set(m.upc.trim().toUpperCase(), c);
      }
    });

    const itemsToUpdate: any[] = [];

    items.forEach(it => {
      const costoUnitarioAplicado = getItemCostoReferencial(it, maestroCostMap, camion?.tiene_reporte_ap);

      const bEsp = Number(it.bultos_esperados || 0);
      const uEsp = Number(it.unidades_esperadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const uEscRaw = Number(it.unidades_escaneadas || 0);
      const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
      const uFisicas = (bEsc * factor) + uEscRaw;

      const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
      const cantFaltante = (!isSobranteNoFact && uFisicas < uEsp) ? (uEsp - uFisicas) : 0;
      const costoUnitarioFinal = costoUnitarioAplicado > 0 ? costoUnitarioAplicado : (it.costo_unitario || 0);
      const costoTotalFinal = Number((costoUnitarioFinal * uEsp).toFixed(2));

      itemsToUpdate.push(sanitizeAuditoriaItemForDb({
        ...it,
        costo_unitario: costoUnitarioFinal,
        costo_total: costoTotalFinal,
        updated_at: new Date().toISOString()
      }));
    });

    if (itemsToUpdate.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
        const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
        await supabase.from('auditoria_items').upsert(batch, { onConflict: 'id' });
      }
    }
  } catch (err) {
    console.warn('⚠️ Error al persisitir costos de reclamo Magma:', err);
  }
};

/**
 * Evalúa cada contador de discrepancias de manera independiente (NO realiza suma algebraica):
 * - cantFaltantes: Cantidad total de unidades/kilos faltantes (artículos donde conteo < facturado).
 * - cantSobrantes: Cantidad total de unidades/kilos sobrantes (artículos donde conteo > facturado o sobrante no facturado).
 * - cantDaniados: Cantidad total de unidades/kilos rotos o dañados (cantidad_danada > 0).
 * - cantSinContar: Cantidad de ítems/artículos que quedaron con conteo = 0 y facturado > 0 (sin auditar).
 */
export interface DiscrepanciasCamion {
  cantFaltantes: number;
  cantSobrantes: number;
  cantDaniados: number;
  cantSinContar: number;
  es100Conforme: boolean;
}

export const evaluarDiscrepanciasCamion = (
  items: AuditoriaItem[], 
  esParcial: boolean = false
): DiscrepanciasCamion => {
  let cantFaltantes = 0;
  let cantSobrantes = 0;
  let cantDaniados = 0;
  let cantSinContar = 0;

  items.forEach(it => {
    const uEsp = Number(it.unidades_esperadas || 0);
    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    const totalFisico = calcularUnidadesFisicasItem(it);
    const cantDan = Number((Number(it.cantidad_danada || 0)).toFixed(3));
    const isSobranteNoFact = Boolean(it.es_sobrante_no_facturado) || 
      (it.depto_codigo ? parseInt(it.depto_codigo, 10) === 999 : false);

    // Omitir sobrantes no facturados que quedaron en cero
    if (isSobranteNoFact && totalFisico === 0 && bEsc === 0 && uEscRaw === 0) {
      return;
    }

    // EN CIERRE PARCIAL: si el producto no tuvo interacción real (conteo === 0 y rotura === 0)
    // Se ignora del balance de diferencias (no se imputa faltante ni sin contar)
    if (esParcial && totalFisico === 0 && cantDan === 0 && !isSobranteNoFact) {
      return;
    }

    // 1. Mercadería dañada / roturas
    if (cantDan > 0) {
      cantDaniados += cantDan;
    }

    // 2. Sobrantes no facturados
    if (isSobranteNoFact) {
      if (totalFisico > 0) {
        cantSobrantes += totalFisico;
      }
    } else {
      // 3. Ítems del manifiesto
      if (totalFisico === 0 && bEsc === 0 && uEscRaw === 0 && uEsp > 0) {
        if (!esParcial) {
          cantSinContar += 1;
        }
      } else if (totalFisico < uEsp) {
        // Faltante (conteo < facturado) sobre lo auditado
        const dif = Number((uEsp - totalFisico).toFixed(3));
        if (dif > 0) cantFaltantes += dif;
      } else if (totalFisico > uEsp && uEsp > 0) {
        // Sobrante (conteo > facturado)
        const dif = Number((totalFisico - uEsp).toFixed(3));
        if (dif > 0) cantSobrantes += dif;
      }
    }
  });

  cantFaltantes = Number(cantFaltantes.toFixed(3));
  cantSobrantes = Number(cantSobrantes.toFixed(3));
  cantDaniados = Number(cantDaniados.toFixed(3));

  const es100Conforme = cantFaltantes === 0 && cantSobrantes === 0 && cantDaniados === 0 && (esParcial ? true : cantSinContar === 0);

  return {
    cantFaltantes,
    cantSobrantes,
    cantDaniados,
    cantSinContar,
    es100Conforme
  };
};

export interface ResultadoCierreCamion {
  success: boolean;
  es100Conforme: boolean;
  cantFaltantes: number;
  cantSobrantes: number;
  cantDaniados: number;
  cantSinContar: number;
  mensaje: string;
  reclamoGenerado: boolean;
}

/**
 * Cierra formalmente la auditoría del camión NAE en Supabase (estado = 'CERRADO' o 'CERRADO_PARCIAL')
 * Evalúa contadores independientes de discrepancias:
 * - Si esParcial = true: Excluye del balance de diferencias e impacto de Magma a todos los productos sin conteo ni rotura.
 * - Si es 100% conforme: OMITA inserción en reclamos_magma y registra log.
 * - Si posee diferencias: Genera/actualiza reclamo en reclamos_magma únicamente por lo auditado.
 */
export const cerrarCamionNae = async (
  naeId: string, 
  usuarioResponsable?: string,
  esParcial: boolean = false
): Promise<ResultadoCierreCamion> => {
  // Persistir costos aplicados y de reclamo Magma antes de cerrar
  await persisitirCostosReclamoMagma(naeId);

  const now = new Date().toISOString();
  const activeUser = (usuarioResponsable || localStorage.getItem('audimas_collaborator') || 'OPERADOR 1').toUpperCase();

  const { data: currentCamion } = await supabase
    .from('camiones_nae')
    .select('*')
    .eq('id', naeId)
    .single();

  const { data: items } = await supabase
    .from('auditoria_items')
    .select('*')
    .eq('nae_id', naeId);

  const itemsList = items || [];
  const discEval = evaluarDiscrepanciasCamion(itemsList, esParcial);

  const estadoDeseado = esParcial ? 'CERRADO_PARCIAL' : 'CERRADO';

  const updateData: any = {
    estado: estadoDeseado,
    updated_at: now
  };

  if (currentCamion?.fecha_reapertura) {
    // Si fue reabierto, registra el cierre de reapertura sin alterar el 1° cierre
    updateData.fecha_fin_reapertura = now;
    updateData.usuario_cierre_reapertura = activeUser;
  } else {
    // Si es el 1° cierre original
    updateData.fecha_fin_auditoria = now;
    updateData.usuario_fin_auditoria = activeUser;
  }

  let { error } = await supabase
    .from('camiones_nae')
    .update(updateData)
    .eq('id', naeId);

  // Fallback si la DB tiene restricción CHECK sin CERRADO_PARCIAL
  if (error && esParcial) {
    updateData.estado = 'CERRADO';
    const fallbackRes = await supabase
      .from('camiones_nae')
      .update(updateData)
      .eq('id', naeId);
    error = fallbackRes.error;
  }

  if (error) {
    throw new Error(`No se pudo cerrar la auditoría del camión: ${error.message}`);
  }

  let reclamoGenerado = false;
  let mensajeFeedback = '';

  if (discEval.es100Conforme) {
    // OMITIR la inserción en la tabla reclamos_magma
    try {
      await supabase.from('reclamos_magma').delete().eq('nae_id', naeId);
    } catch (e) {
      console.warn('⚠️ No se pudo eliminar reclamo previo en Supabase:', e);
    }

    try {
      const recRaw = localStorage.getItem('audimas_reclamos_magma_cache');
      if (recRaw) {
        const recMap = JSON.parse(recRaw);
        delete recMap[naeId];
        delete recMap[`rec_${naeId}`];
        localStorage.setItem('audimas_reclamos_magma_cache', JSON.stringify(recMap));
      }
    } catch (e) {}

    const logMsg = esParcial
      ? `Camión finalizado de forma PARCIAL por ${activeUser}. Ítems no escaneados excluidos del balance de reclamos.`
      : "Camión finalizado 100% conforme. Sin faltantes, sobrantes, roturas ni ítems sin contar. No requiere reclamo Magma.";

    try {
      await supabase.from('auditoria_logs').insert({
        nae_id: naeId,
        upc: esParcial ? 'LOG_CIERRE_PARCIAL' : 'LOG_CIERRE',
        colaborador_nombre: activeUser,
        modo_conteo: 'UNIDADES',
        cantidad: 1
      });
    } catch (e) {
      console.warn('⚠️ Error registrando log de cierre:', e);
    }

    mensajeFeedback = logMsg;
  } else {
    // EXISTEN DISCREPANCIAS EN LO AUDITADO
    let totalMontoReclamado = 0;
    let cantUnidadesAfectadas = 0;
    const skuSet = new Set<string>();

    itemsList.forEach(it => {
      const uEsp = Number(it.unidades_esperadas || 0);
      const uFisicas = calcularUnidadesFisicasItem(it);
      const cantDan = Number((Number(it.cantidad_danada || 0)).toFixed(3));
      const isSobranteNoFact = Boolean(it.es_sobrante_no_facturado) || (it.depto_codigo ? parseInt(it.depto_codigo, 10) === 999 : false);
      const costoUnitRef = Number(it.costo_unitario_aplicado || it.costo_unitario_ap || it.costo_unitario || 0);

      // En cierre parcial, ignorar ítems sin conteo ni rotura
      if (esParcial && uFisicas === 0 && cantDan === 0 && !isSobranteNoFact) {
        return;
      }

      if (isSobranteNoFact && uFisicas > 0) {
        const tot = Number((uFisicas * costoUnitRef).toFixed(2));
        totalMontoReclamado += tot;
        skuSet.add(it.sku);
        cantUnidadesAfectadas += uFisicas;
      } else if (!isSobranteNoFact) {
        if (uFisicas < uEsp) {
          const cantFalt = Number((uEsp - uFisicas).toFixed(3));
          if (cantFalt > 0) {
            totalMontoReclamado += Number((cantFalt * costoUnitRef).toFixed(2));
            skuSet.add(it.sku);
            cantUnidadesAfectadas += cantFalt;
          }
        } else if (uFisicas > uEsp && uEsp > 0) {
          const cantSobr = Number((uFisicas - uEsp).toFixed(3));
          if (cantSobr > 0) {
            totalMontoReclamado += Number((cantSobr * costoUnitRef).toFixed(2));
            skuSet.add(it.sku);
            cantUnidadesAfectadas += cantSobr;
          }
        }
      }
      if (cantDan > 0) {
        totalMontoReclamado += Number((cantDan * costoUnitRef).toFixed(2));
        skuSet.add(it.sku);
        cantUnidadesAfectadas += cantDan;
      }
    });

    if (esParcial) {
      try {
        await supabase.from('auditoria_logs').insert({
          nae_id: naeId,
          upc: 'LOG_CIERRE_PARCIAL',
          colaborador_nombre: activeUser,
          modo_conteo: 'UNIDADES',
          cantidad: 1
        });
      } catch (e) {}
    }

    const fechaCierre = updateData.fecha_fin_auditoria || updateData.fecha_fin_reapertura || now;
    const newReclamo: any = {
      id: `rec_${naeId}`,
      nae_id: naeId,
      nae_numero: currentCamion?.numero_nae || '',
      tienda_codigo: currentCamion?.tienda_codigo || '',
      tienda_nombre: currentCamion?.tienda_nombre || '',
      estado: 'PENDIENTE',
      monto_total_reclamado: Number(totalMontoReclamado.toFixed(2)),
      cant_skus_afectados: skuSet.size > 0 ? skuSet.size : itemsList.length,
      cant_unidades_afectadas: Number(cantUnidadesAfectadas.toFixed(3)),
      fecha_cierre_auditoria: fechaCierre,
      created_at: now,
      updated_at: now
    };

    try {
      await supabase.from('reclamos_magma').upsert([newReclamo], { onConflict: 'id' });
    } catch (e) {
      console.warn('⚠️ Error al crear reclamo en Supabase:', e);
    }

    try {
      const recRaw = localStorage.getItem('audimas_reclamos_magma_cache');
      const recMap = recRaw ? JSON.parse(recRaw) : {};
      recMap[newReclamo.id] = newReclamo;
      localStorage.setItem('audimas_reclamos_magma_cache', JSON.stringify(recMap));
    } catch (e) {}

    reclamoGenerado = true;
    mensajeFeedback = esParcial
      ? `Camión finalizado de forma PARCIAL por ${activeUser}. Se generó el reclamo Magma únicamente por las diferencias de los ítems auditados ($${Number(totalMontoReclamado.toFixed(2)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}).`
      : `Camión finalizado con discrepancias. Se generó automáticamente el reclamo Magma por $${Number(totalMontoReclamado.toFixed(2)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}.`;
  }

  return {
    success: true,
    es100Conforme: discEval.es100Conforme,
    cantFaltantes: discEval.cantFaltantes,
    cantSobrantes: discEval.cantSobrantes,
    cantDaniados: discEval.cantDaniados,
    cantSinContar: discEval.cantSinContar,
    mensaje: mensajeFeedback,
    reclamoGenerado
  };
};


/**
 * Reabre formalmente la auditoría del camión NAE en Supabase (estado = 'EN_PROCESO').
 * Preserva intacta la fecha_fin_auditoria del 1° cierre original y registra fecha_reapertura.
 */
export const reabrirCamionNae = async (naeId: string, usuarioResponsable?: string): Promise<boolean> => {
  const now = new Date().toISOString();

  const { data: currentCamion } = await supabase
    .from('camiones_nae')
    .select('*')
    .eq('id', naeId)
    .single();

  let primerCierre = currentCamion?.fecha_fin_auditoria || currentCamion?.fecha_fin;

  if (!primerCierre) {
    // Consultar el log con la fecha MÁXIMA de auditoria_logs para este camión
    const maxLogDate = await fetchMaxLogDateForTruck(naeId);
    primerCierre = maxLogDate || currentCamion?.created_at || now;

    if (currentCamion?.fecha_inicio_auditoria) {
      const timeInicio = new Date(currentCamion.fecha_inicio_auditoria).getTime();
      const timeFin = new Date(primerCierre).getTime();
      if (!isNaN(timeInicio) && !isNaN(timeFin) && timeFin < timeInicio) {
        primerCierre = currentCamion.fecha_inicio_auditoria;
      }
    }
  }

  const updateData: any = {
    estado: 'EN_PROCESO',
    fecha_fin_auditoria: primerCierre,
    fecha_reapertura: now,
    fecha_fin_reapertura: null,
    updated_at: now
  };

  if (usuarioResponsable) {
    updateData.usuario_reapertura = usuarioResponsable;
  }

  const { error } = await supabase
    .from('camiones_nae')
    .update(updateData)
    .eq('id', naeId);

  if (error) {
    throw new Error(`No se pudo reabrir la auditoría del camión: ${error.message}`);
  }

  // Limpiar snapshot guardado en localStorage
  try {
    const LOCAL_SNAPSHOTS_KEY = 'audimas_report_snapshots_v1';
    const existingsStr = localStorage.getItem(LOCAL_SNAPSHOTS_KEY);
    if (existingsStr) {
      const snapshotsMap = JSON.parse(existingsStr);
      delete snapshotsMap[naeId];
      localStorage.setItem(LOCAL_SNAPSHOTS_KEY, JSON.stringify(snapshotsMap));
    }
  } catch (e) {
    console.warn('Advertencia al limpiar snapshot cache:', e);
  }

  return true;
};

/**
 * Formatea la etiqueta legible para la modalidad / tipo de auditoría del camión
 */
export const formatTipoAuditoriaLabel = (nae: CamionNAE): string => {
  const modo = (nae.modo_auditoria || 'TOTAL').toUpperCase();
  if (modo === 'TOTAL' || modo === '100%') {
    return 'AUDITORÍA AL 100%';
  }
  if (modo === 'MONTO') {
    const mTh = nae.umbral_monto || 0;
    return mTh > 0 ? `AUDITORÍA POR MONTO (≥ $${mTh.toLocaleString('es-AR')})` : 'AUDITORÍA POR MONTO ($)';
  }
  if (modo === 'UNIDADES') {
    const uTh = nae.umbral_unidades || 0;
    return uTh > 0 ? `AUDITORÍA POR UNIDADES (≥ ${uTh.toLocaleString('es-AR')} un)` : 'AUDITORÍA POR UNIDADES';
  }
  if (modo === 'MIXTO') {
    return 'AUDITORÍA MIXTA';
  }
  if (modo.includes('DEPARTAMENTO')) {
    return 'AUDITORÍA POR DEPARTAMENTO';
  }
  if (modo.includes('ALEATORIA')) {
    return 'AUDITORÍA ALEATORIA';
  }
  return `AUDITORÍA ${modo}`;
};

/**
 * Genera y descarga el archivo Excel completo (.xlsx) con 3 hojas estructuradas usando ExcelJS para soporte completo de estilos
 */
export const exportarAuditoriaExcel = async (
  nae: CamionNAE,
  items: AuditoriaItem[],
  productividad: ProductividadColaborador[]
) => {
  const resumen = calcularResumenAuditoria(items);
  const duracion = calcularDuracionAuditoria(nae.fecha_inicio_auditoria, nae.fecha_fin_auditoria);
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OperaMAS Suite';
  workbook.lastModifiedBy = 'OperaMAS';
  workbook.created = new Date();

  // Borde delgado gris corporativo (#CBD5E1)
  const BORDER_GREY = {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
  };

  // =========================================================================
  // HOJA 1: RESUMEN GENERAL
  // =========================================================================
  const wsResumen = workbook.addWorksheet('Resumen General');

  // Fila 1: Banner Principal A1:E1
  wsResumen.mergeCells('A1:E1');
  const bannerResumenCell = wsResumen.getCell('A1');
  bannerResumenCell.value = 'Resumen General - Auditoría';
  bannerResumenCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerResumenCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerResumenCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsResumen.getRow(1).height = 36;

  // Fila 2: Separador
  wsResumen.getRow(2).height = 12;

  // Filas 3 a 10: Bloque de Metadatos
  const metadataMap: [string, any][] = [
    ['Número de NAE:', nae.numero_nae],
    ['Tienda Destino:', `${nae.tienda_codigo} - ${nae.tienda_nombre}`],
    ['Estado de la Auditoría:', nae.estado],
    ['Tipo de Auditoría:', formatTipoAuditoriaLabel(nae)],
    ['Hora de Inicio:', nae.fecha_inicio_auditoria ? new Date(nae.fecha_inicio_auditoria).toLocaleString('es-AR') : 'No iniciada'],
    ['Hora de Fin:', nae.fecha_fin_auditoria ? new Date(nae.fecha_fin_auditoria).toLocaleString('es-AR') : (nae.estado === 'CERRADO' ? 'Concluida' : 'En proceso')],
    ['Duración Total Auditoría:', duracion],
    ['Fecha y Hora de Generación del Informe:', new Date().toLocaleString('es-AR')]
  ];

  metadataMap.forEach((meta, idx) => {
    const rowNum = idx + 3; // Filas 3 a 10
    const row = wsResumen.getRow(rowNum);
    row.values = [meta[0], meta[1]];
    row.height = 20;

    const cellLbl = row.getCell(1);
    cellLbl.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
    cellLbl.alignment = { horizontal: 'left', vertical: 'middle' };

    const cellVal = row.getCell(2);
    cellVal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellVal.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // Fila 11: Separador
  wsResumen.getRow(11).height = 12;

  // Fila 12: Título Tabla de Métricas Clave
  wsResumen.getCell('A12').value = 'TABLA DE MÉTRICAS CLAVE';
  wsResumen.getCell('A12').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  wsResumen.getCell('A12').alignment = { horizontal: 'left', vertical: 'middle' };
  wsResumen.getRow(12).height = 22;

  // Fila 13: Cabecera Tabla Métricas (A13:E13)
  wsResumen.mergeCells('C13:E13');
  const row13 = wsResumen.getRow(13);
  row13.values = ['Métrica', 'Valor esperados / físicos', 'Detalle'];
  row13.height = 24;

  ['A13', 'B13', 'C13', 'D13', 'E13'].forEach(ref => {
    const cell = wsResumen.getCell(ref);
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_GREY;
  });

  // Filas 14 a 21: Datos de Métricas Clave
  const metricRows = [
    ['Total SKUs Manifiesto', resumen.totalSkus, 'Total SKUs registrados'],
    ['Bultos Esperados vs. Bultos Físicos Escaneados', `${resumen.bultosEsperados} esperados / ${resumen.bultosEscaneados} físicos`, `Diferencia: ${resumen.bultosEscaneados - resumen.bultosEsperados}`],
    ['Unidades Esperadas vs. Unidades Físicas Escaneadas', `${resumen.unidadesEsperadas} esperadas / ${resumen.unidadesEscaneadas} físicas`, `Diferencia: ${resumen.unidadesEscaneadas - resumen.unidadesEsperadas}`],
    ['Efectividad de Entrega (%)', `${resumen.efectividadPorcentaje}%`, 'Porcentaje de cumplimiento global'],
    ['SKUs y Unidades con Faltante', `${resumen.skusConFaltante} SKUs`, `${resumen.unidadesFaltantes} unidades faltantes`],
    ['SKUs y Unidades con Sobrante Facturado', `${resumen.skusConSobrante} SKUs`, `${resumen.unidadesSobrantes} unidades sobrantes facturadas`],
    ['SKUs y Unidades Sobrantes No Facturados (Catálogo Maestro)', `${resumen.skusNoFacturados} SKUs`, `${resumen.unidadesNoFacturadas} unidades no facturadas`],
    ['SKUs Agotados en Tránsito (Stock 0)', resumen.skusAgotadosTransito, 'Productos críticos con Stock 0 en góndola']
  ];

  metricRows.forEach((row, idx) => {
    const rNum = idx + 14; // Filas 14 a 21
    wsResumen.mergeCells(`C${rNum}:E${rNum}`);
    const rowObj = wsResumen.getRow(rNum);
    rowObj.values = [row[0], row[1], row[2]];
    rowObj.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';

    ['A', 'B', 'C', 'D', 'E'].forEach((colLet, colIdx) => {
      const cell = wsResumen.getCell(`${colLet}${rNum}`);
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;

      if (colIdx === 0) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colIdx === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  // Fila 22: Separador
  wsResumen.getRow(22).height = 12;

  // Fila 23: Título Productividad
  wsResumen.getCell('A23').value = 'PRODUCTIVIDAD POR COLABORADOR';
  wsResumen.getCell('A23').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  wsResumen.getCell('A23').alignment = { horizontal: 'left', vertical: 'middle' };
  wsResumen.getRow(23).height = 22;

  // Fila 24: Cabecera Productividad (A24 a E24)
  const row24 = wsResumen.getRow(24);
  row24.values = [
    'Colaborador',
    'Unidades Auditadas',
    'Bultos Auditados',
    'Total Escaneos',
    '% de Participación'
  ];
  row24.height = 24;

  row24.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_GREY;
  });

  // Filas 25 en adelante: Datos de Productividad
  productividad.forEach((p, idx) => {
    const rNum = idx + 25;
    const rowObj = wsResumen.getRow(rNum);
    rowObj.values = [
      p.colaborador_nombre,
      p.totalUnidades,
      p.totalBultos,
      p.totalEscaneos,
      `${p.porcentajeParticipacion}%`
    ];
    rowObj.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';

    rowObj.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;
      cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' };
    });
  });


  // Anchos Fijos de Columna para Hoja 1 (A: 38, B: 28, C: 16, D: 16, E: 22)
  const fixedWidthsHoja1 = [38, 28, 16, 16, 22];
  wsResumen.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja1.length) {
      col.width = fixedWidthsHoja1[cIdx];
    }
  });

  // =========================================================================
  // HOJA 2: REPORTE GENERAL CAMIÓN
  // =========================================================================
  const wsGeneral = workbook.addWorksheet('Reporte General Camión');

  // Fila 1: Banner Principal A1:S1
  wsGeneral.mergeCells('A1:S1');
  const bannerGenCell = wsGeneral.getCell('A1');
  bannerGenCell.value = 'REPORTE GENERAL CAMION';
  bannerGenCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerGenCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerGenCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsGeneral.getRow(1).height = 38;

  // Fila 2: Subtítulo Dinámico A2:S2 "NEA [Número NAE]"
  wsGeneral.mergeCells('A2:S2');
  const subGenCell = wsGeneral.getCell('A2');
  subGenCell.value = `NEA ${nae.numero_nae}`;
  subGenCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF000000' } };
  subGenCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  subGenCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsGeneral.getRow(2).height = 24;

  // Fila 3: Separador (Fila en blanco)
  wsGeneral.getRow(3).height = 12;

  // Fila 4: Encabezados de la Tabla (A4 a S4)
  const rGenHeader = wsGeneral.getRow(4);
  rGenHeader.values = [
    'N°',
    'Departamento',
    'UPC',
    'SKU',
    'Descripción',
    'Unidades Esperadas',
    'Unidades Auditadas',
    'Diferencia',
    'Estado / Observación',
    'Cant. Dañada',
    'Observación Daño',
    'Foto Daño 1',
    'Foto Daño 2',
    'Foto Daño 3',
    'Costo Unitario Ref. ($)',
    'Total Faltante ($)',
    'Total Sobrante ($)',
    'Total Mercadería Dañada ($)',
    'Total Reclamado / Impacto ($)'
  ];
  rGenHeader.height = 35;
  rGenHeader.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA2D2DF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_GREY;
  });

  // Mapa de costos desde Catálogo Maestro para fallback (Prioridad 2)
  const maestroCostMap = new Map<string, number>();
  try {
    const { data: maestroItems } = await supabase
      .from('maestro_productos')
      .select('sku, upc, costo_unitario');

    maestroItems?.forEach(m => {
      const c = Number(m.costo_unitario) || 0;
      if (c > 0) {
        if (m.sku) maestroCostMap.set(m.sku.trim().toUpperCase(), c);
        if (m.upc) maestroCostMap.set(m.upc.trim().toUpperCase(), c);
      }
    });
  } catch (e) {
    console.warn('Advertencia al consultar costos del Catálogo Maestro para Excel:', e);
  }

  // Ordenamiento automático por defecto: FALTANTE, SOBRANTE, CORRECTO, NO FACTURADO
  const getPriorityOrder = (it: AuditoriaItem): number => {
    const uEsp = Number(it.unidades_esperadas || 0);
    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsp = Number(it.bultos_esperados || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
    const uEsc = (bEsc * factor) + uEscRaw;

    const deptoNum = it.depto_codigo ? parseInt(it.depto_codigo, 10) : 999;

    if (it.es_sobrante_no_facturado || isNaN(deptoNum) || deptoNum === 999) {
      return 4;
    }
    if (uEsc < uEsp) {
      return 1;
    }
    if (uEsc > uEsp && uEsp > 0) {
      return 2;
    }
    return 3;
  };

  // Filtrado de ítems para Hoja 2: Excluir sobrantes no facturados en 0
  const itemsValidosHoja2 = items.filter(it => {
    const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    if (isSobranteNoFact && uEscRaw === 0 && bEsc === 0) {
      return false;
    }
    return true;
  });

  const itemsOrdenados = [...itemsValidosHoja2].sort((a, b) => {
    const pA = getPriorityOrder(a);
    const pB = getPriorityOrder(b);
    if (pA !== pB) return pA - pB;
    const deptA = a.depto_codigo ? parseInt(a.depto_codigo, 10) : 999;
    const deptB = b.depto_codigo ? parseInt(b.depto_codigo, 10) : 999;
    if (deptA !== deptB) return deptA - deptB;
    return (a.sku || '').localeCompare(b.sku || '');
  });

  // Filas de datos (Fila 5 en adelante)
  itemsOrdenados.forEach((it, idx) => {
    const rowNum = idx + 5; // Fila real en Excel (Fila 4 es la cabecera)
    const uEsp = Number(it.unidades_esperadas || 0);
    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsp = Number(it.bultos_esperados || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
    const uEsc = Math.round((bEsc * factor) + uEscRaw);

    let deptoNum = 999;
    if (it.depto_codigo) {
      const parsed = parseInt(it.depto_codigo, 10);
      if (!isNaN(parsed) && parsed > 0) deptoNum = parsed;
    }

    let deptoNombre = (it.depto_nombre || '').trim();
    if (deptoNum === 999 || !deptoNombre) {
      deptoNombre = 'DESCONOCIDO / SIN MAESTRO';
    }

    let descripcion = (it.descripcion || '').trim();
    if (!descripcion || descripcion.toUpperCase().includes('SIN MAESTRO') || descripcion.toUpperCase().includes('NO REGISTRADO')) {
      descripcion = '⚠️ PRODUCTO NO REGISTRADO';
    }

    let estadoStr = 'CORRECTO';
    if (it.es_sobrante_no_facturado || deptoNum === 999) {
      estadoStr = 'NO FACTURADO';
    } else if (uEsc < uEsp) {
      estadoStr = 'FALTANTE';
    } else if (uEsc > uEsp && uEsp > 0) {
      estadoStr = 'SOBRANTE';
    }

    const cantDanada = Number(it.cantidad_danada || 0);
    const obsDano = (it.observacion_dano || '').trim() || 'Sin observaciones';
    const rawFotoUrl = it.foto_dano_url || (it as any).fotos_dano_urls;
    const allPhotos = parseFotoUrls(rawFotoUrl);

    // Función auxiliar para construir celda individual de foto (Posición 1, 2, 3)
    const buildFotoCell = (photoIndex: number) => {
      const url = allPhotos[photoIndex];
      if (!url) return '-';
      
      const cleanUrl = url.trim();
      const lower = cleanUrl.toLowerCase();
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return { 
          text: `🔗 Ver Foto ${photoIndex + 1}`, 
          hyperlink: cleanUrl, 
          tooltip: `Abrir Foto ${photoIndex + 1} en navegador` 
        };
      }
      if (lower.startsWith('data:image/')) {
        return `📷 Foto ${photoIndex + 1} (Data URL)`;
      }
      return '-';
    };

    const fotoVal1 = buildFotoCell(0);
    const fotoVal2 = buildFotoCell(1);
    const fotoVal3 = buildFotoCell(2);

    // Cálculo del Costo Unitario Referencial con la Jerarquía Estricta (AP > Maestro > 0.00)
    const costoUnitarioRef = getItemCostoReferencial(it, maestroCostMap, nae.tiene_reporte_ap);
    const cantFaltante = (estadoStr !== 'NO FACTURADO' && uEsc < uEsp) ? (uEsp - uEsc) : 0;
    const cantSobrante = (estadoStr === 'NO FACTURADO') ? uEsc : ((uEsc > uEsp && uEsp > 0) ? (uEsc - uEsp) : 0);

    const totalFaltanteVal = Number((cantFaltante * costoUnitarioRef).toFixed(2));
    const totalSobranteVal = Number((cantSobrante * costoUnitarioRef).toFixed(2));
    const totalDanadoVal = Number((cantDanada * costoUnitarioRef).toFixed(2));
    const totalReclamadoVal = Number(((cantFaltante + cantDanada) * costoUnitarioRef).toFixed(2));

    const r = wsGeneral.addRow([
      deptoNum,
      deptoNombre,
      it.upc,
      it.sku,
      descripcion,
      uEsp,
      uEsc,
      { formula: `G${rowNum}-F${rowNum}` },
      estadoStr,
      cantDanada,
      obsDano,
      fotoVal1,
      fotoVal2,
      fotoVal3,
      costoUnitarioRef,
      { formula: `IF(I${rowNum}="NO FACTURADO", 0, MAX(0, F${rowNum}-G${rowNum})*O${rowNum})`, result: totalFaltanteVal },
      { formula: `IF(I${rowNum}="NO FACTURADO", G${rowNum}*O${rowNum}, IF(G${rowNum}>F${rowNum}, (G${rowNum}-F${rowNum})*O${rowNum}, 0))`, result: totalSobranteVal },
      { formula: `J${rowNum}*O${rowNum}`, result: totalDanadoVal },
      { formula: `P${rowNum}+R${rowNum}`, result: totalReclamadoVal }
    ]);
    r.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';
    r.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;

      if (colNum >= 15 && colNum <= 19) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        const isLeft = colNum === 2 || colNum === 5 || colNum === 9 || colNum === 11;
        cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
      }

      if ((colNum === 12 || colNum === 13 || colNum === 14) && typeof cell.value === 'object' && cell.value !== null && 'hyperlink' in cell.value) {
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF2563EB' }, underline: true };
      }
    });
  });

  const lastRowIndexHoja2 = 4 + itemsOrdenados.length;
  if (itemsOrdenados.length > 0) {
    const totalsRowNum = lastRowIndexHoja2 + 1;
    const rTotal = wsGeneral.addRow([
      'TOTALES GENERALES ($)',
      '',
      '',
      '',
      '',
      { formula: `SUM(F5:F${lastRowIndexHoja2})` },
      { formula: `SUM(G5:G${lastRowIndexHoja2})` },
      { formula: `SUM(H5:H${lastRowIndexHoja2})` },
      '',
      { formula: `SUM(J5:J${lastRowIndexHoja2})` },
      '',
      '',
      '',
      '',
      '',
      { formula: `SUM(P5:P${lastRowIndexHoja2})` },
      { formula: `SUM(Q5:Q${lastRowIndexHoja2})` },
      { formula: `SUM(R5:R${lastRowIndexHoja2})` },
      { formula: `SUM(S5:S${lastRowIndexHoja2})` }
    ]);
    rTotal.height = 26;

    wsGeneral.mergeCells(`A${totalsRowNum}:E${totalsRowNum}`);

    rTotal.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
      cell.border = BORDER_GREY;

      if (colNum >= 1 && colNum <= 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if ((colNum >= 6 && colNum <= 8) || colNum === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '#,##0';
      } else if (colNum >= 16 && colNum <= 19) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '"$"#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    wsGeneral.autoFilter = `A4:S${lastRowIndexHoja2}`;
  }

  // Anchos Fijos de Columnas para Hoja 2 (A a S)
  const fixedWidthsHoja2 = [5, 18, 16, 12, 40, 11, 11, 10, 16, 12, 30, 16, 16, 16, 18, 18, 18, 22, 22];
  wsGeneral.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja2.length) {
      col.width = fixedWidthsHoja2[cIdx];
    }
  });


  // =========================================================================
  // HOJA 3: AGOTADOS EN TRÁNSITO
  // =========================================================================
  const wsAgotados = workbook.addWorksheet('Agotados en Tránsito');

  // Configuración de Impresión A4 Vertical
  wsAgotados.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2
    }
  };

  // Fila 1: Banner Principal A1:F1
  wsAgotados.mergeCells('A1:F1');
  const bannerCell = wsAgotados.getCell('A1');
  bannerCell.value = 'CONTROL DE AGOTADOS EN TRÁNSITO';
  bannerCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsAgotados.getRow(1).height = 38;

  // Fila 2: Separación
  wsAgotados.getRow(2).height = 12;

  // Filas 3, 4, 5: Metadatos del Camión
  const horaInicioStr = nae.fecha_inicio_auditoria 
    ? new Date(nae.fecha_inicio_auditoria).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: true }) 
    : '--:--';
  const horaFinStr = nae.fecha_fin_auditoria 
    ? new Date(nae.fecha_fin_auditoria).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: true }) 
    : (nae.estado === 'CERRADO' ? 'Concluida' : 'En proceso');

  const fechaDescarga = nae.fecha_arribo || (nae.fecha_inicio_auditoria ? new Date(nae.fecha_inicio_auditoria).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  // Fila 3: Camión NAE
  wsAgotados.mergeCells('A3:B3');
  wsAgotados.mergeCells('C3:D3');
  wsAgotados.getCell('A3').value = 'Camión NAE:';
  wsAgotados.getCell('A3').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E293B' } };
  wsAgotados.getCell('C3').value = nae.numero_nae;
  wsAgotados.getCell('C3').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsAgotados.getRow(3).height = 20;

  // Fila 4: Fecha de Descarga
  wsAgotados.mergeCells('A4:B4');
  wsAgotados.mergeCells('C4:D4');
  wsAgotados.getCell('A4').value = 'Fecha de Descarga:';
  wsAgotados.getCell('A4').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E293B' } };
  wsAgotados.getCell('C4').value = fechaDescarga;
  wsAgotados.getCell('C4').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsAgotados.getRow(4).height = 20;

  // Fila 5: Horario
  wsAgotados.mergeCells('A5:B5');
  wsAgotados.mergeCells('C5:D5');
  wsAgotados.getCell('A5').value = 'Horario:';
  wsAgotados.getCell('A5').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E293B' } };
  wsAgotados.getCell('C5').value = `${horaInicioStr} - ${horaFinStr}`;
  wsAgotados.getCell('C5').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsAgotados.getRow(5).height = 20;

  // Fila 6: Separación
  wsAgotados.getRow(6).height = 12;

  // Fila 7 (Encabezados de la Tabla A7:F7) - Removida la columna 'Unidades Escaneadas'
  const headerRow7 = wsAgotados.getRow(7);
  headerRow7.values = [
    'N°',
    'Departamento',
    'UPC',
    'SKU',
    'Descripción',
    'Colaborador que Separó'
  ];
  headerRow7.height = 32;
  headerRow7.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA2D2DF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_GREY;
  });

  const itemsAgotados = items.filter(it => it.es_agotado_transito);

  itemsAgotados.forEach((it, idx) => {
    let deptoNum = 999;
    if (it.depto_codigo) {
      const parsed = parseInt(it.depto_codigo, 10);
      if (!isNaN(parsed) && parsed > 0) deptoNum = parsed;
    }

    let deptoNombre = (it.depto_nombre || '').trim();
    if (deptoNum === 999 || !deptoNombre) {
      deptoNombre = 'DESCONOCIDO / SIN MAESTRO';
    }

    let descripcion = (it.descripcion || '').trim();
    if (!descripcion || descripcion.toUpperCase().includes('SIN MAESTRO')) {
      descripcion = '⚠️ PRODUCTO NO REGISTRADO';
    }

    const uEsp = Number(it.unidades_esperadas || 0);
    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsp = Number(it.bultos_esperados || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    const factor = (bEsp > 0 && uEsp > 0) ? (uEsp / bEsp) : 1;
    const uEsc = Math.round((bEsc * factor) + uEscRaw);

    const colaboradorNombre = uEsc > 0 
      ? (it.ultimo_colaborador ? it.ultimo_colaborador.trim().toUpperCase() : '') 
      : '';

    const dataRow = wsAgotados.addRow([
      deptoNum,
      deptoNombre,
      it.upc,
      it.sku,
      descripcion,
      colaboradorNombre
    ]);
    dataRow.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';

    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;
      
      const isLeft = colNum === 2 || colNum === 5 || colNum === 6;
      cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
    });
  });

  const lastRowIndexHoja3 = 7 + itemsAgotados.length;
  if (itemsAgotados.length > 0) {
    wsAgotados.autoFilter = `A7:F${lastRowIndexHoja3}`;
  }

  // Anchos Fijos de Columnas para Optimización de Impresión A4 Vertical (6 Columnas)
  const fixedWidthsHoja3 = [6, 18, 16, 12, 36, 20];
  wsAgotados.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja3.length) {
      col.width = fixedWidthsHoja3[cIdx];
    }
  });

  // =========================================================================
  // HOJA 4: SKU NO CONTADOS
  // =========================================================================
  const wsNoContados = workbook.addWorksheet('SKU No Contados');

  // Configuración de Impresión A4 Horizontal
  wsNoContados.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2
    }
  };

  // Fila 1: Banner Principal A1:H1
  wsNoContados.mergeCells('A1:H1');
  const bannerNoContadosCell = wsNoContados.getCell('A1');
  bannerNoContadosCell.value = 'LISTADO DE SKU NO CONTADOS';
  bannerNoContadosCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerNoContadosCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
  bannerNoContadosCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsNoContados.getRow(1).height = 38;

  // Fila 2: Separador
  wsNoContados.getRow(2).height = 12;

  // Filas 3, 4, 5: Metadatos del Camión
  const fechaAuditoriaStr = nae.fecha_inicio_auditoria
    ? formatDateTimeArg(nae.fecha_inicio_auditoria)
    : new Date().toLocaleDateString('es-AR');

  // Filtrado estricto de ítems del manifiesto que quedaron con conteo 0 (No Contados)
  const itemsNoContados = items.filter(it => {
    const isSobranteNoFact = it.es_sobrante_no_facturado || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
    if (isSobranteNoFact) return false;

    const uEscRaw = Number(it.unidades_escaneadas || 0);
    const bEsc = Number(it.bultos_escaneados || 0);
    return uEscRaw === 0 && bEsc === 0;
  });

  itemsNoContados.sort((a, b) => {
    const deptA = a.depto_codigo ? parseInt(a.depto_codigo, 10) : 999;
    const deptB = b.depto_codigo ? parseInt(b.depto_codigo, 10) : 999;
    if (deptA !== deptB) return deptA - deptB;
    return (a.sku || '').localeCompare(b.sku || '');
  });

  // Fila 3: Número de Viaje / Camión
  wsNoContados.mergeCells('A3:B3');
  wsNoContados.mergeCells('C3:D3');
  wsNoContados.getCell('A3').value = 'Número de Viaje / Camión:';
  wsNoContados.getCell('A3').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  wsNoContados.getCell('C3').value = nae.numero_nae;
  wsNoContados.getCell('C3').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsNoContados.getRow(3).height = 20;

  // Fila 4: Fecha de Auditoría
  wsNoContados.mergeCells('A4:B4');
  wsNoContados.mergeCells('C4:D4');
  wsNoContados.getCell('A4').value = 'Fecha de Auditoría:';
  wsNoContados.getCell('A4').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  wsNoContados.getCell('C4').value = fechaAuditoriaStr;
  wsNoContados.getCell('C4').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsNoContados.getRow(4).height = 20;

  // Fila 5: Total de Ítems No Contados
  wsNoContados.mergeCells('A5:B5');
  wsNoContados.mergeCells('C5:D5');
  wsNoContados.getCell('A5').value = 'Total Ítems No Contados:';
  wsNoContados.getCell('A5').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  wsNoContados.getCell('C5').value = `${itemsNoContados.length} SKUs`;
  wsNoContados.getCell('C5').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  wsNoContados.getRow(5).height = 20;

  // Fila 6: Separador
  wsNoContados.getRow(6).height = 12;

  // Fila 7: Encabezados de la Tabla A7:H7
  const headerRowNoContados = wsNoContados.getRow(7);
  headerRowNoContados.values = [
    'Departamento',
    'SKU',
    'UPC / Código de Barras',
    'Descripción del Producto',
    'Unidad de Medida',
    'Cantidad Declarada / Esperada',
    'Costo Unitario Referencial ($)',
    'Impacto Total No Contado ($)'
  ];
  headerRowNoContados.height = 32;
  headerRowNoContados.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA2D2DF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_GREY;
  });

  itemsNoContados.forEach((it, idx) => {
    const rowNum = idx + 8; // Fila real en Excel (Fila 7 es la cabecera)

    let deptoNum = 999;
    if (it.depto_codigo) {
      const parsed = parseInt(it.depto_codigo, 10);
      if (!isNaN(parsed) && parsed > 0) deptoNum = parsed;
    }

    let deptoNombre = (it.depto_nombre || '').trim();
    if (deptoNum === 999 || !deptoNombre) {
      deptoNombre = 'DESCONOCIDO / SIN MAESTRO';
    }

    const deptoDisplay = (deptoNum !== 999 && deptoNombre !== 'DESCONOCIDO / SIN MAESTRO')
      ? `${deptoNum} - ${deptoNombre}`
      : deptoNombre;

    let descripcion = (it.descripcion || '').trim();
    if (!descripcion || descripcion.toUpperCase().includes('SIN MAESTRO')) {
      descripcion = '⚠️ PRODUCTO NO REGISTRADO';
    }

    const uomLabel = getUomLabel(it).toUpperCase();
    const uEsp = Number(it.unidades_esperadas || 0);

    const costoUnitarioRef = getItemCostoReferencial(it, maestroCostMap, nae.tiene_reporte_ap);
    const impactoTotalVal = Number((uEsp * costoUnitarioRef).toFixed(2));

    const dataRow = wsNoContados.addRow([
      deptoDisplay,
      it.sku,
      it.upc,
      descripcion,
      uomLabel,
      uEsp,
      costoUnitarioRef,
      { formula: `F${rowNum}*G${rowNum}`, result: impactoTotalVal }
    ]);
    dataRow.height = 20;

    const bg = idx % 2 === 0 ? 'FFEBF4F6' : 'FFFFFFFF';

    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = BORDER_GREY;

      if (colNum === 7 || colNum === 8) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 6) {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        const isLeft = colNum === 1 || colNum === 4;
        cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
      }
    });
  });

  const lastRowIndexHoja4 = 7 + itemsNoContados.length;
  if (itemsNoContados.length > 0) {
    const totalsRowNumHoja4 = lastRowIndexHoja4 + 1;
    const rTotalNoContados = wsNoContados.addRow([
      'TOTAL GENERAL ($)',
      '',
      '',
      '',
      '',
      { formula: `SUM(F8:F${lastRowIndexHoja4})` },
      '',
      { formula: `SUM(H8:H${lastRowIndexHoja4})` }
    ]);
    rTotalNoContados.height = 26;

    wsNoContados.mergeCells(`A${totalsRowNumHoja4}:E${totalsRowNumHoja4}`);

    rTotalNoContados.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D60' } };
      cell.border = BORDER_GREY;

      if (colNum >= 1 && colNum <= 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNum === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '#,##0';
      } else if (colNum === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '"$"#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    wsNoContados.autoFilter = `A7:H${lastRowIndexHoja4}`;
  }

  // Anchos Fijos de Columnas para Hoja 4 (8 Columnas)
  const fixedWidthsHoja4 = [24, 14, 18, 40, 14, 18, 20, 22];
  wsNoContados.columns.forEach((col, cIdx) => {
    if (cIdx < fixedWidthsHoja4.length) {
      col.width = fixedWidthsHoja4[cIdx];
    }
  });

  // Generar buffer y descargar archivo Excel .xlsx
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fechaStr = new Date().toISOString().split('T')[0];
  const filename = `Auditoria_NAE_${nae.numero_nae}_${fechaStr}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

