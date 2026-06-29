import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom.esm.js';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import type { Song, EditedSong } from '../../types';

type SectionAction = 'keep' | 'cut' | 'mute';

interface Section {
  index: number;
  start: number;
  end: number;
  action: SectionAction;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

export function AudioEditor() {
  const songs = useLibraryStore(s => s.songs);
  const removeSongFromStore = useLibraryStore(s => s.removeSong);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [sectionActions, setSectionActions] = useState<Record<number, SectionAction>>({});
  const [editName, setEditName] = useState('');
  const [edits, setEdits] = useState<EditedSong[]>([]);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [playingEditId, setPlayingEditId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(0);

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const waveScrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const editAudioRef = useRef<HTMLAudioElement | null>(null);
  const addSplitRef = useRef<() => void>(() => {});

  // Derive sections from split points
  const sections = useMemo((): Section[] => {
    if (duration === 0) return [];
    const sorted = [...splitPoints].sort((a, b) => a - b);
    const points = [0, ...sorted, duration];
    return points.slice(0, -1).map((start, i) => ({
      index: i,
      start,
      end: points[i + 1],
      action: sectionActions[i] || 'keep',
    }));
  }, [splitPoints, duration, sectionActions]);

  const hasModifiedSections = sections.some(s => s.action !== 'keep');
  const canMuteVocals = selectedSong?.stems_status === 'ready';

  // Initialize WaveSurfer with MediaElement backend for reliable playback
  useEffect(() => {
    if (!waveContainerRef.current) return;

    const timelinePlugin = TimelinePlugin.create({
      timeInterval: 5,
      primaryLabelInterval: 10,
      style: { fontSize: '10px', color: '#64748b' },
    });

    const zoomPlugin = ZoomPlugin.create({
      scale: 0.2,
      maxZoom: 200,
    });

    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: '#4f46e540',
      progressColor: '#6366f1',
      cursorColor: '#e2e8f0',
      cursorWidth: 2,
      height: 110,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      hideScrollbar: false,
      autoScroll: true,
      autoCenter: true,
      minPxPerSec: 1,
      media: document.createElement('audio'),
      plugins: [timelinePlugin, zoomPlugin],
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('timeupdate', (t: number) => setCurrentTime(t));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsLoading(false);
    });
    ws.on('error', () => setIsLoading(false));
    ws.on('zoom', (minPxPerSec: number) => setZoomLevel(minPxPerSec));

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, []);

  // Keep addSplit ref up to date
  const addSplit = useCallback(() => {
    if (duration === 0) return;
    const t = currentTime;
    if (t < 0.2 || t > duration - 0.2) return;
    if (splitPoints.some(p => Math.abs(p - t) < 0.3)) return;
    setSplitPoints(prev => [...prev, t].sort((a, b) => a - b));
  }, [currentTime, duration, splitPoints]);

  addSplitRef.current = addSplit;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        wsRef.current?.playPause();
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addSplitRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load song into waveform
  useEffect(() => {
    if (!wsRef.current || !selectedSong || selectedSong.id === loadedSongId.current) return;
    loadedSongId.current = selectedSong.id;
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setZoomLevel(0);
    setSplitPoints([]);
    setSectionActions({});

    if (editAudioRef.current) {
      editAudioRef.current.pause();
      editAudioRef.current = null;
      setPlayingEditId(null);
    }

    wsRef.current.load(api.streamUrl(selectedSong.id));
    setEditName(`${selectedSong.title} - edited`);
    loadEdits(selectedSong.id);
  }, [selectedSong]);

  // Cleanup edit audio on unmount
  useEffect(() => {
    return () => {
      if (editAudioRef.current) {
        editAudioRef.current.pause();
        editAudioRef.current = null;
      }
    };
  }, []);

  const loadEdits = async (songId: number) => {
    try {
      setEdits(await api.getEdits(songId));
    } catch {
      setEdits([]);
    }
  };

  const togglePlayback = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  const seekTo = useCallback((time: number) => {
    if (!wsRef.current || duration === 0) return;
    wsRef.current.seekTo(time / duration);
  }, [duration]);

  const removeSplit = useCallback((pointIndex: number) => {
    setSplitPoints(prev => prev.filter((_, i) => i !== pointIndex));
    setSectionActions({});
  }, []);

  const clearSplits = useCallback(() => {
    setSplitPoints([]);
    setSectionActions({});
  }, []);

  const setSectionAction = useCallback((idx: number, action: SectionAction) => {
    setSectionActions(prev => {
      const next = { ...prev };
      if (action === 'keep') delete next[idx];
      else next[idx] = action;
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!selectedSong || !editName.trim() || !hasModifiedSections) return;
    setSaving(true);
    try {
      const cutSections = sections.filter(s => s.action === 'cut');
      const muteSections = sections.filter(s => s.action === 'mute');
      const keepSections = sections.filter(s => s.action === 'keep');

      // If one keep section + only cuts → use trim (more efficient)
      if (keepSections.length === 1 && muteSections.length === 0 && cutSections.length > 0) {
        await api.createEdit({
          song_id: selectedSong.id,
          name: editName.trim(),
          edit_type: 'trim',
          params: { start_seconds: keepSections[0].start, end_seconds: keepSections[0].end },
        });
      } else {
        if (cutSections.length > 0) {
          await api.createEdit({
            song_id: selectedSong.id,
            name: editName.trim() + (muteSections.length > 0 ? ' (cut)' : ''),
            edit_type: 'cut_section',
            params: { sections: cutSections.map(s => ({ start: s.start, end: s.end })) },
          });
        }
        if (muteSections.length > 0) {
          await api.createEdit({
            song_id: selectedSong.id,
            name: editName.trim() + (cutSections.length > 0 ? ' (vocal mute)' : ''),
            edit_type: 'vocal_mute_section',
            params: { sections: muteSections.map(s => ({ start: s.start, end: s.end })) },
          });
        }
      }
      loadEdits(selectedSong.id);
      clearSplits();
    } catch (e: any) {
      alert(e.message || 'Failed to save edit');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEdit = async (editId: number) => {
    if (playingEditId === editId) {
      editAudioRef.current?.pause();
      editAudioRef.current = null;
      setPlayingEditId(null);
    }
    await api.deleteEdit(editId);
    if (selectedSong) loadEdits(selectedSong.id);
  };

  const handlePlayEdit = (editId: number) => {
    if (editAudioRef.current) {
      editAudioRef.current.pause();
      editAudioRef.current = null;
    }
    if (playingEditId === editId) {
      setPlayingEditId(null);
      return;
    }
    const audio = new Audio(api.editStreamUrl(editId));
    audio.play();
    audio.onended = () => { setPlayingEditId(null); editAudioRef.current = null; };
    editAudioRef.current = audio;
    setPlayingEditId(editId);
  };

  const handleDeleteSong = async (songId: number) => {
    try {
      await api.deleteSong(songId);
      removeSongFromStore(songId);
      if (selectedSong?.id === songId) {
        wsRef.current?.pause();
        setSelectedSong(null);
        loadedSongId.current = null;
        setSplitPoints([]);
        setSectionActions({});
        setEdits([]);
      }
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e.message || 'Failed to delete song');
    }
  };

  const filteredSongs = searchQuery
    ? songs.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : songs;

  return (
    <div className="flex h-full bg-bg-secondary">
      {/* Song sidebar */}
      <div className="w-56 border-r border-border flex flex-col flex-shrink-0">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Songs</span>
          <div className="mt-1.5 relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-bg-primary border border-border/60 rounded-md pl-7 pr-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
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
                className="w-full text-left px-3 py-2 pr-8"
              >
                <div className="text-xs text-text-primary truncate font-medium">{song.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-text-muted truncate">{song.artist}</span>
                  <span className="text-[10px] text-text-muted/60 font-mono ml-auto">{formatTime(song.duration_seconds)}</span>
                </div>
              </button>
              {deleteConfirm === song.id ? (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
                  <button
                    onClick={() => handleDeleteSong(song.id)}
                    className="text-[9px] bg-danger text-white px-1.5 py-0.5 rounded font-bold hover:bg-danger/80"
                  >
                    Si
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-[9px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded hover:bg-bg-hover"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={api.downloadUrl(song.id)}
                    className="text-text-muted hover:text-accent p-1"
                    title="Descargar a PC"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setDeleteConfirm(song.id)}
                    className="text-text-muted hover:text-danger p-1"
                    title="Eliminar cancion"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredSongs.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-text-muted">No songs found</div>
          )}
        </div>
      </div>

      {/* Main editor area */}
      {selectedSong ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Song info bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary truncate">{selectedSong.title}</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted">{selectedSong.artist}</span>
                <span className="text-[10px] text-text-muted/50">·</span>
                <span className="text-[10px] text-text-muted font-mono">{formatTime(selectedSong.duration_seconds)}</span>
                {selectedSong.bpm && (
                  <>
                    <span className="text-[10px] text-text-muted/50">·</span>
                    <span className="text-[10px] text-text-muted font-mono">{selectedSong.bpm} BPM</span>
                  </>
                )}
                {canMuteVocals && (
                  <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded font-bold ml-1">STEMS READY</span>
                )}
                {selectedSong.stems_status === 'processing' && (
                  <span className="text-[9px] bg-warning/15 text-warning px-1.5 py-0.5 rounded font-bold ml-1">PROCESSING STEMS...</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setDeleteConfirm(selectedSong.id)}
              className="text-text-muted hover:text-danger transition-colors p-1.5 rounded hover:bg-danger/10"
              title="Eliminar cancion"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Delete confirmation banner */}
          {deleteConfirm === selectedSong.id && (
            <div className="px-4 py-2 bg-danger/10 border-b border-danger/20 flex items-center gap-3">
              <span className="text-xs text-danger font-medium">Eliminar "{selectedSong.title}" permanentemente?</span>
              <div className="flex-1" />
              <Button size="sm" variant="danger" onClick={() => handleDeleteSong(selectedSong.id)}>Eliminar</Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            </div>
          )}

          {/* Waveform with overlays */}
          <div className="px-4 pt-3 pb-1">
            <div ref={waveScrollRef} className="relative bg-bg-primary rounded-lg border border-border/50 overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Cargando forma de onda...
                  </div>
                </div>
              )}
              <div ref={waveContainerRef} className="w-full" />

              {/* Section color overlays + split markers */}
              {duration > 0 && (
                <div className="absolute top-0 pointer-events-none" style={{ height: '110px', left: 0, right: 0 }}>
                  {sections.map(section => section.action !== 'keep' && (
                    <div
                      key={`s-${section.index}`}
                      className="absolute top-0 bottom-0 transition-colors"
                      style={{
                        left: `${(section.start / duration) * 100}%`,
                        width: `${((section.end - section.start) / duration) * 100}%`,
                        backgroundColor: section.action === 'cut'
                          ? 'rgba(239, 68, 68, 0.18)'
                          : 'rgba(245, 158, 11, 0.18)',
                      }}
                    />
                  ))}
                  {splitPoints.map((point, i) => (
                    <div
                      key={`m-${i}`}
                      className="absolute top-0 bottom-0 w-0.5"
                      style={{
                        left: `${(point / duration) * 100}%`,
                        background: 'rgba(255,255,255,0.6)',
                      }}
                    >
                      <div
                        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white/80 bg-bg-primary"
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        title={`Split @ ${formatTime(point)} — click to remove`}
                        onClick={() => removeSplit(i)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Zoom slider */}
            {duration > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={zoomLevel}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setZoomLevel(v);
                    wsRef.current?.zoom(v);
                  }}
                  className="flex-1 h-1 accent-accent"
                />
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6M11 8v6" />
                </svg>
                <span className="text-[10px] text-text-muted font-mono min-w-[32px] text-right">{zoomLevel}px</span>
              </div>
            )}
          </div>

          {/* Section overview bar */}
          {splitPoints.length > 0 && duration > 0 && (
            <div className="px-4 pb-1">
              <div className="flex rounded-md overflow-hidden h-3 border border-border/30">
                {sections.map(section => (
                  <button
                    key={section.index}
                    onClick={() => seekTo(section.start)}
                    className={`relative transition-colors cursor-pointer hover:brightness-125 ${
                      section.action === 'keep' ? 'bg-success/25' :
                      section.action === 'cut' ? 'bg-danger/35' : 'bg-warning/35'
                    }`}
                    style={{ width: `${((section.end - section.start) / duration) * 100}%` }}
                    title={`${formatTime(section.start)} - ${formatTime(section.end)}: ${
                      section.action === 'keep' ? 'Mantener' : section.action === 'cut' ? 'Cortar' : 'Mute Vocal'
                    }`}
                  >
                    <div className="absolute right-0 top-0 bottom-0 w-px bg-border/60" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transport controls */}
          <div className="flex items-center gap-2 px-4 py-2">
            <button
              onClick={togglePlayback}
              disabled={isLoading || duration === 0}
              className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>
            <span className="text-xs font-mono text-text-secondary tabular-nums min-w-[100px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="w-px h-5 bg-border/50 mx-1" />

            {/* Split button */}
            <button
              onClick={addSplit}
              disabled={isLoading || duration === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-primary border border-border/60 rounded-lg text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-accent/40 disabled:opacity-40 transition-all group"
              title="Dividir en la posicion actual (S)"
            >
              <svg className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
              Dividir
              <kbd className="text-[9px] text-text-muted bg-bg-tertiary px-1 py-0.5 rounded ml-0.5 font-mono">S</kbd>
            </button>

            <div className="flex-1" />

            {splitPoints.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearSplits}>
                Limpiar todo
              </Button>
            )}
          </div>

          {/* Sections list + Save + Saved edits */}
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            {/* Sections */}
            {sections.length > 1 && (
              <div className="mb-3">
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
                  Secciones ({sections.length})
                </div>
                <div className="space-y-1">
                  {sections.map(section => (
                    <div
                      key={section.index}
                      className={`flex items-center gap-2 bg-bg-primary border rounded-md px-2.5 py-1.5 transition-colors ${
                        section.action === 'keep' ? 'border-border/40' :
                        section.action === 'cut' ? 'border-danger/30' : 'border-warning/30'
                      }`}
                    >
                      <button
                        onClick={() => seekTo(section.start)}
                        className="text-[10px] font-mono text-accent hover:underline cursor-pointer flex-shrink-0"
                        title="Ir a esta seccion"
                      >
                        {formatTime(section.start)}
                      </button>
                      <span className="text-[10px] text-text-muted">→</span>
                      <span className="text-[10px] font-mono text-text-secondary flex-shrink-0">
                        {formatTime(section.end)}
                      </span>
                      <span className="text-[10px] text-text-muted/60 font-mono">
                        ({formatTime(section.end - section.start)})
                      </span>

                      <div className="flex-1" />

                      {/* Action buttons */}
                      <div className="flex bg-bg-secondary rounded-md p-0.5 gap-0.5">
                        <button
                          onClick={() => setSectionAction(section.index, 'keep')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            section.action === 'keep'
                              ? 'bg-success/20 text-success shadow-sm'
                              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                          }`}
                        >
                          Mantener
                        </button>
                        <button
                          onClick={() => setSectionAction(section.index, 'cut')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            section.action === 'cut'
                              ? 'bg-danger/20 text-danger shadow-sm'
                              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                          }`}
                        >
                          Cortar
                        </button>
                        <button
                          onClick={() => setSectionAction(section.index, 'mute')}
                          disabled={!canMuteVocals}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            section.action === 'mute'
                              ? 'bg-warning/20 text-warning shadow-sm'
                              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed'
                          }`}
                          title={canMuteVocals ? 'Silenciar vocales en esta seccion' : 'Los stems deben separarse primero'}
                        >
                          Mute Vocal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!canMuteVocals && sections.some(s => s.action === 'mute') && (
                  <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Separa los stems de la cancion para usar Mute Vocal
                  </p>
                )}
              </div>
            )}

            {/* Save form */}
            {hasModifiedSections && (
              <div className="bg-bg-primary border border-border/50 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre del edit"
                    className="flex-1 bg-bg-secondary border border-border/60 rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !editName.trim()}
                  >
                    {saving ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Guardando...
                      </span>
                    ) : 'Guardar Edit'}
                  </Button>
                </div>
                <p className="text-[10px] text-text-muted mt-1.5">
                  {sections.filter(s => s.action === 'cut').length > 0 && (
                    <span className="text-danger">{sections.filter(s => s.action === 'cut').length} seccion(es) se eliminaran. </span>
                  )}
                  {sections.filter(s => s.action === 'mute').length > 0 && (
                    <span className="text-warning">{sections.filter(s => s.action === 'mute').length} seccion(es) tendran vocales silenciadas.</span>
                  )}
                </p>
              </div>
            )}

            {/* Help text when no splits */}
            {splitPoints.length === 0 && !isLoading && duration > 0 && edits.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-text-muted">
                <svg className="w-10 h-10 mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
                <p className="text-xs font-medium">Divide la cancion en secciones</p>
                <p className="text-[10px] mt-1 text-text-muted/60">
                  Posiciona el cursor y presiona <strong className="text-text-secondary">Dividir</strong> o la tecla <kbd className="bg-bg-tertiary px-1 py-0.5 rounded font-mono text-text-secondary">S</kbd>
                </p>
                <p className="text-[10px] mt-0.5 text-text-muted/60">
                  Luego marca cada seccion como Mantener, Cortar, o Mute Vocal
                </p>
              </div>
            )}

            {/* Saved edits */}
            {edits.length > 0 && (
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
                  Edits Guardados ({edits.length})
                </div>
                <div className="space-y-1">
                  {edits.map(edit => (
                    <div
                      key={edit.id}
                      className="flex items-center gap-2 bg-bg-primary border border-border/40 rounded-md px-3 py-2 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-primary font-medium truncate">{edit.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            edit.edit_type === 'trim' ? 'bg-accent/15 text-accent'
                            : edit.edit_type === 'cut_section' ? 'bg-danger/15 text-danger'
                            : 'bg-warning/15 text-warning'
                          }`}>
                            {edit.edit_type === 'trim' ? 'trim' : edit.edit_type === 'cut_section' ? 'corte' : 'mute'}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono">{formatTime(edit.duration_seconds)}</span>
                      </div>
                      <button
                        onClick={() => handlePlayEdit(edit.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          playingEditId === edit.id
                            ? 'bg-accent text-white'
                            : 'bg-accent/10 hover:bg-accent/20 text-accent opacity-0 group-hover:opacity-100'
                        }`}
                        title={playingEditId === edit.id ? 'Detener' : 'Preview'}
                      >
                        {playingEditId === edit.id ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        ) : (
                          <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteEdit(edit.id)}
                        className="w-7 h-7 rounded-full bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Eliminar edit"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <p className="text-sm">Selecciona una cancion para editar</p>
        </div>
      )}
    </div>
  );
}
