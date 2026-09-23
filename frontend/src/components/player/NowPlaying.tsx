import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';
import { getEffectivePlaybackSettings, getEffectiveMuteSections } from '../../types';
import type { MuteSection } from '../../types';
import { api } from '../../api/http';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TRANSITION_TYPES = [
  { value: 'smooth', label: 'Smooth', desc: 'Crossfade suave (equal-power)' },
  { value: 'sharp', label: 'Sharp', desc: 'Crossfade con curva S' },
  { value: 'linear', label: 'Linear', desc: 'Crossfade lineal' },
  { value: 'cut', label: 'Cut', desc: 'Corte directo sin crossfade' },
];

export function NowPlaying() {
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const folders = usePlayerStore(s => s.folders);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);

  const currentItem = sessionItems.find(i => i.id === currentItemId);
  const song = currentItem?.song;

  const itemFolder = currentItem?.folder_id
    ? folders.find(f => f.id === currentItem.folder_id)
    : null;

  // Get next item
  const nextItem = currentItemId ? usePlayerStore.getState().getNextItem() : null;
  const nextSong = nextItem?.song;
  const nextFolder = nextItem?.folder_id
    ? folders.find(f => f.id === nextItem.folder_id)
    : null;

  // Editing state
  const [editing, setEditing] = useState(false);

  if (!song || !currentItem) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-text-muted text-sm">Selecciona una cancion para reproducir</p>
      </div>
    );
  }

  const eff = getEffectivePlaybackSettings(currentItem);

  return (
    <div className="px-4 py-3">
      {/* Song info header */}
      <div className="flex items-start gap-2 mb-2">
        {itemFolder && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 ring-1 ring-offset-1 ring-offset-bg-secondary"
            style={{ backgroundColor: itemFolder.color, boxShadow: `0 0 6px ${itemFolder.color}50` }}
            title={itemFolder.name}
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-text-primary truncate leading-tight">{song.title}</h2>
          <p className="text-sm text-text-secondary truncate leading-tight">{song.artist || 'Artista desconocido'}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {song.bpm && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono">
              {song.bpm} BPM
            </span>
          )}
          {song.key && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono">
              {song.key}
            </span>
          )}
          {eff.playback_speed !== 1.0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono font-bold">
              {eff.playback_speed.toFixed(2).replace(/0$/, '')}x
            </span>
          )}
        </div>
      </div>

      {/* Waveform deck */}
      <WaveformDeck
        item={currentItem}
        currentTime={currentTime}
        duration={duration}
        restrictedMode={restrictedMode}
        editing={editing}
        onToggleEdit={() => setEditing(!editing)}
      />

      {/* Transition settings info bar (clickable to edit) */}
      {!editing && !restrictedMode && (
        <button
          onClick={() => setEditing(true)}
          className="w-full mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded text-[10px] text-text-muted font-mono hover:bg-bg-tertiary/50 transition-colors text-left"
          title="Click para editar transiciones"
        >
          <span className="text-green-400">{formatTime(eff.start_time)}</span>
          <span className="text-text-muted/40">-</span>
          <span className="text-red-400">{formatTime(eff.end_time ?? song.duration_seconds)}</span>
          <span className="text-text-muted/40">|</span>
          <span className="text-amber-400">{TRANSITION_TYPES.find(t => t.value === eff.transition_type)?.label || eff.transition_type} {eff.transition_duration}s</span>
          <span className="ml-auto text-text-muted/50 text-[9px]">editar</span>
        </button>
      )}

      {/* Next up */}
      {nextSong && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-tertiary/50 border border-border/20">
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold shrink-0">Siguiente</span>
          {nextFolder && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: nextFolder.color }}
              title={nextFolder.name}
            />
          )}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-xs text-text-primary truncate">{nextSong.title}</span>
            <span className="text-[10px] text-text-muted truncate shrink-0">- {nextSong.artist}</span>
          </div>
          <span className="text-[10px] text-text-muted font-mono tabular-nums shrink-0">
            {formatDuration(nextSong.duration_seconds)}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Waveform Deck Component ---

function WaveformDeck({
  item,
  currentTime,
  duration,
  restrictedMode,
  editing,
  onToggleEdit,
}: {
  item: NonNullable<ReturnType<typeof usePlayerStore.getState>['sessionItems'][0]>;
  currentTime: number;
  duration: number;
  restrictedMode: boolean;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const song = item.song;
  const eff = getEffectivePlaybackSettings(item);

  const [startTime, setStartTime] = useState(eff.start_time);
  const [endTime, setEndTime] = useState(eff.end_time ?? song.duration_seconds);
  const [transitionDuration, setTransitionDuration] = useState(eff.transition_duration);
  const [transitionType, setTransitionType] = useState(eff.transition_type);
  const [muteSections, setMuteSections] = useState<MuteSection[]>(getEffectiveMuteSections(item));
  const [saving, setSaving] = useState(false);

  // Sync state when item changes
  useEffect(() => {
    const e = getEffectivePlaybackSettings(item);
    setStartTime(e.start_time);
    setEndTime(e.end_time ?? song.duration_seconds);
    setTransitionDuration(e.transition_duration);
    setTransitionType(e.transition_type);
    setMuteSections(getEffectiveMuteSections(item));
  }, [item.id, item.start_time, item.end_time, item.transition_duration, item.transition_type, item.mute_sections, song.duration_seconds]);

  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const updatingFromRegion = useRef(false);
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
      waveColor: 'rgba(99, 102, 241, 0.4)',
      progressColor: 'rgba(99, 102, 241, 0.7)',
      cursorColor: 'rgba(255, 255, 255, 0.8)',
      cursorWidth: 2,
      height: 64,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: !restrictedMode,
      hideScrollbar: true,
      plugins: [regions],
    });
    wsRef.current = ws;

    // Always load via blob URL (peaks constructor causes media element errors)
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(api.streamUrl(song.id));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (cancelled) return;
        const blob = await response.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        ws.load(blobUrl);
        ws.once('ready', () => URL.revokeObjectURL(blobUrl));
        ws.once('error', () => URL.revokeObjectURL(blobUrl));
      } catch (err) {
        console.error('WaveSurfer blob load failed:', err);
      }
    })();

    // Seek on click
    ws.on('click', (relativeX: number) => {
      if (restrictedMode) return;
      const time = relativeX * song.duration_seconds;
      usePlayerStore.getState().setCurrentTime(time);
      getPlaybackEngine().seek(time);
    });

    return () => {
      cancelled = true;
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [song.id, restrictedMode]);

  // Update progress cursor position
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !song.duration_seconds) return;
    const progress = currentTime / song.duration_seconds;
    // Use seekTo to move the visual cursor without triggering audio seek
    try {
      ws.seekTo(Math.min(Math.max(progress, 0), 1));
    } catch {
      // ignore if not ready
    }
  }, [currentTime, song.duration_seconds]);

  // Draw regions
  const drawRegions = useCallback(() => {
    const regions = regionsRef.current;
    if (!regions) return;

    updatingFromRegion.current = true;
    regions.clearRegions();

    const st = startTimeRef.current;
    const et = endTimeRef.current;
    const td = transitionDurationRef.current;
    const transStart = Math.max(0, et - td);
    const dur = song.duration_seconds;

    // Dimmed zone before start
    if (st > 0.1) {
      regions.addRegion({
        start: 0,
        end: st,
        color: 'rgba(0, 0, 0, 0.5)',
        drag: false,
        resize: false,
      });
    }

    // Dimmed zone after end
    if (et < dur - 0.1) {
      regions.addRegion({
        start: et,
        end: dur,
        color: 'rgba(0, 0, 0, 0.5)',
        drag: false,
        resize: false,
      });
    }

    // Transition zone
    if (td > 0.1 && transStart < et) {
      regions.addRegion({
        id: 'transition-zone',
        start: transStart,
        end: et,
        color: 'rgba(245, 158, 11, 0.2)',
        drag: false,
        resize: editing,
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
        drag: editing,
        resize: editing,
      });
    });

    if (editing) {
      // Start marker
      regions.addRegion({
        id: 'start-marker',
        start: st,
        end: st,
        color: 'rgba(34, 197, 94, 0.9)',
        drag: true,
        resize: false,
      });

      // End marker
      regions.addRegion({
        id: 'end-marker',
        start: et,
        end: et,
        color: 'rgba(239, 68, 68, 0.9)',
        drag: true,
        resize: false,
      });
    }

    updatingFromRegion.current = false;
  }, [song.duration_seconds, editing]);

  // Region event listeners
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    const onReady = () => drawRegions();
    ws.on('ready', onReady);

    const onRegionUpdated = (region: any) => {
      if (updatingFromRegion.current) return;

      if (region.id === 'start-marker') {
        const newStart = Math.max(0, Math.min(region.start, endTimeRef.current - 1));
        setStartTime(newStart);
      } else if (region.id === 'end-marker') {
        const newEnd = Math.max(startTimeRef.current + 1, Math.min(region.start, song.duration_seconds));
        setEndTime(newEnd);
      } else if (region.id === 'transition-zone') {
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
              end: Math.min(song.duration_seconds, region.end),
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
  }, [song.duration_seconds, drawRegions]);

  // Redraw regions when values change
  useEffect(() => {
    drawRegions();
  }, [startTime, endTime, transitionDuration, muteSections, editing, drawRegions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sessionId = usePlayerStore.getState().sessionId;
      const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;
      if (!sessionId) return;

      await api.updateSessionItem(sessionId, item.id, {
        start_time: startTime > 0.5 ? startTime : 0.0,
        end_time: endTime >= song.duration_seconds - 0.5 ? 0.0 : endTime,
        transition_duration: transitionDuration,
        transition_type: transitionType,
        mute_sections: muteSections.length > 0 ? JSON.stringify(muteSections) : '',
      }, password);

      // Refresh session data
      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();
      onToggleEdit();
    } catch (err) {
      console.error('Failed to save playback settings:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Waveform */}
      <div className="relative bg-bg-primary rounded-lg overflow-hidden border border-border/40">
        <div ref={containerRef} className="w-full" />

        {/* Time overlay */}
        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-white/70 bg-black/40 px-1 rounded">
          {formatTime(currentTime)}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] font-mono text-white/70 bg-black/40 px-1 rounded">
          {formatTime(duration)}
        </div>

        {/* Legend (when editing) */}
        {editing && (
          <div className="absolute top-1 right-1 flex gap-2 text-[9px] pointer-events-none">
            <span className="flex items-center gap-0.5 text-green-400 bg-black/30 px-1 rounded">
              <span className="w-1 h-2.5 bg-green-500 rounded-sm inline-block" />
              Inicio
            </span>
            <span className="flex items-center gap-0.5 text-red-400 bg-black/30 px-1 rounded">
              <span className="w-1 h-2.5 bg-red-500 rounded-sm inline-block" />
              Final
            </span>
            <span className="flex items-center gap-0.5 text-amber-400 bg-black/30 px-1 rounded">
              <span className="w-2 h-2.5 bg-amber-500/40 rounded-sm inline-block" />
              Trans
            </span>
            {muteSections.length > 0 && (
              <span className="flex items-center gap-0.5 text-purple-400 bg-black/30 px-1 rounded">
                <span className="w-2 h-2.5 bg-purple-500/40 rounded-sm inline-block" />
                Mute
              </span>
            )}
          </div>
        )}
      </div>

      {/* Editing controls */}
      {editing && (
        <div className="mt-2 space-y-2 bg-bg-secondary/60 rounded-lg p-3 border border-border/30">
          {/* Start / End / Transition duration */}
          <div className="flex items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1 text-text-muted">
              <span className="text-green-400 font-semibold">Inicio:</span>
              <input
                type="number"
                min={0}
                max={endTime - 1}
                step={0.5}
                value={Math.round(startTime * 10) / 10}
                onChange={e => setStartTime(Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 1)))}
                className="w-16 bg-bg-primary border border-border/60 rounded px-1.5 py-1 text-xs text-text-primary font-mono text-center focus:outline-none focus:border-green-500/60"
              />
              <span className="text-text-muted/50">s</span>
            </label>
            <label className="flex items-center gap-1 text-text-muted">
              <span className="text-red-400 font-semibold">Final:</span>
              <input
                type="number"
                min={startTime + 1}
                max={song.duration_seconds}
                step={0.5}
                value={Math.round(endTime * 10) / 10}
                onChange={e => setEndTime(Math.max(startTime + 1, Math.min(parseFloat(e.target.value) || 0, song.duration_seconds)))}
                className="w-16 bg-bg-primary border border-border/60 rounded px-1.5 py-1 text-xs text-text-primary font-mono text-center focus:outline-none focus:border-red-500/60"
              />
              <span className="text-text-muted/50">s</span>
            </label>
            <label className="flex items-center gap-1 text-text-muted">
              <span className="text-amber-400 font-semibold">Trans:</span>
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={transitionDuration}
                onChange={e => setTransitionDuration(Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)))}
                className="w-14 bg-bg-primary border border-border/60 rounded px-1.5 py-1 text-xs text-text-primary font-mono text-center focus:outline-none focus:border-amber-500/60"
              />
              <span className="text-text-muted/50">s</span>
            </label>
          </div>

          {/* Transition type selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted font-semibold shrink-0">Tipo:</span>
            {TRANSITION_TYPES.map(tt => (
              <button
                key={tt.value}
                onClick={() => setTransitionType(tt.value)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors min-h-[28px] ${
                  transitionType === tt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                }`}
                title={tt.desc}
              >
                {tt.label}
              </button>
            ))}
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
                const playhead = currentTime;
                const newStart = Math.max(0, playhead);
                const newEnd = Math.min(song.duration_seconds, playhead + 5);
                setMuteSections(prev => [...prev, { start: newStart, end: newEnd }]);
              }}
              className="px-2 py-1 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
              title="Agregar seccion de mute en la posicion actual"
            >
              + Mute
            </button>
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onToggleEdit}
              className="px-3 py-1.5 text-xs bg-bg-tertiary text-text-secondary rounded-md hover:bg-bg-hover transition-colors min-h-[30px]"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 min-h-[30px] font-medium"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
