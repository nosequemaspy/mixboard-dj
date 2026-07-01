import { useEffect, useRef } from 'react';
import type { DeckId } from '../../types';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface VUMeterProps {
  deckId: DeckId;
}

const SEGMENTS = 12;

export function VUMeter({ deckId }: VUMeterProps) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animRef = useRef<number>(0);
  const engine = getAudioEngine();

  useEffect(() => {
    const update = () => {
      const data = engine.getAnalyserData(deckId);
      // Compute average level without Array.reduce (avoid GC pressure)
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      const active = Math.round(avg * SEGMENTS);

      for (let i = 0; i < SEGMENTS; i++) {
        const el = segmentRefs.current[i];
        if (el) el.style.opacity = i < active ? '1' : '0.15';
      }
      animRef.current = requestAnimationFrame(update);
    };
    animRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animRef.current);
  }, [deckId, engine]);

  return (
    <div className="flex flex-col-reverse gap-0.5">
      {Array.from({ length: SEGMENTS }, (_, i) => {
        let color = 'bg-success';
        if (i >= 10) color = 'bg-danger';
        else if (i >= 7) color = 'bg-warning';
        return (
          <div
            key={i}
            ref={el => { segmentRefs.current[i] = el; }}
            className={`w-2 h-2 rounded-sm ${color}`}
            style={{ opacity: 0.15, transition: 'opacity 50ms' }}
          />
        );
      })}
    </div>
  );
}
