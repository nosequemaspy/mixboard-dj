import { useLibraryStore } from '../../store/libraryStore';

export function SearchBar() {
  const { search, setSearch } = useLibraryStore();

  return (
    <input
      type="text"
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Search songs..."
      className="bg-bg-primary border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-64"
    />
  );
}
