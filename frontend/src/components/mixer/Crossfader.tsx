import { useRef, useCallback, useEffect, useState } from 'react';

interface CrossfaderProps {
  value: number; // -1 to 1
  onChange: (value: number) => void;
}

export function Crossfader({ value, onChange }: CrossfaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const valueToPercent = (v: number) => ((v + 1) / 2) * 100;

  const positionToValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Snap to center when close
    const raw = ratio * 2 - 1;
    return Math.abs(raw) < 0.03 ? 0 : Math.round(raw * 100) / 100;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(positionToValue(e.clientX));
  }, [onChange, positionToValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    onChange(positionToValue(e.clientX));
  }, [dragging, onChange, positionToValue]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Prevent text selection while dragging
  useEffect(() => {
    if (!dragging) return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('selectstart', prevent);
    return () => document.removeEventListener('selectstart', prevent);
  }, [dragging]);

  const percent = valueToPercent(value);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-6 cursor-pointer select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Track background */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, #3b82f6, #1e293b 40%, #1e293b 60%, #f97316)',
          }}
        />
      </div>

      {/* Center notch */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-3 bg-text-muted/30 rounded-full" />

      {/* Thumb */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-shadow ${
          dragging ? 'scale-105' : ''
        }`}
        style={{ left: `${percent}%` }}
      >
        <div
          className={`w-5 h-5 rounded-md border-2 transition-colors ${
            dragging
              ? 'bg-text-primary border-accent shadow-lg shadow-accent/30'
              : 'bg-bg-tertiary border-border hover:border-text-muted'
          }`}
          style={{
            boxShadow: dragging
              ? '0 0 8px rgba(99, 102, 241, 0.4)'
              : '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {/* Grip lines */}
          <div className="flex flex-col items-center justify-center h-full gap-px">
            <div className="w-2 h-px bg-text-muted/40 rounded-full" />
            <div className="w-2 h-px bg-text-muted/40 rounded-full" />
            <div className="w-2 h-px bg-text-muted/40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
