'use client';

import { Chess } from 'chess.js';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { en } from '@/lib/i18n/en';
import { ChessBoardView } from './ChessBoardView';
import { MoveList, type MoveLogEntry } from './MoveList';

interface ReplayViewerProps {
  moves: MoveLogEntry[];
  orientation: 'white' | 'black';
}

const INITIAL_FEN = new Chess().fen();

export function ReplayViewer({ moves, orientation }: ReplayViewerProps) {
  const [ply, setPly] = useState(moves.length);

  const currentFen = useMemo(() => {
    if (ply <= 0) return INITIAL_FEN;
    return moves[ply - 1]?.fenAfter ?? INITIAL_FEN;
  }, [moves, ply]);

  const activeComment = ply > 0 ? moves[ply - 1]?.comment : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
      <div className="w-full max-w-[540px] space-y-3">
        <ChessBoardView
          fen={currentFen}
          orientation={orientation}
          interactive={false}
          onPlayerMove={() => {}}
          labels={en.promotion}
        />

        <div dir="ltr" className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPly(0)}
            disabled={ply === 0}
            aria-label={en.replay.start}
            className="rounded-md border border-stone-300 bg-white p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronFirst className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPly((p) => Math.max(0, p - 1))}
            disabled={ply === 0}
            aria-label={en.replay.prev}
            className="rounded-md border border-stone-300 bg-white p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center font-mono text-xs tabular-nums text-stone-600 dark:text-stone-400">
            {ply} / {moves.length}
          </span>
          <button
            type="button"
            onClick={() => setPly((p) => Math.min(moves.length, p + 1))}
            disabled={ply === moves.length}
            aria-label={en.replay.next}
            className="rounded-md border border-stone-300 bg-white p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPly(moves.length)}
            disabled={ply === moves.length}
            aria-label={en.replay.end}
            className="rounded-md border border-stone-300 bg-white p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLast className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {activeComment ? (
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
            {activeComment}
          </div>
        ) : null}
        <MoveList
          moves={moves}
          title={en.game.movesTitle}
          activePly={ply}
          onSelectPly={(selected) => setPly(selected)}
        />
      </div>
    </div>
  );
}
