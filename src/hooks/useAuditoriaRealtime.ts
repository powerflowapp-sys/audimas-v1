import { useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { AuditoriaItem } from '../types';

export interface ToastActivity {
  id: string;
  message: string;
  colaborador: string;
  timestamp: Date;
}

export const useAuditoriaRealtime = (naeId: string | null) => {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<ToastActivity | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Carga inicial de ítems desde Supabase
   */
  const fetchItems = useCallback(async () => {
    if (!naeId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('auditoria_items')
        .select('*')
        .eq('nae_id', naeId)
        .order('updated_at', { ascending: false });

      if (fetchErr) {
        throw new Error(fetchErr.message);
      }

      setItems(data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar ítems de auditoría';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [naeId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /**
   * Suscripción a Supabase Realtime
   */
  useEffect(() => {
    if (!naeId) return;

    const channelName = `auditoria_realtime_${naeId}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auditoria_items',
          filter: `nae_id=eq.${naeId}`
        },
        (payload) => {
          const updatedItem = payload.new as AuditoriaItem;
          
          if (!updatedItem || !updatedItem.id) return;

          setItems((prevItems) => {
            const cleanUpc = (updatedItem.upc || '').trim();
            const index = prevItems.findIndex(
              (item) => (item.upc || '').trim() === cleanUpc || (item.id && updatedItem.id && item.id === updatedItem.id)
            );

            // Generar toast dinámico si hay colaborador que modificó la fila
            if (updatedItem.ultimo_colaborador) {
              const diffBultos = payload.eventType === 'UPDATE' && payload.old
                ? (updatedItem.bultos_escaneados - ((payload.old as AuditoriaItem).bultos_escaneados || 0))
                : updatedItem.bultos_escaneados;

              const diffUnidades = payload.eventType === 'UPDATE' && payload.old
                ? (updatedItem.unidades_escaneadas - ((payload.old as AuditoriaItem).unidades_escaneadas || 0))
                : updatedItem.unidades_escaneadas;

              let actionText = '';
              if (diffBultos > 0) {
                actionText = `${diffBultos} bulto(s)`;
              } else if (diffUnidades > 0) {
                actionText = `${diffUnidades} unidad(es)`;
              } else {
                actionText = 'mercadería';
              }

              setToastMessage({
                id: `${Date.now()}-${Math.random()}`,
                colaborador: updatedItem.ultimo_colaborador,
                message: `${updatedItem.ultimo_colaborador} escaneó ${actionText} de "${updatedItem.descripcion}"`,
                timestamp: new Date()
              });
            }

            if (index >= 0) {
              // Reemplazar item existente y consolidar valores
              const next = [...prevItems];
              next[index] = { ...next[index], ...updatedItem, upc: cleanUpc };
              return next;
            } else {
              // Insertar nuevo item al inicio de la lista
              return [{ ...updatedItem, upc: cleanUpc }, ...prevItems];
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true);
        } else {
          setIsRealtimeConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [naeId]);

  return {
    items,
    setItems,
    isRealtimeConnected,
    toastMessage,
    setToastMessage,
    loading,
    error,
    refreshItems: fetchItems
  };
};
