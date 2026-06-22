import { useState, useRef, useEffect } from 'react';
import type { SessionFolder } from '../../types';

interface FolderChipsProps {
  folders: SessionFolder[];
  activeFolder: number | null;
  onFolderChange: (folderId: number | null) => void;
  totalItems: number;
  folderItemCounts: Record<number, number>;
  onCreate?: (name: string, color: string) => void;
  onDelete?: (folderId: number) => void;
  onRename?: (folderId: number, name: string, color: string) => void;
  readOnly?: boolean;
}

const FOLDER_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export function FolderChips({
  folders,
  activeFolder,
  onFolderChange,
  totalItems,
  folderItemCounts,
  onCreate,
  onDelete,
  onRename,
  readOnly = false,
}: FolderChipsProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [contextMenu, setContextMenu] = useState<{ folderId: number; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const handleCreate = () => {
    if (newName.trim() && onCreate) {
      onCreate(newName.trim(), newColor);
      setNewName('');
      setNewColor(FOLDER_COLORS[(folders.length + 1) % FOLDER_COLORS.length]);
      setCreating(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, folderId: number) => {
    if (readOnly) return;
    e.preventDefault();
    setContextMenu({ folderId, x: e.clientX, y: e.clientY });
  };

  const startEdit = (folder: SessionFolder) => {
    setEditingId(folder.id);
    setEditName(folder.name);
    setEditColor(folder.color);
    setContextMenu(null);
  };

  const handleEditSubmit = () => {
    if (editingId && editName.trim() && onRename) {
      onRename(editingId, editName.trim(), editColor);
    }
    setEditingId(null);
  };

  const handleDelete = (folderId: number) => {
    setContextMenu(null);
    if (onDelete && window.confirm('Delete folder? Songs will remain in Home.')) {
      onDelete(folderId);
      if (activeFolder === folderId) onFolderChange(null);
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto scrollbar-none bg-bg-secondary/40">
      {/* Home chip */}
      <button
        onClick={() => onFolderChange(null)}
        className={`shrink-0 text-[11px] px-3 py-1 rounded-md font-medium transition-all duration-150 flex items-center gap-1.5 ${
          activeFolder === null
            ? 'bg-accent text-white shadow-sm shadow-accent/25'
            : 'bg-bg-tertiary/60 text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-70">
          <path d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l.622.621a1.5 1.5 0 001.06.439H12.5A1.5 1.5 0 0114 5v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        All ({totalItems})
      </button>

      {/* Divider when folders exist */}
      {folders.length > 0 && (
        <div className="shrink-0 w-px h-4 bg-border/40 mx-0.5" />
      )}

      {/* Folder chips */}
      {folders.map(folder => (
        editingId === folder.id ? (
          <div key={folder.id} className="shrink-0 flex items-center gap-1.5 bg-bg-tertiary/80 rounded-lg px-2 py-1">
            <input
              ref={editInputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditSubmit(); if (e.key === 'Escape') setEditingId(null); }}
              onBlur={handleEditSubmit}
              className="text-[11px] px-2 py-0.5 rounded-md bg-bg-primary border border-border/60 w-24 text-text-primary focus:outline-none focus:border-accent/60"
            />
            <div className="flex gap-1">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={(e) => { e.stopPropagation(); setEditColor(c); }}
                  className="w-4 h-4 rounded-full transition-transform duration-100"
                  style={{
                    backgroundColor: c,
                    boxShadow: editColor === c ? `0 0 0 2px ${c}40, 0 0 0 3px ${c}` : 'none',
                    transform: editColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={folder.id}
            onClick={() => onFolderChange(folder.id)}
            onContextMenu={e => handleContextMenu(e, folder.id)}
            className={`shrink-0 text-[11px] px-3 py-1 rounded-md font-medium transition-all duration-150 flex items-center gap-1.5 ${
              activeFolder === folder.id
                ? 'text-white shadow-sm'
                : 'hover:brightness-125'
            }`}
            style={{
              backgroundColor: activeFolder === folder.id ? folder.color : `${folder.color}18`,
              color: activeFolder === folder.id ? 'white' : folder.color,
              boxShadow: activeFolder === folder.id ? `0 2px 8px ${folder.color}30` : undefined,
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: activeFolder === folder.id ? 'rgba(255,255,255,0.7)' : folder.color,
              }}
            />
            {folder.name}
            <span className={`text-[10px] ${activeFolder === folder.id ? 'text-white/60' : 'opacity-50'}`}>
              {folderItemCounts[folder.id] || 0}
            </span>
          </button>
        )
      ))}

      {/* Create folder */}
      {!readOnly && (
        creating ? (
          <div className="shrink-0 flex items-center gap-1.5 bg-bg-tertiary/80 rounded-lg px-2 py-1">
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Folder name..."
              className="text-[11px] px-2 py-0.5 rounded-md bg-bg-primary border border-border/60 w-24 text-text-primary focus:outline-none focus:border-accent/60 placeholder:text-text-muted/50"
            />
            <div className="flex gap-1">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-4 h-4 rounded-full transition-transform duration-100"
                  style={{
                    backgroundColor: c,
                    boxShadow: newColor === c ? `0 0 0 2px ${c}40, 0 0 0 3px ${c}` : 'none',
                    transform: newColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <button onClick={handleCreate} className="text-[11px] px-1.5 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors">
              Add
            </button>
            <button onClick={() => setCreating(false)} className="text-[11px] px-1 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
              &times;
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNewColor(FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
              setCreating(true);
            }}
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-all duration-150"
            title="New folder"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary/95 backdrop-blur-sm border border-border/60 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const folder = folders.find(f => f.id === contextMenu.folderId);
              if (folder) startEdit(folder);
            }}
            className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-hover/80 flex items-center gap-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-muted">
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Rename / Color
          </button>
          <div className="mx-2 my-0.5 border-t border-border/30" />
          <button
            onClick={() => handleDelete(contextMenu.folderId)}
            className="w-full text-left px-3 py-2 text-xs text-danger hover:bg-danger/10 flex items-center gap-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-danger/70">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete folder
          </button>
        </div>
      )}
    </div>
  );
}
