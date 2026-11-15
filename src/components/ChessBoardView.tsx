'use client';

import { Chess, type Square } from 'chess.js';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Dictionary } from '@/lib/i18n/en';

export type BoardTheme = 'classic' | 'slate' | 'walnut';

const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  classic: { light: '#eeeed2', dark: '#769656' },
  slate: { light: '#e2e8f0', dark: '#64748b' },
  walnut: { light: '#f0d9b5', dark: '#b58863' },
};

export interface ChessBoardViewProps {
  fen: string;
  orientation: 'white' | 'black';
  interactive: boolean;
  lastMove?: { from: string; to: string } | null;
  theme?: BoardTheme;
  onPlayerMove: (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => void;
  labels: Dictionary['promotion'];
}

const emptySubscribe = () => () => {};

export function ChessBoardView({
  fen,
  orientation,
  interactive,
  lastMove,
  theme = 'classic',
  onPlayerMove,
  labels,
}: ChessBoardViewProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [selectedState, setSelectedState] = useState<{ fen: string; square: string } | null>(null);
  const [pendingState, setPendingState] = useState<{
    fen: string;
    from: string;
    to: string;
  } | null>(null);

  const selectedSquare = selectedState?.fen === fen ? selectedState.square : null;
  const pendingPromotion = pendingState?.fen === fen ? pendingState : null;
  const setSelectedSquare = (square: string | null) =>
    setSelectedState(square ? { fen, square } : null);
  const setPendingPromotion = (pending: { from: string; to: string } | null) =>
    setPendingState(pending ? { fen, ...pending } : null);

  const chess = useMemo(() => new Chess(fen), [fen]);

  const legalTargets = useMemo(() => {
    if (!interactive || !selectedSquare) return new Map<string, boolean>();
    const moves = chess.moves({ square: selectedSquare as Square, verbose: true });
    const map = new Map<string, boolean>();
    for (const m of moves) {
      map.set(m.to, Boolean(m.captured));
    }
    return map;
  }, [chess, interactive, selectedSquare]);

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    const board = chess.board();
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
    return null;
  }, [chess]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(202, 138, 4, 0.28)' };
      styles[lastMove.to] = { backgroundColor: 'rgba(202, 138, 4, 0.38)' };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(15, 118, 110, 0.35)' };
    }
    for (const [sq, isCapture] of legalTargets.entries()) {
      styles[sq] = isCapture
        ? {
            background: 'radial-gradient(circle, transparent 58%, rgba(15, 118, 110, 0.55) 60%)',
          }
        : {
            background: 'radial-gradient(circle, rgba(15, 118, 110, 0.45) 22%, transparent 25%)',
          };
    }
    if (checkSquare) {
      styles[checkSquare] = {
        backgroundColor: 'rgba(220, 38, 38, 0.45)',
      };
    }
    return styles;
  }, [checkSquare, lastMove, legalTargets, selectedSquare]);

  const attemptMove = (from: string, to: string): boolean => {
    if (!interactive) return false;
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (legal.length === 0) return false;

    const needsPromotion = legal.some((m) => Boolean(m.promotion));
    if (needsPromotion) {
      setPendingPromotion({ from, to });
      setSelectedSquare(null);
      return true;
    }

    setSelectedSquare(null);
    onPlayerMove({ from, to });
    return true;
  };

  if (!mounted) {
    return (
      <div
        dir="ltr"
        className="aspect-square w-full max-w-[540px] rounded-lg border border-stone-300 bg-stone-200/70"
      />
    );
  }

  return (
    <div
      dir="ltr"
      style={{ unicodeBidi: 'isolate' }}
      className="relative aspect-square w-full max-w-[540px] select-none overflow-hidden rounded-lg border border-stone-300 shadow-sm"
      data-testid="chessboard-container"
    >
      <Chessboard
        options={{
          id: 'arena-board',
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          showNotation: true,
          squareStyles,
          darkSquareStyle: { backgroundColor: BOARD_THEMES[theme].dark },
          lightSquareStyle: { backgroundColor: BOARD_THEMES[theme].light },
          canDragPiece: ({ piece }) => {
            if (!interactive) return false;
            const turnPrefix = chess.turn();
            return piece.pieceType.toLowerCase().startsWith(turnPrefix);
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return attemptMove(sourceSquare, targetSquare);
          },
          onSquareClick: ({ square }) => {
            if (!interactive) return;
            if (selectedSquare && legalTargets.has(square)) {
              attemptMove(selectedSquare, square);
              return;
            }
            const piece = chess.get(square as Square);
            if (piece && piece.color === chess.turn()) {
              setSelectedSquare(square === selectedSquare ? null : square);
            } else {
              setSelectedSquare(null);
            }
          },
        }}
      />

      {pendingPromotion ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/50 p-4"
          role="dialog"
          aria-label={labels.title}
        >
          <div className="w-full max-w-xs rounded-lg border border-stone-300 bg-white p-4 shadow-lg">
            <p className="mb-3 text-sm font-semibold text-stone-900">{labels.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => {
                    const pending = pendingPromotion;
                    setPendingPromotion(null);
                    onPlayerMove({ from: pending.from, to: pending.to, promotion: piece });
                  }}
                  className="rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-stone-100"
                >
                  {labels[piece]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
