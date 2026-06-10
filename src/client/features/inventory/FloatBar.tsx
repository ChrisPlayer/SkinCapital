interface FloatBarProps {
  value: number;
}

export function FloatBar({ value }: FloatBarProps) {
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{
      // Brand palette progression: sf-green -> gold -> sf-pink.
      background: 'linear-gradient(90deg, #4ADE80 0%, #4ADE80 12%, #f0b90b 38%, #ff3366 90%, #ff3366 100%)',
    }}>
      <div
        className="absolute top-[-2px] w-[3px] h-[8px] bg-white rounded-sm shadow-[0_0_6px_rgba(255,255,255,0.5)]"
        style={{ left: `${value * 100}%`, transform: 'translateX(-50%)' }}
      />
    </div>
  );
}
