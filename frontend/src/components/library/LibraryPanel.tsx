import { useEffect, useRef, useState } from 'react';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { SearchBar } from './SearchBar';
import { CategoryFilter } from './CategoryFilter';
import { SongTable } from './SongTable';
import { Button } from '../shared/Button';
import type { Song } from '../../types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateSongsTxt(songs: Song[]): string {
  const lines: string[] = [];
  lines.push('BIBLIOTECA DE CANCIONES');
  lines.push('='.repeat(50));
  lines.push(`Total: ${songs.length} canciones`);
  lines.push('');
  lines.push('Podés copiar este archivo y pegarlo en una IA para que te arme un orden de playlist, un mix con transiciones suaves, cambios de género, etc.');
  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('');

  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    lines.push(`${i + 1}. ${s.title}`);
    if (s.artist) lines.push(`   Artista: ${s.artist}`);
    if (s.bpm) lines.push(`   BPM: ${s.bpm}`);
    if (s.key) lines.push(`   Tonalidad: ${s.key}`);
    lines.push(`   Duración: ${formatDuration(s.duration_seconds)}`);
    if (s.categories.length > 0) {
      lines.push(`   Categorías: ${s.categories.map(c => c.name).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function LibraryPanel() {
  const { songs, fetchSongs } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await api.uploadSong(file);
    }
    fetchSongs();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = async () => {
    if (exporting || songs.length === 0) return;
    setExporting(true);
    try {
      await api.exportSongs(songs.map(s => s.id));
    } catch {
      // error is already thrown by api method
    } finally {
      setExporting(false);
    }
  };

  const handleExportTxt = () => {
    if (songs.length === 0) return;
    const txt = generateSongsTxt(songs);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canciones.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <SearchBar />
        <CategoryFilter />
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={handleImport}
            className="hidden"
          />
          {songs.length > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={handleExportTxt} title="Descargar lista de canciones como TXT para compartir con una IA">
                Export TXT
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting...' : 'Download All'}
              </Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
        </div>
      </div>
      <SongTable />
    </div>
  );
}
