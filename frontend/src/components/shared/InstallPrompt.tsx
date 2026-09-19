import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'mixboard-install-dismissed';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-bg-secondary border border-border rounded-xl shadow-2xl p-4 flex items-center gap-3 pointer-events-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">Instalar MixBoard</p>
          <p className="text-xs text-text-muted">Acceso rapido desde tu pantalla de inicio</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex-shrink-0 min-h-[36px]"
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          className="p-2 text-text-muted hover:text-text-primary transition-colors flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="Cerrar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
