import { CamionNAE } from '../types';

export interface CargoBadgeInfo {
  label: string;
  className: string;
}

/**
 * Retorna la insignia de origen y tipo de carga según el prefijo del NAE y departamentos
 */
export const getBadgeClasificacionCarga = (camion: CamionNAE): CargoBadgeInfo => {
  const nae = (camion.numero_nae || '').trim();

  // Prefijo '15' -> CD Moreno / Seco
  if (nae.startsWith('15')) {
    return {
      label: '📦 SECO - MORENO',
      className: 'bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 shadow-indigo-900/30'
    };
  }

  // Prefijo '8', '08' o '008' -> CD Escobar / Seco
  if (nae.startsWith('8') || nae.startsWith('008') || nae.startsWith('08')) {
    return {
      label: '📦 SECO - ESCOBAR',
      className: 'bg-sky-950/90 text-sky-300 border border-sky-500/40 shadow-sky-900/30'
    };
  }

  // Prefijo '5' -> Frío o Congelado según Depto 91
  if (nae.startsWith('5')) {
    if (camion.has_depto_91) {
      return {
        label: '❄️ CONGELADO',
        className: 'bg-cyan-950/90 text-cyan-300 border border-cyan-400/40 shadow-cyan-900/30'
      };
    }
    return {
      label: '🧊 FRÍO',
      className: 'bg-blue-950/90 text-blue-300 border border-blue-400/40 shadow-blue-900/30'
    };
  }

  // Otros prefijos -> Carga General
  return {
    label: '🚚 CARGA GENERAL',
    className: 'bg-slate-800/90 text-slate-300 border border-slate-600/40 shadow-sm'
  };
};

/**
 * Retorna la insignia de modalidad y umbrales aplicados a la auditoría
 */
export const getBadgeModalidadAuditoria = (camion: CamionNAE): CargoBadgeInfo => {
  const modo = (camion.modo_auditoria || 'TOTAL').toUpperCase();
  const un = camion.umbral_unidades || camion.meta_unidades || 0;
  const monto = camion.umbral_monto || camion.meta_monto || 0;

  if (modo === 'UNIDADES') {
    return {
      label: `📦 MODO UNIDADES: ≥ ${un} un`,
      className: 'bg-blue-950/80 text-blue-300 border border-blue-400/30 shadow-blue-900/20'
    };
  }

  if (modo === 'MONTO') {
    return {
      label: `💲 MODO MONTO: ≥ $${monto.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      className: 'bg-emerald-950/80 text-emerald-300 border border-emerald-400/30 shadow-emerald-900/20'
    };
  }

  if (modo === 'MIXTO' || modo === 'MIXTA') {
    return {
      label: `🔀 MODO MIXTO: ≥ ${un} un ó ≥ $${monto.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      className: 'bg-purple-950/80 text-purple-300 border border-purple-400/30 shadow-purple-900/20'
    };
  }

  return {
    label: '🛡️ AUDITORÍA 100% TOTAL',
    className: 'bg-slate-800/80 text-sky-300 border border-sky-500/30 shadow-sky-900/20'
  };
};
