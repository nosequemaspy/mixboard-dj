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

  const handleDoubleClick = useCallback(() => {
    onChangeRef.current(1.0);
  }, []);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      className="relative w-14 cursor-pointer select-none"
      style={{ touchAction: 'none', height: '100%' }}
    >
      {/* Track background — wide bar showing full range */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-5 rounded-lg overflow-hidden bg-bg-tertiary border border-border/50">
        {/* Tick marks for visual reference */}
        <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
          {[100, 75, 50, 25, 0].map(tick => (
            <div key={tick} className="w-full flex items-center">
              <div className="w-full h-px bg-text-muted/15" />
            </div>
          ))}
        </div>
        {/* Fill — colored portion showing current level */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-lg transition-[height] duration-75"
          style={{
            height: `${percent}%`,
            background: `linear-gradient(to top, ${color}, ${color}cc)`,
            opacity: dragging ? 1 : 0.85,
          }}
        />
      </div>

      {/* Thumb */}
      <div
        className="absolute left-1/2 pointer-events-none z-10"
        style={{ bottom: `${percent}%`, transform: `translateX(-50%) translateY(50%)` }}
      >
        <div
          className={`w-12 h-6 rounded-md border-2 transition-all duration-100 ${
            dragging
              ? 'bg-text-primary border-accent shadow-lg scale-105'
              : 'bg-bg-tertiary border-border hover:border-text-muted'
          }`}
          style={{
            boxShadow: dragging ? `0 0 14px ${color}90` : '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          {/* Grip lines */}
          <div className="flex flex-col items-center justify-center h-full gap-[3px]">
            <div className="w-6 h-px bg-text-muted/60 rounded-full" />
            <div className="w-6 h-px bg-text-muted/60 rounded-full" />
            <div className="w-6 h-px bg-text-muted/60 rounded-full" />
          </div>
        </div>
      </div>

      {/* Value label */}
      {label && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted font-mono tabular-nums whitespace-nowrap">
          {Math.round(value * 100)}
        </div>
      )}
    </div>
  );
}
