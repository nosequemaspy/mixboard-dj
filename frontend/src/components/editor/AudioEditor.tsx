import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import type { Song, EditedSong } from '../../types';

type RegionAction = 'cut' | 'mute';

interface TrackedRegion {
  id: string;
  region: Region;
  action: RegionAction;
}

const COLORS = {
  cut: 'rgba(239, 68, 68, 0.25)',
  mute: 'rgba(245, 158, 11, 0.25)',
  cutSelected: 'rgba(239, 68, 68, 0.45)',
  muteSelected: 'rgba(245, 158, 11, 0.45)',
};

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
  const [editName, setEditName] = useState('');
  const [edits, setEdits] = useState<EditedSong[]>([]);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [playingEditId, setPlayingEditId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [regions, setRegions] = useState<TrackedRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const editAudioRef = useRef<HTMLAudioElement | null>(null);

  const canMuteVocals = selectedSong?.stems_status === 'ready';
  const hasRegions = regions.length > 0;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveContainerRef.current) return;

    const regionsPlugin = RegionsPlugin.create();

    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: '#4f46e540',
      progressColor: '#6366f1',
      cursorColor: '#e2e8f0',
      cursorWidth: 2,
      height: 120,
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
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('timeupdate', (t: number) => setCurrentTime(t));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
      // Enable drag selection (threshold=5 so clicks still seek)
      regionsPlugin.enableDragSelection({
        color: COLORS.cut,
        drag: true,
        resize: true,
      }, 5);
    });
    ws.on('error', (err: any) => {
      console.error('WaveSurfer error:', err);
      setIsLoading(false);
      setLoadError(typeof err === 'string' ? err : 'Error al cargar audio');
    });

    // Region events
    regionsPlugin.on('region-created', (region: Region) => {
      const id = region.id;
      setRegions(prev => [...prev, { id, region, action: 'cut' }]);
      setSelectedRegionId(id);
    });

    regionsPlugin.on('region-updated', (region: Region) => {
      setRegions(prev => prev.map(r =>
        r.id === region.id ? { ...r, region } : r
      ));
    });

    regionsPlugin.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation();
      setSelectedRegionId(region.id);
    });

    ws.on('click', () => {
      setSelectedRegionId(null);
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        wsRef.current?.playPause();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedRegionId) {
          e.preventDefault();
          removeRegion(selectedRegionId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId]);

  // Load song into waveform
  useEffect(() => {
    if (!wsRef.current || !selectedSong || selectedSong.id === loadedSongId.current) return;
    loadedSongId.current = selectedSong.id;
    setIsLoading(true);
    setLoadError(null);
    setCurrentTime(0);
    setDuration(0);
    setZoomLevel(1);
    setRegions([]);
    setSelectedRegionId(null);
    regionsRef.current?.clearRegions();

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

  const handleZoom = useCallback((newLevel: number) => {
    setZoomLevel(newLevel);
    wsRef.current?.zoom(newLevel);
  }, []);

  const setRegionAction = useCallback((regionId: string, action: RegionAction) => {
    setRegions(prev => prev.map(r => {
      if (r.id !== regionId) return r;
      const isSelected = regionId === selectedRegionId;
      r.region.setOptions({
        color: action === 'cut'
          ? (isSelected ? COLORS.cutSelected : COLORS.cut)
          : (isSelected ? COLORS.muteSelected : COLORS.mute),
      });
      return { ...r, action };
    }));
  }, [selectedRegionId]);

  const removeRegion = useCallback((regionId: string) => {
    setRegions(prev => {
      const found = prev.find(r => r.id === regionId);
      if (found) found.region.remove();
      return prev.filter(r => r.id !== regionId);
    });
    if (selectedRegionId === regionId) setSelectedRegionId(null);
  }, [selectedRegionId]);

  const clearAllRegions = useCallback(() => {
    regionsRef.current?.clearRegions();
    setRegions([]);
    setSelectedRegionId(null);
  }, []);

  // Update region visual when selection changes
  useEffect(() => {
    regions.forEach(r => {
      const isSelected = r.id === selectedRegionId;
      const color = r.action === 'cut'
        ? (isSelected ? COLORS.cutSelected : COLORS.cut)
        : (isSelected ? COLORS.muteSelected : COLORS.mute);
      r.region.setOptions({ color });
    });
  }, [selectedRegionId, regions]);

  const handleSave = async () => {
    if (!selectedSong || !editName.trim() || !hasRegions) return;
    setSaving(true);
    try {
      const cutRegions = regions.filter(r => r.action === 'cut');
      const muteRegions = regions.filter(r => r.action === 'mute');

      if (cutRegions.length > 0) {
        await api.createEdit({
          song_id: selectedSong.id,
          name: editName.trim() + (muteRegions.length > 0 ? ' (corte)' : ''),
          edit_type: 'cut_section',
          params: { sections: cutRegions.map(r => ({ start: r.region.start, end: r.region.end })) },
        });
      }
      if (muteRegions.length > 0) {
        await api.createEdit({
          song_id: selectedSong.id,
          name: editName.trim() + (cutRegions.length > 0 ? ' (vocal mute)' : ''),
          edit_type: 'vocal_mute_section',
          params: { sections: muteRegions.map(r => ({ start: r.region.start, end: r.region.end })) },
        });
      }
      loadEdits(selectedSong.id);
      clearAllRegions();
    } catch (e: any) {
      alert(e.message || 'Error al guardar');
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
        setRegions([]);
        setSelectedRegionId(null);
        setEdits([]);
      }
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e.message || 'Error al eliminar');
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
              placeholder="Buscar..."
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
                    title="Descargar"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setDeleteConfirm(song.id)}
                    className="text-text-muted hover:text-danger p-1"
                    title="Eliminar"
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
            <div className="px-3 py-6 text-center text-xs text-text-muted">No se encontraron canciones</div>
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
                  <span className="text-[9px] bg-warning/15 text-warning px-1.5 py-0.5 rounded font-bold ml-1 animate-pulse">PROCESANDO STEMS...</span>
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

          {/* Waveform timeline */}
          <div className="px-4 pt-3 pb-1">
            <div
              className="relative bg-bg-primary rounded-lg border border-border/50"
              style={{ overflowX: 'auto', overflowY: 'hidden' }}
              onWheel={e => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -10 : 10;
                  const newZoom = Math.max(1, Math.min(200, zoomLevel + delta));
                  handleZoom(newZoom);
                }
              }}
            >
              {isLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/80 backdrop-blur-sm gap-2">
                  <svg className="animate-spin w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="text-xs text-text-muted">Cargando audio...</span>
                </div>
              )}
              {loadError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/90 gap-2">
                  <span className="text-xs text-danger">{loadError}</span>
                  <button
                    onClick={() => {
                      if (wsRef.current && selectedSong) {
                        loadedSongId.current = null;
                        setSelectedSong({ ...selectedSong });
                      }
                    }}
                    className="text-[10px] text-accent hover:underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              <div ref={waveContainerRef} className="w-full" />
            </div>

            {/* Zoom slider */}
            {duration > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6" />
                </svg>
                <input
                  type="range"
                  min="1"
                  max="200"
                  step="1"
                  value={zoomLevel}
                  onChange={e => handleZoom(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent"
                />
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6M11 8v6" />
                </svg>
                <span className="text-[10px] text-text-muted font-mono min-w-[32px] text-right">{zoomLevel}x</span>
              </div>
            )}
          </div>

          {/* Transport + region actions */}
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

            {/* Hint */}
            {!hasRegions && duration > 0 && (
              <span className="text-[10px] text-text-muted">
                Arrastra sobre la forma de onda para seleccionar una zona · Ctrl+Scroll para zoom
              </span>
            )}

            <div className="flex-1" />

            {hasRegions && (
              <Button size="sm" variant="ghost" onClick={clearAllRegions}>
                Limpiar todo
              </Button>
            )}
          </div>

          {/* Regions list + Save + Saved edits */}
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            {/* Region list */}
            {hasRegions && (
              <div className="mb-3">
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
                  Selecciones ({regions.length})
                </div>
                <div className="space-y-1">
                  {regions.map(({ id, region, action }) => (
                    <div
                      key={id}
                      onClick={() => { setSelectedRegionId(id); seekTo(region.start); }}
                      className={`flex items-center gap-2 bg-bg-primary border rounded-md px-2.5 py-1.5 cursor-pointer transition-colors ${
                        selectedRegionId === id
                          ? action === 'cut' ? 'border-danger/60 bg-danger/5' : 'border-warning/60 bg-warning/5'
                          : 'border-border/40 hover:border-border'
                      }`}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); seekTo(region.start); }}
                        className="text-[10px] font-mono text-accent hover:underline cursor-pointer flex-shrink-0"
                      >
                        {formatTime(region.start)}
                      </button>
                      <span className="text-[10px] text-text-muted">{'\u2192'}</span>
                      <span className="text-[10px] font-mono text-text-secondary flex-shrink-0">
                        {formatTime(region.end)}
                      </span>
                      <span className="text-[10px] text-text-muted/60 font-mono">
                        ({formatTime(region.end - region.start)})
                      </span>

                      <div className="flex-1" />

                      {/* Action buttons */}
                      <div className="flex bg-bg-secondary rounded-md p-0.5 gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRegionAction(id, 'cut'); }}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            action === 'cut'
                              ? 'bg-danger/20 text-danger shadow-sm'
                              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                          }`}
                        >
                          Cortar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setRegionAction(id, 'mute'); }}
                          disabled={!canMuteVocals}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            action === 'mute'
                              ? 'bg-warning/20 text-warning shadow-sm'
                              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed'
                          }`}
                          title={canMuteVocals ? 'Reducir vocales en esta zona' : 'Primero separa los stems'}
                        >
                          Mute Vocal
                        </button>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRegion(id); }}
                        className="text-text-muted hover:text-danger p-0.5 transition-colors"
                        title="Eliminar seleccion"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {!canMuteVocals && regions.some(r => r.action === 'mute') && (
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
            {hasRegions && (
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
                  {regions.filter(r => r.action === 'cut').length > 0 && (
                    <span className="text-danger">{regions.filter(r => r.action === 'cut').length} zona(s) se cortaran. </span>
                  )}
                  {regions.filter(r => r.action === 'mute').length > 0 && (
                    <span className="text-warning">{regions.filter(r => r.action === 'mute').length} zona(s) tendran vocales reducidas.</span>
                  )}
                </p>
              </div>
            )}

            {/* Help text when no regions */}
            {!hasRegions && !isLoading && !loadError && duration > 0 && edits.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-text-muted">
                <svg className="w-10 h-10 mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18M15 3v18" />
                </svg>
                <p className="text-xs font-medium">Arrastra sobre la forma de onda</p>
                <p className="text-[10px] mt-1 text-text-muted/60">
                  Click y arrastra para seleccionar una zona, luego elige <strong className="text-danger">Cortar</strong> o <strong className="text-warning">Mute Vocal</strong>
                </p>
                <p className="text-[10px] mt-0.5 text-text-muted/60">
                  Ctrl + rueda del mouse para hacer zoom
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
                      <a
                        href={api.editStreamUrl(edit.id)}
                        download={`${edit.name}.mp3`}
                        className="w-7 h-7 rounded-full bg-success/10 hover:bg-success/20 text-success flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Descargar"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                      <button
                        onClick={() => handleDeleteEdit(edit.id)}
                        className="w-7 h-7 rounded-full bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Eliminar"
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
