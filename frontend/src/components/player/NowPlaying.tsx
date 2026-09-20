import { usePlayerStore } from '../../store/playerStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TRANSITION_LABELS: Record<string, string> = {
  smooth: 'Smooth',
  sharp: 'Sharp',
  linear: 'Linear',
  cut: 'Cut',
};

export function NowPlaying() {
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const folders = usePlayerStore(s => s.folders);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);

  const currentItem = sessionItems.find(i => i.song_id === currentSongId);
  const song = currentItem?.song;
  const ps = song?.playback_settings;

  // Find the folder this item belongs to
  const itemFolder = currentItem?.folder_id
    ? folders.find(f => f.id === currentItem.folder_id)
    : null;

  // Effective playback range
  const startTime = ps?.start_time ?? 0;
  const endTime = ps?.end_time ?? (song?.duration_seconds ?? 0);
  const speed = ps?.playback_speed ?? 1.0;
  const transitionDuration = ps?.transition_duration ?? 4;
  const transitionType = ps?.transition_type ?? 'smooth';
  const effectiveDuration = Math.max(0, endTime - startTime);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Get next item
  const nextItem = currentItemId ? usePlayerStore.getState().getNextItem() : null;
  const nextSong = nextItem?.song;
  const nextFolder = nextItem?.folder_id
    ? folders.find(f => f.id === nextItem.folder_id)
    : null;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = (parseFloat(e.target.value) / 100) * duration;
    usePlayerStore.getState().setCurrentTime(time);
    getPlaybackEngine().seek(time);
  };

  return (
    <div className="px-4 py-4">
      {song ? (
        <>
          {/* Current song - deck-style card */}
          <div className="bg-bg-primary/50 rounded-lg p-3 mb-3 border border-border/40">
            {/* Top row: folder dot + title + BPM/Key badges */}
            <div className="flex items-start gap-2 mb-2">
              {itemFolder && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ring-1 ring-offset-1 ring-offset-bg-secondary"
                  style={{ backgroundColor: itemFolder.color, boxShadow: `0 0 6px ${itemFolder.color}50` }}
                  title={itemFolder.name}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-text-primary truncate leading-tight">{song.title}</h2>
                <p className="text-sm text-text-secondary truncate leading-tight">{song.artist || 'Artista desconocido'}</p>
              </div>
            </div>

            {/* Info badges row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {song.bpm && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono tabular-nums">
                  {song.bpm} BPM
                </span>
              )}
              {song.key && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono">
                  {song.key}
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono tabular-nums">
                {formatDuration(song.duration_seconds)}
              </span>
              {speed !== 1.0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono font-bold">
                  {speed.toFixed(2).replace(/0$/, '')}x
                </span>
              )}
              {/* Category tags */}
              {song.categories?.map(cat => (
                <span
                  key={cat.id}
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                >
                  {cat.name}
                </span>
              ))}
            </div>

            {/* Transition info */}
            <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
              <span title="Rango efectivo de reproduccion">
                {formatTime(startTime)} - {formatTime(endTime)}
              </span>
              <span className="text-text-muted/40">|</span>
              <span title="Transicion">
                {TRANSITION_LABELS[transitionType] || transitionType} {transitionDuration}s
              </span>
              {effectiveDuration !== song.duration_seconds && (
                <>
                  <span className="text-text-muted/40">|</span>
                  <span title="Duracion efectiva">
                    Eff: {formatDuration(speed > 0 ? effectiveDuration / speed : effectiveDuration)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={handleSeek}
              disabled={restrictedMode}
              className={`w-full h-2 ${restrictedMode ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${progress}%, var(--color-bg-tertiary) ${progress}%)`,
              }}
            />
          </div>

          {/* Time display */}
          <div className="flex justify-between mt-1.5 text-xs text-text-muted font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Next up */}
          {nextSong && (
            <div className="mt-3 flex items-center gap-2 px-2 py-2 rounded-md bg-bg-tertiary/50 border border-border/20">
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold shrink-0">Siguiente</span>
              {nextFolder && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: nextFolder.color }}
                  title={nextFolder.name}
                />
              )}
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-xs text-text-primary truncate">{nextSong.title}</span>
                <span className="text-[10px] text-text-muted truncate shrink-0">- {nextSong.artist}</span>
              </div>
              <span className="text-[10px] text-text-muted font-mono tabular-nums shrink-0">
                {formatDuration(nextSong.duration_seconds)}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm">Selecciona una cancion para reproducir</p>
        </div>
      )}
    </div>
  );
}
