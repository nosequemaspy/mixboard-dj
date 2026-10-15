import { useOfflineStore } from '../../store/offlineStore';

export function OfflineDownloadBar() {
  const activeDownload = useOfflineStore(s => s.activeDownload);
  const cancelDownload = useOfflineStore(s => s.cancelDownload);

  if (!activeDownload) return null;

  const { completedSongs, totalSongs, currentSongTitle, failedSongs } = activeDownload;
  const progress = totalSongs > 0 ? (completedSongs / totalSongs) * 100 : 0;

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/20">
      {/* Pulsing indicator */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-blue-300">
          <span className="truncate">
            Descargando: {currentSongTitle}
          </span>
          <span className="flex-shrink-0 font-mono text-blue-400">
            ({completedSongs}/{totalSongs})
          </span>
          {failedSongs > 0 && (
            <span className="flex-shrink-0 font-mono text-amber-400">
              {failedSongs} fallida{failedSongs !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-1 h-1 bg-blue-500/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={cancelDownload}
        className="flex-shrink-0 p-1.5 text-blue-400 hover:text-blue-300 transition-colors"
        title="Cancelar descarga"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </button>
    </div>
  );
}
