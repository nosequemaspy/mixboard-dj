import { useState, useEffect, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const enumerate = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const outputs = allDevices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Output (${d.deviceId.slice(0, 8)})`,
        }));
      setDevices(outputs);
    } catch {
      // enumerateDevices not available
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      // Request mic permission so browser reveals device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermissionGranted(true);
      await enumerate();
    } catch {
      // Permission denied, still try to enumerate
      await enumerate();
    }
  }, [enumerate]);

  useEffect(() => {
    enumerate();

    const handleChange = () => enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', handleChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleChange);
    };
  }, [enumerate]);

  return { devices, permissionGranted, requestPermission, refresh: enumerate };
}
