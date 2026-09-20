import { usePlayerStore } from '../../store/playerStore';

export function QueueSection() {
  const queue = usePlayerStore(s => s.queue);

  if (queue.length === 0) return null;

  const handleRemove = (index: number) => {
    usePlayerStore.getState().removeFromQueue(index);
  };

  const handleClearAll = () => {
    // Remove all by setting empty queue
    for (let i = queue.length - 1; i >= 0; i--) {
      usePlayerStore.getState().removeFromQueue(i);
    }
  };

  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Cola ({queue.length} {queue.length === 1 ? 'cancion' : 'canciones'})
        </h3>
        {queue.length > 1 && (
          <button
            onClick={handleClearAll}
            className="text-[10px] px-2 py-1 rounded text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors font-medium"
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="space-y-1">
        {queue.map((entry, index) => (
          <div
            key={`queue-${entry.item.id}-${index}`}
            className="flex items-center justify-between py-2 px-2 rounded-md bg-accent/5"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[10px] font-mono text-text-muted/60 w-4 text-center shrink-0">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate">{entry.item.song.title}</p>
                <p className="text-xs text-text-muted truncate">{entry.item.song.artist}</p>
              </div>
              {entry.source === 'manual' && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
                  COLA
                </span>
              )}
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
