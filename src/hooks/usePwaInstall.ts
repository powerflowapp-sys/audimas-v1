import { useState, useEffect } from 'react';

export interface PwaInstallState {
  deferredPrompt: any;
  isStandalone: boolean;
  isInstalled: boolean;
  isIos: boolean;
  installPwa: () => Promise<void>;
}

export const usePwaInstall = (): PwaInstallState => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // Detectar si la app corre en modo standalone (instalada como PWA)
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  // Detectar dispositivo iOS (Safari en iPhone / iPad)
  const isIos =
    typeof window !== 'undefined' &&
    /ipad|iphone|ipod/i.test(window.navigator.userAgent) &&
    !(window as any).MSStream;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPwa = async () => {
    if (isStandalone || isInstalled) {
      alert('📱 La aplicación ya se encuentra instalada en este dispositivo.');
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }

    if (isIos) {
      alert('📱 Para instalar en iOS: toca el botón "Compartir" de Safari y selecciona "Agregar a inicio".');
      return;
    }

    alert('📱 Para instalar: abre la opción del navegador y selecciona "Agregar a pantalla principal" o "Instalar aplicación".');
  };

  return {
    deferredPrompt,
    isStandalone,
    isInstalled,
    isIos,
    installPwa
  };
};
