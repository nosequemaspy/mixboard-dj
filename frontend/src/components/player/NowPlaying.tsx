import { usePlayerStore } from '../../store/playerStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function NowPlaying() {
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const sessionItems = usePlayerStore(s => s.sessionItems);

  const currentItem = sessionItems.find(i => i.song_id === currentSongId);
  const song = currentItem?.song;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = (parseFloat(e.target.value) / 100) * duration;
    usePlayerStore.getState().setCurrentTime(time);
    getPlaybackEngine().seek(time);
  };

  return (
    <div className="px-4 py-5">
      {song ? (
        <>
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold text-text-primary truncate">{song.title}</h2>
            <p className="text-sm text-text-secondary truncate">{song.artist || 'Unknown Artist'}</p>
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
              className="w-full h-2 cursor-pointer"
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
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm">Selecciona una cancion para reproducir</p>
        </div>
      )}
    </div>
  );
}
