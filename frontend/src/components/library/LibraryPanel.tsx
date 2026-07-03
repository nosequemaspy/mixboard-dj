import { useEffect, useRef, useState } from 'react';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { SearchBar } from './SearchBar';
import { CategoryFilter } from './CategoryFilter';
import { SongTable } from './SongTable';
import { Button } from '../shared/Button';

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
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Download All'}
            </Button>
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
