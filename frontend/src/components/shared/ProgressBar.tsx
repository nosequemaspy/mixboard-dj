interface ProgressBarProps {
  value: number; // 0 to 1
  color?: string;
  className?: string;
}

export function ProgressBar({ value, color = '#6366f1', className = '' }: ProgressBarProps) {
  return (
    <div className={`h-1.5 bg-bg-tertiary rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
