import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/http';
import type { SessionNote } from '../../types';

interface NotesSectionProps {
  sessionId: number;
  notes: SessionNote[];
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NoteCard({ note }: { note: SessionNote }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = note.content.length > 150;

  return (
    <div className="bg-bg-secondary border border-border/50 rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-accent">{note.author_name}</span>
        <span className="text-[10px] text-text-muted">{timeAgo(note.created_at)}</span>
      </div>
      <p className={`text-sm text-text-primary whitespace-pre-wrap break-words ${
        !expanded && isLong ? 'line-clamp-3' : ''
      }`}>
        {note.content}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent hover:text-accent-hover mt-1 font-medium"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export function NotesSection({ sessionId, notes, onRefresh }: NotesSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showForm && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await api.createNote(sessionId, {
        content: content.trim(),
        author_name: authorName.trim() || 'anonymous',
      });
      setContent('');
      setShowForm(false);
      onRefresh();
    } catch {
      // ignore
    }
    setSubmitting(false);
  };

  return (
    <div className="p-3">
      {/* Write note button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          <span>Escribir nota</span>
        </button>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 bg-bg-secondary border border-border rounded-lg p-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your note or song suggestion..."
            rows={3}
            className="w-full bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:border-accent"
          />
          <input
            value={authorName}
            onChange={e => setAuthorName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full mt-2 bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {submitting ? 'Sending...' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setContent(''); }}
              className="px-3 py-2 bg-bg-tertiary text-text-muted hover:text-text-primary rounded-md text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Notes list */}
      {notes.length > 0 ? (
        <div>
          {notes.map(note => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-text-muted text-sm">
          No notes yet. Be the first to write one!
        </div>
      )}
    </div>
  );
}
