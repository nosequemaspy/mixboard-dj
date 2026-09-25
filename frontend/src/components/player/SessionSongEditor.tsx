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

// --- Clip types (session: keep | mute | cut) ---

interface Clip {
  id: string;
  start: number;
  end: number;
  status: 'keep' | 'mute' | 'cut';
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

function findClipAt(time: number, clips: Clip[]): Clip | null {
  return clips.find((c, i) =>
    time >= c.start && (i === clips.length - 1 ? time <= c.end : time < c.end)
  ) ?? null;
}

const TRANSITION_TYPES = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'linear', label: 'Linear' },
  { value: 'cut', label: 'Cut' },
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
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all min-h-[36px] sm:min-h-0
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-bg-hover'}
        ${active && activeClass ? activeClass : active ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {shortcut && <kbd className="text-[9px] text-text-muted/40 font-mono ml-0.5 hidden md:inline">{shortcut}</kbd>}
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

const IconTransition = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <line x1="4" y1="12" x2="20" y2="12" /><polyline points="16 8 20 12 16 16" />
    <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
  </svg>
);

const IconTrash = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const IconReset = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
  </svg>
);

// =============================================================================
// SessionSongEditor — visual-only waveform editor panel
// All audio goes through PlaybackEngine. Zero memory leaks. Zero double-audio.
// =============================================================================

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

  // Memoize mute/cut sections to avoid new-array-every-render
  const existingMuteSectionsJson = currentItem?.mute_sections ?? '';
  const existingMuteSections = useMemo<MuteSection[]>(() => {
    if (!existingMuteSectionsJson) return [];
    try { return JSON.parse(existingMuteSectionsJson); } catch { return []; }
  }, [existingMuteSectionsJson]);

  const existingCutSectionsJson = song?.cut_sections ?? '';
  const existingCutSections = useMemo<MuteSection[]>(() => {
    if (!existingCutSectionsJson) return [];
    try { return JSON.parse(existingCutSectionsJson); } catch { return []; }
  }, [existingCutSectionsJson]);

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
  const [retryKey, setRetryKey] = useState(0);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [muteStartMark, setMuteStartMark] = useState<number | null>(null);
  const [cutStartMark, setCutStartMark] = useState<number | null>(null);
  const [showStemPrompt, setShowStemPrompt] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#6366f1');
  const folderPickerRef = useRef<HTMLDivElement>(null);

  // Stems
  const startStemSeparation = useLibraryStore(s => s.startStemSeparation);
  const stemSeparationStatus = useLibraryStore(s => s.stemSeparationStatus);
  const separatingStems = song ? (stemSeparationStatus[song.id] === 'processing' || song.stems_status === 'processing') : false;
  const stemsStatus = song?.stems_status;
  const canMuteVocals = stemsStatus === 'ready';

  // Refs
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const playerTimeRef = useRef(playerCurrentTime);
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const transitionDurationRef = useRef(transitionDuration);
  const updatingFromRegion = useRef(false);
  const muteStartMarkRef = useRef<number | null>(null);
  const cutStartMarkRef = useRef<number | null>(null);
  const existingCutSectionsRef = useRef<MuteSection[]>(existingCutSections);

  const mutedCount = clips.filter(c => c.status === 'mute').length;
  const cutCount = clips.filter(c => c.status === 'cut').length;

  // Helper: check if a clip matches a saved cut section
  const isSavedCut = useCallback((clip: Clip) => {
    if (clip.status !== 'cut') return false;
    return existingCutSections.some(s =>
      Math.abs(s.start - clip.start) < 0.5 && Math.abs(s.end - clip.end) < 0.5
    );
  }, [existingCutSections]);

  const savedCutCount = clips.filter(c => isSavedCut(c)).length;
  const pendingCutCount = cutCount - savedCutCount;

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { playerTimeRef.current = playerCurrentTime; }, [playerCurrentTime]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { endTimeRef.current = endTime; }, [endTime]);
  useEffect(() => { transitionDurationRef.current = transitionDuration; }, [transitionDuration]);
  useEffect(() => { existingCutSectionsRef.current = existingCutSections; }, [existingCutSections]);
  useEffect(() => { muteStartMarkRef.current = muteStartMark; }, [muteStartMark]);
  useEffect(() => { cutStartMarkRef.current = cutStartMark; }, [cutStartMark]);

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

  // Dismiss stem prompt when stems become ready
  useEffect(() => {
    if (canMuteVocals) setShowStemPrompt(false);
  }, [canMuteVocals]);

  // --- Init editing state from session item ---
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

  // --- Init clips from mute + cut sections ---
  const initClipsFromSections = useCallback((dur: number, ms: MuteSection[], cs: MuteSection[]) => {
    if (dur <= 0) return;
    if (ms.length === 0 && cs.length === 0) {
      setClips([{ id: genId(), start: 0, end: dur, status: 'keep' }]);
      return;
    }
    // Merge mute and cut sections with their status, sorted by start
    const tagged: { start: number; end: number; status: 'mute' | 'cut' }[] = [
      ...ms.map(s => ({ ...s, status: 'mute' as const })),
      ...cs.map(s => ({ ...s, status: 'cut' as const })),
    ].sort((a, b) => a.start - b.start);
    const newClips: Clip[] = [];
    let pos = 0;
    for (const section of tagged) {
      if (section.start > pos)
        newClips.push({ id: genId(), start: pos, end: section.start, status: 'keep' });
      newClips.push({ id: genId(), start: section.start, end: section.end, status: section.status });
      pos = section.end;
    }
    if (pos < dur) newClips.push({ id: genId(), start: pos, end: dur, status: 'keep' });
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
    if (current.some(c => Math.abs(c.start - time) < SPLIT_MIN || Math.abs(c.end - time) < SPLIT_MIN)) return;
    const idx = current.findIndex(c => time > c.start + SPLIT_MIN && time < c.end - SPLIT_MIN);
    if (idx === -1) return;
    pushHistory();
    const clip = current[idx];
    const newClips = [...current];
    newClips.splice(idx, 1,
      { id: genId(), start: clip.start, end: time, status: clip.status },
      { id: genId(), start: time, end: clip.end, status: clip.status },
    );
    setClips(newClips);
    setSelectedClipId(newClips[idx + 1].id);
  }, [wsDuration, song?.duration_seconds, pushHistory]);

  const setTransitionAtPlayhead = useCallback(() => {
    const time = playerTimeRef.current;
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (dur <= 0 || time < startTimeRef.current + 1 || time > dur) return;
    setEndTime(Math.round(time * 10) / 10);
  }, [wsDuration, song?.duration_seconds]);

  /** Apply a status to a time range: split clips at boundaries, mark clips inside as the given status */
  const applyStatusRange = useCallback((rangeStart: number, rangeEnd: number, status: 'mute' | 'cut') => {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    if (end - start < SPLIT_MIN) return;

    pushHistory();
    let current = [...clipsRef.current];

    // Split at start boundary if it falls inside a clip
    const startIdx = current.findIndex(c => start > c.start + SPLIT_MIN && start < c.end - SPLIT_MIN);
    if (startIdx !== -1) {
      const clip = current[startIdx];
      current.splice(startIdx, 1,
        { id: genId(), start: clip.start, end: start, status: clip.status },
        { id: genId(), start: start, end: clip.end, status: clip.status },
      );
    }

    // Split at end boundary if it falls inside a clip
    const endIdx = current.findIndex(c => end > c.start + SPLIT_MIN && end < c.end - SPLIT_MIN);
    if (endIdx !== -1) {
      const clip = current[endIdx];
      current.splice(endIdx, 1,
        { id: genId(), start: clip.start, end: end, status: clip.status },
        { id: genId(), start: end, end: clip.end, status: clip.status },
      );
    }

    // Toggle clips within [start, end] to the given status
    current = current.map(c => {
      if (c.start >= start - SPLIT_MIN && c.end <= end + SPLIT_MIN) {
        return { ...c, status: c.status === status ? 'keep' : status };
      }
      return c;
    });

    setClips(current);
    setSelectedClipId(null);
  }, [pushHistory]);

  const toggleClipMute = useCallback(() => {
    if (!selectedClipId) return;
    if (!canMuteVocals) {
      setShowStemPrompt(true);
      return;
    }
    pushHistory();
    setClips(prev => prev.map(c =>
      c.id === selectedClipId ? { ...c, status: c.status === 'mute' ? 'keep' : 'mute' } : c
    ));
  }, [selectedClipId, canMuteVocals, pushHistory]);

  const handleMuteAction = useCallback(() => {
    if (!canMuteVocals) {
      setShowStemPrompt(true);
      return;
    }
    // If a clip is selected, toggle its mute status directly
    if (selectedClipId) {
      toggleClipMute();
      return;
    }
    // Otherwise, use range-based approach (M twice to mark start/end)
    const time = playerTimeRef.current;
    if (muteStartMarkRef.current === null) {
      setMuteStartMark(time);
    } else {
      applyStatusRange(muteStartMarkRef.current, time, 'mute');
      setMuteStartMark(null);
    }
  }, [canMuteVocals, selectedClipId, toggleClipMute, applyStatusRange]);

  const toggleClipCut = useCallback(() => {
    if (!selectedClipId) return;
    pushHistory();
    setClips(prev => prev.map(c =>
      c.id === selectedClipId ? { ...c, status: c.status === 'cut' ? 'keep' : 'cut' } : c
    ));
  }, [selectedClipId, pushHistory]);

  const handleCutAction = useCallback(() => {
    // If a clip is selected, toggle its cut status directly
    if (selectedClipId) {
      toggleClipCut();
      return;
    }
    // Otherwise, use range-based approach (D twice to mark start/end)
    const time = playerTimeRef.current;
    if (cutStartMarkRef.current === null) {
      setCutStartMark(time);
    } else {
      applyStatusRange(cutStartMarkRef.current, time, 'cut');
      setCutStartMark(null);
    }
  }, [selectedClipId, toggleClipCut, applyStatusRange]);

  const undo = useCallback(() => {
    if (clipHistory.length === 0) return;
    setClipHistory(h => h.slice(0, -1));
    setClips(clipHistory[clipHistory.length - 1]);
    setSelectedClipId(null);
  }, [clipHistory]);

  const resetClips = useCallback(() => {
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (dur === 0) return;
    pushHistory();
    setClips([{ id: genId(), start: 0, end: dur, status: 'keep' }]);
    setSelectedClipId(null);
  }, [wsDuration, song?.duration_seconds, pushHistory]);

  // --- WaveSurfer lifecycle: use pre-computed peaks when available, fetch from API, blob fallback ---

  useEffect(() => {
    if (!waveContainerRef.current || !song) return;

    setIsLoading(true);
    setLoadError(null);
    setWsDuration(0);
    setZoomLevel(1);
    setClips([]);
    setSelectedClipId(null);
    setClipHistory([]);

    const regionsPlugin = RegionsPlugin.create();
    let cancelled = false;

    const wsOptions: any = {
      container: waveContainerRef.current,
      waveColor: 'rgba(99, 102, 241, 0.35)',
      progressColor: 'rgba(99, 102, 241, 0.8)',
      cursorColor: 'rgba(255, 255, 255, 0.8)',
      cursorWidth: 2,
      height: 'auto',
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      hideScrollbar: false,
      autoScroll: true,
      autoCenter: true,
      minPxPerSec: 1,
      plugins: [
        TimelinePlugin.create({
          timeInterval: 5,
          primaryLabelInterval: 10,
          style: { fontSize: '10px', color: '#64748b' },
        }),
        regionsPlugin,
      ],
    };

    // Try to use inline peaks first (may be null if from session/list response)
    let usedPeaks = false;
    if (song.waveform_peaks) {
      try {
        const peaks: number[] = JSON.parse(song.waveform_peaks);
        if (peaks.length > 0) {
          wsOptions.peaks = [peaks];
          wsOptions.duration = song.duration_seconds;
          usedPeaks = true;
        }
      } catch { /* parse failed */ }
    }

    const ws = WaveSurfer.create(wsOptions);

    ws.on('ready', () => {
      setWsDuration(ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
    });
    ws.on('click', (relativeX: number) => {
      const dur = ws.getDuration();
      if (dur <= 0) return;
      const time = relativeX * dur;
      usePlayerStore.getState().setCurrentTime(time);
      getPlaybackEngine().seek(time);
      const clip = findClipAt(time, clipsRef.current);
      if (clip) setSelectedClipId(clip.id);
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;

    if (usedPeaks) {
      // Peaks render instantly
      setWsDuration(song.duration_seconds);
      setIsLoading(false);
    } else {
      // No inline peaks — fetch from single-song API (lightweight, returns peaks without downloading audio)
      // Falls back to audio blob if API doesn't have peaks either
      const loadPeaksOrBlob = async () => {
        // First try: fetch peaks from GET /api/songs/{id} (small JSON, ~5KB)
        try {
          if (cancelled) return;
          const fullSong = await api.getSong(song.id);
          if (cancelled) return;
          if (fullSong.waveform_peaks) {
            const peaks: number[] = JSON.parse(fullSong.waveform_peaks);
            if (peaks.length > 0) {
              ws.load('', [peaks], song.duration_seconds);
              setWsDuration(song.duration_seconds);
              setIsLoading(false);
              return;
            }
          }
        } catch { /* API failed, fall through to blob */ }

        // Fallback: fetch audio blob with retry
        ws.on('error', (err: any) => {
          console.error('WaveSurfer error:', err);
          setIsLoading(false);
          setLoadError(typeof err === 'string' ? err : 'Error al cargar audio');
        });
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            if (cancelled) return;
            const response = await fetch(api.streamUrl(song.id));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (cancelled) return;
            const blob = await response.blob();
            if (cancelled) return;
            const blobUrl = URL.createObjectURL(blob);
            ws.load(blobUrl);
            ws.once('ready', () => URL.revokeObjectURL(blobUrl));
            ws.once('error', () => URL.revokeObjectURL(blobUrl));
            return;
          } catch (err: any) {
            if (cancelled) return;
            if (attempt >= 2) {
              setLoadError(`Error al cargar: ${err.message}`);
              setIsLoading(false);
            } else {
              await new Promise(r => setTimeout(r, 1500));
            }
          }
        }
      };
      loadPeaksOrBlob();
    }

    return () => {
      cancelled = true;
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [song?.id, retryKey]);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        const store = usePlayerStore.getState();
        if (!store.currentItemId) {
          const filtered = store.getFilteredItems();
          const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
          if (first) store.playItem(first);
          return;
        }
        store.setIsPlaying(!store.isPlaying);
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); splitAtPlayhead();
      } else if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); setTransitionAtPlayhead();
      } else if (e.code === 'KeyM' && !e.ctrlKey) {
        e.preventDefault(); handleMuteAction();
      } else if (e.code === 'KeyD' && !e.ctrlKey) {
        e.preventDefault(); handleCutAction();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
        e.preventDefault(); toggleClipCut();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); undo();
      } else if (e.code === 'Escape') {
        setSelectedClipId(null);
        setMuteStartMark(null);
        setCutStartMark(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [splitAtPlayhead, setTransitionAtPlayhead, handleMuteAction, handleCutAction, toggleClipCut, undo, selectedClipId]);

  // --- Init clips on duration ready ---

  useEffect(() => {
    if (wsDuration > 0 && clips.length === 0) {
      initClipsFromSections(wsDuration, existingMuteSections, existingCutSections);
    }
  }, [wsDuration, clips.length, existingMuteSections, existingCutSections, initClipsFromSections]);

  // --- Sync cursor from PlaybackEngine ---

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !song) return;
    const dur = song.duration_seconds;
    if (dur <= 0) return;
    try { ws.seekTo(Math.min(Math.max(playerCurrentTime / dur, 0), 1)); } catch {}
  }, [playerCurrentTime, song?.duration_seconds]);

  // --- Draw regions with draggable start/end handles (Filmora-style) ---

  const drawRegions = useCallback(() => {
    const rp = regionsRef.current;
    const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);
    if (!rp || dur === 0) return;

    updatingFromRegion.current = true;
    rp.clearRegions();

    const st = startTimeRef.current;
    const et = endTimeRef.current;
    const td = transitionDurationRef.current;

    const addOverlay = (start: number, end: number, color: string) => {
      if (start >= end) return;
      const r = rp.addRegion({ start, end, color, drag: false, resize: false });
      try { (r as any).element.style.pointerEvents = 'none'; } catch {}
    };

    // Dimmed zones
    if (st > 0.1) addOverlay(0, st, 'rgba(0,0,0,0.45)');
    if (et < dur - 0.1) addOverlay(et, dur, 'rgba(0,0,0,0.45)');

    // Transition zone (amber)
    const transStart = Math.max(st, et - td);
    if (td > 0.1 && transStart < et) addOverlay(transStart, et, 'rgba(245,158,11,0.18)');

    // Mute overlays (purple)
    clipsRef.current.forEach(c => {
      if (c.status === 'mute') addOverlay(c.start, c.end, 'rgba(168,85,247,0.25)');
    });

    // Cut overlays: saved = dark (applied), pending = red
    const savedCuts = existingCutSectionsRef.current;
    clipsRef.current.forEach(c => {
      if (c.status === 'cut') {
        const saved = savedCuts.some(s =>
          Math.abs(s.start - c.start) < 0.5 && Math.abs(s.end - c.end) < 0.5
        );
        addOverlay(c.start, c.end, saved ? 'rgba(0,0,0,0.55)' : 'rgba(239,68,68,0.25)');
      }
    });

    // Split lines
    clipsRef.current.forEach((c, i) => {
      if (i > 0) addOverlay(c.start, c.start, 'rgba(148,163,184,0.5)');
    });

    // Pending mute/cut start markers
    if (muteStartMark !== null) {
      const mr = rp.addRegion({ start: muteStartMark, end: muteStartMark, color: 'rgba(168,85,247,0.9)', drag: false, resize: false });
      try {
        const el = (mr as any).element;
        if (el) { el.style.borderLeft = '3px dashed rgb(168,85,247)'; el.style.zIndex = '4'; el.style.pointerEvents = 'none'; }
      } catch {}
    }
    if (cutStartMark !== null) {
      const cr = rp.addRegion({ start: cutStartMark, end: cutStartMark, color: 'rgba(239,68,68,0.9)', drag: false, resize: false });
      try {
        const el = (cr as any).element;
        if (el) { el.style.borderLeft = '3px dashed rgb(239,68,68)'; el.style.zIndex = '4'; el.style.pointerEvents = 'none'; }
      } catch {}
    }

    // === DRAGGABLE START HANDLE (green) ===
    const startR = rp.addRegion({
      id: 'start-handle',
      start: st,
      end: st,
      color: 'rgba(34,197,94,0.9)',
      drag: true,
      resize: false,
    });
    try {
      const el = (startR as any).element;
      if (el) {
        el.style.cursor = 'col-resize';
        el.style.borderLeft = '4px solid rgb(34,197,94)';
        el.style.boxShadow = '0 0 8px rgba(34,197,94,0.5)';
        el.style.zIndex = '5';
      }
    } catch {}

    // === DRAGGABLE END HANDLE (orange — transition marker) ===
    const endR = rp.addRegion({
      id: 'end-handle',
      start: et,
      end: et,
      color: 'rgba(249,115,22,0.9)',
      drag: true,
      resize: false,
    });
    try {
      const el = (endR as any).element;
      if (el) {
        el.style.cursor = 'col-resize';
        el.style.borderLeft = '4px solid rgb(249,115,22)';
        el.style.boxShadow = '0 0 8px rgba(249,115,22,0.5)';
        el.style.zIndex = '5';
      }
    } catch {}

    updatingFromRegion.current = false;
  }, [wsDuration, song?.duration_seconds, muteStartMark, cutStartMark]);

  // --- Region event listeners for draggable handles ---

  useEffect(() => {
    const rp = regionsRef.current;
    const ws = wsRef.current;
    if (!rp || !ws) return;

    const onReady = () => drawRegions();
    ws.on('ready', onReady);

    const onRegionUpdated = (region: any) => {
      if (updatingFromRegion.current) return;
      const dur = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? 0);

      if (region.id === 'start-handle') {
        const newStart = Math.max(0, Math.min(region.start, endTimeRef.current - 1));
        setStartTime(Math.round(newStart * 10) / 10);
      } else if (region.id === 'end-handle') {
        const newEnd = Math.max(startTimeRef.current + 1, Math.min(region.start, dur));
        setEndTime(Math.round(newEnd * 10) / 10);
      }
    };

    rp.on('region-updated', onRegionUpdated);

    return () => {
      ws.un('ready', onReady);
      rp.un('region-updated', onRegionUpdated);
    };
  }, [wsDuration, song?.duration_seconds, drawRegions]);

  // --- Redraw regions when values change ---

  useEffect(() => {
    drawRegions();
  }, [startTime, endTime, transitionDuration, clips, muteStartMark, cutStartMark, drawRegions]);

  // --- Sync editor cut sections to PlaybackEngine for real-time preview ---

  useEffect(() => {
    const pendingCuts = clips
      .filter(c => c.status === 'cut')
      .filter(c => !existingCutSections.some(s =>
        Math.abs(s.start - c.start) < 0.5 && Math.abs(s.end - c.end) < 0.5
      ))
      .map(c => ({ start: c.start, end: c.end }));
    const allCuts = [...existingCutSections, ...pendingCuts];
    getPlaybackEngine().setEditorCutSections(allCuts.length > 0 ? allCuts : null);
  }, [clips, existingCutSections]);

  // Clear editor cuts from PlaybackEngine when editor unmounts
  useEffect(() => {
    return () => { getPlaybackEngine().setEditorCutSections(null); };
  }, []);

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
    setShowStemPrompt(false);
    try { await api.separateStems(song.id); startStemSeparation(song.id); } catch {}
  };

  const handleSave = async () => {
    if (!currentItem || !song) return;
    setSaving(true);
    try {
      const sessionId = usePlayerStore.getState().sessionId;
      const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;
      if (!sessionId) return;

      const muteSectionsData: MuteSection[] = clips
        .filter(c => c.status === 'mute')
        .map(c => ({ start: c.start, end: c.end }));

      const cutSectionsData: MuteSection[] = clips
        .filter(c => c.status === 'cut')
        .map(c => ({ start: c.start, end: c.end }));

      // Save cut sections as metadata on the Song (non-destructive, shared across all sessions)
      // PlaybackEngine already skips cut sections in real-time during playback
      await api.updateSong(song.id, {
        cut_sections: cutSectionsData.length > 0 ? JSON.stringify(cutSectionsData) : '',
      });

      // Save per-session settings (transitions, mute, speed)
      await api.updateSessionItem(sessionId, currentItem.id, {
        start_time: startTime > 0.5 ? startTime : 0.0,
        end_time: endTime >= song.duration_seconds - 0.5 ? 0.0 : endTime,
        transition_duration: transitionDuration,
        transition_type: transitionType,
        playback_speed: playbackSpeed,
        mute_sections: muteSectionsData.length > 0 ? JSON.stringify(muteSectionsData) : '',
      }, password);

      // Refresh both stores
      await useLibraryStore.getState().fetchSongs();
      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();

      // Update PlaybackEngine config for the current item (so cuts/mutes take effect immediately)
      const updatedItems = usePlayerStore.getState().sessionItems;
      const updatedItem = updatedItems.find(i => i.id === currentItem.id);
      if (updatedItem) {
        getPlaybackEngine().refreshCurrentConfig(updatedItem);
      }

      // Reload editor: force WaveSurfer + clips re-init from saved data
      setMuteStartMark(null);
      setCutStartMark(null);
      setSelectedClipId(null);
      setClipHistory([]);
      setRetryKey(k => k + 1);
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
    if (dur > 0) initClipsFromSections(dur, existingMuteSections, existingCutSections);
    setSelectedClipId(null);
    setClipHistory([]);
    setMuteStartMark(null);
    setCutStartMark(null);
  };

  // --- Folder picker handlers ---

  const handleAssignFolder = async (folderId: number | null) => {
    if (!currentItem) return;
    const sessionId = usePlayerStore.getState().sessionId;
    const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;
    if (!sessionId) return;
    try {
      await api.assignItemFolder(sessionId, currentItem.id, folderId, password);
      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();
    } catch (err: any) {
      console.error('Failed to assign folder:', err);
    }
    setShowFolderPicker(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const sessionId = usePlayerStore.getState().sessionId;
    const password = sessionId ? useSessionStore.getState().getPassword(sessionId) : undefined;
    if (!sessionId) return;
    try {
      const folder = await api.createSessionFolder(sessionId, { name: newFolderName.trim(), color: newFolderColor }, password);
      await api.assignItemFolder(sessionId, currentItem!.id, folder.id, password);
      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();
    } catch (err: any) {
      console.error('Failed to create folder:', err);
    }
    setCreatingFolder(false);
    setNewFolderName('');
    setNewFolderColor('#6366f1');
    setShowFolderPicker(false);
  };

  // Close folder picker on click outside
  useEffect(() => {
    if (!showFolderPicker) return;
    const handler = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setShowFolderPicker(false);
        setCreatingFolder(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderPicker]);

  const FOLDER_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];

  const displayDuration = wsDuration > 0 ? wsDuration : (song?.duration_seconds ?? playerDuration);

  if (!song || !currentItem) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-text-muted text-sm">Selecciona una cancion para editar</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-b border-border bg-bg-primary">

      {/* === Header: Song info + Play + Zoom === */}
      <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 border-b border-border/50 bg-bg-secondary/40 overflow-hidden">
        <button
          onClick={handlePlayPause}
          className="w-7 h-7 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          {playerIsPlaying ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
          )}
        </button>

        <span className="text-[11px] font-mono text-accent tabular-nums shrink-0">{fmt(playerCurrentTime)}</span>
        <span className="text-[10px] text-text-muted/40 hidden sm:inline">/</span>
        <span className="text-[11px] font-mono text-text-muted tabular-nums hidden sm:inline">{fmt(displayDuration)}</span>

        <div className="w-px h-4 bg-border/30 shrink-0 hidden sm:block" />

        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
          {/* Folder picker */}
          <div className="relative shrink-0 hidden sm:block" ref={folderPickerRef}>
            <button
              onClick={() => setShowFolderPicker(!showFolderPicker)}
              className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-bg-hover transition-colors"
              title={itemFolder ? itemFolder.name : 'Sin etiqueta'}
            >
              <span className="w-2.5 h-2.5 rounded-full border border-white/20"
                style={{ backgroundColor: itemFolder?.color ?? '#4b5563' }} />
              <span className="text-[9px] text-text-muted max-w-[60px] truncate">
                {itemFolder?.name ?? 'Etiqueta'}
              </span>
            </button>
            {showFolderPicker && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-bg-secondary border border-border rounded-lg shadow-xl z-50 py-1">
                {/* Unassign option */}
                <button
                  onClick={() => handleAssignFolder(null)}
                  className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-bg-hover transition-colors flex items-center gap-2 ${
                    !itemFolder ? 'text-accent font-medium' : 'text-text-secondary'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-border/60 bg-bg-tertiary" />
                  Sin etiqueta
                </button>
                {folders.map(f => (
                  <button key={f.id}
                    onClick={() => handleAssignFolder(f.id)}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-bg-hover transition-colors flex items-center gap-2 ${
                      currentItem.folder_id === f.id ? 'text-accent font-medium' : 'text-text-secondary'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
                <div className="border-t border-border/40 mt-1 pt-1">
                  {!creatingFolder ? (
                    <button
                      onClick={() => setCreatingFolder(true)}
                      className="w-full text-left px-2.5 py-1.5 text-[11px] text-accent hover:bg-bg-hover transition-colors"
                    >+ Crear etiqueta...</button>
                  ) : (
                    <div className="px-2 py-1.5 flex flex-col gap-1.5">
                      <input
                        autoFocus
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                        placeholder="Nombre..."
                        className="w-full bg-bg-primary border border-border/50 rounded px-1.5 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent/60"
                      />
                      <div className="flex items-center gap-1">
                        {FOLDER_COLORS.map(c => (
                          <button key={c} onClick={() => setNewFolderColor(c)}
                            className={`w-4 h-4 rounded-full transition-all ${newFolderColor === c ? 'ring-2 ring-white/60 scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setCreatingFolder(false)}
                          className="flex-1 text-[10px] text-text-muted hover:text-text-primary py-0.5">Cancelar</button>
                        <button onClick={handleCreateFolder}
                          className="flex-1 text-[10px] bg-accent text-white rounded py-0.5 hover:bg-accent-hover font-medium">Crear</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="text-[11px] text-text-primary font-medium truncate">{song.title}</span>
          <span className="text-[10px] text-text-muted truncate hidden sm:inline">{song.artist}</span>
        </div>

        {/* Mobile toolbar buttons (hidden on sm+) */}
        <div className="flex items-center shrink-0 sm:hidden">
          <TBtn icon={<IconScissors />} label="Dividir" onClick={splitAtPlayhead} disabled={!displayDuration || clips.length === 0} />
          <TBtn icon={<IconTransition />} label="Trans" onClick={setTransitionAtPlayhead} disabled={!displayDuration} />
          <TBtn icon={<IconMicOff />} label={separatingStems ? '...' : muteStartMark !== null ? 'Mute▸' : 'Mute'} onClick={handleMuteAction} disabled={separatingStems}
            active={muteStartMark !== null} activeClass="bg-purple-500/20 text-purple-400" />
          <TBtn icon={<IconTrash />} label={cutStartMark !== null ? 'Del▸' : 'Eliminar'} onClick={handleCutAction}
            active={cutStartMark !== null} activeClass="bg-danger/20 text-danger" />
          <TBtn icon={<IconUndo />} label="Deshacer" onClick={undo} disabled={clipHistory.length === 0} />
        </div>

        {canMuteVocals ? (
          <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded font-bold shrink-0 hidden sm:inline">STEMS</span>
        ) : (
          <button onClick={handleSeparateStems} disabled={separatingStems}
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 transition-all hidden sm:inline ${
              separatingStems ? 'bg-warning/15 text-warning animate-pulse' : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >{separatingStems ? 'SEPARANDO...' : 'STEMS'}</button>
        )}

        <div className="w-px h-4 bg-border/30 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <input type="range" min="1" max="200" step="1" value={zoomLevel}
            onChange={e => handleZoom(Number(e.target.value))}
            className="w-20 h-1 accent-accent" disabled={wsDuration === 0}
          />
          <span className="text-[9px] text-text-muted font-mono w-5 text-right">{zoomLevel}x</span>
        </div>
      </div>

      {/* === Toolbar (desktop only, merged into header on mobile) === */}
      <div className="hidden sm:flex items-center gap-0.5 px-2 py-0.5 border-b border-border/30 bg-bg-primary/60">
        <TBtn icon={<IconScissors />} label="Dividir" shortcut="S"
          onClick={splitAtPlayhead} disabled={!displayDuration || clips.length === 0} />
        <TBtn icon={<IconTransition />} label="Trans" shortcut="T"
          onClick={setTransitionAtPlayhead} disabled={!displayDuration} />
        <div className="w-px h-3.5 bg-border/20 mx-0.5" />
        <TBtn icon={<IconMicOff />} label={separatingStems ? 'Separando...' : muteStartMark !== null ? 'Mute ▸' : 'Mute'} shortcut="M"
          onClick={handleMuteAction} disabled={separatingStems}
          active={muteStartMark !== null} activeClass="bg-purple-500/20 text-purple-400" />
        <TBtn icon={<IconTrash />} label={cutStartMark !== null ? 'Eliminar ▸' : 'Eliminar'} shortcut="D"
          onClick={handleCutAction}
          active={cutStartMark !== null} activeClass="bg-danger/20 text-danger" />
        <div className="w-px h-3.5 bg-border/20 mx-0.5" />
        <TBtn icon={<IconUndo />} label="Deshacer" shortcut="Ctrl+Z"
          onClick={undo} disabled={clipHistory.length === 0} />
        <TBtn icon={<IconReset />} label="Limpiar"
          onClick={resetClips} disabled={clips.length <= 1 && mutedCount === 0 && cutCount === 0} />
        {(mutedCount > 0 || cutCount > 0) && (
          <span className="ml-auto text-[10px] font-mono flex gap-2">
            {mutedCount > 0 && <span className="text-warning">{mutedCount} mute{mutedCount > 1 ? 's' : ''}</span>}
            {savedCutCount > 0 && <span className="text-zinc-400">{savedCutCount} aplicado{savedCutCount > 1 ? 's' : ''}</span>}
            {pendingCutCount > 0 && <span className="text-danger">{pendingCutCount} corte{pendingCutCount > 1 ? 's' : ''}</span>}
          </span>
        )}
      </div>

      {/* === Stem separation prompt === */}
      {showStemPrompt && !canMuteVocals && !separatingStems && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
          <IconMicOff />
          <span className="text-[11px] text-purple-300 flex-1">Para silenciar vocales se necesita separar los stems de esta cancion.</span>
          <button onClick={handleSeparateStems}
            className="px-2.5 py-0.5 text-[11px] bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors font-medium shrink-0"
          >Separar stems</button>
          <button onClick={() => setShowStemPrompt(false)}
            className="text-text-muted hover:text-text-primary transition-colors shrink-0 p-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {separatingStems && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/20">
          <svg className="animate-spin w-3.5 h-3.5 text-warning shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-[11px] text-warning font-medium">Separando stems... El mute estara disponible cuando termine.</span>
        </div>
      )}

      {/* === Waveform === */}
      <div className="relative h-24 sm:h-40 bg-bg-primary overflow-x-auto overflow-y-hidden"
        onWheel={e => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoom(Math.max(1, Math.min(200, zoomLevel + (e.deltaY > 0 ? -10 : 10))));
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/90 gap-2">
            <svg className="animate-spin w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-xs text-text-muted">Cargando...</span>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/95 gap-1.5">
            <span className="text-xs text-danger">{loadError}</span>
            <button onClick={() => setRetryKey(k => k + 1)}
              className="text-[10px] text-accent hover:underline">Reintentar</button>
          </div>
        )}
        <div ref={waveContainerRef} className="w-full h-full" />
        {/* Legend for draggable handles */}
        {wsDuration > 0 && !isLoading && !loadError && (
          <div className="absolute top-1 right-1 hidden sm:flex gap-2 text-[9px] pointer-events-none z-10">
            <span className="flex items-center gap-0.5 text-green-400 bg-black/40 px-1.5 py-0.5 rounded">
              <span className="w-1 h-2.5 bg-green-500 rounded-sm inline-block" />
              Inicio
            </span>
            <span className="flex items-center gap-0.5 text-orange-400 bg-black/40 px-1.5 py-0.5 rounded">
              <span className="w-1 h-2.5 bg-orange-500 rounded-sm inline-block" />
              Trans
            </span>
            <span className="flex items-center gap-0.5 text-amber-400 bg-black/40 px-1.5 py-0.5 rounded">
              <span className="w-2 h-2.5 bg-amber-500/40 rounded-sm inline-block" />
              Zona
            </span>
          </div>
        )}
      </div>

      {/* === Clip Track === */}
      {displayDuration > 0 && clips.length > 0 && (
        <div className="h-7 border-t border-border/40 bg-bg-primary/40 relative flex overflow-hidden">
          {clips.map(clip => {
            const pct = ((clip.end - clip.start) / displayDuration) * 100;
            const isSelected = clip.id === selectedClipId;
            const isNarrow = pct < 8;
            const saved = isSavedCut(clip);
            return (
              <div key={clip.id}
                onClick={() => { setSelectedClipId(clip.id); seekToTime(clip.start + 0.01); }}
                style={{ width: `${pct}%`, minWidth: '3px' }}
                className={`h-full border-l flex items-center cursor-pointer transition-all overflow-hidden select-none
                  ${clip.status === 'cut'
                    ? saved
                      ? 'border-l-zinc-600/40 bg-zinc-900/40 text-zinc-500/40'
                      : 'border-l-danger/60 bg-danger/10 text-danger/60'
                    : clip.status === 'mute'
                    ? 'border-l-warning/60 bg-warning/10 text-warning/60'
                    : 'border-l-accent/20 bg-accent/5 text-text-muted/40'}
                  ${isSelected ? 'ring-1 ring-inset ring-accent/60 brightness-150' : 'hover:brightness-125'}
                `}
              >
                {!isNarrow && (
                  <span className="text-[8px] font-mono truncate px-1">
                    {clip.status === 'cut' ? (saved ? '━ ' : '✕ ') : clip.status === 'mute' ? '♪ ' : ''}{fmt(clip.start)}
                  </span>
                )}
              </div>
            );
          })}
          <div className="absolute top-0 bottom-0 w-0.5 bg-white/60 pointer-events-none z-10"
            style={{ left: `${displayDuration > 0 ? (playerCurrentTime / displayDuration) * 100 : 0}%` }} />
        </div>
      )}

      {/* === Controls: Mobile (collapsible) === */}
      <div className="sm:hidden border-t border-border/40 bg-bg-secondary/50 overflow-hidden">
        {/* Compact bar: summary + Save/Cancel + expand toggle */}
        <div className="flex items-center gap-1 px-2 py-1 overflow-hidden">
          <button onClick={() => setShowMobileControls(!showMobileControls)}
            className="flex items-center shrink-0 text-[10px] text-text-muted min-h-[36px] px-0.5"
          >
            <svg className={`w-3 h-3 transition-transform ${showMobileControls ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <span className="text-[10px] font-mono text-text-muted truncate min-w-0 flex-1">
            <span className="text-green-400">{fmt(startTime)}</span>
            {'-'}
            <span className="text-orange-400">{fmt(endTime)}</span>
            {' '}
            <span className="text-amber-400">{transitionDuration}s</span>
            {' '}
            <span className="text-text-muted/60">{transitionType} {playbackSpeed !== 1 ? `${playbackSpeed}x` : ''}</span>
          </span>
          <div className="shrink-0 flex items-center gap-1">
            <button onClick={handleCancel}
              className="px-2 py-1 text-[11px] bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover transition-colors min-h-[36px]"
            >Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="px-2 py-1 text-[11px] bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 font-medium min-h-[36px]"
            >{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
        {/* Expanded controls */}
        {showMobileControls && (
          <div className="px-2 pb-2 flex flex-col gap-2 border-t border-border/30 overflow-hidden">
            {/* Start / Trans inputs */}
            <div className="flex items-center gap-1.5 pt-1.5">
              <label className="flex-1 flex items-center gap-0.5">
                <span className="text-green-400 font-semibold text-[10px]">Ini</span>
                <input type="number" min={0} max={endTime - 1} step={0.5}
                  value={Math.round(startTime * 10) / 10}
                  onChange={e => setStartTime(Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 1)))}
                  className="w-full min-h-[36px] bg-bg-primary border border-border/50 rounded px-1 py-1 text-[11px] text-text-primary font-mono text-center focus:outline-none focus:border-green-500/60"
                />
              </label>
              <label className="flex-1 flex items-center gap-0.5">
                <span className="text-amber-400 font-semibold text-[10px]">Trans</span>
                <input type="number" min={0} max={30} step={0.5}
                  value={transitionDuration}
                  onChange={e => setTransitionDuration(Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)))}
                  className="w-full min-h-[36px] bg-bg-primary border border-border/50 rounded px-1 py-1 text-[11px] text-text-primary font-mono text-center focus:outline-none focus:border-amber-500/60"
                />
              </label>
            </div>
            {/* Transition type buttons + speed */}
            <div className="flex items-center gap-1">
              {TRANSITION_TYPES.map(tt => (
                <button key={tt.value} onClick={() => setTransitionType(tt.value)}
                  className={`flex-1 min-h-[36px] rounded text-[10px] font-medium transition-colors ${
                    transitionType === tt.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                  }`}
                >{tt.label}</button>
              ))}
              <select value={playbackSpeed} onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                className="min-h-[36px] bg-bg-primary border border-border/50 rounded px-1 text-[11px] text-text-primary font-mono focus:outline-none"
              >
                {SPEED_OPTIONS.map(s => <option key={s} value={s}>{s}x</option>)}
              </select>
            </div>
            {/* Zoom slider */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-muted">Zoom</span>
              <input type="range" min="1" max="200" step="1" value={zoomLevel}
                onChange={e => handleZoom(Number(e.target.value))}
                className="flex-1 h-1 accent-accent" disabled={wsDuration === 0}
              />
              <span className="text-[9px] text-text-muted font-mono w-6 text-right">{zoomLevel}x</span>
            </div>
          </div>
        )}
      </div>

      {/* === Controls: Desktop (full row) === */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border-t border-border/40 bg-bg-secondary/50 flex-wrap">
        {/* Start/End/Trans inputs */}
        <div className="flex items-center gap-2 text-[11px]">
          <label className="flex items-center gap-0.5">
            <span className="text-green-400 font-semibold text-[10px]">Inicio</span>
            <input type="number" min={0} max={endTime - 1} step={0.5}
              value={Math.round(startTime * 10) / 10}
              onChange={e => setStartTime(Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 1)))}
              className="w-14 bg-bg-primary border border-border/50 rounded px-1 py-0.5 text-[11px] text-text-primary font-mono text-center focus:outline-none focus:border-green-500/60"
            />
          </label>
          <label className="flex items-center gap-0.5">
            <span className="text-amber-400 font-semibold text-[10px]">Trans</span>
            <input type="number" min={0} max={30} step={0.5}
              value={transitionDuration}
              onChange={e => setTransitionDuration(Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)))}
              className="w-12 bg-bg-primary border border-border/50 rounded px-1 py-0.5 text-[11px] text-text-primary font-mono text-center focus:outline-none focus:border-amber-500/60"
            />
          </label>
        </div>

        <div className="w-px h-4 bg-border/30" />

        {/* Transition type */}
        <div className="flex items-center gap-0.5">
          {TRANSITION_TYPES.map(tt => (
            <button key={tt.value} onClick={() => setTransitionType(tt.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                transitionType === tt.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}
            >{tt.label}</button>
          ))}
        </div>

        <div className="w-px h-4 bg-border/30" />

        {/* Speed */}
        <select value={playbackSpeed} onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
          className="bg-bg-primary border border-border/50 rounded px-1 py-0.5 text-[11px] text-text-primary font-mono focus:outline-none"
        >
          {SPEED_OPTIONS.map(s => <option key={s} value={s}>{s}x</option>)}
        </select>

        {/* Save / Cancel */}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={handleCancel}
            className="px-2.5 py-1 text-[11px] bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover transition-colors"
          >Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1 text-[11px] bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 font-medium"
          >{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
