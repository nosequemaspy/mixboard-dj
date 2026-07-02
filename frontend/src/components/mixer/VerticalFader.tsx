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
    e.stopPropagation();
    // Capture on the track element itself, not e.target (which could be a child)
    trackRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(positionToValue(e.clientY));
  }, [onChange, positionToValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    onChange(positionToValue(e.clientY));
  }, [dragging, onChange, positionToValue]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    trackRef.current?.releasePointerCapture(e.pointerId);
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
      className="relative w-8 cursor-pointer select-none"
      style={{ touchAction: 'none', height: '100%' }}
    >
      {/* Wider invisible hit area */}
      <div className="absolute inset-0" />

      {/* Track background */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1 bottom-1 w-2 rounded-full overflow-hidden bg-bg-tertiary">
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-[opacity] duration-75"
          style={{
            height: `${percent}%`,
            backgroundColor: color,
            opacity: dragging ? 1 : 0.7,
          }}
        />
      </div>

      {/* Thumb */}
      <div
        className="absolute left-1/2 pointer-events-none"
        style={{ bottom: `${percent}%`, transform: `translateX(-50%) translateY(50%)` }}
      >
        <div
          className={`w-7 h-4 rounded-sm border-2 transition-colors ${
            dragging
              ? 'bg-text-primary border-accent shadow-lg'
              : 'bg-bg-tertiary border-border hover:border-text-muted'
          }`}
          style={{
            boxShadow: dragging ? `0 0 8px ${color}80` : '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          {/* Grip lines */}
          <div className="flex flex-col items-center justify-center h-full gap-0.5">
            <div className="w-3.5 h-px bg-text-muted/50 rounded-full" />
            <div className="w-3.5 h-px bg-text-muted/50 rounded-full" />
          </div>
        </div>
      </div>

      {/* Label */}
      {label && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-text-muted font-mono tabular-nums whitespace-nowrap">
          {Math.round(value * 100)}
        </div>
      )}
    </div>
  );
}
