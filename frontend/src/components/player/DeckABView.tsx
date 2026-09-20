import { usePlayerStore } from '../../store/playerStore';
import { getEffectivePlaybackSettings } from '../../types';
import type { SessionItem } from '../../types';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Pure CSS progress bar showing start/active/transition/end zones */
function DeckProgressBar({
  startTime,
  endTime,
  transitionDuration,
  totalDuration,
  currentTime,
  showPlayhead,
}: {
  startTime: number;
  endTime: number;
  transitionDuration: number;
  totalDuration: number;
  currentTime: number;
  showPlayhead: boolean;
}) {
  if (totalDuration <= 0) return null;

  const startPct = (startTime / totalDuration) * 100;
  const endPct = (endTime / totalDuration) * 100;
  const transStartPct = (Math.max(0, endTime - transitionDuration) / totalDuration) * 100;
  const playheadPct = (currentTime / totalDuration) * 100;

  return (
    <div className="relative h-3 rounded-full overflow-hidden bg-white/5">
      {/* Dimmed zone before start */}
      {startPct > 0.5 && (
        <div
          className="absolute inset-y-0 left-0 bg-white/5"
          style={{ width: `${startPct}%` }}
        />
      )}

      {/* Active playback zone */}
      <div
        className="absolute inset-y-0 bg-accent/40"
        style={{ left: `${startPct}%`, width: `${Math.max(0, transStartPct - startPct)}%` }}
      />

      {/* Transition zone */}
      {transitionDuration > 0.1 && (
        <div
          className="absolute inset-y-0 bg-amber-500/30"
          style={{ left: `${transStartPct}%`, width: `${Math.max(0, endPct - transStartPct)}%` }}
        />
      )}

      {/* Dimmed zone after end */}
      {endPct < 99.5 && (
        <div
          className="absolute inset-y-0 right-0 bg-white/5"
          style={{ left: `${endPct}%`, width: `${100 - endPct}%` }}
        />
      )}

      {/* Orange dot markers */}
      {startPct > 0.5 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400 z-10"
          style={{ left: `${startPct}%`, marginLeft: '-4px' }}
          title={`Inicio: ${formatTime(startTime)}`}
        />
      )}
      {transitionDuration > 0.1 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 z-10"
          style={{ left: `${transStartPct}%`, marginLeft: '-4px' }}
          title={`Trans: ${formatTime(endTime - transitionDuration)}`}
        />
      )}
      {endPct < 99.5 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400 z-10"
          style={{ left: `${endPct}%`, marginLeft: '-4px' }}
          title={`Final: ${formatTime(endTime)}`}
        />
      )}

      {/* Playhead line */}
      {showPlayhead && (
        <div
          className="absolute inset-y-0 w-0.5 bg-white z-20 shadow-[0_0_4px_rgba(255,255,255,0.6)]"
          style={{ left: `${Math.min(Math.max(playheadPct, 0), 100)}%` }}
        />
      )}
    </div>
  );
}

function DeckCard({
  label,
  item,
  currentTime,
  showPlayhead,
  isQueue,
}: {
  label: string;
  item: SessionItem;
  currentTime: number;
  showPlayhead: boolean;
  isQueue?: boolean;
}) {
  const song = item.song;
  const eff = getEffectivePlaybackSettings(item);
  const effectiveEnd = eff.end_time ?? song.duration_seconds;
  const folders = usePlayerStore(s => s.folders);
  const itemFolder = item.folder_id ? folders.find(f => f.id === item.folder_id) : null;

  return (
    <div className="px-4 py-3">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted/60">{label}</span>
        {itemFolder && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: itemFolder.color }}
            title={itemFolder.name}
          />
        )}
        {isQueue && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
            COLA
          </span>
        )}
        <div className="flex-1" />
        {song.bpm && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono">
            {song.bpm}
          </span>
        )}
        {song.key && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono">
            {song.key}
          </span>
        )}
        {eff.playback_speed !== 1.0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono font-bold">
            {eff.playback_speed.toFixed(2).replace(/0$/, '')}x
          </span>
        )}
      </div>

      {/* Song info */}
      <h3 className="text-sm font-bold text-text-primary truncate leading-tight">{song.title}</h3>
      <p className="text-xs text-text-secondary truncate leading-tight mb-2">{song.artist || 'Artista desconocido'}</p>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <DeckProgressBar
            startTime={eff.start_time}
            endTime={effectiveEnd}
            transitionDuration={eff.transition_duration}
            totalDuration={song.duration_seconds}
            currentTime={currentTime}
            showPlayhead={showPlayhead}
          />
        </div>
        <span className="text-[10px] font-mono text-text-muted tabular-nums shrink-0">
          {showPlayhead ? formatTime(currentTime) : formatTime(effectiveEnd - eff.start_time)}
        </span>
      </div>
    </div>
  );
}

export function DeckABView() {
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const currentTime = usePlayerStore(s => s.currentTime);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const isTransitioning = usePlayerStore(s => s.isTransitioning);
  const nextTransitionSongTitle = usePlayerStore(s => s.nextTransitionSongTitle);
  const queue = usePlayerStore(s => s.queue);

  const currentItem = sessionItems.find(i => i.id === currentItemId);
  const nextItem = currentItemId ? usePlayerStore.getState().getNextItem() : null;
  const isNextFromQueue = queue.length > 0 && nextItem && queue[0].item.id === nextItem.id;

  if (!currentItem) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-text-muted text-sm">Selecciona una cancion para reproducir</p>
      </div>
    );
  }

  return (
    <div>
      {/* Deck A - Currently playing */}
      <DeckCard
        label="Deck A"
        item={currentItem}
        currentTime={currentTime}
        showPlayhead={true}
      />

      {/* Transition indicator */}
      {isTransitioning && nextTransitionSongTitle && (
        <div className="px-4 py-1.5 flex items-center gap-2 border-t border-border/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          <span className="text-xs text-amber-400 font-medium truncate">
            Transicionando a {nextTransitionSongTitle}...
          </span>
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 border-t border-border/30" />

      {/* Deck B - Next up */}
      {nextItem ? (
        <DeckCard
          label="Deck B"
          item={nextItem}
          currentTime={0}
          showPlayhead={false}
          isQueue={isNextFromQueue}
        />
      ) : (
        <div className="px-4 py-4 text-center">
          <p className="text-text-muted/50 text-xs">No hay siguiente cancion</p>
        </div>
      )}
    </div>
  );
}
