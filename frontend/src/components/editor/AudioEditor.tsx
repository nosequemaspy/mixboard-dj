import { useState, useEffect } from 'react';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import type { Song, EditedSong } from '../../types';

export function AudioEditor() {
  const songs = useLibraryStore(s => s.songs);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editType, setEditType] = useState<'trim' | 'cut_section' | 'vocal_mute_section'>('trim');
  const [editName, setEditName] = useState('');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [sections, setSections] = useState<{ start: number; end: number }[]>([]);
  const [sectionStart, setSectionStart] = useState(0);
  const [sectionEnd, setSectionEnd] = useState(0);
  const [edits, setEdits] = useState<EditedSong[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedSong) {
      setTrimEnd(selectedSong.duration_seconds);
      setEditName(`${selectedSong.title} - edited`);
      loadEdits(selectedSong.id);
    }
  }, [selectedSong]);

  const loadEdits = async (songId: number) => {
    const data = await api.getEdits(songId);
    setEdits(data);
  };

  const addSection = () => {
    if (sectionStart >= sectionEnd) return;
    setSections(prev => [...prev, { start: sectionStart, end: sectionEnd }]);
    setSectionStart(sectionEnd);
    setSectionEnd(selectedSong?.duration_seconds || 0);
  };

  const removeSection = (index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedSong || !editName.trim()) return;
    setSaving(true);
    try {
      let params: any = {};
      if (editType === 'trim') {
        params = { start_seconds: trimStart, end_seconds: trimEnd };
      } else {
        params = { sections };
      }
      await api.createEdit({
        song_id: selectedSong.id,
        name: editName.trim(),
        edit_type: editType,
        params,
      });
      loadEdits(selectedSong.id);
      setSections([]);
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full bg-bg-secondary">
      {/* Song selector */}
      <div className="w-56 border-r border-border flex flex-col">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Select Song</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {songs.map(song => (
            <button
              key={song.id}
              onClick={() => setSelectedSong(song)}
              className={`w-full text-left px-3 py-2 border-b border-border/30 transition-colors ${
                selectedSong?.id === song.id ? 'bg-accent/10' : 'hover:bg-bg-hover'
              }`}
            >
              <div className="text-sm text-text-primary truncate">{song.title}</div>
              <div className="text-xs text-text-muted">{formatTime(song.duration_seconds)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      {selectedSong ? (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-xl mx-auto space-y-5">
            <h3 className="text-lg font-semibold text-text-primary">
              Editing: {selectedSong.title}
            </h3>

            {/* Edit type selector */}
            <div className="flex gap-2">
              {(['trim', 'cut_section', 'vocal_mute_section'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => { setEditType(type); setSections([]); }}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    editType === type ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {type === 'trim' ? 'Trim' : type === 'cut_section' ? 'Cut Sections' : 'Vocal Mute Sections'}
                </button>
              ))}
            </div>

            {/* Edit name */}
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Edit name"
              className="w-full bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />

            {/* Trim controls */}
            {editType === 'trim' && (
              <div className="bg-bg-primary rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-text-secondary w-12">Start:</label>
                  <input
                    type="range" min="0" max={selectedSong.duration_seconds} step="0.1"
                    value={trimStart} onChange={e => setTrimStart(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-text-muted w-12">{formatTime(trimStart)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-text-secondary w-12">End:</label>
                  <input
                    type="range" min="0" max={selectedSong.duration_seconds} step="0.1"
                    value={trimEnd} onChange={e => setTrimEnd(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-text-muted w-12">{formatTime(trimEnd)}</span>
                </div>
                <p className="text-xs text-text-muted">
                  Duration: {formatTime(Math.max(0, trimEnd - trimStart))}
                </p>
              </div>
            )}

            {/* Section controls (cut or vocal mute) */}
            {(editType === 'cut_section' || editType === 'vocal_mute_section') && (
              <div className="bg-bg-primary rounded-lg border border-border p-4 space-y-3">
                {editType === 'vocal_mute_section' && selectedSong.stems_status !== 'ready' && (
                  <p className="text-sm text-warning">Stems must be separated first to use vocal mute editing.</p>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1">
                    <label className="text-xs text-text-secondary">From:</label>
                    <input
                      type="number" min="0" max={selectedSong.duration_seconds} step="0.1"
                      value={sectionStart} onChange={e => setSectionStart(parseFloat(e.target.value))}
                      className="w-20 bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <label className="text-xs text-text-secondary">To:</label>
                    <input
                      type="number" min="0" max={selectedSong.duration_seconds} step="0.1"
                      value={sectionEnd} onChange={e => setSectionEnd(parseFloat(e.target.value))}
                      className="w-20 bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary"
                    />
                  </div>
                  <Button size="sm" onClick={addSection}>Add</Button>
                </div>
                {sections.length > 0 && (
                  <div className="space-y-1">
                    {sections.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-text-secondary">
                          {formatTime(s.start)} - {formatTime(s.end)}
                        </span>
                        <button onClick={() => removeSection(i)} className="text-danger hover:text-danger/80">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Edit'}
            </Button>

            {/* Existing edits */}
            {edits.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-text-secondary mb-2">Saved Edits</h4>
                <div className="space-y-2">
                  {edits.map(edit => (
                    <div key={edit.id} className="flex items-center gap-3 bg-bg-primary border border-border rounded-lg px-3 py-2">
                      <div className="flex-1">
                        <span className="text-sm text-text-primary">{edit.name}</span>
                        <span className="text-xs text-text-muted ml-2">({edit.edit_type})</span>
                      </div>
                      <span className="text-xs text-text-muted font-mono">{formatTime(edit.duration_seconds)}</span>
                      <button onClick={() => handleDeleteEdit(edit.id)} className="text-danger text-xs hover:text-danger/80">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          Select a song to edit
        </div>
      )}
    </div>
  );
}
