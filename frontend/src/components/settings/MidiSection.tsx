import { useState, useEffect, useCallback } from 'react';
import { getMidiEngine } from '../../hooks/useMidi';
import { useMixerStore } from '../../store/mixerStore';
import { Button } from '../shared/Button';
import type { MidiMapping } from '../../types';

export function MidiSection() {
  const midi = getMidiEngine();
  const { midiLearnMode, midiLearnTarget, setMidiLearnMode } = useMixerStore();
  const [mappings, setMappings] = useState<MidiMapping[]>(midi.getMappings());
  const [devices, setDevices] = useState<string[]>(midi.getDevices());

  const refreshState = useCallback(() => {
    setMappings(midi.getMappings());
    setDevices(midi.getDevices());
  }, [midi]);

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 3000);
    return () => clearInterval(interval);
  }, [refreshState]);

  const handleLearnToggle = () => {
    if (midiLearnMode) {
      midi.stopLearn();
      setMidiLearnMode(false);
    } else {
      setMidiLearnMode(true, undefined);
    }
  };

  const handleReset = () => {
    midi.resetToDefaults();
    refreshState();
  };

  const formatControl = (control: number) => `0x${control.toString(16).toUpperCase().padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Connected Devices */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">MIDI Devices</h3>
        {devices.length === 0 ? (
          <p className="text-xs text-text-muted">No MIDI devices connected.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {devices.map((name, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-bg-tertiary rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-xs text-text-primary">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MIDI Learn & Reset */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Controls</h3>
        <div className="flex gap-2">
          <Button
            variant={midiLearnMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleLearnToggle}
          >
            {midiLearnMode ? `Learning: ${midiLearnTarget || 'any'}...` : 'MIDI Learn'}
          </Button>
          <Button variant="danger" size="sm" onClick={handleReset}>
            Reset to DDJ-REV7 Defaults
          </Button>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Current Mappings
          <span className="text-text-muted font-normal ml-2">({mappings.length})</span>
        </h3>
        {mappings.length === 0 ? (
          <p className="text-xs text-text-muted">No mappings configured.</p>
        ) : (
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted uppercase tracking-wide border-b border-border">
                  <th className="text-left py-1.5 px-2 font-medium">Action</th>
                  <th className="text-left py-1.5 px-2 font-medium">Deck</th>
                  <th className="text-left py-1.5 px-2 font-medium">Type</th>
                  <th className="text-left py-1.5 px-2 font-medium">Ch</th>
                  <th className="text-left py-1.5 px-2 font-medium">Control</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary">
                    <td className="py-1.5 px-2 text-text-primary font-medium">{m.action}</td>
                    <td className="py-1.5 px-2">
                      {m.deckId ? (
                        <span className={m.deckId === 'A' ? 'text-deck-a' : 'text-deck-b'}>
                          {m.deckId}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-text-secondary">{m.type.toUpperCase()}</td>
                    <td className="py-1.5 px-2 text-text-secondary">{m.channel}</td>
                    <td className="py-1.5 px-2 text-text-secondary font-mono">{formatControl(m.control)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
