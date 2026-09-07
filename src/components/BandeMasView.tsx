import React, { useState } from 'react';
import { 
  Tag, 
  Printer, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { BottomNavCapsule } from './BottomNavCapsule';

interface BandeMasViewProps {
  onBack: () => void;
  onHome: () => void;
}

interface CartelItem {
  id: string;
  sku: string;
  descripcion: string;
  precioAnterior?: number;
  precioActual: number;
  tipo: 'FLAG_GONDOLA' | 'FLEJERA' | 'CARTEL_OFERTA';
  estado: 'PENDIENTE' | 'IMPRESO';
}

export const BandeMasView: React.FC<BandeMasViewProps> = ({ onBack, onHome }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');

  const [carteles, setCarteles] = useState<CartelItem[]>([
    { id: '1', sku: '100452', descripcion: 'DETERGENTE ALA ROPA 3L', precioAnterior: 5400, precioActual: 4290, tipo: 'CARTEL_OFERTA', estado: 'PENDIENTE' },
    { id: '2', sku: '208910', descripcion: 'ACEITE GIRASOL NATURA 1.5L', precioActual: 2150, tipo: 'FLAG_GONDOLA', estado: 'IMPRESO' },
    { id: '3', sku: '304112', descripcion: 'LECHE ENTERA LA SERENISIMA 1L', precioActual: 1280, tipo: 'FLEJERA', estado: 'PENDIENTE' },
    { id: '4', sku: '409115', descripcion: 'GALLETITAS PIPAS 200G', precioAnterior: 1100, precioActual: 890, tipo: 'CARTEL_OFERTA', estado: 'IMPRESO' }
  ]);

  const toggleEstado = (id: string) => {
    setCarteles(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, estado: c.estado === 'PENDIENTE' ? 'IMPRESO' : 'PENDIENTE' };
      }
      return c;
    }));
  };

  const filteredCarteles = carteles.filter(c => {
    const matchType = filtroTipo === 'TODOS' || c.tipo === filtroTipo;
    const matchQuery = !searchQuery.trim() || 
      c.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.descripcion.toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchQuery;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0038a8] via-[#001f66] to-[#000d26] text-white flex flex-col font-sans pb-36 select-none">
      
      {/* Header Fijo BandeMAS */}
      <header className="sticky top-0 z-30 bg-[#0a041c]/95 backdrop-blur-md border-b border-purple-500/20 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center font-['Chakra_Petch'] font-black text-xl text-white shadow-lg shadow-purple-600/40 border border-purple-400/30">
            B
          </div>
          <div>
            <h1 className="font-['Chakra_Petch'] uppercase tracking-wider leading-tight flex items-baseline space-x-0.5">
              <span className="font-bold text-base text-purple-400">BANDE</span>
              <span className="font-black text-lg text-white">MAS</span>
            </h1>
            <p className="text-[10px] text-purple-300/80 font-mono tracking-widest uppercase">GESTIÓN DE CARTELERÍA</p>
          </div>
        </div>

        <span className="px-2.5 py-1 bg-purple-950/60 border border-purple-500/40 rounded-full text-[10px] font-['Chakra_Petch'] font-bold text-purple-300 uppercase">
          Módulo Cartelería
        </span>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
        
        {/* Banner de Inicio de Módulo */}
        <div className="p-3.5 bg-gradient-to-r from-purple-950/80 to-indigo-950/80 border border-purple-500/30 rounded-2xl space-y-1 shadow-xl">
          <div className="flex items-center space-x-2 text-purple-300 font-['Chakra_Petch'] font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Loteo y Marcación en Góndola</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Genera e imprime banderas de precios, flejeras de góndola y cartelería de ofertas promocionales.
          </p>
        </div>

        {/* Buscador y Filtros */}
        <div className="bg-[#0a041c]/90 border border-purple-500/20 rounded-2xl p-3 space-y-2.5 shadow-xl">
          <div className="relative">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cartel por SKU o Descripción..."
              className="w-full pl-9 pr-3 py-2.5 bg-[#04010d] border border-purple-500/30 text-white text-xs rounded-xl focus:outline-none focus:border-purple-400"
            />
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pt-1">
            {['TODOS', 'CARTEL_OFERTA', 'FLAG_GONDOLA', 'FLEJERA'].map(tipo => (
              <button
                key={tipo}
                onClick={() => setFiltroTipo(tipo)}
                className={`px-3 py-1 rounded-full text-[10px] font-['Chakra_Petch'] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  filtroTipo === tipo
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40'
                    : 'bg-[#150a36] text-purple-300 border border-purple-500/30 hover:bg-[#200e52]'
                }`}
              >
                {tipo === 'TODOS' ? 'Todos' : tipo.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Carteles Loteados */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-bold text-purple-300">
            <span>Carteles Loteados ({filteredCarteles.length})</span>
            <span className="text-[10px] text-slate-400 font-mono">Pendientes de impresión</span>
          </div>

          {filteredCarteles.map(c => (
            <div 
              key={c.id}
              onClick={() => toggleEstado(c.id)}
              className={`p-3.5 border rounded-2xl space-y-2 transition-all cursor-pointer shadow-lg ${
                c.estado === 'IMPRESO'
                  ? 'bg-purple-950/20 border-purple-500/20 opacity-70'
                  : 'bg-[#0f0629]/90 border-purple-500/40 hover:border-purple-400'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-extrabold">
                <span className="px-2 py-0.5 bg-[#1a0a47] border border-purple-500/30 text-purple-300 uppercase rounded-md">
                  {c.tipo.replace('_', ' ')}
                </span>

                <span className={`px-2 py-0.5 rounded-full font-['Chakra_Petch'] flex items-center space-x-1 ${
                  c.estado === 'IMPRESO'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {c.estado === 'IMPRESO' ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Printer className="w-3 h-3 text-amber-400" />}
                  <span>{c.estado}</span>
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-white leading-tight">{c.descripcion}</h4>
                <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">SKU: {c.sku}</p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-purple-500/10 text-xs">
                <div className="flex items-baseline space-x-2 font-mono">
                  {c.precioAnterior && (
                    <span className="line-through text-slate-500 text-[11px]">${c.precioAnterior.toLocaleString()}</span>
                  )}
                  <span className="text-emerald-400 font-black text-sm">${c.precioActual.toLocaleString()}</span>
                </div>

                <button 
                  type="button"
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-['Chakra_Petch'] font-bold text-[10px] uppercase shadow-sm"
                >
                  {c.estado === 'IMPRESO' ? 'Reimprimir' : 'Marcar Impreso'}
                </button>
              </div>
            </div>
          ))}
        </div>

      </main>

      {/* Cápsula de Navegación Flotante */}
      <BottomNavCapsule
        onBack={onBack}
        showScan={false}
        onHome={onHome}
      />
    </div>
  );
};
