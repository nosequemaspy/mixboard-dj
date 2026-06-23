import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import type { Song, EditedSong } from '../../types';

type EditMode = 'trim' | 'cut_section' | 'vocal_mute_section';

interface RegionData {
  id: string;
  start: number;
  end: number;
}

const EDIT_MODES: { value: EditMode; label: string; desc: string; icon: string }[] = [
  {
    value: 'trim',
    label: 'Trim',
    desc: 'Keep only the selected range',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    value: 'cut_section',
    label: 'Cut',
    desc: 'Remove selected sections',
    icon: 'M14.121 14.121L19 19m-7-7l7-7m-7 7l-7 7m7-7l-7-7',
  },
  {
    value: 'vocal_mute_section',
    label: 'Vocal Mute',
    desc: 'Silence vocals in sections',
    icon: 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2',
  },
];

const REGION_COLORS: Record<EditMode, string> = {
  trim: 'rgba(99, 102, 241, 0.25)',
  cut_section: 'rgba(239, 68, 68, 0.25)',
  vocal_mute_section: 'rgba(245, 158, 11, 0.25)',
};

const REGION_BORDER_COLORS: Record<EditMode, string> = {
  trim: '#6366f1',
  cut_section: '#ef4444',
  vocal_mute_section: '#f59e0b',
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

export function AudioEditor() {
  const songs = useLibraryStore(s => s.songs);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('trim');
  const [editName, setEditName] = useState('');
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [edits, setEdits] = useState<EditedSong[]>([]);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const disableDragRef = useRef<(() => void) | null>(null);
  const editModeRef = useRef<EditMode>(editMode);
  editModeRef.current = editMode;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveContainerRef.current) return;

    const regionsPlugin = RegionsPlugin.create();
    const timelinePlugin = TimelinePlugin.create({
      timeInterval: 5,
      primaryLabelInterval: 10,
      style: {
        fontSize: '10px',
        color: '#64748b',
      },
    });

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
      hideScrollbar: true,
      plugins: [regionsPlugin, timelinePlugin],
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('timeupdate', (t: number) => setCurrentTime(t));
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsLoading(false);
    });

    regionsPlugin.on('region-updated', (region) => {
      setRegions(prev =>
        prev.map(r => r.id === region.id ? { id: region.id, start: region.start, end: region.end } : r)
      );
    });

    regionsPlugin.on('region-created', (region) => {
      // In trim mode, only allow one region - remove any previous ones
      if (editModeRef.current === 'trim') {
        const existing = regionsPlugin.getRegions().filter(r => r.id !== region.id);
        existing.forEach(r => r.remove());
        setRegions([{ id: region.id, start: region.start, end: region.end }]);
      } else {
        setRegions(prev => {
          if (prev.some(r => r.id === region.id)) return prev;
          return [...prev, { id: region.id, start: region.start, end: region.end }];
        });
      }
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;

    return () => {
      if (disableDragRef.current) disableDragRef.current();
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, []);

  // Space bar to toggle playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        wsRef.current?.playPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update drag selection when edit mode changes
  useEffect(() => {
    if (!regionsRef.current) return;
    if (disableDragRef.current) {
      disableDragRef.current();
      disableDragRef.current = null;
    }
    disableDragRef.current = regionsRef.current.enableDragSelection({
      color: REGION_COLORS[editMode],
    });
  }, [editMode]);

  // Load song into waveform
  useEffect(() => {
    if (!wsRef.current || !selectedSong || selectedSong.id === loadedSongId.current) return;
    loadedSongId.current = selectedSong.id;
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    // Clear regions
    if (regionsRef.current) regionsRef.current.clearRegions();
    setRegions([]);

    wsRef.current.load(api.streamUrl(selectedSong.id));
    setEditName(`${selectedSong.title} - edited`);
    loadEdits(selectedSong.id);
  }, [selectedSong]);

  const loadEdits = async (songId: number) => {
    try {
      const data = await api.getEdits(songId);
      setEdits(data);
    } catch {
      setEdits([]);
    }
  };

  const togglePlayback = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.playPause();
  }, []);

  const removeRegion = useCallback((regionId: string) => {
    if (!regionsRef.current) return;
    const allRegions = regionsRef.current.getRegions();
    const region = allRegions.find(r => r.id === regionId);
    if (region) region.remove();
    setRegions(prev => prev.filter(r => r.id !== regionId));
  }, []);

  const clearAllRegions = useCallback(() => {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
    setRegions([]);
  }, []);

  const handleSave = async () => {
    if (!selectedSong || !editName.trim() || regions.length === 0) return;
    setSaving(true);
    try {
      let params: Record<string, unknown> = {};
      if (editMode === 'trim') {
        const r = regions[0];
        params = { start_seconds: r.start, end_seconds: r.end };
      } else {
        params = { sections: regions.map(r => ({ start: r.start, end: r.end })) };
      }
      await api.createEdit({
        song_id: selectedSong.id,
        name: editName.trim(),
        edit_type: editMode,
        params,
      });
      loadEdits(selectedSong.id);
      clearAllRegions();
    } catch (e: any) {
      alert(e.message || 'Edit failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEdit = async (editId: number) => {
    await api.deleteEdit(editId);
    if (selectedSong) loadEdits(selectedSong.id);
  };

  const handlePlayEdit = (editId: number) => {
    const audio = new Audio(api.editStreamUrl(editId));
    audio.play();
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
      <div className="w-60 border-r border-border flex flex-col flex-shrink-0">
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Songs</span>
          <div className="mt-1.5 relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search songs..."
              className="w-full bg-bg-primary border border-border/60 rounded-md pl-7 pr-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSongs.map(song => (
            <button
              key={song.id}
              onClick={() => setSelectedSong(song)}
              className={`w-full text-left px-3 py-2 border-b border-border/20 transition-colors group ${
                selectedSong?.id === song.id
                  ? 'bg-accent/10 border-l-2 border-l-accent'
                  : 'hover:bg-bg-hover border-l-2 border-l-transparent'
              }`}
            >
              <div className="text-xs text-text-primary truncate font-medium">{song.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-muted truncate">{song.artist}</span>
                <span className="text-[10px] text-text-muted/60 font-mono ml-auto flex-shrink-0">{formatTime(song.duration_seconds)}</span>
              </div>
            </button>
          ))}
          {filteredSongs.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-text-muted">No songs found</div>
          )}
        </div>
      </div>

      {/* Main editor area */}
      {selectedSong ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-bg-secondary">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary truncate">{selectedSong.title}</h3>
              <span className="text-[10px] text-text-muted">{selectedSong.artist} · {formatTime(selectedSong.duration_seconds)}</span>
            </div>

            {/* Edit mode selector */}
            <div className="flex bg-bg-primary rounded-lg border border-border/60 p-0.5">
              {EDIT_MODES.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => { setEditMode(mode.value); clearAllRegions(); }}
                  title={mode.desc}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all ${
                    editMode === mode.value
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d={mode.icon} />
                  </svg>
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode description bar */}
          <div className="px-4 py-1.5 border-b border-border/40 bg-bg-primary/50">
            <p className="text-[10px] text-text-muted">
              {editMode === 'trim' && (
                <>
                  <span className="text-accent font-semibold">TRIM</span> — Drag on the waveform to select the range you want to keep. Only one region allowed.
                </>
              )}
              {editMode === 'cut_section' && (
                <>
                  <span className="text-danger font-semibold">CUT</span> — Drag to mark sections to remove. Add multiple regions.
                </>
              )}
              {editMode === 'vocal_mute_section' && (
                <>
                  <span className="text-warning font-semibold">VOCAL MUTE</span> — Drag to mark sections where vocals will be silenced. Requires stems separation.
                  {selectedSong.stems_status !== 'ready' && (
                    <span className="ml-2 text-warning font-bold">⚠ Stems not ready</span>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Waveform */}
          <div className="px-4 pt-4 pb-2">
            <div className="relative bg-bg-primary rounded-lg border border-border/50 overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Loading waveform...
                  </div>
                </div>
              )}
              <div ref={waveContainerRef} className="w-full" />
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-3 px-4 pb-3">
            <button
              onClick={togglePlayback}
              className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors"
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>
            <span className="text-xs font-mono text-text-secondary tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={clearAllRegions} disabled={regions.length === 0}>
              Clear All
            </Button>
          </div>

          {/* Regions list + Save */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Regions table */}
            {regions.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
                  {editMode === 'trim' ? 'Trim Range' : 'Sections'} ({regions.length})
                </div>
                <div className="space-y-1">
                  {regions.map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 bg-bg-primary border border-border/40 rounded-md px-3 py-1.5 group"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: REGION_BORDER_COLORS[editMode] }}
                      />
                      <span className="text-xs text-text-secondary font-mono">
                        {editMode === 'trim' ? 'Keep' : `Section ${i + 1}`}
                      </span>
                      <span className="text-xs font-mono text-text-primary">
                        {formatTime(r.start)} → {formatTime(r.end)}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono ml-1">
                        ({formatTime(r.end - r.start)})
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => removeRegion(r.id)}
                        className="text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save form */}
            {regions.length > 0 && (
              <div className="bg-bg-primary border border-border/50 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Edit name"
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
                        Saving...
                      </span>
                    ) : (
                      'Save Edit'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Saved edits */}
            {edits.length > 0 && (
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
                  Saved Edits ({edits.length})
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
                            edit.edit_type === 'trim'
                              ? 'bg-accent/15 text-accent'
                              : edit.edit_type === 'cut_section'
                              ? 'bg-danger/15 text-danger'
                              : 'bg-warning/15 text-warning'
                          }`}>
                            {edit.edit_type === 'trim' ? 'trim' : edit.edit_type === 'cut_section' ? 'cut' : 'mute'}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono">{formatTime(edit.duration_seconds)}</span>
                      </div>
                      <button
                        onClick={() => handlePlayEdit(edit.id)}
                        className="w-6 h-6 rounded-full bg-accent/10 hover:bg-accent/20 text-accent flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                        title="Preview"
                      >
                        <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                      </button>
                      <button
                        onClick={() => handleDeleteEdit(edit.id)}
                        className="w-6 h-6 rounded-full bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete"
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

            {/* Empty state */}
            {regions.length === 0 && edits.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-text-muted">
                <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm">Drag on the waveform to create a region</p>
                <p className="text-xs mt-1 text-text-muted/60">Regions can be dragged and resized</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <p className="text-sm">Select a song to start editing</p>
        </div>
      )}
    </div>
  );
}
