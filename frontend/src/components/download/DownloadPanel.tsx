import { useState, useRef } from 'react';
import { api } from '../../api/http';
import { useLibraryStore } from '../../store/libraryStore';
import { useMixerStore } from '../../store/mixerStore';
import { Button } from '../shared/Button';
import { ProgressBar } from '../shared/ProgressBar';
import type { DownloadPreview } from '../../types';

export function DownloadPanel() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<DownloadPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchSongs = useLibraryStore(s => s.fetchSongs);
  const tasks = useMixerStore(s => s.tasks);
  const updateTask = useMixerStore(s => s.updateTask);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTasks = Array.from(tasks.values()).filter(
    t => t.status === 'running' || t.status === 'pending'
  );

  const handlePreview = async () => {
    if (!url.trim()) return;
    setError('');
    setLoading(true);
    try {
      const data = await api.previewDownload(url.trim());
      setPreview(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch preview');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) return;
    setError('');
    const songTitle = preview?.title;
    try {
      const result = await api.startDownload(url.trim(), preview?.title, preview?.artist);
      if (result?.task_id) {
        // Only set initial state if WS events haven't arrived yet (race condition fix)
        const existing = useMixerStore.getState().tasks.get(result.task_id);
        if (!existing) {
          updateTask({
            task_id: result.task_id,
            progress: 0,
            status: 'pending',
            title: songTitle,
          });
        } else if (!existing.title && songTitle) {
          updateTask({ ...existing, title: songTitle });
        }
      }
      setUrl('');
      setPreview(null);
    } catch (e: any) {
      setError(e.message || 'Failed to start download');
    }
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await api.uploadSong(file);
    }
    fetchSongs();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full bg-bg-secondary p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* YouTube Download */}
        <div className="bg-bg-primary rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Download from YouTube</h3>
          <div className="flex gap-2 mb-3">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePreview()}
              placeholder="Paste YouTube URL..."
              className="flex-1 bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            <Button variant="secondary" onClick={handlePreview} disabled={loading || !url.trim()}>
              {loading ? 'Loading...' : 'Preview'}
            </Button>
          </div>

          {error && <p className="text-sm text-danger mb-3">{error}</p>}

          {preview && (
            <div className="bg-bg-secondary rounded-lg border border-border p-4 mb-3">
              <div className="flex gap-4">
                {preview.thumbnail_url && (
                  <img src={preview.thumbnail_url} alt="" className="w-32 h-20 object-cover rounded" />
                )}
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-text-primary">{preview.title}</h4>
                  <p className="text-xs text-text-muted">{preview.artist}</p>
                  <p className="text-xs text-text-muted mt-1">{formatDuration(preview.duration_seconds)}</p>
                </div>
              </div>
              <Button variant="primary" className="w-full mt-3" onClick={handleDownload}>
                Download as MP3 (320kbps)
              </Button>
            </div>
          )}
        </div>

        {/* Import Local */}
        <div className="bg-bg-primary rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Import Local Files</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={handleImportFiles}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg py-8 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors"
          >
            <p className="text-sm text-text-secondary">Click to browse or drag files here</p>
            <p className="text-xs text-text-muted mt-1">MP3, WAV, FLAC, OGG, M4A supported</p>
          </div>
        </div>

        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <div className="bg-bg-primary rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Active Tasks</h3>
            <div className="space-y-3">
              {activeTasks.map(task => (
                <div key={task.task_id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-primary font-medium truncate mr-2">
                      {task.title || 'Unknown'}
                    </span>
                    <span className="text-xs text-text-muted flex-shrink-0">
                      {task.status === 'running' ? `Downloading... ${Math.round(task.progress * 100)}%` : 'In queue...'}
                    </span>
                  </div>
                  <ProgressBar value={task.progress} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
