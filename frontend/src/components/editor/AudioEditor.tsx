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
  const [separatingStems, setSeparatingStems] = useState(false);

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const editAudioRef = useRef<HTMLAudioElement | null>(null);

  const stemsStatus = selectedSong?.stems_status;
  const canMuteVocals = stemsStatus === 'ready';
  const hasRegions = regions.length > 0;

  // Initialize WaveSurfer
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

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('timeupdate', (t: number) => setCurrentTime(t));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
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

    regionsPlugin.on('region-created', (region: Region) => {
      setRegions(prev => [...prev, { id: region.id, region, action: 'cut' }]);
      setSelectedRegionId(region.id);
    });
    regionsPlugin.on('region-updated', (region: Region) => {
      setRegions(prev => prev.map(r => r.id === region.id ? { ...r, region } : r));
    });
    regionsPlugin.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation();
      setSelectedRegionId(region.id);
    });
    ws.on('click', () => setSelectedRegionId(null));

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
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedRegionId) {
        e.preventDefault();
        removeRegion(selectedRegionId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId]);

  // Load song — fetch as blob then pass to WaveSurfer
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
        if (!cancelled) {
          setLoadError(`Error: ${err.message}`);
          setIsLoading(false);
        }
      }
    })();

    setEditName(`${selectedSong.title} - edited`);
    loadEdits(selectedSong.id);
    return () => { cancelled = true; };
  }, [selectedSong]);

  useEffect(() => {
    return () => {
      if (editAudioRef.current) {
        editAudioRef.current.pause();
        editAudioRef.current = null;
      }
    };
  }, []);

  const loadEdits = async (songId: number) => {
    try { setEdits(await api.getEdits(songId)); } catch { setEdits([]); }
  };

  const handleZoom = useCallback((v: number) => {
    setZoomLevel(v);
    wsRef.current?.zoom(v);
  }, []);

  const seekTo = useCallback((time: number) => {
    if (!wsRef.current || duration === 0) return;
    wsRef.current.seekTo(time / duration);
  }, [duration]);

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

  useEffect(() => {
    regions.forEach(r => {
      const isSelected = r.id === selectedRegionId;
      const color = r.action === 'cut'
        ? (isSelected ? COLORS.cutSelected : COLORS.cut)
        : (isSelected ? COLORS.muteSelected : COLORS.mute);
      r.region.setOptions({ color });
    });
  }, [selectedRegionId, regions]);

  const handleSeparateStems = async () => {
    if (!selectedSong || separatingStems) return;
    setSeparatingStems(true);
    try {
      await api.separateStems(selectedSong.id);
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`${api.streamUrl(selectedSong.id).replace('/audio/stream/', '/songs/')}`)
            .catch(() => null);
          if (!res) return;
          // Re-fetch songs to get updated stems_status
          await useLibraryStore.getState().fetchSongs();
          const updated = useLibraryStore.getState().songs.find(s => s.id === selectedSong.id);
          if (updated && updated.stems_status === 'ready') {
            setSelectedSong(updated);
            setSeparatingStems(false);
            clearInterval(poll);
          } else if (updated && updated.stems_status === 'error') {
            setSeparatingStems(false);
            clearInterval(poll);
          }
        } catch { /* keep polling */ }
      }, 2000);
      // Safety timeout
      setTimeout(() => { clearInterval(poll); setSeparatingStems(false); }, 60000);
    } catch {
      setSeparatingStems(false);
    }
  };

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
    if (playingEditId === editId) { setPlayingEditId(null); return; }
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
                  <span className="text-[10px] text-text-muted/60 font-mono ml-auto">{formatTime(song.duration_seconds)}</span>
                </div>
              </button>
              <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setDeleteConfirm(song.id)}
                  className="text-text-muted hover:text-danger p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
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

      {/* Main editor */}
      {selectedSong ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar: song info + transport + zoom */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-bg-primary/50">
            {/* Play button */}
            <button
              onClick={() => wsRef.current?.playPause()}
              disabled={isLoading || duration === 0}
              className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isPlaying ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>

            {/* Time */}
            <span className="text-xs font-mono text-accent tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-text-muted">/</span>
            <span className="text-xs font-mono text-text-muted tabular-nums">
              {formatTime(duration)}
            </span>

            <div className="w-px h-5 bg-border/50" />

            {/* Song title */}
            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary font-medium truncate block">{selectedSong.title}</span>
            </div>

            {/* Stems status + separate button */}
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

            {/* Zoom */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="range"
                min="1"
                max="200"
                step="1"
                value={zoomLevel}
                onChange={e => handleZoom(Number(e.target.value))}
                className="w-24 h-1 accent-accent"
                disabled={duration === 0}
              />
              <span className="text-[9px] text-text-muted font-mono w-6 text-right">{zoomLevel}x</span>
            </div>
          </div>

          {/* Waveform — fills all available space */}
          <div
            className="flex-1 relative bg-bg-primary"
            style={{ overflowX: 'auto', overflowY: 'hidden' }}
            onWheel={e => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -10 : 10;
                handleZoom(Math.max(1, Math.min(200, zoomLevel + delta)));
              }
            }}
          >
            {isLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/90 gap-3">
                <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-sm text-text-muted">Cargando audio...</span>
              </div>
            )}
            {loadError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-primary/95 gap-2">
                <span className="text-sm text-danger">{loadError}</span>
                <button
                  onClick={() => {
                    loadedSongId.current = null;
                    setSelectedSong({ ...selectedSong });
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  Reintentar
                </button>
              </div>
            )}
            <div ref={waveContainerRef} className="w-full h-full" />
          </div>

          {/* Bottom panel: regions + save + edits */}
          {(hasRegions || edits.length > 0) && (
            <div className="border-t border-border bg-bg-secondary max-h-[35%] overflow-y-auto">
              {/* Regions */}
              {hasRegions && (
                <div className="px-4 pt-2 pb-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                      Selecciones ({regions.length})
                    </span>
                    <div className="flex-1" />
                    <button onClick={clearAllRegions} className="text-[10px] text-text-muted hover:text-danger">
                      Limpiar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {regions.map(({ id, region, action }) => (
                      <div
                        key={id}
                        onClick={() => { setSelectedRegionId(id); seekTo(region.start); }}
                        className={`flex items-center gap-1.5 border rounded px-2 py-1 cursor-pointer transition-colors text-[10px] ${
                          selectedRegionId === id
                            ? action === 'cut' ? 'border-danger/60 bg-danger/5' : 'border-warning/60 bg-warning/5'
                            : 'border-border/40 hover:border-border bg-bg-primary'
                        }`}
                      >
                        <span className="font-mono text-accent">{formatTime(region.start)}</span>
                        <span className="text-text-muted">{'\u2192'}</span>
                        <span className="font-mono text-text-secondary">{formatTime(region.end)}</span>
                        <span className="text-text-muted/50 font-mono">({formatTime(region.end - region.start)})</span>

                        <div className="flex gap-0.5 ml-1">
                          <button
                            onClick={e => { e.stopPropagation(); setRegionAction(id, 'cut'); }}
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              action === 'cut' ? 'bg-danger/20 text-danger' : 'text-text-muted hover:text-danger'
                            }`}
                          >
                            Cortar
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setRegionAction(id, 'mute'); }}
                            disabled={!canMuteVocals}
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              action === 'mute' ? 'bg-warning/20 text-warning' : 'text-text-muted hover:text-warning disabled:opacity-30'
                            }`}
                            title={canMuteVocals ? 'Reducir vocales' : 'Separa stems primero'}
                          >
                            Mute Vocal
                          </button>
                        </div>

                        <button
                          onClick={e => { e.stopPropagation(); removeRegion(id); }}
                          className="text-text-muted hover:text-danger ml-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Save */}
                  <div className="flex items-center gap-2 mt-2">
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
                  {!canMuteVocals && regions.some(r => r.action === 'mute') && (
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
                <div className="px-4 py-2 border-t border-border/30">
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
                        <span className="text-[10px] text-text-muted font-mono">{formatTime(edit.duration_seconds)}</span>
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

          {/* Instruction when no regions and waveform loaded */}
          {!hasRegions && !isLoading && !loadError && duration > 0 && edits.length === 0 && (
            <div className="border-t border-border bg-bg-secondary px-4 py-2 text-center">
              <span className="text-[11px] text-text-muted">
                Arrastra sobre la forma de onda para seleccionar una zona
                {' '}&middot;{' '}Ctrl + scroll para zoom
                {!canMuteVocals && <>{' '}&middot;{' '}<button onClick={handleSeparateStems} disabled={separatingStems} className="text-accent hover:underline">{separatingStems ? 'Separando...' : 'Separar stems para mute vocal'}</button></>}
              </span>
            </div>
          )}
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
