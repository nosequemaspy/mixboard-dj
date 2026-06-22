import type { Suggestion } from '../../types';
import { api } from '../../api/http';

interface SuggestionReviewProps {
  suggestions: Suggestion[];
  sessionId: number;
  password?: string;
  onUpdate: () => void;
}

export function SuggestionReview({ suggestions, sessionId, password, onUpdate }: SuggestionReviewProps) {
  const pending = suggestions.filter(s => s.status === 'pending');
  const reviewed = suggestions.filter(s => s.status !== 'pending');

  const handleReview = async (suggestionId: number, status: string) => {
    await api.updateSuggestion(sessionId, suggestionId, { status }, password);
    onUpdate();
  };

  const handleDelete = async (suggestionId: number) => {
    await api.deleteSuggestion(sessionId, suggestionId, password);
    onUpdate();
  };

  const renderSuggestion = (s: Suggestion, showActions: boolean) => (
    <div key={s.id} className="flex items-start gap-3 px-3 py-2 border-b border-border/30 group">
      {s.suggestion_type === 'youtube' && s.youtube_thumbnail && (
        <img src={s.youtube_thumbnail} alt="" className="w-16 h-12 rounded object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {s.suggestion_type === 'youtube' ? (
          <>
            <span className="text-sm text-text-primary truncate block">{s.youtube_title || 'YouTube Video'}</span>
            <span className="text-xs text-text-muted truncate block">{s.youtube_url}</span>
          </>
        ) : (
          <>
            <span className="text-sm text-text-primary truncate block">{s.manual_title}</span>
            <span className="text-xs text-text-muted truncate block">{s.manual_artist}</span>
          </>
        )}
        <span className="text-[10px] text-text-muted">by {s.submitted_by}</span>
      </div>
      {showActions ? (
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => handleReview(s.id, 'approved')}
            className="text-[10px] px-2 py-1 rounded bg-success/20 text-success hover:bg-success/30"
          >
            Approve
          </button>
          <button
            onClick={() => handleReview(s.id, 'rejected')}
            className="text-[10px] px-2 py-1 rounded bg-danger/20 text-danger hover:bg-danger/30"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded ${
            s.status === 'approved' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
          }`}>
            {s.status}
          </span>
          <button
            onClick={() => handleDelete(s.id)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {pending.length > 0 && (
        <>
          <div className="px-3 py-1.5 bg-bg-tertiary/50">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Pending ({pending.length})
            </span>
          </div>
          {pending.map(s => renderSuggestion(s, true))}
        </>
      )}
      {reviewed.length > 0 && (
        <>
          <div className="px-3 py-1.5 bg-bg-tertiary/50">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Reviewed</span>
          </div>
          {reviewed.map(s => renderSuggestion(s, false))}
        </>
      )}
      {suggestions.length === 0 && (
        <div className="py-8 text-center text-text-muted text-sm">
          No suggestions yet. Share the session link to receive suggestions.
        </div>
      )}
    </div>
  );
}
