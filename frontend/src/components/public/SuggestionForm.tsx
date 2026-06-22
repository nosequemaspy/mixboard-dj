import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/http';

interface SuggestionFormProps {
  sessionId: number;
  onSubmitted: () => void;
}

export function SuggestionForm({ sessionId, onSubmitted }: SuggestionFormProps) {
  const [mode, setMode] = useState<'youtube' | 'manual'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [ytThumb, setYtThumb] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const [submittedBy, setSubmittedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const fetchYoutubeInfo = async (url: string) => {
    setYtLoading(true);
    setYtTitle('');
    setYtThumb('');
    try {
      const data = await api.youtubeOembed(url);
      setYtTitle(data.title || '');
      setYtThumb(data.thumbnail_url || '');
    } catch {
      // ignore errors
    }
    setYtLoading(false);
  };

  const handleUrlChange = (url: string) => {
    setYoutubeUrl(url);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
      debounceRef.current = setTimeout(() => fetchYoutubeInfo(url), 600);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'youtube') {
        await api.createSuggestion(sessionId, {
          suggestion_type: 'youtube',
          youtube_url: youtubeUrl,
          youtube_title: ytTitle || undefined,
          youtube_thumbnail: ytThumb || undefined,
          submitted_by: submittedBy || 'anonymous',
        });
      } else {
        await api.createSuggestion(sessionId, {
          suggestion_type: 'manual',
          manual_title: manualTitle,
          manual_artist: manualArtist || undefined,
          submitted_by: submittedBy || 'anonymous',
        });
      }
      setYoutubeUrl('');
      setYtTitle('');
      setYtThumb('');
      setManualTitle('');
      setManualArtist('');
      setSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(false), 3000);
      onSubmitted();
    } catch {
      // ignore
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Suggest a Song</h3>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode('youtube')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            mode === 'youtube' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
          }`}
        >
          YouTube Link
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            mode === 'manual' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
          }`}
        >
          Song Name
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {mode === 'youtube' ? (
          <>
            <input
              value={youtubeUrl}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="Paste YouTube URL..."
              className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            {ytLoading && <span className="text-xs text-text-muted">Loading preview...</span>}
            {ytThumb && (
              <div className="flex items-center gap-3 p-2 bg-bg-tertiary rounded-md">
                <img src={ytThumb} alt="" className="w-20 h-15 rounded object-cover" />
                <span className="text-sm text-text-primary flex-1 truncate">{ytTitle}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <input
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="Song title"
              className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <input
              value={manualArtist}
              onChange={e => setManualArtist(e.target.value)}
              placeholder="Artist (optional)"
              className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </>
        )}

        <input
          value={submittedBy}
          onChange={e => setSubmittedBy(e.target.value)}
          placeholder="Your name (optional)"
          className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={submitting || (mode === 'youtube' ? !youtubeUrl : !manualTitle)}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          {submitting ? 'Sending...' : 'Send Suggestion'}
        </button>

        {success && (
          <p className="text-xs text-success text-center">Suggestion sent!</p>
        )}
      </form>
    </div>
  );
}
