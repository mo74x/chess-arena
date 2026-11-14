'use client';

interface EvalBarProps {
  evalCp?: number;
  mate?: number;
  label: string;
}

export function EvalBar({ evalCp = 0, mate, label }: EvalBarProps) {
  let whitePercent = 50;
  let display = '0.0';

  if (mate !== undefined) {
    whitePercent = mate > 0 ? 100 : 0;
    display = `M${Math.abs(mate)}`;
  } else {
    const clamped = Math.max(-1000, Math.min(1000, evalCp));
    whitePercent = Math.round(50 + (clamped / 1000) * 48);
    display = `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;
  }

  return (
    <div dir="ltr" className="flex flex-col items-center gap-1.5" aria-label={label}>
      <span className="font-mono text-xs font-medium tabular-nums text-stone-700">{display}</span>
      <div className="relative h-64 w-5 overflow-hidden rounded border border-stone-300 bg-stone-800 sm:h-[460px]">
        <div
          className="absolute bottom-0 left-0 right-0 bg-stone-100 transition-all duration-300"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
    </div>
  );
}
