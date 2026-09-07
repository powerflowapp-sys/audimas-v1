import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const verifyActiveLink = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    try {
      // Intento ligero de verificación para confirmar enlace activo con Supabase DB
      const { error } = await supabase.from('camiones_nae').select('id').limit(1);
      const active = !error;
      setIsOnline(active);
      return active;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      verifyActiveLink();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificación inicial de enlace activo
    verifyActiveLink();

    // Polling ligero cada 15 segundos para asegurar estado de red real en depósitos
    const interval = setInterval(verifyActiveLink, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [verifyActiveLink]);

  return { isOnline, checkConnection: verifyActiveLink };
};
