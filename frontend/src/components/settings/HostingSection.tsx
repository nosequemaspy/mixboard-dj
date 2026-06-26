import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/http';

interface FlyStatus {
  status: 'ok' | 'warning' | 'danger';
  is_fly: boolean;
  machine: {
    size: string;
    memory_mb: number;
    region: string;
    app_name: string;
    auto_suspend: boolean;
    uptime_seconds: number;
    started_at: string;
  };
  storage: {
    total_bytes: number;
    limit_bytes: number;
    volume_gb: number;
    usage_percent: number;
    breakdown: {
      songs: { bytes: number; count: number };
      stems: { bytes: number; count: number };
      edits: { bytes: number; count: number };
      db: { bytes: number };
    };
  };
  capacity: {
    audio_quality_kbps: number;
    avg_song_mb: number;
    songs_current: number;
    songs_estimated_max: number;
    songs_remaining: number;
  };
  free_tier: {
    max_vms: number;
    current_vms: number;
    max_volume_gb: number;
    current_volume_gb: number;
    max_bandwidth_gb_month: number;
  };
  risks: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h ${m}m`;
  }
  return `${h}h ${m}m`;
}

export function HostingSection() {
  const [data, setData] = useState<FlyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    api.getFlyStatus()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 30_000);
    return () => clearInterval(interval);
  }, [reload]);

  if (loading && !data) {
    return <div className="text-sm text-text-muted py-4">Cargando estado del servidor...</div>;
  }

  if (error && !data) {
    return (
      <div className="text-sm text-text-muted py-4">
        No se pudo conectar con el monitor de hosting.
        <button onClick={reload} className="ml-2 underline hover:text-text-secondary">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  const statusConfig = {
    ok: {
      label: 'Free Tier — Todo bien',
      desc: 'No se te va a cobrar nada. Todo dentro del plan gratuito.',
      color: 'text-green-400',
      bg: 'bg-green-500/10 border-green-500/30',
      dot: 'bg-green-400',
    },
    warning: {
      label: 'Atencion — Acercandote al limite',
      desc: 'Estas cerca de los limites del free tier. Revisa el almacenamiento.',
      color: 'text-warning',
      bg: 'bg-warning/10 border-warning/30',
      dot: 'bg-warning',
    },
    danger: {
      label: 'Peligro de cobro',
      desc: 'Podrias exceder el free tier. Libera espacio o reduce el volumen.',
      color: 'text-danger',
      bg: 'bg-danger/10 border-danger/30',
      dot: 'bg-danger',
    },
  };
  const st = statusConfig[data.status];

  const storageBarColor =
    data.storage.usage_percent >= 90
      ? 'bg-danger'
      : data.storage.usage_percent >= 70
        ? 'bg-warning'
        : 'bg-accent';

  const breakdownItems = [
    { label: 'Canciones', bytes: data.storage.breakdown.songs.bytes, count: data.storage.breakdown.songs.count, color: 'bg-accent' },
    { label: 'Stems', bytes: data.storage.breakdown.stems.bytes, count: data.storage.breakdown.stems.count, color: 'bg-deck-b' },
    { label: 'Edits', bytes: data.storage.breakdown.edits.bytes, count: data.storage.breakdown.edits.count, color: 'bg-warning' },
    { label: 'Base de datos', bytes: data.storage.breakdown.db.bytes, count: null as number | null, color: 'bg-text-muted' },
  ];

  const checks = [
    {
      label: 'Compute',
      detail: `${data.free_tier.current_vms} / ${data.free_tier.max_vms} VMs`,
      ok: data.free_tier.current_vms <= data.free_tier.max_vms,
    },
    {
      label: 'Volumen',
      detail: `${data.free_tier.current_volume_gb} / ${data.free_tier.max_volume_gb} GB`,
      ok: data.free_tier.current_volume_gb <= data.free_tier.max_volume_gb,
    },
    {
      label: 'Bandwidth',
      detail: `${data.free_tier.max_bandwidth_gb_month} GB/mes incluidos`,
      ok: true,
    },
    {
      label: 'Auto-suspend',
      detail: data.machine.auto_suspend ? 'Activo' : 'Desactivado',
      ok: data.machine.auto_suspend,
    },
  ];

  const cap = data.capacity;
  const capacityPercent = cap.songs_estimated_max > 0
    ? Math.round((cap.songs_current / cap.songs_estimated_max) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Hosting & Free Tier</h3>
        <button
          onClick={reload}
          disabled={loading}
          className="text-[10px] text-text-muted hover:text-text-secondary px-2 py-0.5 rounded bg-bg-tertiary disabled:opacity-50"
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Status banner */}
      <div className={`rounded-lg border p-3 ${st.bg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${st.dot} ${data.status === 'ok' ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold ${st.color}`}>{st.label}</span>
        </div>
        <p className="text-xs text-text-secondary mt-1">{st.desc}</p>
      </div>

      {/* Song capacity */}
      <div className="bg-bg-secondary border border-border/50 rounded-lg p-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">
          Capacidad de canciones
        </div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <span className="text-2xl font-bold text-text-primary">{cap.songs_current}</span>
            <span className="text-sm text-text-muted ml-1">/ ~{cap.songs_estimated_max} canciones</span>
          </div>
          <span className="text-xs text-text-muted">
            a {cap.audio_quality_kbps} kbps (~{cap.avg_song_mb} MB/cancion)
          </span>
        </div>
        <div className="w-full bg-bg-tertiary rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${capacityPercent >= 90 ? 'bg-danger' : capacityPercent >= 70 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${Math.min(capacityPercent, 100)}%` }}
          />
        </div>
        <div className="text-[10px] text-text-muted mt-1.5">
          Te caben ~{cap.songs_remaining} canciones mas
        </div>
      </div>

      {/* Machine info */}
      <div className="bg-bg-secondary border border-border/50 rounded-lg p-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">
          Maquina
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">CPU</span>
            <span className="text-text-primary font-medium">{data.machine.size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">RAM</span>
            <span className="text-text-primary font-medium">{data.machine.memory_mb} MB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Region</span>
            <span className="text-text-primary font-medium">
              {data.machine.region === 'local' ? 'Local' : data.machine.region.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Uptime</span>
            <span className="text-text-primary font-medium">{formatUptime(data.machine.uptime_seconds)}</span>
          </div>
        </div>
        {data.machine.auto_suspend && (
          <div className="mt-2 text-[10px] text-green-400/80 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Se suspende sola cuando nadie la usa — no cobra en idle
          </div>
        )}
      </div>

      {/* Storage */}
      <div className="bg-bg-secondary border border-border/50 rounded-lg p-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">
          Almacenamiento
        </div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <span className="text-xl font-bold text-text-primary">
              {formatBytes(data.storage.total_bytes)}
            </span>
            <span className="text-xs text-text-muted ml-1">
              / {formatBytes(data.storage.limit_bytes)}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              data.storage.usage_percent >= 90
                ? 'text-danger'
                : data.storage.usage_percent >= 70
                  ? 'text-warning'
                  : 'text-text-secondary'
            }`}
          >
            {data.storage.usage_percent}%
          </span>
        </div>
        <div className="w-full bg-bg-tertiary rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${storageBarColor}`}
            style={{ width: `${Math.min(data.storage.usage_percent, 100)}%` }}
          />
        </div>

        {data.storage.usage_percent >= 90 && (
          <div className="mt-2 flex items-center gap-1.5 text-danger text-[10px] font-medium">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Almacenamiento casi lleno. Elimina canciones o stems.
          </div>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {breakdownItems.map((cat) => (
            <div key={cat.label} className="flex items-center gap-1.5 text-xs">
              <div className={`w-2 h-2 rounded-full ${cat.color} shrink-0`} />
              <span className="text-text-muted truncate">{cat.label}</span>
              <span className="text-text-primary font-medium ml-auto">
                {formatBytes(cat.bytes)}
              </span>
              {cat.count !== null && (
                <span className="text-text-muted text-[10px]">({cat.count})</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Free tier checklist */}
      <div className="bg-bg-secondary border border-border/50 rounded-lg p-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">
          Checklist Free Tier
        </div>
        <div className="space-y-1.5">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center gap-2 text-xs">
              {check.ok ? (
                <svg
                  className="w-3.5 h-3.5 text-green-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5 text-danger shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-text-secondary">{check.label}</span>
              <span className={`ml-auto font-medium ${check.ok ? 'text-text-primary' : 'text-danger'}`}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-bg-secondary border border-border/50 rounded-lg p-3">
        <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1.5">
          Para no pagar nada
        </div>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>
            <strong className="text-text-primary">UptimeRobot</strong>: Puedes usarlo para que la API
            no se duerma. Con 1 VM 24/7 sigues dentro del free tier (dan hasta 3 VMs).
          </li>
          <li>
            Audio a <strong className="text-text-primary">{cap.audio_quality_kbps} kbps</strong> — buena
            calidad y caben ~{cap.songs_estimated_max} canciones en {data.storage.volume_gb} GB.
          </li>
          <li>
            Los <strong className="text-text-primary">stems</strong> ocupan ~5x el tamano original.
            Separa solo las que necesites.
          </li>
          <li>
            Al <strong className="text-text-primary">borrar una cancion</strong> se eliminan tambien
            sus stems y edits automaticamente.
          </li>
          <li>
            Revisa el billing real en{' '}
            <strong className="text-text-primary">fly.io/dashboard</strong> para confirmar.
          </li>
        </ul>
      </div>

      {!data.is_fly && (
        <div className="text-[10px] text-text-muted bg-bg-tertiary rounded-md p-2 text-center">
          Corriendo en modo local — los datos de Fly.io se actualizan al deployar
        </div>
      )}
    </div>
  );
}
