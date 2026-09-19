import { useState, useEffect } from 'react';

/**
 * Hook to reactively monitor browser network connectivity.
 * Also supports simulated offline mode for development and testing.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const effectiveOnline = isOnline && !simulatedOffline;

  return {
    isOnline: effectiveOnline,
    rawOnline: isOnline,
    simulatedOffline,
    toggleSimulatedOffline: () => setSimulatedOffline((prev) => !prev),
  };
}
