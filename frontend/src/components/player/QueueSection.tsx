import { usePlayerStore } from '../../store/playerStore';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableQueueItem({ entryItemId, index, title, artist, source, onRemove, onMoveToFirst, isFirst }: {
  entryItemId: number;
  index: number;
  title: string;
  artist: string;
  source: string;
  onRemove: () => void;
  onMoveToFirst: () => void;
  isFirst: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: entryItemId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-2 px-2 rounded-md bg-accent/5"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="p-1.5 text-text-muted/40 hover:text-text-muted cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[10px] font-mono text-text-muted/60 w-4 text-center shrink-0">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary truncate">{title}</p>
          <p className="text-xs text-text-muted truncate">{artist}</p>
        </div>
        {source === 'manual' && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
            COLA
          </span>
        )}
      </div>

      <div className="flex items-center flex-shrink-0">
        {/* Move to first */}
        {!isFirst && (
          <button
            onClick={onMoveToFirst}
            className="p-2 text-text-muted hover:text-accent transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Mover a primera"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
              <line x1="6" y1="5" x2="18" y2="5" />
            </svg>
          </button>
        )}

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-2 text-text-muted hover:text-danger transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          title="Quitar de la cola"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function QueueSection() {
  const queue = usePlayerStore(s => s.queue);

  if (queue.length === 0) return null;

  const handleRemove = (index: number) => {
    usePlayerStore.getState().removeFromQueue(index);
  };

  const handleMoveToFirst = (index: number) => {
    usePlayerStore.getState().moveQueueItem(index, 0);
  };

  const handleClearAll = () => {
    usePlayerStore.getState().clearQueue();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex(e => e.item.id === active.id);
    const newIndex = queue.findIndex(e => e.item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    usePlayerStore.getState().moveQueueItem(oldIndex, newIndex);
  };

  // Use item.id as sortable IDs
  const sortableIds = queue.map(e => e.item.id);

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
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {queue.map((entry, index) => (
              <SortableQueueItem
                key={`queue-${entry.item.id}-${index}`}
                entryItemId={entry.item.id}
                index={index}
                title={entry.item.song.title}
                artist={entry.item.song.artist}
                source={entry.source}
                onRemove={() => handleRemove(index)}
                onMoveToFirst={() => handleMoveToFirst(index)}
                isFirst={index === 0}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
