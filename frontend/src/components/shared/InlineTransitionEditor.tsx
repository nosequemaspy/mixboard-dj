import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../../api/http';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { getEffectivePlaybackSettings, getEffectiveMuteSections } from '../../types';
import type { SessionItem, MuteSection } from '../../types';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TRANSITION_TYPES = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'linear', label: 'Linear' },
  { value: 'cut', label: 'Cut' },
];

interface InlineTransitionEditorProps {
  item: SessionItem;
  nextItem?: SessionItem | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function InlineTransitionEditor({ item, nextItem, onClose, onSaved }: InlineTransitionEditorProps) {
  const song = item.song;
  const duration = song.duration_seconds;
  const eff = getEffectivePlaybackSettings(item);

  const [startTime, setStartTime] = useState<number>(eff.start_time);
  const [endTime, setEndTime] = useState<number>(eff.end_time ?? duration);
  const [transitionDuration, setTransitionDuration] = useState(eff.transition_duration);
  const [transitionType, setTransitionType] = useState(eff.transition_type);
  const [muteSections, setMuteSections] = useState<MuteSection[]>(getEffectiveMuteSections(item));
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const updatingFromRegion = useRef(false);

  // Refs for latest state values (used in region callbacks)
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const transitionDurationRef = useRef(transitionDuration);
  const muteSectionsRef = useRef(muteSections);
  startTimeRef.current = startTime;
  endTimeRef.current = endTime;
  transitionDurationRef.current = transitionDuration;
  muteSectionsRef.current = muteSections;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(var(--color-accent-rgb, 99, 102, 241), 0.5)',
      progressColor: 'transparent',
      cursorColor: 'transparent',
      cursorWidth: 0,
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: false,
      hideScrollbar: true,
      plugins: [regions],
    });

    wsRef.current = ws;

    // Load waveform from pre-computed peaks or audio URL
    if (song.waveform_peaks) {
      try {
        const peaks: number[] = JSON.parse(song.waveform_peaks);
        ws.load('', [peaks], duration);
      } catch {
        ws.load(api.streamUrl(song.id));
      }
    } else {
      ws.load(api.streamUrl(song.id));
    }

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // Draw/update regions when state changes
  const drawRegions = useCallback(() => {
    const regions = regionsRef.current;
    if (!regions) return;

    updatingFromRegion.current = true;
    regions.clearRegions();

    const st = startTimeRef.current;
    const et = endTimeRef.current;
    const td = transitionDurationRef.current;
    const transStart = Math.max(0, et - td);

    // Dimmed zone before start
    if (st > 0.1) {
      regions.addRegion({
        start: 0,
        end: st,
        color: 'rgba(0, 0, 0, 0.45)',
        drag: false,
        resize: false,
      });
    }

    // Dimmed zone after end
    if (et < duration - 0.1) {
      regions.addRegion({
        start: et,
        end: duration,
        color: 'rgba(0, 0, 0, 0.45)',
        drag: false,
        resize: false,
      });
    }

    // Transition zone (orange/amber overlay)
    if (td > 0.1 && transStart < et) {
      regions.addRegion({
        id: 'transition-zone',
        start: transStart,
        end: et,
        color: 'rgba(245, 158, 11, 0.25)',
        drag: false,
        resize: true,
      });
    }

    // Mute sections (purple regions)
    const ms = muteSectionsRef.current;
    ms.forEach((section, i) => {
      regions.addRegion({
        id: `mute-${i}`,
        start: section.start,
        end: section.end,
        color: 'rgba(168, 85, 247, 0.35)',
        drag: true,
        resize: true,
      });
    });

    // Start marker (green line)
    regions.addRegion({
      id: 'start-marker',
      start: st,
      end: st,
      color: 'rgba(34, 197, 94, 0.9)',
      drag: true,
      resize: false,
    });

    // End marker (red line)
    regions.addRegion({
      id: 'end-marker',
      start: et,
      end: et,
      color: 'rgba(239, 68, 68, 0.9)',
      drag: true,
      resize: false,
    });

    updatingFromRegion.current = false;
  }, [duration]);

  // Set up region event listeners
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    // Draw initial regions once waveform is ready
    const onReady = () => drawRegions();
    ws.on('ready', onReady);

    // Handle region updates
    const onRegionUpdated = (region: any) => {
      if (updatingFromRegion.current) return;

      if (region.id === 'start-marker') {
        const newStart = Math.max(0, Math.min(region.start, endTimeRef.current - 1));
        setStartTime(newStart);
      } else if (region.id === 'end-marker') {
        const newEnd = Math.max(startTimeRef.current + 1, Math.min(region.start, duration));
        setEndTime(newEnd);
      } else if (region.id === 'transition-zone') {
        // Left edge drag adjusts transition duration
        const newTransStart = Math.max(startTimeRef.current, region.start);
        const newTd = Math.max(0, endTimeRef.current - newTransStart);
        setTransitionDuration(Math.min(newTd, 30));
      } else if (typeof region.id === 'string' && region.id.startsWith('mute-')) {
        const idx = parseInt(region.id.split('-')[1], 10);
        setMuteSections(prev => {
          const updated = [...prev];
          if (updated[idx]) {
            updated[idx] = {
              start: Math.max(0, region.start),
              end: Math.min(duration, region.end),
            };
          }
          return updated;
        });
      }
    };

    regions.on('region-updated', onRegionUpdated);

    return () => {
      ws.un('ready', onReady);
      regions.un('region-updated', onRegionUpdated);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw regions when values change
  useEffect(() => {
    drawRegions();
  }, [startTime, endTime, transitionDuration, muteSections, drawRegions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sessionId = usePlayerStore.getState().sessionId;
      const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;

      if (sessionId) {
        // Save per-session-item
        await api.updateSessionItem(sessionId, item.id, {
          start_time: startTime > 0.5 ? startTime : 0.0,
          end_time: endTime >= duration - 0.5 ? 0.0 : endTime,
          transition_duration: transitionDuration,
          transition_type: transitionType,
          mute_sections: muteSections.length > 0 ? JSON.stringify(muteSections) : '',
        }, password);

        await useSessionStore.getState().fetchActiveSession(sessionId);
        usePlayerStore.getState().syncFromSessionStore();
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save transition settings:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 py-3 bg-bg-secondary/80 border-b border-accent/20 space-y-2">
      {/* Waveform */}
      <div className="w-full bg-bg-primary rounded-md overflow-hidden border border-border/50 relative">
        <div ref={containerRef} className="w-full" />
        {/* Legend overlay */}
        <div className="absolute top-1 right-1 flex gap-2 text-[9px] pointer-events-none">
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-1.5 h-3 bg-green-500 rounded-sm inline-block" />
            Inicio
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-1.5 h-3 bg-red-500 rounded-sm inline-block" />
            Final
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2.5 h-3 bg-amber-500/40 rounded-sm inline-block" />
            Transicion
          </span>
          {muteSections.length > 0 && (
            <span className="flex items-center gap-1 text-purple-400">
              <span className="w-2.5 h-3 bg-purple-500/40 rounded-sm inline-block" />
              Mute
            </span>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
        <div className="flex items-center gap-3 text-text-muted">
          <span>
            Inicio: <span className="text-green-400">{formatTime(startTime)}</span>
          </span>
          <span>
            Final: <span className="text-red-400">{formatTime(endTime)}</span>
          </span>
          <span>
            Trans: <span className="text-amber-400">{transitionDuration.toFixed(1)}s</span>
          </span>
        </div>
        {nextItem && (
          <span className="text-text-muted truncate ml-2 max-w-[40%]">
            Siguiente: <span className="text-text-primary">{nextItem.song.title}</span>
          </span>
        )}
      </div>

      {/* Transition type + duration controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text-muted font-semibold">Tipo:</span>
          {TRANSITION_TYPES.map(tt => (
            <button
              key={tt.value}
              onClick={() => setTransitionType(tt.value)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors min-h-[26px] ${
                transitionType === tt.value
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {tt.label}
            </button>
          ))}
        </div>
        <label className="text-[11px] text-text-muted flex items-center gap-1.5 ml-auto">
          Trans:
          <input
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={transitionDuration}
            onChange={e => setTransitionDuration(Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)))}
            className="w-14 bg-bg-primary border border-border/60 rounded px-1.5 py-1 text-xs text-text-primary font-mono text-center focus:outline-none focus:border-accent/60"
          />
          <span className="text-text-muted/60">s</span>
        </label>
      </div>

      {/* Mute sections */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-purple-400 font-semibold shrink-0">Mute vocal:</span>
        {muteSections.map((ms, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-500/15 text-[10px] text-purple-300 font-mono">
            {formatTime(ms.start)}-{formatTime(ms.end)}
            <button
              onClick={() => setMuteSections(prev => prev.filter((_, j) => j !== i))}
              className="text-purple-400 hover:text-red-400 ml-0.5 font-bold"
              title="Eliminar seccion"
            >
              x
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            const mid = duration / 2;
            const newStart = Math.max(0, mid);
            const newEnd = Math.min(duration, mid + 5);
            setMuteSections(prev => [...prev, { start: newStart, end: newEnd }]);
          }}
          className="px-2 py-1 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
          title="Agregar seccion de mute"
        >
          + Mute
        </button>
      </div>

      {/* Save / Cancel */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs bg-bg-tertiary text-text-secondary rounded-md hover:bg-bg-hover transition-colors min-h-[32px]"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 min-h-[32px]"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
