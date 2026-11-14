'use client';

import { BarChart2, ExternalLink, RotateCcw, Save, X } from 'lucide-react';
import Link from 'next/link';
import type { GameResult, GameTermination } from '@/lib/chess/engine';
import type { Dictionary } from '@/lib/i18n/en';

export interface AnalysisSummary {
  white: { acpl: number; accuracy: number };
  black: { acpl: number; accuracy: number };
}

interface GameOverDialogProps {
  open: boolean;
  result: GameResult;
  termination: GameTermination | null;
  illegalAttempts: number;
  fallbackMoves: number;
  avgMoveTimeMs: number;
  analysis: AnalysisSummary | null;
  analyzing: boolean;
  saving: boolean;
  savedGameId: string | null;
  savedPersisted: boolean;
  onAnalyze: () => void;
  onSave: () => void;
  onRematch: () => void;
  onClose: () => void;
  labels: Dictionary['gameOver'];
  gameLabels: Dictionary['game'];
}

export function GameOverDialog({
  open,
  result,
  termination,
  illegalAttempts,
  fallbackMoves,
  avgMoveTimeMs,
  analysis,
  analyzing,
  saving,
  savedGameId,
  savedPersisted,
  onAnalyze,
  onSave,
  onRematch,
  onClose,
  labels,
  gameLabels,
}: GameOverDialogProps) {
  if (!open) return null;

  const terminationText = termination
    ? labels.terminations[termination]
    : '';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/50 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="game-over-dialog"
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between border-b border-stone-200 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{labels.title}</h2>
            <p className="text-sm text-stone-600">
              <span className="font-mono font-semibold text-stone-900">{result}</span>
              {terminationText ? ` · ${terminationText}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-stone-50 p-2.5">
            <div className="text-[11px] text-stone-500">{labels.illegalAttempts}</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-stone-900">
              {illegalAttempts}
            </div>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5">
            <div className="text-[11px] text-stone-500">{labels.fallbackMoves}</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-stone-900">
              {fallbackMoves}
            </div>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5">
            <div className="text-[11px] text-stone-500">{labels.avgMoveTime}</div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-stone-900">
              {avgMoveTimeMs}ms
            </div>
          </div>
        </div>

        {analysis ? (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
            <div>
              <div className="text-stone-500">{gameLabels.whiteAccuracy}</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-stone-900">
                {analysis.white.accuracy}% ({gameLabels.acpl}: {analysis.white.acpl})
              </div>
            </div>
            <div>
              <div className="text-stone-500">{gameLabels.blackAccuracy}</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-stone-900">
                {analysis.black.accuracy}% ({gameLabels.acpl}: {analysis.black.acpl})
              </div>
            </div>
          </div>
        ) : null}

        {savedGameId ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
            <span>{gameLabels.savedLink}</span>
            {savedPersisted ? (
              <Link
                href={`/games/${savedGameId}`}
                className="inline-flex items-center gap-1 font-medium underline"
              >
                <span>/games/{savedGameId.slice(0, 8)}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="font-mono text-[11px] text-stone-600">local-only</span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!analysis ? (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>{analyzing ? gameLabels.analyzing : gameLabels.analyzeButton}</span>
            </button>
          ) : null}

          {!savedGameId ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? gameLabels.saving : gameLabels.saveGame}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRematch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{labels.rematch}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
