import { useRef, useCallback } from 'react';

interface KnobProps {
  value: number; // -1 to 1
  onChange: (value: number) => void;
  size?: number;
  color?: string;
  label?: string;
}

export function Knob({ value, onChange, size = 40, color = '#6366f1', label }: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  const angle = value * 135; // -135 to 135 degrees

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startValue: value };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = (dragRef.current.startY - e.clientY) / 100;
      const newValue = Math.max(-1, Math.min(1, dragRef.current.startValue + delta));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [value, onChange]);

  const handleDoubleClick = useCallback(() => {
    onChange(0);
  }, [onChange]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={knobRef}
        className="relative cursor-pointer"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg viewBox="0 0 40 40" width={size} height={size}>
          {/* Track */}
          <circle cx="20" cy="20" r="16" fill="none" stroke="#333348" strokeWidth="3"
            strokeDasharray="75.4 25.13" strokeDashoffset="-12.57"
            transform="rotate(135 20 20)" />
          {/* Knob body */}
          <circle cx="20" cy="20" r="13" fill="#1a1a24" stroke="#444" strokeWidth="1" />
          {/* Indicator */}
          <line
            x1="20" y1="20" x2="20" y2="9"
            stroke={color} strokeWidth="2" strokeLinecap="round"
            transform={`rotate(${angle} 20 20)`}
          />
        </svg>
      </div>
      {label && <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>}
    </div>
  );
}
