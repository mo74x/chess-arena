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
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
      <div
        dir="ltr"
        style={{ unicodeBidi: 'isolate' }}
        className="max-h-60 overflow-y-auto font-mono text-sm tabular-nums"
      >
        {pairs.length === 0 ? (
          <p className="py-4 text-center font-sans text-xs text-stone-400">1. ...</p>
        ) : (
          <div className="space-y-1">
            {pairs.map((pair) => (
              <div key={pair.moveNumber} className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1">
                <span className="text-xs text-stone-400">{pair.moveNumber}.</span>
                {[pair.white, pair.black].map((entry, idx) =>
                  entry ? (
                    <button
                      key={entry.ply}
                      type="button"
                      onClick={() => onSelectPly?.(entry.ply)}
                      className={`flex items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors ${
                        activePly === entry.ply
                          ? 'bg-teal-700 text-white'
                          : 'bg-stone-50 text-stone-800 hover:bg-stone-100'
                      }`}
                    >
                      <span>{entry.san}</span>
                      {entry.illegalAttempts && entry.illegalAttempts > 0 ? (
                        <span
                          className={`ms-1 rounded px-1 text-[10px] ${
                            activePly === entry.ply
                              ? 'bg-amber-200 text-stone-900'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                          title={`Illegal attempts: ${entry.illegalAttempts}`}
                        >
                          !{entry.illegalAttempts}
                        </span>
                      ) : null}
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
