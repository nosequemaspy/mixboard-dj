import { useEffect, useRef } from 'react';
import { useLibraryStore } from '../../store/libraryStore';

export function SearchBar() {
  const { search, setSearch, fetchSongs } = useLibraryStore();
  const debounceRef = useRef<number>(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchSongs();
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <input
      type="text"
      value={search}
      onChange={handleChange}
      placeholder="Search songs..."
      className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-64"
    />
  );
}
