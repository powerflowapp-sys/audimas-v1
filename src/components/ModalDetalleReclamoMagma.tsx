import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Download, Search, Check, FileSpreadsheet, Save, CheckSquare, Square, Printer } from 'lucide-react';
import { AuditoriaItem, CamionNAE, ReclamoMagma, isCamionCierreParcial } from '../types';
import { supabase } from '../services/supabase';
import { calcularDiscrepanciasReclamo, exportarPlanillaReclamoMagmaExcel, updateReclamoMagma, rescatarCostosDesdeMaestroV8 } from '../services/reclamosService';
import { enriquecerCamionesConLogsParciales } from '../services/reportService';
import { getUomLabel } from '../utils/formatUtils';
import { ReporteAjusteSIMModal } from './ReporteAjusteSIMModal';

interface Props {
  reclamo: ReclamoMagma;
  isOpen: boolean;
  onClose: () => void;
  onExportExcel: () => void;
  onSelectionSaved?: (updated: ReclamoMagma) => void;
  camion?: CamionNAE;
}

export const ModalDetalleReclamoMagma: React.FC<Props> = ({
  reclamo,
  isOpen,
  onClose,
  onExportExcel,
  onSelectionSaved,
  camion: camionInput
}) => {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [camionObj, setCamionObj] = useState<CamionNAE | null>(camionInput || null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<boolean>(false);
  const [showSIMModal, setShowSIMModal] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !reclamo.nae_id) return;
    let isMounted = true;

    const loadItems = async () => {
      setLoading(true);
      try {
        // 1. Obtener la cabecera real del camión si no fue provista por props
        let targetCamion: CamionNAE = camionInput || {
          id: reclamo.nae_id,
          numero_nae: reclamo.nae_numero,
          tienda_codigo: reclamo.tienda_codigo,
          tienda_nombre: reclamo.tienda_nombre,
          estado: 'CERRADO'
        };

        if (!camionInput) {
          const { data: dbCamion } = await supabase
            .from('camiones_nae')
            .select('*')
            .eq('id', reclamo.nae_id)
            .maybeSingle();

          if (dbCamion) {
            targetCamion = dbCamion as CamionNAE;
          }
        }

        // Enriquecer preventivamente con logs para asegurar el flag parcial
        const enriched = await enriquecerCamionesConLogsParciales([targetCamion]);
        const finalCamion = enriched[0] || targetCamion;

        const { data } = await supabase
          .from('auditoria_items')
          .select('*')
          .eq('nae_id', reclamo.nae_id);

        if (isMounted) {
          let loadedItems = data || [];
          loadedItems = await rescatarCostosDesdeMaestroV8(loadedItems);
          setItems(loadedItems);
          setCamionObj(finalCamion);

          // Inicializar selección calculando sobre el camión enriquecido (respetando esParcial)
          const disc = calcularDiscrepanciasReclamo(loadedItems, finalCamion);
          
          if (reclamo.seleccion_manual) {
            setSelectedKeys(new Set(reclamo.items_seleccionados || []));
          } else if (Array.isArray(reclamo.items_seleccionados) && reclamo.items_seleccionados.length > 0) {
            setSelectedKeys(new Set(reclamo.items_seleccionados));
          } else {
            // Por defecto, seleccionar el 100% de los ítems discrepantes de lo auditado
            setSelectedKeys(new Set(disc.itemsDiscrepantes.map(d => d.itemKey)));
          }
        }
      } catch (err) {
        console.warn('Error cargando ítems de reclamo:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadItems();
    return () => { isMounted = false; };
  }, [isOpen, reclamo.nae_id, camionInput]);

  if (!isOpen) return null;

  const activeCamion: CamionNAE = useMemo(() => {
    const base = camionObj || camionInput || {
      id: reclamo.nae_id,
      numero_nae: reclamo.nae_numero,
      tienda_codigo: reclamo.tienda_codigo,
      tienda_nombre: reclamo.tienda_nombre,
      estado: 'CERRADO'
    };

    const isParcialDetected = isCamionCierreParcial(base) ||
      Boolean(base.es_parcial) ||
      base.tipo_cierre === 'PARCIAL' ||
      base.has_log_parcial === true ||
      (Boolean(reclamo.cant_skus_afectados) && reclamo.cant_skus_afectados! < 100 && items.length > 50);

    if (isParcialDetected) {
      return {
        ...base,
        es_parcial: true,
        tipo_cierre: 'PARCIAL' as const,
        has_log_parcial: true
      };
    }
    return base;
  }, [camionObj, camionInput, reclamo, items.length]);

  const esParcialEfectivo = isCamionCierreParcial(activeCamion);

  // Filtrado obligatorio de ítems auditados si es cierre parcial (omite uEsc === 0 && bEsc === 0 && cantDan === 0)
  const scopedItemsModal = useMemo(() => {
    if (!esParcialEfectivo) return items;
    return items.filter(it => {
      const uEsc = Number(it.unidades_escaneadas || 0);
      const bEsc = Number(it.bultos_escaneados || 0);
      const cantDan = Number(it.cantidad_danada || 0);
      const isSobrante = Boolean(it.es_sobrante_no_facturado) || (it.depto_codigo && parseInt(it.depto_codigo, 10) === 999);
      return uEsc > 0 || bEsc > 0 || cantDan > 0 || isSobrante;
    });
  }, [items, esParcialEfectivo]);

  const disc = useMemo(() => {
    return calcularDiscrepanciasReclamo(scopedItemsModal, activeCamion, esParcialEfectivo);
  }, [scopedItemsModal, activeCamion, esParcialEfectivo]);

  const filteredDiscrepancias = disc.itemsDiscrepantes.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const it = d.item;
    return (
      it.sku.toLowerCase().includes(q) ||
      it.upc.toLowerCase().includes(q) ||
      it.descripcion.toLowerCase().includes(q) ||
      (it.depto_nombre || '').toLowerCase().includes(q) ||
      d.motivo.toLowerCase().includes(q)
    );
  });

  // Métricas dinámicas en tiempo real
  const totalDiscrepanciasAuditoria = disc.totalMontoReclamado;

  const selectedDiscrepancias = disc.itemsDiscrepantes.filter(d => selectedKeys.has(d.itemKey));
  const totalSeleccionadoMagma = Number(selectedDiscrepancias.reduce((sum, d) => sum + d.totalReclamado, 0).toFixed(2));
  
  const selectedSkusSet = new Set(selectedDiscrepancias.map(d => d.item.sku));
  const countSelectedSkus = selectedSkusSet.size;
  const countTotalSkus = disc.cantSkusAfectados;
  const countSelectedUnits = Number(selectedDiscrepancias.reduce((sum, d) => sum + d.cantidadAfectada, 0).toFixed(3));

  const isAllSelected = disc.itemsDiscrepantes.length > 0 && selectedKeys.size === disc.itemsDiscrepantes.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(disc.itemsDiscrepantes.map(d => d.itemKey)));
    }
  };

  const handleToggleItem = (itemKey: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const handleSaveSelection = async () => {
    setIsSaving(true);
    try {
      const keysArray = Array.from(selectedKeys);
      const isCero = keysArray.length === 0;
      const finalMonto = isCero ? 0 : totalSeleccionadoMagma;
      const finalSkus = isCero ? 0 : countSelectedSkus;
      const finalUnits = isCero ? 0 : countSelectedUnits;

      const naeIdReal = reclamo.nae_id || activeCamion?.id || (reclamo.id.startsWith('rec_') ? reclamo.id.replace('rec_', '') : '');
      const naeNumeroReal = reclamo.nae_numero || activeCamion?.numero_nae || '';

      const updated = await updateReclamoMagma(reclamo.id, {
        nae_id: naeIdReal,
        nae_numero: naeNumeroReal,
        tienda_codigo: reclamo.tienda_codigo || activeCamion?.tienda_codigo,
        tienda_nombre: reclamo.tienda_nombre || activeCamion?.tienda_nombre,
        estado: reclamo.estado,
        ticket_magma: reclamo.ticket_magma,
        items_seleccionados: keysArray,
        monto_total_reclamado: finalMonto,
        monto_discrepancias_total: totalDiscrepanciasAuditoria,
        cant_skus_afectados: finalSkus,
        cant_unidades_afectadas: finalUnits,
        seleccion_manual: true
      });
      if (onSelectionSaved) onSelectionSaved(updated);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (err) {
      console.warn('Error al guardar selección de reclamo:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    const keysArray = Array.from(selectedKeys);
    await exportarPlanillaReclamoMagmaExcel(reclamo, scopedItemsModal, keysArray, activeCamion);
    onExportExcel();
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col border border-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">Detalle Discrepancias para Reclamo Magma</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  NAE {reclamo.nae_numero}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">{reclamo.tienda_codigo} - {reclamo.tienda_nombre}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Stats Bar Dinámica */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm font-semibold">
            
            {/* Total Discrepancias 100% */}
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Discrepancias Auditoría</span>
              <span className="text-slate-700 font-bold text-sm">
                ${totalDiscrepanciasAuditoria.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="w-px h-8 bg-slate-300 hidden sm:block" />

            {/* Total Seleccionado para Magma */}
            <div>
              <span className="text-[10px] text-emerald-800 uppercase font-extrabold block">Total Seleccionado Magma</span>
              <span className="text-emerald-700 font-black text-base md:text-lg">
                ${totalSeleccionadoMagma.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="w-px h-8 bg-slate-300 hidden sm:block" />

            {/* Contador de SKUs */}
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">SKUs Seleccionados</span>
              <span className="text-slate-800 font-extrabold">
                {countSelectedSkus} de {countTotalSkus} SKUs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón Guardar Selección */}
            <button
              onClick={handleSaveSelection}
              disabled={isSaving}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                saveToast
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {saveToast ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saveToast ? '¡Selección Guardada!' : isSaving ? 'Guardando...' : 'Guardar Selección'}
            </button>

            {/* Botón Imprimir Reporte SIM */}
            <button
              onClick={() => setShowSIMModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir Reporte SIM
            </button>

            {/* Botón Exportar Planilla Magma (Excel) */}
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              Exportar Excel ({selectedKeys.size})
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por SKU, UPC, descripción o motivo..."
              className="w-full pl-10 pr-4 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>
        </div>

        {/* Scrollable Table Container con Overflow-X-Auto Garantizado */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading ? (
            <div className="py-16 text-center text-slate-400 font-medium">
              Cargando discrepancias del camión...
            </div>
          ) : filteredDiscrepancias.length === 0 ? (
            <div className="py-16 text-center text-slate-400 font-medium">
              No se encontraron ítems discrepantes con el filtro aplicado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-left border-collapse text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                    {/* Checkbox Header */}
                    <th className="py-3 px-3 text-center w-10">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="p-1 text-slate-300 hover:text-white transition-colors"
                        title={isAllSelected ? "Deseleccionar Todos" : "Seleccionar Todos"}
                      >
                        {isAllSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-3">Depto</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">UPC / Barras</th>
                    <th className="py-3 px-3">Descripción</th>
                    <th className="py-3 px-3 text-center">Motivo</th>
                    <th className="py-3 px-3 text-center">Cantidad Afectada</th>
                    <th className="py-3 px-3 text-center">UOM</th>
                    <th className="py-3 px-3 text-right">Costo Unit. Ref ($)</th>
                    <th className="py-3 px-3 text-right">Total Reclamado ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDiscrepancias.map((d, idx) => {
                    const it = d.item;
                    const isSelected = selectedKeys.has(d.itemKey);
                    const skuCopyKey = `sku_${idx}_${it.sku}`;
                    const cantCopyKey = `cant_${idx}_${d.cantidadAfectada}`;
                    const uomLabel = getUomLabel(it).toUpperCase();

                    // Formateo numérico limpio con hasta 3 decimales para pesables (KG/L)
                    const cantFormatted = d.cantidadAfectada.toLocaleString('es-AR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3
                    });

                    let deptoDisplay = (it.depto_nombre || 'DESCONOCIDO').toUpperCase();
                    if (it.depto_codigo && it.depto_codigo !== '999') {
                      deptoDisplay = `${it.depto_codigo} - ${deptoDisplay}`;
                    }

                    return (
                      <tr 
                        key={d.itemKey} 
                        className={`transition-colors ${
                          isSelected ? 'bg-emerald-50/40 hover:bg-emerald-50/80' : 'opacity-60 hover:opacity-100 hover:bg-slate-50'
                        }`}
                      >
                        {/* Checkbox Row */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleItem(d.itemKey)}
                            className="p-1 text-slate-600 hover:text-emerald-700 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 text-slate-600 truncate max-w-[140px]">{deptoDisplay}</td>
                        
                        {/* SKU with Copy Button */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span>{it.sku}</span>
                            <button
                              onClick={() => handleCopy(it.sku, skuCopyKey)}
                              title="Copiar SKU"
                              className={`p-1 rounded transition-colors ${
                                copiedKey === skuCopyKey
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                              }`}
                            >
                              {copiedKey === skuCopyKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-slate-500 font-mono">{it.upc}</td>
                        <td className="py-2.5 px-3 text-slate-800 font-semibold max-w-[220px] truncate">{it.descripcion}</td>
                        
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            d.motivo === 'FALTANTE'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : d.motivo === 'SOBRANTE'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : d.motivo === 'NO FACTURADO'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {d.motivo}
                          </span>
                        </td>

                        {/* Cantidad con 3 Decimales y Copy Button */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 font-bold text-slate-900">
                            <span>{cantFormatted}</span>
                            <button
                              onClick={() => handleCopy(String(d.cantidadAfectada), cantCopyKey)}
                              title="Copiar Cantidad"
                              className={`p-1 rounded transition-colors ${
                                copiedKey === cantCopyKey
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                              }`}
                            >
                              {copiedKey === cantCopyKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center text-slate-600 font-bold">{uomLabel}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700 font-mono">${d.costoUnitario.toFixed(2)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold font-mono ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}>
                          ${d.totalReclamado.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            💡 Tilda o destilda la casilla para incluir o excluir ítems de la planilla Excel y del Reporte SIM. Usa <Copy className="w-3 h-3 inline mx-0.5 text-slate-400" /> para copiar datos rápidamente.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>

        {/* Modal de Reporte Imprimible de Ajuste SIM */}
        {showSIMModal && (
          <ReporteAjusteSIMModal
            isOpen={showSIMModal}
            onClose={() => setShowSIMModal(false)}
            reclamo={reclamo}
            camion={activeCamion}
            itemsDiscrepantes={selectedDiscrepancias}
          />
        )}

      </div>
    </div>
  );
};
