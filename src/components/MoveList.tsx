'use client';

export interface MoveLogEntry {
  ply: number;
  san: string;
  fenAfter: string;
  by: 'human' | 'model';
  comment?: string | null;
  latencyMs?: number | null;
  illegalAttempts?: number;
  fallbackUsed?: boolean;
  totalTokens?: number;
}

interface MoveListProps {
  moves: MoveLogEntry[];
  title: string;
  activePly?: number;
  onSelectPly?: (ply: number) => void;
}

export function MoveList({ moves, title, activePly, onSelectPly }: MoveListProps) {
  const pairs: Array<{ moveNumber: number; white?: MoveLogEntry; black?: MoveLogEntry }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{title}</h2>
      <div
        dir="ltr"
        style={{ unicodeBidi: 'isolate' }}
        className="max-h-60 overflow-y-auto font-mono text-sm tabular-nums"
      >
        {pairs.length === 0 ? (
          <p className="py-4 text-center font-sans text-xs text-stone-400 dark:text-stone-500">1. ...</p>
        ) : (
          <div className="space-y-1">
            {pairs.map((pair) => (
              <div key={pair.moveNumber} className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1">
                <span className="text-xs text-stone-400 dark:text-stone-500">{pair.moveNumber}.</span>
                {[pair.white, pair.black].map((entry, idx) =>
                  entry ? (
                    <button
                      key={entry.ply}
                      type="button"
                      onClick={() => onSelectPly?.(entry.ply)}
                      className={`flex items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors ${
                        activePly === entry.ply
                          ? 'bg-teal-700 text-white'
                          : 'bg-stone-50 text-stone-800 hover:bg-stone-100 dark:bg-stone-800/70 dark:text-stone-200 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span>{entry.san}</span>
                      <span className="flex items-center gap-1">
                        {entry.totalTokens && entry.totalTokens > 0 ? (
                          <span
                            className={`text-[10px] ${
                              activePly === entry.ply
                                ? 'text-teal-100'
                                : 'text-stone-400 dark:text-stone-500'
                            }`}
                          >
                            {entry.totalTokens}t
                          </span>
                        ) : null}
                        {entry.illegalAttempts && entry.illegalAttempts > 0 ? (
                          <span
                            className={`rounded px-1 text-[10px] ${
                              activePly === entry.ply
                                ? 'bg-amber-200 text-stone-900'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                            }`}
                            title={`Illegal attempts: ${entry.illegalAttempts}`}
                          >
                            !{entry.illegalAttempts}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ) : (
                    <span key={`empty-${pair.moveNumber}-${idx}`} />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
