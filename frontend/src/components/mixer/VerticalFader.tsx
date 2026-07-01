import { useRef, useCallback, useEffect, useState } from 'react';

interface VerticalFaderProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  color?: string;
  label?: string;
}

export function VerticalFader({ value, onChange, color = '#6366f1', label }: VerticalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const positionToValue = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(ratio * 100) / 100;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(positionToValue(e.clientY));
  }, [onChange, positionToValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    onChange(positionToValue(e.clientY));
  }, [dragging, onChange, positionToValue]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('selectstart', prevent);
    return () => document.removeEventListener('selectstart', prevent);
  }, [dragging]);

  const percent = value * 100;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-5 cursor-pointer select-none"
      style={{ touchAction: 'none', height: '100%' }}
    >
      {/* Track background */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1.5 rounded-full overflow-hidden bg-bg-tertiary">
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-colors"
          style={{
            height: `${percent}%`,
            backgroundColor: color,
            opacity: dragging ? 0.9 : 0.6,
          }}
        />
      </div>

      {/* Thumb */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ bottom: `${percent}%`, top: 'auto', transform: `translateX(-50%) translateY(50%)` }}
      >
        <div
          className={`w-5 h-3 rounded-sm border transition-colors ${
            dragging
              ? 'bg-text-primary border-accent shadow-lg'
              : 'bg-bg-tertiary border-border hover:border-text-muted'
          }`}
          style={{
            boxShadow: dragging ? `0 0 6px ${color}60` : '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {/* Grip lines */}
          <div className="flex flex-col items-center justify-center h-full gap-px">
            <div className="w-2.5 h-px bg-text-muted/40 rounded-full" />
            <div className="w-2.5 h-px bg-text-muted/40 rounded-full" />
          </div>
        </div>
      </div>

      {/* Label */}
      {label && (
        <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[8px] text-text-muted font-mono tabular-nums whitespace-nowrap">
          {Math.round(value * 100)}
        </div>
      )}
    </div>
  );
}
