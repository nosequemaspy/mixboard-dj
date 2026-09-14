import { useState, useEffect } from 'react';
import type { SessionItem } from '../../types';
import { api } from '../../api/http';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SongSettingsModalProps {
  item: SessionItem;
  onClose: () => void;
}

export function SongSettingsModal({ item, onClose }: SongSettingsModalProps) {
  const song = item.song;
  const existing = song.playback_settings;

  const [startTime, setStartTime] = useState(existing?.start_time ?? 0);
  const [endTime, setEndTime] = useState<number | ''>(existing?.end_time ?? '');
  const [transitionDuration, setTransitionDuration] = useState(existing?.transition_duration ?? 4);
  const [transitionType, setTransitionType] = useState(existing?.transition_type ?? 'smooth');
  const [playbackSpeed, setPlaybackSpeed] = useState(existing?.playback_speed ?? 1.0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePlaybackSettings(song.id, {
        start_time: startTime,
        end_time: endTime === '' ? null : endTime,
        transition_duration: transitionDuration,
        transition_type: transitionType,
        playback_speed: playbackSpeed,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save playback settings:', err);
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary rounded-xl border border-border w-full max-w-md mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">Ajustes de reproduccion</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-4 truncate">
          {song.title} — {song.artist || 'Unknown'} ({formatTime(song.duration_seconds)})
        </p>

        <div className="space-y-4">
          {/* Start Time */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Inicio (segundos)</label>
            <input
              type="number"
              min={0}
              max={song.duration_seconds}
              step={0.5}
              value={startTime}
              onChange={e => setStartTime(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <p className="text-[10px] text-text-muted mt-0.5">Saltar intro hasta este punto</p>
          </div>

          {/* End Time */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Final (segundos, vacio = completa)</label>
            <input
              type="number"
              min={0}
              max={song.duration_seconds}
              step={0.5}
              value={endTime}
              onChange={e => setEndTime(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
              placeholder={formatTime(song.duration_seconds)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <p className="text-[10px] text-text-muted mt-0.5">Terminar antes del final</p>
          </div>

          {/* Transition Duration */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Duracion de transicion ({transitionDuration}s)</label>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={transitionDuration}
              onChange={e => setTransitionDuration(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Transition Type */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Tipo de transicion</label>
            <div className="grid grid-cols-4 gap-1">
              {(['smooth', 'sharp', 'linear', 'cut'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setTransitionType(type)}
                  className={`px-2 py-2 text-xs rounded-md transition-colors min-h-[40px] ${
                    transitionType === type
                      ? 'bg-accent text-white'
                      : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  {type === 'smooth' ? 'Suave' : type === 'sharp' ? 'Rapida' : type === 'linear' ? 'Lineal' : 'Corte'}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Speed */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Velocidad ({playbackSpeed.toFixed(1)}x)</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={playbackSpeed}
              onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>0.5x</span>
              <button
                onClick={() => setPlaybackSpeed(1.0)}
                className="text-accent hover:text-accent-hover"
              >
                Reset
              </button>
              <span>2.0x</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm bg-bg-tertiary text-text-secondary rounded-md hover:bg-bg-hover transition-colors min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
