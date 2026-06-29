import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import type { Song, EditedSong } from '../../types';

interface Clip {
  id: string;
  start: number;
  end: number;
  status: 'keep' | 'delete' | 'mute';
}

let _cid = 0;
const genId = () => `c${++_cid}`;
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

const IconTrash = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
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

export function AudioEditor() {
  const songs = useLibraryStore(s => s.songs);
  const removeSongFromStore = useLibraryStore(s => s.removeSong);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipHistory, setClipHistory] = useState<Clip[][]>([]);

  const [editName, setEditName] = useState('');
  const [edits, setEdits] = useState<EditedSong[]>([]);
  const [saving, setSaving] = useState(false);
  const [playingEditId, setPlayingEditId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [separatingStems, setSeparatingStems] = useState(false);

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const editAudioRef = useRef<HTMLAudioElement | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const instrumentalBufferRef = useRef<AudioBuffer | null>(null);
  const instrumentalSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const instrumentalGainRef = useRef<GainNode | null>(null);
  const instrumentalDataRef = useRef<ArrayBuffer | null>(null);
  const muteActiveRef = useRef(false);
  const muteStartCtxTimeRef = useRef(0);
  const muteStartOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const stemsStatus = selectedSong?.stems_status;
  const canMuteVocals = stemsStatus === 'ready';
  const selectedClip = clips.find(c => c.id === selectedClipId) ?? null;
  const hasModifications = clips.some(c => c.status !== 'keep');
  const deletedDuration = clips.filter(c => c.status === 'delete').reduce((s, c) => s + (c.end - c.start), 0);
  const mutedCount = clips.filter(c => c.status === 'mute').length;
  const deletedCount = clips.filter(c => c.status === 'delete').length;

  // --- AudioContext setup (must be called from user gesture for autoplay policy) ---
  // AudioContext is used ONLY for instrumental playback.
  // WaveSurfer's original audio is muted/unmuted via media.muted property.

  const ensureAudioCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      instrumentalGainRef.current = audioCtxRef.current.createGain();
      instrumentalGainRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    // Decode pending instrumental data if available
    if (instrumentalDataRef.current && !instrumentalBufferRef.current) {
      try {
        instrumentalBufferRef.current = await audioCtxRef.current.decodeAudioData(instrumentalDataRef.current);
        instrumentalDataRef.current = null;
      } catch (e) {
        console.error('Failed to decode instrumental:', e);
      }
    }
  }, []);

  // --- Clip actions ---

  const pushHistory = useCallback(() => {
    setClipHistory(prev => [...prev.slice(-50), clipsRef.current]);
  }, []);

  const splitAtPlayhead = useCallback(() => {
    const time = wsRef.current?.getCurrentTime() ?? 0;
    if (time < SPLIT_MIN || time > duration - SPLIT_MIN) return;

    const current = clipsRef.current;
    const tooClose = current.some(c =>
      Math.abs(c.start - time) < SPLIT_MIN || Math.abs(c.end - time) < SPLIT_MIN
    );
    if (tooClose) return;

    const idx = current.findIndex(c => time > c.start + SPLIT_MIN && time < c.end - SPLIT_MIN);
    if (idx === -1) return;

    pushHistory();
    const clip = current[idx];
    const left = { id: genId(), start: clip.start, end: time, status: clip.status };
    const right = { id: genId(), start: time, end: clip.end, status: clip.status };
    const newClips = [...current];
    newClips.splice(idx, 1, left, right);
    setClips(newClips);
    setSelectedClipId(right.id);
  }, [duration, pushHistory]);

  const toggleClipStatus = useCallback((status: 'delete' | 'mute') => {
    if (!selectedClipId) return;
    if (status === 'mute' && !canMuteVocals) return;
    pushHistory();
    setClips(prev => prev.map(c => {
      if (c.id !== selectedClipId) return c;
      return { ...c, status: c.status === status ? 'keep' : status };
    }));
  }, [selectedClipId, canMuteVocals, pushHistory]);

  const undo = useCallback(() => {
    if (clipHistory.length === 0) return;
    const prev = clipHistory[clipHistory.length - 1];
    setClipHistory(h => h.slice(0, -1));
    setClips(prev);
    setSelectedClipId(null);
  }, [clipHistory]);

  const resetClips = useCallback(() => {
    if (duration === 0) return;
    pushHistory();
    setClips([{ id: genId(), start: 0, end: duration, status: 'keep' }]);
    setSelectedClipId(null);
  }, [duration, pushHistory]);

  // --- WaveSurfer ---

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
      plugins: [
        TimelinePlugin.create({
          timeInterval: 5,
          primaryLabelInterval: 10,
          style: { fontSize: '11px', color: '#64748b' },
        }),
        regionsPlugin,
      ],
    });

    ws.on('play', () => {
      setIsPlaying(true);
      ensureAudioCtx();
    });
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('timeupdate', (t: number) => setCurrentTime(t));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
    });
    ws.on('error', (err: any) => {
      console.error('WaveSurfer error:', err);
      setIsLoading(false);
      setLoadError(typeof err === 'string' ? err : 'Error al cargar audio');
    });

    ws.on('seeking', (t: number) => {
      const clip = findClipAt(t, clipsRef.current);
      if (clip) setSelectedClipId(clip.id);
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;
    return () => { ws.destroy(); wsRef.current = null; regionsRef.current = null; };
  }, []);

  // --- Keyboard ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        ensureAudioCtx();
        wsRef.current?.playPause();
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        splitAtPlayhead();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
        e.preventDefault();
        toggleClipStatus('delete');
      } else if (e.code === 'KeyM' && !e.ctrlKey && selectedClipId) {
        e.preventDefault();
        toggleClipStatus('mute');
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      } else if (e.code === 'Escape') {
        setSelectedClipId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [splitAtPlayhead, toggleClipStatus, undo, selectedClipId, ensureAudioCtx]);

  // --- Load song ---

  useEffect(() => {
    if (!wsRef.current || !selectedSong || selectedSong.id === loadedSongId.current) return;
    loadedSongId.current = selectedSong.id;
    setIsLoading(true);
    setLoadError(null);
    setCurrentTime(0);
    setDuration(0);
    setZoomLevel(1);
    setClips([]);
    setSelectedClipId(null);
    setClipHistory([]);

    if (editAudioRef.current) {
      editAudioRef.current.pause();
      editAudioRef.current = null;
      setPlayingEditId(null);
    }

    const ws = wsRef.current;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(api.streamUrl(selectedSong.id));
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

    setEditName(`${selectedSong.title} - edited`);
    loadEdits(selectedSong.id);
    return () => { cancelled = true; };
  }, [selectedSong]);

  // --- Init clips on duration ---

  useEffect(() => {
    if (duration > 0 && clips.length === 0) {
      setClips([{ id: genId(), start: 0, end: duration, status: 'keep' }]);
    }
  }, [duration, clips.length]);

  // --- Sync overlays ---

  useEffect(() => {
    const rp = regionsRef.current;
    if (!rp || duration === 0) return;

    rp.clearRegions();

    clips.forEach(clip => {
      if (clip.status === 'keep') return;
      const color = clip.status === 'delete'
        ? 'rgba(239, 68, 68, 0.25)'
        : 'rgba(245, 158, 11, 0.25)';
      const r = rp.addRegion({ start: clip.start, end: clip.end, color, drag: false, resize: false });
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
  }, [clips, duration]);

  // --- Load instrumental stem data for preview ---

  useEffect(() => {
    if (!selectedSong || !canMuteVocals) {
      instrumentalDataRef.current = null;
      instrumentalBufferRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(api.stemByTypeUrl(selectedSong.id, 'instrumental'));
        const data = await response.arrayBuffer();
        if (cancelled) return;
        // If AudioContext already exists and running, decode immediately
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === 'running') {
          const buffer = await ctx.decodeAudioData(data);
          if (cancelled) return;
          instrumentalBufferRef.current = buffer;
          instrumentalDataRef.current = null;
        } else {
          // Store raw data — will be decoded on first play (user gesture)
          instrumentalDataRef.current = data;
        }
      } catch (e) {
        console.error('Failed to load instrumental:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSong?.id, canMuteVocals]);

  // --- Real-time preview: skip deleted clips, play instrumental for muted ---
  // Mutes WaveSurfer via media.muted and plays instrumental via AudioContext.

  useEffect(() => {
    if (!isPlaying || !wsRef.current) {
      // When paused, unmute original and stop instrumental
      if (muteActiveRef.current) {
        muteActiveRef.current = false;
        try { const m = wsRef.current?.getMediaElement(); if (m) m.muted = false; } catch {}
        if (instrumentalSourceRef.current) {
          try { instrumentalSourceRef.current.stop(); } catch {}
          instrumentalSourceRef.current = null;
        }
      }
      return;
    }

    const startInstrumental = (offset: number) => {
      const ctx = audioCtxRef.current;
      const buffer = instrumentalBufferRef.current;
      const gain = instrumentalGainRef.current;
      if (!ctx || !buffer || !gain) return;
      // Stop previous source
      if (instrumentalSourceRef.current) {
        try { instrumentalSourceRef.current.stop(); } catch {}
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(0, offset);
      instrumentalSourceRef.current = source;
      muteStartCtxTimeRef.current = ctx.currentTime;
      muteStartOffsetRef.current = offset;
    };

    const stopInstrumental = () => {
      if (instrumentalSourceRef.current) {
        try { instrumentalSourceRef.current.stop(); } catch {}
        instrumentalSourceRef.current = null;
      }
    };

    let animFrame: number;
    const check = () => {
      const ws = wsRef.current;
      if (!ws || !isPlayingRef.current) return;
      const t = ws.getCurrentTime();
      const currentClips = clipsRef.current;
      if (currentClips.length === 0) { animFrame = requestAnimationFrame(check); return; }

      const clip = findClipAt(t, currentClips);
      if (!clip) { animFrame = requestAnimationFrame(check); return; }

      if (clip.status === 'delete') {
        // Skip to the next non-deleted clip
        const idx = currentClips.indexOf(clip);
        const next = currentClips.slice(idx + 1).find(c => c.status !== 'delete');
        if (next) {
          ws.seekTo(next.start / ws.getDuration());
        } else {
          ws.pause();
        }
      } else if (clip.status === 'mute' && instrumentalBufferRef.current) {
        if (!muteActiveRef.current) {
          // Mute original (absolute silence), play instrumental
          muteActiveRef.current = true;
          try { ws.getMediaElement().muted = true; } catch {}
          startInstrumental(t);
        } else {
          // Drift correction: re-sync if >200ms drift
          const ctx = audioCtxRef.current;
          if (ctx) {
            const elapsed = ctx.currentTime - muteStartCtxTimeRef.current;
            const expected = muteStartOffsetRef.current + elapsed;
            if (Math.abs(expected - t) > 0.2) {
              startInstrumental(t);
            }
          }
        }
      } else {
        // Normal clip - unmute original, stop instrumental
        if (muteActiveRef.current) {
          muteActiveRef.current = false;
          try { ws.getMediaElement().muted = false; } catch {}
          stopInstrumental();
        }
      }

      animFrame = requestAnimationFrame(check);
    };

    animFrame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying]);

  // --- Cleanup ---

  useEffect(() => {
    return () => {
      if (editAudioRef.current) { editAudioRef.current.pause(); editAudioRef.current = null; }
      if (instrumentalSourceRef.current) {
        try { instrumentalSourceRef.current.stop(); } catch {}
        instrumentalSourceRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  // --- Handlers ---

  const handleZoom = useCallback((v: number) => {
    setZoomLevel(v);
    wsRef.current?.zoom(v);
  }, []);

  const seekTo = useCallback((time: number) => {
    if (!wsRef.current || duration === 0) return;
    wsRef.current.seekTo(Math.min(Math.max(time / duration, 0), 1));
  }, [duration]);

  const loadEdits = async (songId: number) => {
    try { setEdits(await api.getEdits(songId)); } catch { setEdits([]); }
  };

  const handleSeparateStems = async () => {
    if (!selectedSong || separatingStems) return;
    setSeparatingStems(true);
    try {
      await api.separateStems(selectedSong.id);
      const poll = setInterval(async () => {
        try {
          await useLibraryStore.getState().fetchSongs();
          const updated = useLibraryStore.getState().songs.find(s => s.id === selectedSong.id);
          if (updated && updated.stems_status === 'ready') {
            setSelectedSong(updated); setSeparatingStems(false); clearInterval(poll);
          } else if (updated && updated.stems_status === 'error') {
            setSeparatingStems(false); clearInterval(poll);
          }
        } catch {}
      }, 2000);
      setTimeout(() => { clearInterval(poll); setSeparatingStems(false); }, 60000);
    } catch { setSeparatingStems(false); }
  };

  const handleSave = async () => {
    if (!selectedSong || !editName.trim() || !hasModifications) return;
    const delClips = clips.filter(c => c.status === 'delete');
    const muteClips = clips.filter(c => c.status === 'mute');
    setSaving(true);
    try {
      if (delClips.length > 0) {
        await api.createEdit({
          song_id: selectedSong.id,
          name: editName.trim() + (muteClips.length > 0 ? ' (corte)' : ''),
          edit_type: 'cut_section',
          params: { sections: delClips.map(c => ({ start: c.start, end: c.end })) },
        });
      }
      if (muteClips.length > 0) {
        await api.createEdit({
          song_id: selectedSong.id,
          name: editName.trim() + (delClips.length > 0 ? ' (vocal mute)' : ''),
          edit_type: 'vocal_mute_section',
          params: { sections: muteClips.map(c => ({ start: c.start, end: c.end })) },
        });
      }
      loadEdits(selectedSong.id);
      resetClips();
    } catch (e: any) {
      alert(e.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handlePlayEdit = (editId: number) => {
    if (editAudioRef.current) { editAudioRef.current.pause(); editAudioRef.current = null; }
    if (playingEditId === editId) { setPlayingEditId(null); return; }
    const audio = new Audio(api.editStreamUrl(editId));
    audio.play();
    audio.onended = () => { setPlayingEditId(null); editAudioRef.current = null; };
    editAudioRef.current = audio;
    setPlayingEditId(editId);
  };

  const handleDeleteEdit = async (editId: number) => {
    if (playingEditId === editId) { editAudioRef.current?.pause(); editAudioRef.current = null; setPlayingEditId(null); }
    await api.deleteEdit(editId);
    if (selectedSong) loadEdits(selectedSong.id);
  };

  const handleDeleteSong = async (songId: number) => {
    try {
      await api.deleteSong(songId);
      removeSongFromStore(songId);
      if (selectedSong?.id === songId) {
        wsRef.current?.pause();
        setSelectedSong(null);
        loadedSongId.current = null;
        setClips([]); setSelectedClipId(null); setClipHistory([]); setEdits([]);
      }
      setDeleteConfirm(null);
    } catch (e: any) { alert(e.message || 'Error al eliminar'); }
  };

  const filteredSongs = searchQuery
    ? songs.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.artist.toLowerCase().includes(searchQuery.toLowerCase()))
    : songs;

  // =================== JSX ===================

  return (
    <div className="flex h-full bg-bg-secondary">
      {/* ===== SIDEBAR ===== */}
      <div className="w-48 border-r border-border flex flex-col flex-shrink-0">
        <div className="px-2 py-2 border-b border-border">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Canciones</span>
          <div className="mt-1 relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-bg-primary border border-border/60 rounded pl-6 pr-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSongs.map(song => (
            <div
              key={song.id}
              className={`relative group ${
                selectedSong?.id === song.id
                  ? 'bg-accent/10 border-l-2 border-l-accent'
                  : 'hover:bg-bg-hover border-l-2 border-l-transparent'
              }`}
            >
              <button
                onClick={() => { setSelectedSong(song); setDeleteConfirm(null); }}
                className="w-full text-left px-2 py-1.5 pr-7"
              >
                <div className="text-[11px] text-text-primary truncate font-medium">{song.title}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-text-muted truncate">{song.artist}</span>
                  <span className="text-[10px] text-text-muted/60 font-mono ml-auto">{fmt(song.duration_seconds)}</span>
                </div>
              </button>
              <div className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setDeleteConfirm(song.id)} className="text-text-muted hover:text-danger p-0.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {deleteConfirm === song.id && (
                <div className="absolute inset-0 bg-bg-primary/95 flex items-center justify-center gap-1 z-10">
                  <button onClick={() => handleDeleteSong(song.id)} className="text-[9px] bg-danger text-white px-1.5 py-0.5 rounded font-bold">Si</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-[9px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded">No</button>
                </div>
              )}
            </div>
          ))}
          {filteredSongs.length === 0 && (
            <div className="px-2 py-4 text-center text-[10px] text-text-muted">Sin resultados</div>
          )}
        </div>
      </div>

      {/* ===== MAIN EDITOR ===== */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* --- Transport Bar --- */}
        {selectedSong && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-bg-primary/50">
            <button
              onClick={() => { ensureAudioCtx(); wsRef.current?.playPause(); }}
              disabled={isLoading || duration === 0}
              className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isPlaying ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>

            <span className="text-xs font-mono text-accent tabular-nums">{fmt(currentTime)}</span>
            <span className="text-xs text-text-muted">/</span>
            <span className="text-xs font-mono text-text-muted tabular-nums">{fmt(duration)}</span>

            <div className="w-px h-5 bg-border/50" />

            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary font-medium truncate block">{selectedSong.title}</span>
            </div>

            {canMuteVocals ? (
              <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded font-bold">STEMS</span>
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
                disabled={duration === 0}
              />
              <span className="text-[9px] text-text-muted font-mono w-6 text-right">{zoomLevel}x</span>
            </div>
          </div>
        )}

        {/* --- Toolbar --- */}
        {selectedSong && (
          <div className="flex items-center gap-0.5 px-3 py-1 border-b border-border/40 bg-bg-primary/30">
            <TBtn
              icon={<IconScissors />}
              label="Dividir"
              shortcut="S"
              onClick={splitAtPlayhead}
              disabled={!duration || clips.length === 0}
            />

            <div className="w-px h-4 bg-border/30 mx-1" />

            <TBtn
              icon={<IconTrash />}
              label="Eliminar"
              shortcut="Supr"
              onClick={() => toggleClipStatus('delete')}
              disabled={!selectedClipId}
              active={selectedClip?.status === 'delete'}
              activeClass="bg-danger/20 text-danger"
            />
            <TBtn
              icon={<IconMicOff />}
              label="Mute Vocal"
              shortcut="M"
              onClick={() => toggleClipStatus('mute')}
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
              disabled={clips.length <= 1 && !hasModifications}
            />

            {/* Status summary */}
            {hasModifications && (
              <div className="ml-auto flex items-center gap-2 text-[10px]">
                {deletedCount > 0 && (
                  <span className="text-danger font-mono">
                    {deletedCount} corte{deletedCount > 1 ? 's' : ''} ({fmt(deletedDuration)})
                  </span>
                )}
                {mutedCount > 0 && (
                  <span className="text-warning font-mono">
                    {mutedCount} mute{mutedCount > 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-text-muted font-mono">
                  = {fmt(duration - deletedDuration)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* --- Waveform (ALWAYS rendered so WaveSurfer initializes on mount) --- */}
        <div
          className="flex-1 relative bg-bg-primary"
          style={{ overflowX: 'auto', overflowY: 'hidden' }}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              handleZoom(Math.max(1, Math.min(200, zoomLevel + (e.deltaY > 0 ? -10 : 10))));
            }
          }}
        >
          {/* No song placeholder */}
          {!selectedSong && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-text-muted gap-3">
              <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-sm">Selecciona una cancion para editar</p>
            </div>
          )}
          {selectedSong && isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/90 gap-3">
              <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm text-text-muted">Cargando audio...</span>
            </div>
          )}
          {selectedSong && loadError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/95 gap-2">
              <span className="text-sm text-danger">{loadError}</span>
              <button
                onClick={() => { loadedSongId.current = null; setSelectedSong({ ...selectedSong }); }}
                className="text-xs text-accent hover:underline"
              >
                Reintentar
              </button>
            </div>
          )}
          <div ref={waveContainerRef} className="w-full h-full" />
        </div>

        {/* --- Clip Track --- */}
        {selectedSong && duration > 0 && clips.length > 0 && (
          <div className="h-10 border-t border-border bg-bg-primary/60 relative flex flex-shrink-0 overflow-hidden">
            {clips.map(clip => {
              const pct = ((clip.end - clip.start) / duration) * 100;
              const isSelected = clip.id === selectedClipId;
              const isNarrow = pct < 6;
              const isMedium = pct >= 6 && pct < 14;

              let borderColor = 'border-l-accent/30';
              let bg = 'bg-accent/5';
              let textColor = 'text-text-muted/50';

              if (clip.status === 'delete') {
                borderColor = 'border-l-danger/60';
                bg = 'bg-danger/10';
                textColor = 'text-danger/70';
              } else if (clip.status === 'mute') {
                borderColor = 'border-l-warning/60';
                bg = 'bg-warning/10';
                textColor = 'text-warning/70';
              }

              return (
                <div
                  key={clip.id}
                  onClick={() => { setSelectedClipId(clip.id); seekTo(clip.start + 0.01); }}
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
                      {clip.status === 'delete' && <span className="mr-0.5">&#10005;</span>}
                      {clip.status === 'mute' && <span className="mr-0.5">&#9834;</span>}
                      {isMedium
                        ? fmt(clip.start)
                        : `${fmt(clip.start)} \u2013 ${fmt(clip.end)}`
                      }
                      {!isMedium && clip.status !== 'keep' && (
                        <span className="opacity-50 ml-1">
                          {clip.status === 'delete' ? 'eliminar' : 'mute'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Playhead on clip track */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/70 pointer-events-none z-10"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* --- Save / Edits Panel --- */}
        {selectedSong && (hasModifications || edits.length > 0) && (
          <div className="border-t border-border bg-bg-secondary max-h-[30%] overflow-y-auto">

            {/* Save controls */}
            {hasModifications && (
              <div className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre del edit"
                    className="flex-1 bg-bg-primary border border-border/60 rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
                  />
                  <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !editName.trim()}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
                {!canMuteVocals && mutedCount > 0 && (
                  <p className="text-[10px] text-warning mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Primero separa los stems para usar Mute Vocal
                  </p>
                )}
              </div>
            )}

            {/* Saved edits */}
            {edits.length > 0 && (
              <div className={`px-4 py-2 ${hasModifications ? 'border-t border-border/30' : ''}`}>
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                  Edits guardados ({edits.length})
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {edits.map(edit => (
                    <div key={edit.id} className="flex items-center gap-1.5 bg-bg-primary border border-border/40 rounded px-2 py-1 group">
                      <span className="text-[11px] text-text-primary font-medium truncate max-w-[150px]">{edit.name}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                        edit.edit_type === 'cut_section' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
                      }`}>
                        {edit.edit_type === 'cut_section' ? 'corte' : 'mute'}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">{fmt(edit.duration_seconds)}</span>
                      <button
                        onClick={() => handlePlayEdit(edit.id)}
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          playingEditId === edit.id ? 'bg-accent text-white' : 'text-accent hover:bg-accent/20'
                        }`}
                      >
                        {playingEditId === edit.id ? (
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        ) : (
                          <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                        )}
                      </button>
                      <a
                        href={api.editStreamUrl(edit.id)}
                        download={`${edit.name}.mp3`}
                        className="w-5 h-5 rounded-full text-success hover:bg-success/20 flex items-center justify-center"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                      <button
                        onClick={() => handleDeleteEdit(edit.id)}
                        className="w-5 h-5 rounded-full text-danger hover:bg-danger/20 flex items-center justify-center"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Instructions --- */}
        {selectedSong && !hasModifications && !isLoading && !loadError && duration > 0 && edits.length === 0 && clips.length === 1 && (
          <div className="border-t border-border bg-bg-secondary px-4 py-2 text-center">
            <span className="text-[11px] text-text-muted">
              Reproduce el audio, pausa donde quieras cortar y presiona{' '}
              <kbd className="bg-bg-tertiary px-1.5 py-0.5 rounded text-text-secondary font-mono text-[10px]">S</kbd>
              {' '}para dividir
              {' '}&middot;{' '}Ctrl + scroll para zoom
              {!canMuteVocals && (
                <>
                  {' '}&middot;{' '}
                  <button onClick={handleSeparateStems} disabled={separatingStems} className="text-accent hover:underline">
                    {separatingStems ? 'Separando...' : 'Separar stems para mute vocal'}
                  </button>
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
