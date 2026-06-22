import { useState, useRef, useEffect } from 'react';
import type { SessionData } from '../../types';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import { SessionSongList } from './SessionSongList';
import { SuggestionReview } from './SuggestionReview';

interface SessionDetailProps {
  session: SessionData;
  password?: string;
  onUpdate: () => void;
  onAddSong: () => void;
  onDuplicate: () => void;
}

type Tab = 'songs' | 'suggestions' | 'notes';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SessionDetail({ session, password, onUpdate, onAddSong, onDuplicate }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const shareUrl = `${window.location.origin}/s/${session.share_code}`;
  const pendingCount = session.suggestions.filter(s => s.status === 'pending').length;
  const notesCount = session.notes?.length || 0;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await api.deleteNote(session.id, noteId, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleCreateFolder = async (name: string, color: string) => {
    try {
      await api.createSessionFolder(session.id, { name, color }, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    try {
      await api.deleteSessionFolder(session.id, folderId, password);
      if (activeFolder === folderId) setActiveFolder(null);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleRenameFolder = async (folderId: number, name: string, color: string) => {
    try {
      await api.updateSessionFolder(session.id, folderId, { name, color }, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{session.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-text-muted font-mono">{session.share_code}</span>
            {session.is_public && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">public</span>
            )}
            {session.has_password && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">locked</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>Duplicate</Button>
          <Button size="sm" variant="primary" onClick={onAddSong}>Add Song</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        <button
          onClick={() => setActiveTab('songs')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'songs'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Songs ({session.items.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Notas
          {notesCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] font-bold rounded-full bg-accent/20 text-accent px-1">
              {notesCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors relative ${
            activeTab === 'suggestions'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Suggestions
          {pendingCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-danger text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'songs' ? (
          <SessionSongList
            items={session.items}
            sessionId={session.id}
            password={password}
            onUpdate={onUpdate}
            folders={session.folders || []}
            activeFolder={activeFolder}
            onFolderChange={setActiveFolder}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
          />
        ) : activeTab === 'notes' ? (
          <div className="h-full overflow-y-auto p-3">
            {(session.notes || []).length > 0 ? (
              <div className="space-y-2">
                {session.notes.map(note => (
                  <div key={note.id} className="bg-bg-primary border border-border/50 rounded-lg p-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-accent">{note.author_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted">{timeAgo(note.created_at)}</span>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-[10px] text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          delete
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{note.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No notes yet. Share the link so people can leave notes.
              </div>
            )}
          </div>
        ) : (
          <SuggestionReview
            suggestions={session.suggestions}
            sessionId={session.id}
            password={password}
            onUpdate={onUpdate}
          />
        )}
      </div>
    </div>
  );
}
