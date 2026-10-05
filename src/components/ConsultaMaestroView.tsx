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
      
      {/* 1. Header Superior Móvil Fijo */}
      <header className="sticky top-0 z-40 bg-[#040e21]/95 backdrop-blur-md border-b border-sky-500/20 shadow-md px-3.5 py-2.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <button
              onClick={onBack}
              className="p-1.5 text-sky-400 hover:text-white hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer shrink-0"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-400/30 text-sky-400 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="font-['Chakra_Petch'] font-black text-xs sm:text-sm uppercase tracking-wider text-white truncate">
                  Consultar Catálogo
                </h1>
                <p className="text-[10px] text-sky-300/80 font-medium truncate">
                  Búsqueda elástica UPC y SKU en SIM
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onHome}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-sky-500/10 rounded-xl transition-all cursor-pointer shrink-0 ml-2"
            title="Ir al Inicio"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Cuerpo Central Mobile-First (max-w-md) */}
      <main className="max-w-md w-full mx-auto px-3.5 py-3 space-y-3.5 flex-1">
        
        {/* Formulario de Entrada Ergonómico (h-12) */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-sky-400 pointer-events-none">
              <Barcode className="w-5 h-5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Escaneá o ingresá UPC o SKU..."
              className="w-full h-12 pl-11 pr-24 bg-[#061833]/90 border border-sky-500/30 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 rounded-2xl text-white placeholder-slate-400 font-mono text-xs tracking-wide transition-all shadow-inner outline-none"
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
                className="absolute right-20 p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Limpiar"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={isSearching || !searchInput.trim()}
              className="absolute right-1.5 h-9 px-3.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 text-white font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center space-x-1 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </div>

          {/* Búsquedas recientes rápidas (Chips compactos) */}
          {recentSearches.length > 0 && !hasSearched && (
            <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Recientes:</span>
              {recentSearches.map((rec, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSearchInput(rec);
                    executeSearch(rec);
                  }}
                  className="px-2 py-0.5 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-500/20 rounded-lg text-[11px] font-mono text-sky-200 transition-colors"
                >
                  {rec}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* 3. Panel de Resultados */}
        {isSearching && (
          <div className="p-8 text-center space-y-2 bg-[#051329]/60 rounded-2xl border border-sky-500/20 backdrop-blur-md animate-pulse">
            <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
            <p className="text-xs text-sky-200 font-medium">
              Consultando variantes en <strong className="text-white">maestro_productos</strong>...
            </p>
          </div>
        )}

        {/* CASO A: PRODUCTO ENCONTRADO (ESTILO TARJETA DE CAMIÓN AUDIMÁS) */}
        {!isSearching && foundProduct && (
          <div className="bg-[#061833]/95 border border-sky-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3.5 animate-fadeIn">
            
            {/* Header de Éxito Compacto */}
            <div className="flex items-center justify-between pb-2 border-b border-sky-500/20">
              <div className="flex items-center space-x-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider text-emerald-300">
                  Encontrado en Catálogo
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                SIM / V8
              </span>
            </div>

            {/* Badges de Depto y UOM */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-sky-500/20 border border-sky-400/30 text-sky-300">
                  Depto {foundProduct.depto_codigo || '00'} • {foundProduct.depto_nombre || 'GENERAL'}
                </span>
                {foundProduct.unidad_medida && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-purple-500/20 border border-purple-400/30 text-purple-300">
                    UOM: {foundProduct.unidad_medida}
                  </span>
                )}
              </div>

              {/* Título del Producto Adaptable */}
              <h2 className="text-base sm:text-lg font-['Chakra_Petch'] font-bold text-white tracking-wide leading-snug line-clamp-2">
                {foundProduct.descripcion || 'SIN DESCRIPCIÓN'}
              </h2>
            </div>

            {/* Grilla de Códigos (SKU y UPC Proporcionales) */}
            <div className="grid grid-cols-2 gap-2">
              
              {/* SKU */}
              <div className="bg-[#020b17] border border-sky-500/20 rounded-xl p-2.5 flex items-center justify-between">
                <div className="min-w-0 pr-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    SKU Maestro
                  </span>
                  <span className="text-xs font-mono font-bold text-white tracking-wider truncate block">
                    {foundProduct.sku || 'SIN SKU'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(foundProduct.sku, 'sku')}
                  className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 rounded-lg transition-all shrink-0 cursor-pointer"
                  title="Copiar SKU"
                >
                  {copiedField === 'sku' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* UPC */}
              <div className="bg-[#020b17] border border-sky-500/20 rounded-xl p-2.5 flex items-center justify-between">
                <div className="min-w-0 pr-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    UPC en DB
                  </span>
                  <span className="text-xs font-mono font-bold text-sky-300 tracking-wider truncate block">
                    {foundProduct.upc || 'SIN UPC'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(foundProduct.upc, 'upc')}
                  className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 rounded-lg transition-all shrink-0 cursor-pointer"
                  title="Copiar UPC"
                >
                  {copiedField === 'upc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Grilla Económica Compacta (Costo y Retail) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-sky-500/20">
              
              {/* Costo Unitario */}
              <div className="bg-[#041a38]/80 border border-emerald-500/30 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">
                    Costo Unit. Ref.
                  </span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <p className="text-base sm:text-lg font-mono font-black text-emerald-300">
                  {formatMoney(foundProduct.costo_unitario)}
                </p>
                <span className="text-[8px] text-emerald-400/80 block truncate">
                  {foundProduct.costo_unitario && foundProduct.costo_unitario > 0
                    ? '✓ Disponible para Magma'
                    : '⚠️ Sin costo ($0,00)'}
                </span>
              </div>

              {/* Precio Retail */}
              <div className="bg-[#041a38]/80 border border-sky-500/30 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-sky-300 font-bold uppercase tracking-wider">
                    Precio Retail
                  </span>
                  <Tag className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                </div>
                <p className="text-base sm:text-lg font-mono font-black text-sky-300">
                  {formatMoney(foundProduct.precio_retail)}
                </p>
                <span className="text-[8px] text-sky-400/80 block truncate">
                  Venta góndola
                </span>
              </div>
            </div>

            {/* Detalle de Resolución Elástica Sutil */}
            {lastSearchedCode !== foundProduct.upc && lastSearchedCode !== foundProduct.sku && (
              <div className="bg-sky-950/40 border border-sky-500/20 rounded-xl p-2.5 text-xs text-sky-300 space-y-0.5">
                <div className="flex items-center space-x-1 font-bold text-[10px] text-sky-300">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Coincidencia Elástica:</span>
                </div>
                <p className="text-slate-300 font-mono text-[10px] leading-snug">
                  Buscaste: <strong className="text-white">{lastSearchedCode}</strong> → En base como: <strong className="text-emerald-400">{matchedVariant}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* CASO B: MÚLTIPLES RESULTADOS (Búsqueda por texto) */}
        {!isSearching && multipleResults.length > 0 && (
          <div className="space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-[11px] text-sky-300 font-medium px-1">
              <span>{multipleResults.length} artículos encontrados:</span>
              <span className="text-slate-400">Toca uno para ver</span>
            </div>

            <div className="space-y-1.5">
              {multipleResults.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectMultipleItem(p)}
                  className="bg-[#061833]/90 hover:bg-[#0c2e59] border border-sky-500/30 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                >
                  <div className="min-w-0 pr-3">
                    <p className="font-['Chakra_Petch'] font-bold text-white text-xs truncate">
                      {p.descripcion}
                    </p>
                    <p className="text-[10px] text-sky-300 font-mono mt-0.5 truncate">
                      SKU: {p.sku} • UPC: {p.upc}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-emerald-400 text-xs block">
                      {formatMoney(p.costo_unitario)}
                    </span>
                    <span className="text-[9px] text-slate-400 block">Costo Ref.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CASO C: NO ENCONTRADO (ALERTA COMPACTA) */}
        {!isSearching && hasSearched && !foundProduct && multipleResults.length === 0 && (
          <div className="bg-[#1a0808]/90 border border-rose-500/40 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3 animate-fadeIn">
            <div className="flex items-center space-x-2.5 text-rose-400">
              <div className="p-1.5 bg-rose-500/20 border border-rose-500/40 rounded-lg shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wide text-rose-300">
                  Código no encontrado
                </h3>
                <p className="text-[10px] text-rose-300/80">
                  Sin registro en <strong className="text-white">maestro_productos</strong>.
                </p>
              </div>
            </div>

            <div className="bg-[#0c0303] border border-rose-500/20 rounded-xl p-2.5 space-y-1.5">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block">
                Variantes evaluadas sin coincidencia:
              </span>
              <div className="flex flex-wrap gap-1">
                {testedVariants.map((v, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-200 font-mono text-[10px]"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-slate-300 leading-snug">
              💡 <strong>Tip:</strong> Si es un ítem nuevo en tienda, podés auditarlo con doble validación de 2 fotos para ingresarlo como Sobrante No Facturado.
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
