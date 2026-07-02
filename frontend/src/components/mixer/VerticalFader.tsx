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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const positionToValue = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(ratio * 100) / 100;
  }, []);

  // Use document-level listeners for reliable drag tracking
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      onChangeRef.current(positionToValue(e.clientY));
    };
    const handleUp = () => {
      setDragging(false);
    };
    const preventSelect = (e: Event) => e.preventDefault();

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    document.addEventListener('selectstart', preventSelect);

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
      document.removeEventListener('selectstart', preventSelect);
    };
  }, [dragging, positionToValue]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    onChangeRef.current(positionToValue(e.clientY));
  }, [positionToValue]);

  const percent = value * 100;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      className="relative w-8 cursor-pointer select-none"
      style={{ touchAction: 'none', height: '100%' }}
    >
      {/* Track background */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1 bottom-1 w-2 rounded-full overflow-hidden bg-bg-tertiary">
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full"
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

      {/* Value label */}
      {label && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-text-muted font-mono tabular-nums whitespace-nowrap">
          {Math.round(value * 100)}
        </div>
      )}
    </div>
  );
}
