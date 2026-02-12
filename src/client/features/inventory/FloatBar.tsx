interface FloatBarProps {
  value: number;
}

export function FloatBar({ value }: FloatBarProps) {
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{
      background: 'linear-gradient(90deg, #4CAF50 0%, #8BC34A 15%, #FFC107 38%, #FF9800 45%, #F44336 100%)',
    }}>
      <div
        className="absolute top-[-2px] w-[3px] h-[8px] bg-white rounded-sm shadow-[0_0_6px_rgba(255,255,255,0.5)]"
        style={{ left: `${value * 100}%`, transform: 'translateX(-50%)' }}
      />
    </div>
  );
}
