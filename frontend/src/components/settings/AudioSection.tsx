import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { Button } from '../shared/Button';
import { Knob } from '../shared/Knob';

export function AudioSection() {
  const settings = useSettingsStore();
  const engine = getAudioEngine();
  const { devices, permissionGranted, requestPermission, refresh } = useAudioDevices();
  const [audioInfo, setAudioInfo] = useState(engine.getAudioInfo());

  useEffect(() => {
    const interval = setInterval(() => setAudioInfo(engine.getAudioInfo()), 2000);
    return () => clearInterval(interval);
  }, [engine]);

  const handleMasterDevice = async (deviceId: string) => {
    settings.setMasterDeviceId(deviceId);
    await engine.setMasterDevice(deviceId);
  };

  const handleHeadphoneDevice = async (deviceId: string) => {
    settings.setHeadphoneDeviceId(deviceId);
    await engine.setHeadphoneDevice(deviceId);
  };

  const handleMasterVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    settings.setMasterVolume(v);
    engine.setMasterVolume(v);
  };

  const handleHeadphoneVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    settings.setHeadphoneVolume(v);
    engine.setHeadphoneVolume(v);
  };

  const handleCueMix = (value: number) => {
    // Knob: -1 to 1 → cueMix: 0 to 1
    const cueMix = (value + 1) / 2;
    settings.setHeadphoneCueMix(cueMix);
    engine.setHeadphoneCueMix(cueMix);
  };

  const handleCueToggle = (deckId: 'A' | 'B') => {
    const current = deckId === 'A' ? settings.cueA : settings.cueB;
    const next = !current;
    if (deckId === 'A') settings.setCueA(next);
    else settings.setCueB(next);
    engine.setCueEnabled(deckId, next);
  };

  // Convert cueMix (0-1) to knob value (-1 to 1)
  const cueMixKnobValue = settings.headphoneCueMix * 2 - 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Output Devices */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Output Devices</h3>
          <div className="flex gap-2">
            {!permissionGranted && (
              <Button size="sm" variant="ghost" onClick={requestPermission}>
                Allow Access
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={refresh}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* Master Output */}
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted flex-shrink-0">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <circle cx="12" cy="14" r="4" />
              <line x1="12" y1="6" x2="12" y2="6.01" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase tracking-wide block mb-1">Master Output</label>
              <select
                value={settings.masterDeviceId}
                onChange={e => handleMasterDevice(e.target.value)}
                className="w-full bg-bg-tertiary border border-border rounded-md px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">System Default</option>
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Headphone Output */}
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted flex-shrink-0">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted uppercase tracking-wide block mb-1">Headphone Output</label>
              <select
                value={settings.headphoneDeviceId}
                onChange={e => handleHeadphoneDevice(e.target.value)}
                className="w-full bg-bg-tertiary border border-border rounded-md px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">System Default</option>
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Volume Controls */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Volume</h3>
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-[10px] text-text-muted uppercase tracking-wide">Master Volume</label>
              <span className="text-[10px] text-text-secondary">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01"
              value={settings.masterVolume}
              onChange={handleMasterVolume}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-[10px] text-text-muted uppercase tracking-wide">Headphone Volume</label>
              <span className="text-[10px] text-text-secondary">{Math.round(settings.headphoneVolume * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01"
              value={settings.headphoneVolume}
              onChange={handleHeadphoneVolume}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Pre-listen / Cue */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Pre-listen (Cue)</h3>
        <div className="flex items-center gap-6">
          {/* Cue buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleCueToggle('A')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
                settings.cueA
                  ? 'bg-deck-a/20 border-deck-a text-deck-a'
                  : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary'
              }`}
            >
              CUE A
            </button>
            <button
              onClick={() => handleCueToggle('B')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
                settings.cueB
                  ? 'bg-deck-b/20 border-deck-b text-deck-b'
                  : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary'
              }`}
            >
              CUE B
            </button>
          </div>

          {/* Headphone Mix knob */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted">CUE</span>
            <Knob
              value={cueMixKnobValue}
              onChange={handleCueMix}
              size={36}
              color="#6366f1"
              label="MIX"
            />
            <span className="text-[10px] text-text-muted">MST</span>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">System Info</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="text-[10px] text-text-muted uppercase block">Sample Rate</span>
            <span className="text-sm text-text-primary">{audioInfo.sampleRate} Hz</span>
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase block">Latency</span>
            <span className="text-sm text-text-primary">
              {((audioInfo.baseLatency + audioInfo.outputLatency) * 1000).toFixed(1)} ms
            </span>
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase block">State</span>
            <span className={`text-sm ${audioInfo.state === 'running' ? 'text-success' : 'text-warning'}`}>
              {audioInfo.state}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
