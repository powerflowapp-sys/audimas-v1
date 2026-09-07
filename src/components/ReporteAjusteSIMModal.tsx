import React from 'react';
import { X, Printer, FileText, ArrowDownRight, ArrowUpRight, Calculator } from 'lucide-react';
import { ReclamoMagma, CamionNAE, AuditoriaItem } from '../types';
import { getUomLabel } from '../utils/formatUtils';

interface DiscrepanciaItem {
  itemKey: string;
  item: AuditoriaItem;
  motivo: 'FALTANTE' | 'SOBRANTE' | 'NO FACTURADO' | 'DAÑADO / ROTURA';
  cantidadAfectada: number;
  costoUnitario: number;
  totalReclamado: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reclamo: ReclamoMagma;
  camion: CamionNAE;
  itemsDiscrepantes: DiscrepanciaItem[];
}

/**
 * Resuelve y retorna el número / código numérico de departamento real del ítem.
 * Parsea prefijos antes del guión ("90 - ALMACEN" -> "90"), campos depto_codigo, depto, etc.
 * Si no se encuentra un código válido, retorna "-" (evita estrictamente el texto "GENERAL").
 */
export const obtenerCodigoDepartamento = (item: any): string => {
  if (!item) return '-';

  const candidateFields = [
    item.depto_codigo,
    item.depto,
    item.departamento_id,
    item.departamento,
    item.depto_num,
    item.depto_nombre
  ];

  for (const rawField of candidateFields) {
    if (rawField === null || rawField === undefined) continue;
    const str = String(rawField).trim();
    if (!str) continue;

    const strUpper = str.toUpperCase();
    if (
      strUpper === 'GENERAL' || 
      strUpper === 'N/A' || 
      strUpper === 'DESCONOCIDO' || 
      strUpper === 'NULL' || 
      strUpper === 'UNDEFINED'
    ) {
      continue;
    }

    // Si tiene formato "90 - ALMACEN" o "86 - FIAMBRES"
    const matchPrefijo = str.match(/^(\d+)\s*[-]/);
    if (matchPrefijo) {
      return matchPrefijo[1];
    }

    // Si es un número puro o string numérico (ej: "90", "86", 82, "01")
    const matchNumeroPuro = str.match(/^(\d+)$/);
    if (matchNumeroPuro) {
      return matchNumeroPuro[1];
    }

    // Si contiene dígitos al comienzo (ej: "90 ALMACEN")
    const matchDigitos = str.match(/^(\d+)/);
    if (matchDigitos) {
      return matchDigitos[1];
    }

    // Si no es "GENERAL" y no tiene dígitos pero es un código corto
    if (str.length <= 10) {
      return str;
    }
  }

  return '-';
};

export const ReporteAjusteSIMModal: React.FC<Props> = ({
  isOpen,
  onClose,
  reclamo,
  itemsDiscrepantes
}) => {
  if (!isOpen) return null;

  // Clasificación de BAJAS (Faltantes + Dañados)
  const bajasList = itemsDiscrepantes.filter(
    d => d.motivo === 'FALTANTE' || d.motivo === 'DAÑADO / ROTURA'
  );
  const totalMontoBajas = Number(bajasList.reduce((sum, d) => sum + d.totalReclamado, 0).toFixed(2));
  const totalUnidadesBajas = Number(bajasList.reduce((sum, d) => sum + d.cantidadAfectada, 0).toFixed(3));

  // Clasificación de ALTAS (Sobrantes + No Facturados)
  const altasList = itemsDiscrepantes.filter(
    d => d.motivo === 'SOBRANTE' || d.motivo === 'NO FACTURADO'
  );
  const totalMontoAltas = Number(altasList.reduce((sum, d) => sum + d.totalReclamado, 0).toFixed(2));
  const totalUnidadesAltas = Number(altasList.reduce((sum, d) => sum + d.cantidadAfectada, 0).toFixed(3));

  // Ajuste Neto monetario ($)
  const ajusteNeto = Number((totalMontoAltas - totalMontoBajas).toFixed(2));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 md:p-6 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      {/* Estilos específicos para forzar orientación Vertical (Portrait) y compactar en Impresión */}
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 10mm 8mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>

      {/* Contenedor Modal */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border border-slate-200 print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Header No Imprimible */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Vista Previa - Reporte Ajuste de Inventario (SIM)</h3>
              <p className="text-xs text-slate-400">Planilla formal compacta para entrega directa a Recepción</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir Reporte SIM
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
          
          {/* Document Sheet */}
          <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-0 text-slate-900 text-xs font-sans max-w-4xl mx-auto space-y-4">
            
            {/* Header del Documento Formal (Limpio y Compacto) */}
            <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase block">AudiMAS V1 — OperaMAS Suite</span>
                <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight uppercase">
                  REPORTE DE AJUSTE DE INVENTARIO - SISTEMA SIM
                </h1>
                <p className="text-xs font-bold text-slate-900 mt-1 uppercase font-mono tracking-wide">
                  NÚMERO NAE: <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-300 font-black">{reclamo.nae_numero}</span>
                </p>
              </div>
              <div className="text-right border-l-2 border-slate-300 pl-4 py-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Movimiento Stock</span>
                <span className="text-sm font-black text-slate-900 font-mono">REPORTE SIM</span>
              </div>
            </div>

            {/* SECCIÓN 1: BAJAS DE INVENTARIO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-red-200 pb-1">
                <h2 className="text-xs font-black text-red-700 uppercase flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-600 print:hidden" />
                  SECCIÓN 1: BAJAS DE INVENTARIO (Faltantes y Mercadería Dañada)
                </h2>
                <span className="text-[11px] font-bold text-red-800">
                  Subtotal Bajas: ${totalMontoBajas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {bajasList.length === 0 ? (
                <p className="text-slate-400 italic text-[10px] py-1">No existen bajas de inventario registradas en esta selección.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10.5px] font-medium leading-snug">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase text-[9.5px]">
                        <th className="py-1.5 px-1.5 text-center">Depto</th>
                        <th className="py-1.5 px-1.5">SKU</th>
                        <th className="py-1.5 px-1.5">UPC / Barras</th>
                        <th className="py-1.5 px-1.5">Descripción del Producto</th>
                        <th className="py-1.5 px-1.5 text-center">Motivo</th>
                        <th className="py-1.5 px-1.5 text-center">Cant. Baja</th>
                        <th className="py-1.5 px-1.5 text-center">UOM</th>
                        <th className="py-1.5 px-1.5 text-right">Costo Unit ($)</th>
                        <th className="py-1.5 px-1.5 text-right">Total ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                      {bajasList.map((d, idx) => (
                        <tr key={`baja_${idx}_${d.itemKey}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="py-1 px-1.5 text-center font-mono font-bold text-slate-800">
                            {obtenerCodigoDepartamento(d.item)}
                          </td>
                          <td className="py-1 px-1.5 font-bold text-slate-900">{d.item.sku}</td>
                          <td className="py-1 px-1.5 font-mono text-slate-600">{d.item.upc}</td>
                          <td className="py-1 px-1.5 text-slate-800 font-medium max-w-[220px] truncate">{d.item.descripcion}</td>
                          <td className="py-1 px-1.5 text-center font-bold text-red-700">{d.motivo}</td>
                          <td className="py-1 px-1.5 text-center font-bold text-slate-900">
                            {d.cantidadAfectada.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                          </td>
                          <td className="py-1 px-1.5 text-center text-slate-600">{getUomLabel(d.item).toUpperCase()}</td>
                          <td className="py-1 px-1.5 text-right font-mono text-slate-700">${d.costoUnitario.toFixed(2)}</td>
                          <td className="py-1 px-1.5 text-right font-mono font-bold text-red-700">${d.totalReclamado.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 text-red-900 font-bold border-t border-red-200 text-[10.5px]">
                        <td colSpan={5} className="py-1.5 px-1.5 text-right uppercase">TOTAL BAJAS SIM:</td>
                        <td className="py-1.5 px-1.5 text-center font-bold">{totalUnidadesBajas}</td>
                        <td colSpan={2}></td>
                        <td className="py-1.5 px-1.5 text-right font-mono text-xs">${totalMontoBajas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: ALTAS DE INVENTARIO */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between border-b border-blue-200 pb-1">
                <h2 className="text-xs font-black text-blue-700 uppercase flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 print:hidden" />
                  SECCIÓN 2: ALTAS DE INVENTARIO (Sobrantes y No Facturados)
                </h2>
                <span className="text-[11px] font-bold text-blue-800">
                  Subtotal Altas: ${totalMontoAltas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {altasList.length === 0 ? (
                <p className="text-slate-400 italic text-[10px] py-1">No existen altas de inventario registradas en esta selección.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10.5px] font-medium leading-snug">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase text-[9.5px]">
                        <th className="py-1.5 px-1.5 text-center">Depto</th>
                        <th className="py-1.5 px-1.5">SKU</th>
                        <th className="py-1.5 px-1.5">UPC / Barras</th>
                        <th className="py-1.5 px-1.5">Descripción del Producto</th>
                        <th className="py-1.5 px-1.5 text-center">Motivo</th>
                        <th className="py-1.5 px-1.5 text-center">Cant. Alta</th>
                        <th className="py-1.5 px-1.5 text-center">UOM</th>
                        <th className="py-1.5 px-1.5 text-right">Costo Unit ($)</th>
                        <th className="py-1.5 px-1.5 text-right">Total ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                      {altasList.map((d, idx) => (
                        <tr key={`alta_${idx}_${d.itemKey}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="py-1 px-1.5 text-center font-mono font-bold text-slate-800">
                            {obtenerCodigoDepartamento(d.item)}
                          </td>
                          <td className="py-1 px-1.5 font-bold text-slate-900">{d.item.sku}</td>
                          <td className="py-1 px-1.5 font-mono text-slate-600">{d.item.upc}</td>
                          <td className="py-1 px-1.5 text-slate-800 font-medium max-w-[220px] truncate">{d.item.descripcion}</td>
                          <td className="py-1 px-1.5 text-center font-bold text-blue-700">{d.motivo}</td>
                          <td className="py-1 px-1.5 text-center font-bold text-slate-900">
                            {d.cantidadAfectada.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                          </td>
                          <td className="py-1 px-1.5 text-center text-slate-600">{getUomLabel(d.item).toUpperCase()}</td>
                          <td className="py-1 px-1.5 text-right font-mono text-slate-700">${d.costoUnitario.toFixed(2)}</td>
                          <td className="py-1 px-1.5 text-right font-mono font-bold text-blue-700">${d.totalReclamado.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50 text-blue-900 font-bold border-t border-blue-200 text-[10.5px]">
                        <td colSpan={5} className="py-1.5 px-1.5 text-right uppercase">TOTAL ALTAS SIM:</td>
                        <td className="py-1.5 px-1.5 text-center font-bold">{totalUnidadesAltas}</td>
                        <td colSpan={2}></td>
                        <td className="py-1.5 px-1.5 text-right font-mono text-xs">${totalMontoAltas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* RESUMEN NETO DE TOTALES */}
            <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-1.5 print:bg-slate-100 print:text-slate-900 print:border-slate-400">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider border-b border-slate-700 print:border-slate-300 pb-1">
                <span className="flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-emerald-400 print:text-slate-700" />
                  BALANCE DE AJUSTE DE INVENTARIO SIM
                </span>
                <span>AUDIMAS V1</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center py-0.5">
                <div>
                  <span className="text-[9.5px] text-slate-400 print:text-slate-600 uppercase font-bold block">Total Bajas ($)</span>
                  <span className="text-red-400 print:text-red-700 font-bold text-xs">
                    ${totalMontoBajas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 print:text-slate-600 uppercase font-bold block">Total Altas ($)</span>
                  <span className="text-blue-400 print:text-blue-700 font-bold text-xs">
                    ${totalMontoAltas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 print:text-slate-600 uppercase font-bold block">Ajuste Neto ($)</span>
                  <span className={`font-black text-sm ${ajusteNeto >= 0 ? 'text-emerald-400 print:text-emerald-700' : 'text-amber-400 print:text-amber-700'}`}>
                    ${ajusteNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* FIRMAS AL PIE */}
            <div className="pt-6 border-t border-slate-300 mt-6 grid grid-cols-2 gap-8 print:pt-8">
              <div className="text-center space-y-8">
                <div className="border-b border-slate-400 pb-1 max-w-[240px] mx-auto"></div>
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-900 uppercase text-[11px]">Firma Auditor / Receptor</p>
                  <p className="text-[9.5px] text-slate-500">Aclaración: ___________________________</p>
                  <p className="text-[9.5px] text-slate-500">DNI / Legajo: _________________________</p>
                </div>
              </div>

              <div className="text-center space-y-8">
                <div className="border-b border-slate-400 pb-1 max-w-[240px] mx-auto"></div>
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-900 uppercase text-[11px]">Firma Responsable Stock / Gerencia</p>
                  <p className="text-[9.5px] text-slate-500">Aclaración: ___________________________</p>
                  <p className="text-[9.5px] text-slate-500">DNI / Legajo: _________________________</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer No Imprimible */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0 print:hidden">
          <span className="text-xs text-slate-500 font-medium">
            💡 Pulsá <strong>Imprimir Reporte SIM</strong> para abrir el cuadro de diálogo oficial de impresión / guardar PDF.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
