import { useSettingsStore } from '../../store/settingsStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type { CrossfaderCurve } from '../../types';

const curves: { id: CrossfaderCurve; label: string; description: string }[] = [
  { id: 'smooth', label: 'Smooth', description: 'Equal-power (cosine). Maintains consistent volume through the crossfade.' },
  { id: 'linear', label: 'Linear', description: 'Straight line. Simple proportional blend between decks.' },
  { id: 'sharp', label: 'Sharp', description: 'Fast cut. Both decks at full volume near center, quick transition at edges.' },
];

function CurvePreview({ curve, active }: { curve: CrossfaderCurve; active: boolean }) {
  const w = 100;
  const h = 50;
  const points = 50;

  const getY = (x: number): [number, number] => {
    const pos = x / w;
    switch (curve) {
      case 'linear':
        return [1 - pos, pos];
      case 'sharp': {
        const sharpness = 4;
        const a = pos < 0.5 ? 1 : Math.max(0, 1 - Math.pow((pos - 0.5) * 2, 1 / sharpness));
        const b = pos > 0.5 ? 1 : Math.max(0, 1 - Math.pow((0.5 - pos) * 2, 1 / sharpness));
        return [a, b];
      }
      case 'smooth':
      default:
        return [Math.cos(pos * Math.PI / 2), Math.sin(pos * Math.PI / 2)];
    }
  };

  const pathA: string[] = [];
  const pathB: string[] = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w;
    const [a, b] = getY(x);
    const cmd = i === 0 ? 'M' : 'L';
    pathA.push(`${cmd}${x},${h - a * h}`);
    pathB.push(`${cmd}${x},${h - b * h}`);
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <rect x="0" y="0" width={w} height={h} fill="transparent" />
      {/* Grid lines */}
      <line x1={w / 2} y1="0" x2={w / 2} y2={h} stroke="#333348" strokeWidth="0.5" strokeDasharray="2" />
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#333348" strokeWidth="0.5" strokeDasharray="2" />
      {/* Deck A curve (blue) */}
      <path d={pathA.join(' ')} fill="none" stroke={active ? '#3b82f6' : '#3b82f680'} strokeWidth="2" />
      {/* Deck B curve (orange) */}
      <path d={pathB.join(' ')} fill="none" stroke={active ? '#f97316' : '#f9731680'} strokeWidth="2" />
    </svg>
  );
}

export function MixerSection() {
  const { crossfaderCurve, setCrossfaderCurve } = useSettingsStore();
  const engine = getAudioEngine();

  const handleCurveChange = (curve: CrossfaderCurve) => {
    setCrossfaderCurve(curve);
    engine.setCrossfaderCurve(curve);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Crossfader Curve</h3>
        <div className="grid grid-cols-3 gap-3">
          {curves.map(c => (
            <button
              key={c.id}
              onClick={() => handleCurveChange(c.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                crossfaderCurve === c.id
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-tertiary hover:border-text-muted'
              }`}
            >
              <CurvePreview curve={c.id} active={crossfaderCurve === c.id} />
              <span className={`text-xs font-medium ${
                crossfaderCurve === c.id ? 'text-accent' : 'text-text-secondary'
              }`}>
                {c.label}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-3">
          {curves.find(c => c.id === crossfaderCurve)?.description}
        </p>
      </div>

      {/* Legend */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Legend</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-deck-a rounded" />
            <span className="text-xs text-text-secondary">Deck A</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-deck-b rounded" />
            <span className="text-xs text-text-secondary">Deck B</span>
          </div>
        </div>
        <p className="text-[11px] text-text-muted mt-2">
          The curve shows how each deck's volume changes as the crossfader moves from left (A) to right (B).
        </p>
      </div>
    </div>
  );
}
