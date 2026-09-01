import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { 
  AuditoriaItem, 
  CamionNAE, 
  ResumenAuditoria, 
  ProductividadColaborador 
} from '../types';

/**
 * Calcula las métricas generales de resumen de la auditoría
 */
export const calcularResumenAuditoria = (items: AuditoriaItem[]): ResumenAuditoria => {
  const totalSkus = items.length;
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
    const totalUnidadesFisicasItem = (bEsc * factor) + uEsc;

    unidadesEsperadas += uEsp;
    unidadesEscaneadas += totalUnidadesFisicasItem;
    bultosEsperados += bEsp;
    bultosEscaneados += bEsc;

    if (it.es_agotado_transito) {
      skusAgotadosTransito++;
    }

    if (it.es_sobrante_no_facturado) {
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
    skusAgotadosTransito
  };
};

/**
 * Consulta la tabla auditoria_logs (y fallback en auditoria_items) para calcular el aporte de unidades físicas por colaborador
 */
export const fetchProductividadColaboradores = async (
  naeId: string
): Promise<ProductividadColaborador[]> => {
  // 1. Obtener los ítems del camión para mapear el factor de empaque (unidades_por_bulto) de cada UPC
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

  // 2. Obtener los logs históricos de escaneo
  const { data: logs, error } = await supabase
    .from('auditoria_logs')
    .select('colaborador_nombre, modo_conteo, cantidad, upc')
    .eq('nae_id', naeId);

  const mapColab = new Map<string, { totalUnidades: number; totalBultos: number; totalEscaneos: number }>();

  if (!error && logs && logs.length > 0) {
    logs.forEach((log) => {
      const colabRaw = (log.colaborador_nombre || 'DESCONOCIDO').trim().toUpperCase();
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
    // Fallback: si no hay logs atómicos creados previamente, atribuir directamente desde auditoria_items
    items.forEach(it => {
      if (!it.ultimo_colaborador) return;
      const colabRaw = it.ultimo_colaborador.trim().toUpperCase();
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

  // 3. Sumar el total acumulado de unidades físicas procesadas por todos los colaboradores
  let totalOverallUnits = 0;
  mapColab.forEach((val) => {
    totalOverallUnits += Math.max(0, val.totalUnidades);
  });

  // 4. Formatear lista con porcentajes reales de aporte
  const resultado: ProductividadColaborador[] = [];
  mapColab.forEach((val, key) => {
    const unFisicas = Math.max(0, Math.round(val.totalUnidades));
    const pct = totalOverallUnits > 0 
      ? Math.min(100, Math.round((unFisicas / totalOverallUnits) * 100)) 
      : 0;

    resultado.push({
      colaborador_nombre: key,
      totalUnidades: unFisicas,
      totalBultos: Math.max(0, Math.round(val.totalBultos)),
      totalEscaneos: val.totalEscaneos,
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
 * Cierra formalmente el camión NAE en Supabase (estado = 'CERRADO')
 */
export const cerrarCamionNae = async (naeId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('camiones_nae')
    .update({ 
      estado: 'CERRADO',
      fecha_fin_auditoria: new Date().toISOString()
    })
    .eq('id', naeId);

  if (error) {
    throw new Error(`No se pudo cerrar la auditoría del camión: ${error.message}`);
  }
  return true;
};

/**
 * Genera y descarga el archivo Excel completo (.xlsx) con 3 hojas estructuradas
 */
export const exportarAuditoriaExcel = (
  nae: CamionNAE,
  items: AuditoriaItem[],
  productividad: ProductividadColaborador[]
) => {
  const resumen = calcularResumenAuditoria(items);
  const duracion = calcularDuracionAuditoria(nae.fecha_inicio_auditoria, nae.fecha_fin_auditoria);
  const wb = XLSX.utils.book_new();

  // =========================================================================
  // HOJA 1: RESUMEN GENERAL Y PRODUCTIVIDAD
  // =========================================================================
  const hojaResumenData: (string | number)[][] = [
    ['INFORME CONCILIACIÓN DE AUDITORÍA DE CAMIÓN CD RETAIL'],
    ['================================================================='],
    ['Número NAE:', nae.numero_nae],
    ['Tienda Destino:', `${nae.tienda_codigo} - ${nae.tienda_nombre}`],
    ['Fecha de Arribo:', nae.fecha_arribo || new Date().toISOString().split('T')[0]],
    ['Estado Auditoría:', nae.estado],
    ['Inicio Auditoría:', nae.fecha_inicio_auditoria ? new Date(nae.fecha_inicio_auditoria).toLocaleString('es-AR') : 'No iniciada'],
    ['Fin Auditoría:', nae.fecha_fin_auditoria ? new Date(nae.fecha_fin_auditoria).toLocaleString('es-AR') : (nae.estado === 'CERRADO' ? 'Concluida' : 'En proceso')],
    ['Duración Total Auditoría:', duracion],
    ['Fecha Generación Informe:', new Date().toLocaleString('es-AR')],
    [],
    ['METRICAS CLAVE DE AUDITORÍA'],
    ['Métrica', 'Valor'],
    ['Total SKUs Manifiesto', resumen.totalSkus],
    ['Bultos Esperados', resumen.bultosEsperados],
    ['Bultos Escaneados Físicos', resumen.bultosEscaneados],
    ['Unidades Esperadas', resumen.unidadesEsperadas],
    ['Unidades Escaneadas Físicas', resumen.unidadesEscaneadas],
    ['Efectividad de Entrega (%)', `${resumen.efectividadPorcentaje}%`],
    ['SKUs con Faltante', resumen.skusConFaltante],
    ['Unidades Faltantes Totales', resumen.unidadesFaltantes],
    ['SKUs con Sobrante Facturado', resumen.skusConSobrante],
    ['Unidades Sobrantes Facturadas', resumen.unidadesSobrantes],
    ['SKUs Sobrantes No Facturados (Maestro)', resumen.skusNoFacturados],
    ['Unidades No Facturadas (Maestro)', resumen.unidadesNoFacturadas],
    ['SKUs Agotados en Tránsito (Stock 0)', resumen.skusAgotadosTransito],
    [],
    ['PRODUCTIVIDAD POR COLABORADOR'],
    ['Colaborador', 'Unidades Auditadas', 'Bultos Auditados', 'Total Escaneos', '% Participación']
  ];

  productividad.forEach((p) => {
    hojaResumenData.push([
      p.colaborador_nombre,
      p.totalUnidades,
      p.totalBultos,
      p.totalEscaneos,
      `${p.porcentajeParticipacion}%`
    ]);
  });

  const wsResumen = XLSX.utils.aoa_to_sheet(hojaResumenData);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen General');

  // =========================================================================
  // HOJA 2: DETALLE DE DIFERENCIAS (Faltantes, Sobrantes, No Facturados)
  // =========================================================================
  const hojaDiferenciasData: (string | number)[][] = [
    [
      'Departamento', 
      'SKU', 
      'UPC', 
      'Descripción', 
      'Bultos Esp.', 
      'Bultos Fís.', 
      'Unidades Esp.', 
      'Unidades Fís.', 
      'Diferencia Unidades', 
      'Estado Conciliación'
    ]
  ];

  items.forEach((it) => {
    const uEsp = Number(it.unidades_esperadas || 0);
    const uEsc = Number(it.unidades_escaneadas || 0);
    const diff = uEsc - uEsp;

    let estadoStr = 'OK / CONFORME';
    let tieneDiferencia = false;

    if (it.es_sobrante_no_facturado) {
      estadoStr = 'SOBRANTE NO FACTURADO (CATÁLOGO MAESTRO)';
      tieneDiferencia = true;
    } else if (uEsc < uEsp) {
      estadoStr = `FALTANTE (-${uEsp - uEsc} u)`;
      tieneDiferencia = true;
    } else if (uEsc > uEsp && uEsp > 0) {
      estadoStr = `SOBRANTE FACTURADO (+${uEsc - uEsp} u)`;
      tieneDiferencia = true;
    }

    if (tieneDiferencia) {
      hojaDiferenciasData.push([
        it.depto_nombre || 'GENERAL',
        it.sku,
        it.upc,
        it.descripcion,
        it.bultos_esperados,
        it.bultos_escaneados,
        it.unidades_esperadas,
        it.unidades_escaneadas,
        diff,
        estadoStr
      ]);
    }
  });

  const wsDiferencias = XLSX.utils.aoa_to_sheet(hojaDiferenciasData);
  XLSX.utils.book_append_sheet(wb, wsDiferencias, 'Detalle Diferencias');

  // =========================================================================
  // HOJA 3: AGOTADOS EN TRÁNSITO (Productos con Stock 0 a góndola)
  // =========================================================================
  const hojaAgotadosData: (string | number)[][] = [
    [
      'Departamento', 
      'SKU', 
      'UPC', 
      'Descripción', 
      'Stock Disponible CEDIS', 
      'Bultos Escaneados', 
      'Unidades Escaneadas', 
      'Acción Requerida'
    ]
  ];

  items
    .filter((it) => it.es_agotado_transito)
    .forEach((it) => {
      hojaAgotadosData.push([
        it.depto_nombre || 'GENERAL',
        it.sku,
        it.upc,
        it.descripcion,
        it.stock_disponible,
        it.bultos_escaneados,
        it.unidades_escaneadas,
        '🚨 SEPARAR 1 CAJA A GÓNDOLA DE INMEDIATO'
      ]);
    });

  const wsAgotados = XLSX.utils.aoa_to_sheet(hojaAgotadosData);
  XLSX.utils.book_append_sheet(wb, wsAgotados, 'Agotados en Tránsito');

  // Descarga del archivo en el smartphone o PC
  const fechaStr = new Date().toISOString().split('T')[0];
  const filename = `Auditoria_NAE_${nae.numero_nae}_${fechaStr}.xlsx`;

  XLSX.writeFile(wb, filename);
};
