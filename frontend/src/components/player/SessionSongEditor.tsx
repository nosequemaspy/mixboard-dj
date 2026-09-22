import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { useLibraryStore } from '../../store/libraryStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';
import { getEffectivePlaybackSettings } from '../../types';
import type { MuteSection } from '../../types';
import { api } from '../../api/http';

// --- Clip types (session variant: keep | mute only) ---

interface Clip {
  id: string;
  start: number;
  end: number;
  status: 'keep' | 'mute';
}

let _cid = 0;
const genId = () => `sc${++_cid}`;
const SPLIT_MIN = 0.1;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function findClipAt(time: number, clips: Clip[]): Clip | null {
  return clips.find((c, i) =>
    time >= c.start && (i === clips.length - 1 ? time <= c.end : time < c.end)
  ) ?? null;
}

const TRANSITION_TYPES = [
  { value: 'smooth', label: 'Smooth', desc: 'Crossfade suave (equal-power)' },
  { value: 'sharp', label: 'Sharp', desc: 'Crossfade con curva S' },
  { value: 'linear', label: 'Linear', desc: 'Crossfade lineal' },
  { value: 'cut', label: 'Cut', desc: 'Corte directo sin crossfade' },
];

const SPEED_OPTIONS = [0.5, 0.75, 0.8, 0.9, 1.0, 1.1, 1.2, 1.25, 1.5, 2.0];

// --- Toolbar Button ---

function TBtn({ icon, label, shortcut, onClick, disabled, active, activeClass }: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-bg-hover'}
        ${active && activeClass ? activeClass : active ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}
      `}
    >
      {icon}
      {label}
      {shortcut && <kbd className="text-[9px] text-text-muted/40 font-mono ml-0.5 hidden sm:inline">{shortcut}</kbd>}
    </button>
  );
}

// --- Icons ---

const IconScissors = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const IconMicOff = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const IconUndo = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M9 14L4 9l5-5" /><path d="M20 20v-7a4 4 0 00-4-4H4" />
  </svg>
);

const IconReset = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
  </svg>
);

// --- Main Component ---
// This is a VISUAL-ONLY waveform editor. All audio playback goes through
// the PlaybackEngine (via PlayerControls). No WaveSurfer audio, no AudioContext.
// This ensures zero double-audio issues and zero memory leaks during 3+ hour sessions.

export function SessionSongEditor() {
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const playerCurrentTime = usePlayerStore(s => s.currentTime);
  const playerDuration = usePlayerStore(s => s.duration);
  const playerIsPlaying = usePlayerStore(s => s.isPlaying);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const folders = usePlayerStore(s => s.folders);

  const currentItem = sessionItems.find(i => i.id === currentItemId);
  const song = currentItem?.song;
  const itemFolder = currentItem?.folder_id
    ? folders.find(f => f.id === currentItem.folder_id)
    : null;

  // Memoize mute sections to prevent unnecessary re-renders
  const existingMuteSectionsJson = currentItem?.mute_sections ?? '';
  const existingMuteSections = useMemo<MuteSection[]>(() => {
    if (!existingMuteSectionsJson) return [];
    try { return JSON.parse(existingMuteSectionsJson); } catch { return []; }
  }, [existingMuteSectionsJson]);

  // Editing state from session item
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(4);
  const [transitionType, setTransitionType] = useState('smooth');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const [wsDuration, setWsDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipHistory, setClipHistory] = useState<Clip[][]>([]);
  const [saving, setSaving] = useState(false);

  // Stem separation
  const startStemSeparation = useLibraryStore(s => s.startStemSeparation);
  const stemSeparationStatus = useLibraryStore(s => s.stemSeparationStatus);
  const separatingStems = song ? (stemSeparationStatus[song.id] === 'processing' || song.stems_status === 'processing') : false;
  const stemsStatus = song?.stems_status;
  const canMuteVocals = stemsStatus === 'ready';

  // Refs
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const playerTimeRef = useRef(playerCurrentTime);

  const selectedClip = clips.find(c => c.id === selectedClipId) ?? null;
  const mutedCount = clips.filter(c => c.status === 'mute').length;

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { playerTimeRef.current = playerCurrentTime; }, [playerCurrentTime]);

  // --- Sync stems_status from library store ---
  useEffect(() => {
    if (!song) return;
    const unsub = useLibraryStore.subscribe((state) => {
      const updated = state.songs.find(s => s.id === song.id);
      if (updated && updated.stems_status !== song.stems_status) {
        usePlayerStore.getState().syncFromSessionStore();
      }
    });
    return unsub;
  }, [song?.id, song?.stems_status]);

  // --- Initialize editing state from session item ---
  useEffect(() => {
    if (!currentItem || !song) return;
    const e = getEffectivePlaybackSettings(currentItem);
    setStartTime(e.start_time);
    setEndTime(e.end_time ?? song.duration_seconds);
    setTransitionDuration(e.transition_duration);
    setTransitionType(e.transition_type);
    setPlaybackSpeed(e.playback_speed);
  }, [currentItem?.id, currentItem?.start_time, currentItem?.end_time,
      currentItem?.transition_duration, currentItem?.transition_type,
      currentItem?.playback_speed, song?.duration_seconds]);

  // --- Initialize clips from existing mute sections ---
  const initClipsFromMuteSections = useCallback((dur: number, ms: MuteSection[]) => {
    if (dur <= 0) return;
    if (ms.length === 0) {
      setClips([{ id: genId(), start: 0, end: dur, status: 'keep' }]);
      return;
    }
    const sorted = [...ms].sort((a, b) => a.start - b.start);
    const newClips: Clip[] = [];
    let pos = 0;
    for (const section of sorted) {
      if (section.start > pos) {
        newClips.push({ id: genId(), start: pos, end: section.start, status: 'keep' });
      }
      newClips.push({ id: genId(), start: section.start, end: section.end, status: 'mute' });
      pos = section.end;
    }
    if (pos < dur) {
      newClips.push({ id: genId(), start: pos, end: dur, status: 'keep' });
    }
    setClips(newClips);
  }, []);

  // --- Clip actions ---

  const pushHistory = useCallback(() => {
    setClipHistory(prev => [...prev.slice(-50), clipsRef.current]);
  }, []);

  const splitAtPlayhead = useCallback(() => {
    const time = playerTimeRef.current;
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (time < SPLIT_MIN || time > dur - SPLIT_MIN) return;
    const current = clipsRef.current;
    const tooClose = current.some(c =>
      Math.abs(c.start - time) < SPLIT_MIN || Math.abs(c.end - time) < SPLIT_MIN
    );
    if (tooClose) return;
    const idx = current.findIndex(c => time > c.start + SPLIT_MIN && time < c.end - SPLIT_MIN);
    if (idx === -1) return;
    pushHistory();
    const clip = current[idx];
    const left: Clip = { id: genId(), start: clip.start, end: time, status: clip.status };
    const right: Clip = { id: genId(), start: time, end: clip.end, status: clip.status };
    const newClips = [...current];
    newClips.splice(idx, 1, left, right);
    setClips(newClips);
    setSelectedClipId(right.id);
  }, [wsDuration, song?.duration_seconds, pushHistory]);

  const toggleClipMute = useCallback(() => {
    if (!selectedClipId) return;
    if (!canMuteVocals) return;
    pushHistory();
    setClips(prev => prev.map(c => {
      if (c.id !== selectedClipId) return c;
      return { ...c, status: c.status === 'mute' ? 'keep' : 'mute' };
    }));
  }, [selectedClipId, canMuteVocals, pushHistory]);

  const resetClipToKeep = useCallback(() => {
    if (!selectedClipId) return;
    pushHistory();
    setClips(prev => prev.map(c => {
      if (c.id !== selectedClipId) return c;
      return { ...c, status: 'keep' };
    }));
  }, [selectedClipId, pushHistory]);

  const undo = useCallback(() => {
    if (clipHistory.length === 0) return;
    const prev = clipHistory[clipHistory.length - 1];
    setClipHistory(h => h.slice(0, -1));
    setClips(prev);
    setSelectedClipId(null);
  }, [clipHistory]);

  const resetClips = useCallback(() => {
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (dur === 0) return;
    pushHistory();
    setClips([{ id: genId(), start: 0, end: dur, status: 'keep' }]);
    setSelectedClipId(null);
  }, [wsDuration, song?.duration_seconds, pushHistory]);

  // --- WaveSurfer (VISUAL ONLY — no audio playback) ---

  useEffect(() => {
    if (!waveContainerRef.current) return;
    const regionsPlugin = RegionsPlugin.create();

    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: '#6366f150',
      progressColor: '#6366f1',
      cursorColor: '#e2e8f0',
      cursorWidth: 2,
      height: 'auto' as any,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      hideScrollbar: false,
      autoScroll: true,
      autoCenter: true,
      minPxPerSec: 1,
      // Mute WaveSurfer's internal audio so it never outputs sound
      media: document.createElement('audio'),
      plugins: [
        TimelinePlugin.create({
          timeInterval: 5,
          primaryLabelInterval: 10,
          style: { fontSize: '11px', color: '#64748b' },
        }),
        regionsPlugin,
      ],
    });

    ws.on('ready', () => {
      setWsDuration(ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
    });
    ws.on('error', (err: any) => {
      console.error('WaveSurfer error:', err);
      setIsLoading(false);
      setLoadError(typeof err === 'string' ? err : 'Error al cargar audio');
    });

    // Click on waveform → seek PlaybackEngine (no WaveSurfer audio)
    ws.on('click', (relativeX: number) => {
      const dur = ws.getDuration();
      if (dur <= 0) return;
      const time = relativeX * dur;
      usePlayerStore.getState().setCurrentTime(time);
      getPlaybackEngine().seek(time);
      // Select clip at clicked position
      const clip = findClipAt(time, clipsRef.current);
      if (clip) setSelectedClipId(clip.id);
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;
    return () => { ws.destroy(); wsRef.current = null; regionsRef.current = null; };
  }, []);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        // Toggle PlaybackEngine play/pause (same as PlayerControls)
        const store = usePlayerStore.getState();
        if (!store.currentItemId) {
          const filtered = store.getFilteredItems();
          const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
          if (first) store.playItem(first);
          return;
        }
        store.setIsPlaying(!store.isPlaying);
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.code === 'KeyM' && !e.ctrlKey && selectedClipId) {
        e.preventDefault();
        toggleClipMute();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
        e.preventDefault();
        resetClipToKeep();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      } else if (e.code === 'Escape') {
        setSelectedClipId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [splitAtPlayhead, toggleClipMute, resetClipToKeep, undo, selectedClipId]);

  // --- Load waveform visual (peaks preferred, audio URL fallback) ---

  useEffect(() => {
    if (!wsRef.current || !song || song.id === loadedSongId.current) return;
    loadedSongId.current = song.id;
    setIsLoading(true);
    setLoadError(null);
    setWsDuration(0);
    setZoomLevel(1);
    setClips([]);
    setSelectedClipId(null);
    setClipHistory([]);

    const ws = wsRef.current;

    if (song.waveform_peaks) {
      // Fast path: use pre-computed peaks (no network request for audio)
      try {
        const peaks: number[] = JSON.parse(song.waveform_peaks);
        ws.load('', [peaks], song.duration_seconds);
      } catch {
        // Peaks parse failed, fall back to audio URL
        loadFromUrl(ws, song.id);
      }
    } else {
      // Slow path: load audio URL for waveform visualization
      loadFromUrl(ws, song.id);
    }
  }, [song?.id]);

  function loadFromUrl(ws: WaveSurfer, songId: number) {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(api.streamUrl(songId));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (cancelled) return;
        const blob = await response.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        ws.load(blobUrl);
        ws.once('ready', () => URL.revokeObjectURL(blobUrl));
        ws.once('error', () => URL.revokeObjectURL(blobUrl));
      } catch (err: any) {
        if (!cancelled) { setLoadError(`Error: ${err.message}`); setIsLoading(false); }
      }
    })();
    // Note: no cleanup return here because this is called inside useEffect which handles song.id changes
  }

  // --- Init clips on duration ready ---

  useEffect(() => {
    if (wsDuration > 0 && clips.length === 0) {
      initClipsFromMuteSections(wsDuration, existingMuteSections);
    }
  }, [wsDuration, clips.length, existingMuteSections, initClipsFromMuteSections]);

  // --- Sync WaveSurfer cursor from PlaybackEngine time ---

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !song) return;
    const dur = song.duration_seconds;
    if (dur <= 0) return;
    const progress = playerCurrentTime / dur;
    try {
      ws.seekTo(Math.min(Math.max(progress, 0), 1));
    } catch {
      // ignore if not ready
    }
  }, [playerCurrentTime, song?.duration_seconds]);

  // --- Sync waveform overlays (regions) ---

  useEffect(() => {
    const rp = regionsRef.current;
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (!rp || dur === 0) return;
    rp.clearRegions();

    // Dimmed zone before start
    if (startTime > 0.1) {
      const r = rp.addRegion({ start: 0, end: startTime, color: 'rgba(0, 0, 0, 0.45)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    }

    // Dimmed zone after end
    if (endTime < dur - 0.1) {
      const r = rp.addRegion({ start: endTime, end: dur, color: 'rgba(0, 0, 0, 0.45)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    }

    // Transition zone (amber, before end marker)
    const transStart = Math.max(startTime, endTime - transitionDuration);
    if (transitionDuration > 0.1 && transStart < endTime) {
      const r = rp.addRegion({ start: transStart, end: endTime, color: 'rgba(245, 158, 11, 0.2)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    }

    // Mute clip overlays (purple)
    clips.forEach(clip => {
      if (clip.status !== 'mute') return;
      const r = rp.addRegion({ start: clip.start, end: clip.end, color: 'rgba(168, 85, 247, 0.3)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    });

    // Split lines
    clips.forEach((clip, i) => {
      if (i === 0) return;
      const r = rp.addRegion({
        start: clip.start, end: clip.start,
        color: 'rgba(148, 163, 184, 0.5)',
        drag: false, resize: false,
      });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    });

    // Start marker (green line)
    if (startTime > 0.05) {
      const r = rp.addRegion({ start: startTime, end: startTime, color: 'rgba(34, 197, 94, 0.9)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    }

    // End marker (red line)
    if (endTime < dur - 0.05) {
      const r = rp.addRegion({ start: endTime, end: endTime, color: 'rgba(239, 68, 68, 0.9)', drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    }
  }, [clips, wsDuration, startTime, endTime, transitionDuration, song?.duration_seconds]);

  // --- Handlers ---

  const handleZoom = useCallback((v: number) => {
    setZoomLevel(v);
    wsRef.current?.zoom(v);
  }, []);

  const handlePlayPause = useCallback(() => {
    const store = usePlayerStore.getState();
    if (!store.currentItemId) {
      const filtered = store.getFilteredItems();
      const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
      if (first) store.playItem(first);
      return;
    }
    store.setIsPlaying(!store.isPlaying);
  }, []);

  const seekToTime = useCallback((time: number) => {
    usePlayerStore.getState().setCurrentTime(time);
    getPlaybackEngine().seek(time);
  }, []);

  const handleSeparateStems = async () => {
    if (!song || separatingStems) return;
    try {
      await api.separateStems(song.id);
      startStemSeparation(song.id);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!currentItem || !song) return;
    setSaving(true);
    try {
      const sessionId = usePlayerStore.getState().sessionId;
      const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;
      if (!sessionId) return;

      const muteClips = clips.filter(c => c.status === 'mute');
      const muteSectionsData: MuteSection[] = muteClips.map(c => ({ start: c.start, end: c.end }));

      await api.updateSessionItem(sessionId, currentItem.id, {
        start_time: startTime > 0.5 ? startTime : 0.0,
        end_time: endTime >= song.duration_seconds - 0.5 ? 0.0 : endTime,
        transition_duration: transitionDuration,
        transition_type: transitionType,
        playback_speed: playbackSpeed,
        mute_sections: muteSectionsData.length > 0 ? JSON.stringify(muteSectionsData) : '',
      }, password);

      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();
    } catch (err: any) {
      console.error('Failed to save:', err);
      alert(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!currentItem || !song) return;
    const e = getEffectivePlaybackSettings(currentItem);
    setStartTime(e.start_time);
    setEndTime(e.end_time ?? song.duration_seconds);
    setTransitionDuration(e.transition_duration);
    setTransitionType(e.transition_type);
    setPlaybackSpeed(e.playback_speed);
    const dur = wsDuration > 0 ? wsDuration : song.duration_seconds;
    if (dur > 0) {
      initClipsFromMuteSections(dur, existingMuteSections);
    }
    setSelectedClipId(null);
    setClipHistory([]);
  };

  const displayDuration = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? playerDuration);

  if (!song || !currentItem) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-muted text-sm">Selecciona una cancion para editar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* === Transport Bar === */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-bg-primary/50 flex-shrink-0">
        <button
          onClick={handlePlayPause}
          className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          {playerIsPlaying ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
          )}
        </button>

        <span className="text-xs font-mono text-accent tabular-nums">{fmt(playerCurrentTime)}</span>
        <span className="text-xs text-text-muted">/</span>
        <span className="text-xs font-mono text-text-muted tabular-nums">{fmt(displayDuration)}</span>

        <div className="w-px h-5 bg-border/50" />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          {itemFolder && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: itemFolder.color }}
              title={itemFolder.name}
            />
          )}
          <span className="text-xs text-text-primary font-medium truncate">{song.title}</span>
          <span className="text-[10px] text-text-muted truncate">{song.artist}</span>
        </div>

        {canMuteVocals ? (
          <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded font-bold">STEMS OK</span>
        ) : (
          <button
            onClick={handleSeparateStems}
            disabled={separatingStems || stemsStatus === 'processing'}
            className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all ${
              separatingStems || stemsStatus === 'processing'
                ? 'bg-warning/15 text-warning animate-pulse'
                : 'bg-accent/15 text-accent hover:bg-accent/25'
            }`}
          >
            {separatingStems || stemsStatus === 'processing' ? 'SEPARANDO...' : 'SEPARAR STEMS'}
          </button>
        )}

        <div className="w-px h-5 bg-border/50" />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="range" min="1" max="200" step="1"
            value={zoomLevel}
            onChange={e => handleZoom(Number(e.target.value))}
            className="w-24 h-1 accent-accent"
            disabled={wsDuration === 0}
          />
          <span className="text-[9px] text-text-muted font-mono w-6 text-right">{zoomLevel}x</span>
        </div>
      </div>

      {/* === Toolbar === */}
      <div className="flex items-center gap-0.5 px-3 py-1 border-b border-border/40 bg-bg-primary/30 flex-shrink-0">
        <TBtn
          icon={<IconScissors />}
          label="Dividir"
          shortcut="S"
          onClick={splitAtPlayhead}
          disabled={!displayDuration || clips.length === 0}
        />

        <div className="w-px h-4 bg-border/30 mx-1" />

        <TBtn
          icon={<IconMicOff />}
          label="Mute Vocal"
          shortcut="M"
          onClick={toggleClipMute}
          disabled={!selectedClipId || !canMuteVocals}
          active={selectedClip?.status === 'mute'}
          activeClass="bg-warning/20 text-warning"
        />

        <div className="w-px h-4 bg-border/30 mx-1" />

        <TBtn
          icon={<IconUndo />}
          label="Deshacer"
          shortcut="Ctrl+Z"
          onClick={undo}
          disabled={clipHistory.length === 0}
        />
        <TBtn
          icon={<IconReset />}
          label="Limpiar"
          onClick={resetClips}
          disabled={clips.length <= 1 && mutedCount === 0}
        />

        {mutedCount > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[10px]">
            <span className="text-warning font-mono">
              {mutedCount} mute{mutedCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* === Waveform (visual only) === */}
      <div
        className="flex-1 relative bg-bg-primary min-h-0"
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
        onWheel={e => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoom(Math.max(1, Math.min(200, zoomLevel + (e.deltaY > 0 ? -10 : 10))));
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/90 gap-3">
            <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-text-muted">Cargando waveform...</span>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/95 gap-2">
            <span className="text-sm text-danger">{loadError}</span>
            <button
              onClick={() => { loadedSongId.current = null; usePlayerStore.getState().syncFromSessionStore(); }}
              className="text-xs text-accent hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}
        <div ref={waveContainerRef} className="w-full h-full" />
      </div>

      {/* === Clip Track === */}
      {displayDuration > 0 && clips.length > 0 && (
        <div className="h-10 border-t border-border bg-bg-primary/60 relative flex flex-shrink-0 overflow-hidden">
          {clips.map(clip => {
            const pct = ((clip.end - clip.start) / displayDuration) * 100;
            const isSelected = clip.id === selectedClipId;
            const isNarrow = pct < 6;
            const isMedium = pct >= 6 && pct < 14;

            let borderColor = 'border-l-accent/30';
            let bg = 'bg-accent/5';
            let textColor = 'text-text-muted/50';

            if (clip.status === 'mute') {
              borderColor = 'border-l-warning/60';
              bg = 'bg-warning/10';
              textColor = 'text-warning/70';
            }

            return (
              <div
                key={clip.id}
                onClick={() => { setSelectedClipId(clip.id); seekToTime(clip.start + 0.01); }}
                style={{ width: `${pct}%`, minWidth: '4px' }}
                className={`h-full border-l-2 border-r border-r-border/15 flex items-center cursor-pointer transition-all overflow-hidden select-none
                  ${borderColor} ${bg} ${textColor}
                  ${isSelected
                    ? 'ring-1 ring-inset ring-accent/70 brightness-150'
                    : 'hover:brightness-125'
                  }
                `}
              >
                {!isNarrow && (
                  <span className="text-[9px] font-mono truncate px-1.5 leading-tight">
                    {clip.status === 'mute' && <span className="mr-0.5">&#9834;</span>}
                    {isMedium
                      ? fmt(clip.start)
                      : `${fmt(clip.start)} \u2013 ${fmt(clip.end)}`
                    }
                    {!isMedium && clip.status === 'mute' && (
                      <span className="opacity-50 ml-1">mute</span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {/* Playhead on clip track */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/70 pointer-events-none z-10"
            style={{ left: `${displayDuration > 0 ? (playerCurrentTime / displayDuration) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* === Controls Panel === */}
      <div className="border-t border-border bg-bg-secondary/60 px-4 py-2 flex-shrink-0 space-y-2">
        {/* Start / End / Transition inputs */}
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
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

          <div className="w-px h-4 bg-border/30" />

          {/* Playback speed */}
          <label className="flex items-center gap-1 text-text-muted">
            <span className="text-accent font-semibold">Velocidad:</span>
            <select
              value={playbackSpeed}
              onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
              className="bg-bg-primary border border-border/60 rounded px-1.5 py-1 text-xs text-text-primary font-mono focus:outline-none focus:border-accent/60"
            >
              {SPEED_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 1 ? '1.0x' : `${s}x`}</option>
              ))}
            </select>
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

        {/* Save / Cancel bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <span className="text-green-400 font-mono">{formatTime(startTime)}</span>
            <span>-</span>
            <span className="text-red-400 font-mono">{formatTime(endTime)}</span>
            <span className="text-text-muted/40">|</span>
            <span className="text-amber-400 font-mono">{transitionType} {transitionDuration}s</span>
            {playbackSpeed !== 1.0 && (
              <>
                <span className="text-text-muted/40">|</span>
                <span className="text-accent font-mono font-bold">{playbackSpeed}x</span>
              </>
            )}
            {mutedCount > 0 && (
              <>
                <span className="text-text-muted/40">|</span>
                <span className="text-purple-400 font-mono">{mutedCount} mute</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
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
      </div>
    </div>
  );
}
