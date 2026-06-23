import { useEffect, useRef, useState } from 'react';
import type { DeckId } from '../../types';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface VUMeterProps {
  deckId: DeckId;
}

export function VUMeter({ deckId }: VUMeterProps) {
  const [level, setLevel] = useState(0);
  const animRef = useRef<number>(0);
  const engine = getAudioEngine();

  useEffect(() => {
    const update = () => {
      const data = engine.getAnalyserData(deckId);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      setLevel(avg);
      animRef.current = requestAnimationFrame(update);
    };
    animRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animRef.current);
  }, [deckId, engine]);

  const segments = 12;
  const activeSegments = Math.round(level * segments);

  return (
    <div className="flex flex-col-reverse gap-0.5">
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < activeSegments;
        let color = 'bg-success';
        if (i >= 10) color = 'bg-danger';
        else if (i >= 7) color = 'bg-warning';
        return (
          <div
            key={i}
            className={`w-2 h-2 rounded-sm transition-opacity ${color} ${isActive ? 'opacity-100' : 'opacity-15'}`}
          />
        );
      })}
    </div>
  );
}
