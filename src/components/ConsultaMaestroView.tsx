import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Database, 
  Barcode, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ArrowLeft, 
  Home, 
  Copy, 
  Check, 
  Tag, 
  DollarSign, 
  Layers, 
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { getBarcodeVariants, sanitizeBarcode } from '../utils/barcodeUtils';
import { ProductoMaestro } from '../types';
import { BottomNavCapsule } from './BottomNavCapsule';

interface Props {
  onBack: () => void;
  onHome: () => void;
  initialCode?: string;
}

export const ConsultaMaestroView: React.FC<Props> = ({ onBack, onHome, initialCode = '' }) => {
  const [searchInput, setSearchInput] = useState<string>(initialCode);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [lastSearchedCode, setLastSearchedCode] = useState<string>('');
  const [testedVariants, setTestedVariants] = useState<string[]>([]);
  
  // Resultado
  const [foundProduct, setFoundProduct] = useState<ProductoMaestro | null>(null);
  const [matchedBy, setMatchedBy] = useState<'UPC' | 'SKU' | 'DESCRIPCION' | null>(null);
  const [matchedVariant, setMatchedVariant] = useState<string>('');
  const [multipleResults, setMultipleResults] = useState<ProductoMaestro[]>([]);
  
  // Feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem('audimas_recent_master_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Si viene con un código inicial, buscar automáticamente
  useEffect(() => {
    if (initialCode && initialCode.trim()) {
      executeSearch(initialCode.trim());
    }
  }, [initialCode]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const saveRecentSearch = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(c => c !== clean);
      const updated = [clean, ...filtered].slice(0, 5);
      try {
        sessionStorage.setItem('audimas_recent_master_searches', JSON.stringify(updated));
      } catch (e) {
        console.warn('Error guardando recientes:', e);
      }
      return updated;
    });
  };

  const executeSearch = async (rawQuery: string) => {
    const cleanQuery = sanitizeBarcode(rawQuery).trim();
    if (!cleanQuery) return;

    setIsSearching(true);
    setHasSearched(true);
    setLastSearchedCode(cleanQuery);
    setFoundProduct(null);
    setMatchedBy(null);
    setMatchedVariant('');
    setMultipleResults([]);

    saveRecentSearch(cleanQuery);

    try {
      // 1. Generar variantes numéricas elásticas para códigos de barras / SKU
      const variants = getBarcodeVariants(cleanQuery);
      setTestedVariants(variants);

      // 2. Búsqueda directa por UPC en variantes elásticas
      const { data: byUpc, error: errUpc } = await supabase
        .from('maestro_productos')
        .select('*')
        .in('upc', variants)
        .limit(1);

      if (!errUpc && byUpc && byUpc.length > 0) {
        const prod = byUpc[0] as ProductoMaestro;
        setFoundProduct(prod);
        setMatchedBy('UPC');
        setMatchedVariant(prod.upc);
        setIsSearching(false);
        return;
      }

      // 3. Búsqueda por SKU en variantes elásticas
      const { data: bySku, error: errSku } = await supabase
        .from('maestro_productos')
        .select('*')
        .in('sku', variants)
        .limit(1);

      if (!errSku && bySku && bySku.length > 0) {
        const prod = bySku[0] as ProductoMaestro;
        setFoundProduct(prod);
        setMatchedBy('SKU');
        setMatchedVariant(prod.sku);
        setIsSearching(false);
        return;
      }

      // 4. Si el query tiene letras o palabras (ej: "ARROZ"), permitir búsqueda de respaldo por descripción
      if (/[a-zA-Z]/.test(cleanQuery) && cleanQuery.length >= 3) {
        const { data: byDesc } = await supabase
          .from('maestro_productos')
          .select('*')
          .ilike('descripcion', `%${cleanQuery}%`)
          .limit(10);

        if (byDesc && byDesc.length > 0) {
          if (byDesc.length === 1) {
            setFoundProduct(byDesc[0] as ProductoMaestro);
            setMatchedBy('DESCRIPCION');
            setMatchedVariant(byDesc[0].descripcion);
          } else {
            setMultipleResults(byDesc as ProductoMaestro[]);
          }
          setIsSearching(false);
          return;
        }
      }

      // 5. No encontrado
      setFoundProduct(null);
    } catch (err) {
      console.error('Error al consultar maestro_productos:', err);
      setFoundProduct(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchInput);
  };

  const handleSelectMultipleItem = (prod: ProductoMaestro) => {
    setFoundProduct(prod);
    setMatchedBy('DESCRIPCION');
    setMatchedVariant(prod.descripcion);
    setMultipleResults([]);
  };

  const formatMoney = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '$0,00';
    return `$${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#001738] via-[#000d21] to-[#000611] text-white flex flex-col font-sans pb-32 select-none">
      
      {/* 1. Header Superior Fijo */}
      <header className="sticky top-0 z-40 bg-[#040e21]/95 backdrop-blur-md border-b border-sky-500/20 shadow-xl px-4 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 text-sky-400 hover:text-white hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-['Chakra_Petch'] font-black text-base uppercase tracking-wider text-white">
                  Consultor de Catálogo Maestro
                </h1>
                <p className="text-[11px] text-sky-300/80 font-medium">
                  Búsqueda elástica en tiempo real de UPC, EAN y SKU
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onHome}
            className="p-2 text-slate-400 hover:text-white hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer"
            title="Ir al Inicio"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Cuerpo Central */}
      <main className="max-w-3xl w-full mx-auto px-4 pt-6 space-y-6 flex-1">
        
        {/* Formulario de Entrada */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-sky-400 pointer-events-none">
              <Barcode className="w-5 h-5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Escaneá o ingresá UPC, EAN o SKU (ej. 0040003601026)..."
              className="w-full pl-12 pr-28 py-3.5 bg-[#061833]/90 border-2 border-sky-500/30 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/20 rounded-2xl text-white placeholder-slate-400 font-mono text-sm tracking-wide transition-all shadow-inner outline-none"
            />

            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setFoundProduct(null);
                  setHasSearched(false);
                  setMultipleResults([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-24 p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Limpiar"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={isSearching || !searchInput.trim()}
              className="absolute right-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Buscando</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </div>

          {/* Búsquedas recientes rápidas */}
          {recentSearches.length > 0 && !hasSearched && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Recientes:</span>
              {recentSearches.map((rec, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSearchInput(rec);
                    executeSearch(rec);
                  }}
                  className="px-2.5 py-1 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-500/20 rounded-lg text-xs font-mono text-sky-200 transition-colors"
                >
                  {rec}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* 3. Panel de Resultados */}
        {isSearching && (
          <div className="p-12 text-center space-y-3 bg-[#051329]/60 rounded-3xl border border-sky-500/20 backdrop-blur-md animate-pulse">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <p className="text-sm text-sky-200 font-medium">
              Consultando variantes numéricas en <strong className="text-white">maestro_productos</strong>...
            </p>
          </div>
        )}

        {/* CASO A: PRODUCTO ENCONTRADO */}
        {!isSearching && foundProduct && (
          <div className="space-y-4 animate-fadeIn">
            {/* Header de Éxito */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-300">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-['Chakra_Petch'] font-black text-sm uppercase tracking-wider text-emerald-200">
                    Artículo Encontrado en Catálogo Maestro
                  </h3>
                  <p className="text-xs text-emerald-300/80">
                    Coincidencia exitosa por <strong className="font-bold text-white">{matchedBy}</strong> ({matchedVariant})
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                ACTIVO EN SIM / V8
              </span>
            </div>

            {/* Tarjeta Principal de Información */}
            <div className="bg-[#061833]/90 border border-sky-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-6">
              
              {/* Descripción Grande y Departamento */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-sky-500/20 border border-sky-400/30 text-sky-300">
                    Depto {foundProduct.depto_codigo || '00'} • {foundProduct.depto_nombre || 'GENERAL'}
                  </span>
                  {foundProduct.unidad_medida && (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-purple-500/20 border border-purple-400/30 text-purple-300">
                      UOM: {foundProduct.unidad_medida}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-['Chakra_Petch'] font-bold text-white tracking-wide leading-tight">
                  {foundProduct.descripcion || 'SIN DESCRIPCIÓN'}
                </h2>
              </div>

              {/* Grilla de Códigos (Para verificar ceros y padding) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* SKU */}
                <div className="bg-[#020b17] border border-sky-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                      SKU Oficial en Maestro
                    </span>
                    <span className="text-lg font-mono font-bold text-white tracking-wider">
                      {foundProduct.sku || 'SIN SKU'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(foundProduct.sku, 'sku')}
                    className="p-2 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer"
                    title="Copiar SKU"
                  >
                    {copiedField === 'sku' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* UPC / Código de Barras */}
                <div className="bg-[#020b17] border border-sky-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                      UPC / EAN en Maestro (Formato DB)
                    </span>
                    <span className="text-lg font-mono font-bold text-sky-300 tracking-wider">
                      {foundProduct.upc || 'SIN UPC'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(foundProduct.upc, 'upc')}
                    className="p-2 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer"
                    title="Copiar UPC"
                  >
                    {copiedField === 'upc' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Grilla Económica: Costo y Retail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-sky-500/20">
                
                {/* Costo Unitario */}
                <div className="bg-[#041a38]/80 border border-emerald-500/30 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">
                      Costo Unitario Referencial
                    </span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-mono font-black text-emerald-300">
                    {formatMoney(foundProduct.costo_unitario)}
                  </p>
                  <span className="text-[10px] text-emerald-400/70 mt-1 block">
                    {foundProduct.costo_unitario && foundProduct.costo_unitario > 0
                      ? '✓ Costo disponible para reclamos Magma'
                      : '⚠️ Sin costo en Maestro ($0,00)'}
                  </span>
                </div>

                {/* Precio Retail / Venta */}
                <div className="bg-[#041a38]/80 border border-sky-500/30 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-sky-300 font-bold uppercase tracking-wider">
                      Precio Retail / Venta
                    </span>
                    <Tag className="w-4 h-4 text-sky-400" />
                  </div>
                  <p className="text-2xl font-mono font-black text-sky-300">
                    {formatMoney(foundProduct.precio_retail)}
                  </p>
                  <span className="text-[10px] text-sky-400/70 mt-1 block">
                    Precio góndola / venta al público
                  </span>
                </div>
              </div>

              {/* Bloque Pedagógico: Comparación de Búsqueda Elástica */}
              {lastSearchedCode !== foundProduct.upc && lastSearchedCode !== foundProduct.sku && (
                <div className="bg-sky-950/40 border border-sky-500/20 rounded-2xl p-3.5 text-xs text-sky-300 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Resolución Elástica Confirmada:</span>
                  </div>
                  <p className="text-slate-300 font-mono text-[11px] leading-relaxed">
                    Buscaste: <strong className="text-white">{lastSearchedCode}</strong> → Encontrado en base como: <strong className="text-emerald-400">{matchedVariant}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CASO B: MÚLTIPLES RESULTADOS (Búsqueda por texto) */}
        {!isSearching && multipleResults.length > 0 && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-sky-300 font-medium">
              <span>Se encontraron {multipleResults.length} artículos por descripción:</span>
              <span className="text-slate-400">Seleccioná uno para ver el detalle</span>
            </div>

            <div className="space-y-2">
              {multipleResults.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectMultipleItem(p)}
                  className="bg-[#061833]/90 hover:bg-[#0c2e59] border border-sky-500/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                >
                  <div className="min-w-0 pr-4">
                    <p className="font-['Chakra_Petch'] font-bold text-white text-sm truncate">
                      {p.descripcion}
                    </p>
                    <p className="text-xs text-sky-300 font-mono mt-0.5">
                      SKU: {p.sku} • UPC: {p.upc} • Depto: {p.depto_codigo} ({p.depto_nombre})
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-emerald-400 text-sm block">
                      {formatMoney(p.costo_unitario)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">Costo Ref.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CASO C: NO ENCONTRADO */}
        {!isSearching && hasSearched && !foundProduct && multipleResults.length === 0 && (
          <div className="bg-[#1a0808]/90 border border-rose-500/40 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-4 animate-fadeIn">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-['Chakra_Petch'] font-black text-base text-rose-300 uppercase tracking-wide">
                  Código no encontrado en el Maestro de Productos
                </h3>
                <p className="text-xs text-rose-300/80">
                  No existe registro en la tabla <strong className="text-white">maestro_productos</strong> con este código.
                </p>
              </div>
            </div>

            <div className="bg-[#0c0303] border border-rose-500/20 rounded-2xl p-4 space-y-2">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block">
                Variantes numéricas evaluadas sin coincidencia:
              </span>
              <div className="flex flex-wrap gap-2">
                {testedVariants.map((v, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/30 text-rose-200 font-mono text-xs"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              💡 <strong>Sugerencias:</strong>
              <br />• Verificá que el archivo de <em>Maestro de Productos (V8 o Stock 24)</em> haya sido cargado desde el menú <em>Catálogo Maestro (SIM)</em>.
              <br />• Si es un artículo nuevo ingresado en tienda, podés auditarlo con doble validación de 2 fotos para catalogarlo como Sobrante No Facturado.
            </p>
          </div>
        )}
      </main>

      {/* 4. Cápsula de Navegación Inferior */}
      <div className="fixed bottom-4 inset-x-0 z-50 flex items-center justify-center pointer-events-none">
        <BottomNavCapsule
          onBack={onBack}
          onHome={onHome}
          className="pointer-events-auto bg-[#061833]/95 backdrop-blur-md border border-sky-500/30 rounded-full px-4 py-2 flex items-center justify-center space-x-3 shadow-2xl animate-fade-in font-sans select-none"
        />
      </div>
    </div>
  );
};
