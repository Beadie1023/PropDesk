import { TIMEFRAMES, setTimeframe } from '@/lib/timeframe';
import { useTimeframe } from '@/lib/useTimeframe';

/** Switches the signal / chart / marker timeframe everywhere at once (shared, remembered). */
export function TimeframeToggle() {
  const timeframe = useTimeframe();
  return (
    <div
      className="flex gap-1 rounded-lg bg-ink-900/70 border border-ink-600/50 p-1"
      role="group"
      aria-label="Signal timeframe"
      title="Timeframe for the chart, signals and position marker (the Probability Gate always uses 1H candles for daily context)"
    >
      {TIMEFRAMES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTimeframe(opt.value)}
          aria-pressed={timeframe === opt.value}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold font-mono transition ${
            timeframe === opt.value ? 'bg-accent-500 text-ink-950' : 'text-steel-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
