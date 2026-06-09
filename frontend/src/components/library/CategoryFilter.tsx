import { useEffect, useState } from 'react';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';

export function CategoryFilter() {
  const { categories, selectedCategoryId, setSelectedCategory, fetchSongs, fetchCategories } = useLibraryStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: number | null) => {
    setSelectedCategory(id);
    fetchSongs();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await api.createCategory({ name: newName.trim(), color: newColor });
    setNewName('');
    setShowCreate(false);
    fetchCategories();
  };

  const handleDelete = async (id: number) => {
    await api.deleteCategory(id);
    if (selectedCategoryId === id) {
      setSelectedCategory(null);
      fetchSongs();
    }
    fetchCategories();
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => handleSelect(null)}
        className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
          selectedCategoryId === null
            ? 'bg-accent text-white'
            : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
        }`}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => handleSelect(cat.id)}
          onContextMenu={(e) => { e.preventDefault(); handleDelete(cat.id); }}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors border ${
            selectedCategoryId === cat.id
              ? 'text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          style={{
            borderColor: cat.color,
            backgroundColor: selectedCategoryId === cat.id ? cat.color : 'transparent',
          }}
          title={`${cat.name} (${cat.song_count}) - Right-click to delete`}
        >
          {cat.name}
        </button>
      ))}
      <button
        onClick={() => setShowCreate(true)}
        className="px-2 py-0.5 text-xs rounded-full border border-dashed border-border text-text-muted hover:text-text-primary hover:border-accent"
      >
        +
      </button>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Category">
        <div className="flex flex-col gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Category name"
            className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Color:</label>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-8 h-8 cursor-pointer" />
          </div>
          <Button variant="primary" onClick={handleCreate}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
