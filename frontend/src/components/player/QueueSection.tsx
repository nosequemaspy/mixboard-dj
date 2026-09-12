import { usePlayerStore } from '../../store/playerStore';

export function QueueSection() {
  const queue = usePlayerStore(s => s.queue);

  if (queue.length === 0) return null;

  const handleRemove = (index: number) => {
    usePlayerStore.getState().removeFromQueue(index);
  };

  return (
    <div className="px-4 py-2 border-b border-border">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
        Cola ({queue.length} {queue.length === 1 ? 'cancion' : 'canciones'})
      </h3>
      <div className="space-y-1">
        {queue.map((item, index) => (
          <div
            key={`queue-${item.id}-${index}`}
            className="flex items-center justify-between py-2 px-2 rounded-md bg-accent/5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary truncate">{item.song.title}</p>
              <p className="text-xs text-text-muted truncate">{item.song.artist}</p>
            </div>
            <button
              onClick={() => handleRemove(index)}
              className="p-2 text-text-muted hover:text-danger transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0"
              title="Quitar de la cola"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
