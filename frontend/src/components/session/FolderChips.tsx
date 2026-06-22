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
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30 overflow-x-auto scrollbar-none">
      {/* Home chip */}
      <button
        onClick={() => onFolderChange(null)}
        className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
          activeFolder === null
            ? 'bg-accent text-white'
            : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
        }`}
      >
        Home ({totalItems})
      </button>

      {/* Folder chips */}
      {folders.map(folder => (
        editingId === folder.id ? (
          <div key={folder.id} className="shrink-0 flex items-center gap-1">
            <input
              ref={editInputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditSubmit(); if (e.key === 'Escape') setEditingId(null); }}
              onBlur={handleEditSubmit}
              className="text-[11px] px-2 py-0.5 rounded bg-bg-primary border border-border w-20 text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="flex gap-0.5">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={(e) => { e.stopPropagation(); setEditColor(c); }}
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: c, outline: editColor === c ? '2px solid white' : 'none', outlineOffset: '1px' }}
                />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={folder.id}
            onClick={() => onFolderChange(folder.id)}
            onContextMenu={e => handleContextMenu(e, folder.id)}
            className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              activeFolder === folder.id
                ? 'text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
            style={{
              backgroundColor: activeFolder === folder.id ? folder.color : undefined,
              border: activeFolder !== folder.id ? `1px solid ${folder.color}40` : undefined,
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: folder.color }} />
            {folder.name} ({folderItemCounts[folder.id] || 0})
          </button>
        )
      ))}

      {/* Create folder */}
      {!readOnly && (
        creating ? (
          <div className="shrink-0 flex items-center gap-1">
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Folder name..."
              className="text-[11px] px-2 py-0.5 rounded bg-bg-primary border border-border w-24 text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="flex gap-0.5">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: c, outline: newColor === c ? '2px solid white' : 'none', outlineOffset: '1px' }}
                />
              ))}
            </div>
            <button onClick={handleCreate} className="text-[10px] text-accent hover:text-accent/80">OK</button>
            <button onClick={() => setCreating(false)} className="text-[10px] text-text-muted hover:text-text-primary">&times;</button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNewColor(FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
              setCreating(true);
            }}
            className="shrink-0 text-[11px] px-2 py-1 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            +
          </button>
        )
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const folder = folders.find(f => f.id === contextMenu.folderId);
              if (folder) startEdit(folder);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
          >
            Rename / Color
          </button>
          <button
            onClick={() => handleDelete(contextMenu.folderId)}
            className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-bg-hover"
          >
            Delete folder
          </button>
        </div>
      )}
    </div>
  );
}
