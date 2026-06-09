import { useEffect, useRef } from 'react';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { SearchBar } from './SearchBar';
import { CategoryFilter } from './CategoryFilter';
import { SongTable } from './SongTable';
import { Button } from '../shared/Button';

export function LibraryPanel() {
  const { fetchSongs } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <SearchBar />
        <CategoryFilter />
        <div className="ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={handleImport}
            className="hidden"
          />
          <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
        </div>
      </div>
      <SongTable />
    </div>
  );
}
