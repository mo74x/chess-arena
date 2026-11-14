'use client';

import { Chess } from 'chess.js';
import {
  AlertTriangle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  PlusCircle,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GameResult,
  type GameTermination,
  getCapturedPieces,
  getGameStatus,
} from '@/lib/chess/engine';
import { getDictionary, type Locale } from '@/lib/i18n';
import { ARENA_MODELS, ENGINE_SKILL_DEFAULT } from '@/lib/providers/models.config';
import { ArenaSetup, type MatchConfig } from './ArenaSetup';
import { ChessBoardView } from './ChessBoardView';
import { EvalBar } from './EvalBar';
import { type AnalysisSummary, GameOverDialog } from './GameOverDialog';
import { LanguageToggle } from './LanguageToggle';
import { MoveList, type MoveLogEntry } from './MoveList';

const PIECE_GLYPHS: Record<string, string> = {
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: 'P',
};

export function GameWorkspace() {
  const [locale, setLocale] = useState<Locale>('en');
  const dict = useMemo(() => getDictionary(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const [config, setConfig] = useState<MatchConfig>({
    modelId: 'mock-legal',
    humanColor: 'w',
    mode: 'pure',
    policy: 'strict',
    skillLevel: ENGINE_SKILL_DEFAULT,
    apiKey: '',
  });

  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [fen, setFen] = useState(() => new Chess().fen());
  const [pgn, setPgn] = useState('');
  const [moves, setMoves] = useState<MoveLogEntry[]>([]);
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(true);
  const [evalState, setEvalState] = useState<{ evalCp?: number; mate?: number }>({});
  const [copiedPgn, setCopiedPgn] = useState(false);

  const [gameOverState, setGameOverState] = useState<{
    over: boolean;
    result: GameResult;
    termination: GameTermination | null;
    resignedBy?: 'w' | 'b';
    forfeitedBy?: 'w' | 'b';
  }>({ over: false, result: '*', termination: null });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ id: string; persisted: boolean } | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);

  const requestInFlightRef = useRef(false);

  const modelSpec = useMemo(
    () => ARENA_MODELS.find((m) => m.id === config.modelId) ?? ARENA_MODELS[0]!,
    [config.modelId],
  );

  const chessInstance = useMemo(() => new Chess(fen), [fen]);
  const captured = useMemo(() => {
    const replay = new Chess();
    if (pgn.trim().length > 0) {
      replay.loadPgn(pgn);
    }
    return getCapturedPieces(replay);
  }, [pgn]);

  const totalIllegalAttempts = useMemo(
    () => moves.reduce((sum, m) => sum + (m.illegalAttempts ?? 0), 0),
    [moves],
  );
  const totalFallbackMoves = useMemo(
    () => moves.filter((m) => m.fallbackUsed).length,
    [moves],
  );
  const avgMoveTimeMs = useMemo(() => {
    const modelMoves = moves.filter((m) => m.by === 'model' && typeof m.latencyMs === 'number');
    if (modelMoves.length === 0) return 0;
    const sum = modelMoves.reduce((acc, m) => acc + (m.latencyMs ?? 0), 0);
    return Math.round(sum / modelMoves.length);
  }, [moves]);

  const latestComment = useMemo(() => {
    const modelMoves = [...moves].reverse().find((m) => m.by === 'model' && m.comment);
    return modelMoves?.comment ?? null;
  }, [moves]);

  const requestAiTurn = useCallback(
    async (currentPgn: string, currentMoves: MoveLogEntry[]) => {
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      setThinking(true);
      setErrorBanner(null);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.apiKey.trim()) {
          headers['x-api-key'] = config.apiKey.trim();
        }

        const res = await fetch('/api/move', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pgn: currentPgn,
            modelId: config.modelId,
            mode: config.mode,
            policy: config.policy,
            skillLevel: config.mode === 'engine' ? config.skillLevel : undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorBanner(data.error || dict.game.modelUnavailable);
          return;
        }

        if (data.telemetry?.usage?.totalTokens) {
          setTotalTokens((prev) => prev + Number(data.telemetry.usage.totalTokens));
        }
        if (typeof data.evalCp === 'number' || typeof data.mate === 'number') {
          setEvalState({ evalCp: data.evalCp, mate: data.mate });
        }

        if (data.san) {
          const replay = new Chess();
          if (currentPgn.trim()) replay.loadPgn(currentPgn);
          const applied = replay.move(data.san);
          if (applied) {
            setLastMoveSquares({ from: applied.from, to: applied.to });
          }

          const entry: MoveLogEntry = {
            ply: currentMoves.length + 1,
            san: data.san,
            fenAfter: data.fen,
            by: 'model',
            comment: data.comment ?? null,
            latencyMs: data.telemetry?.latencyMs ?? null,
            illegalAttempts: data.telemetry?.illegalAttempts ?? 0,
            fallbackUsed: Boolean(data.telemetry?.fallbackUsed),
          };
          const nextMoves = [...currentMoves, entry];
          setMoves(nextMoves);
          setFen(data.fen);
          setPgn(data.pgn);
        }

        if (data.gameOver) {
          const forfeitedBy =
            data.termination === 'forfeit'
              ? config.humanColor === 'w'
                ? 'b'
                : 'w'
              : undefined;
          setGameOverState({
            over: true,
            result: data.result,
            termination: data.termination,
            forfeitedBy,
          });
          setDialogOpen(true);
        }
      } catch {
        setErrorBanner(dict.game.modelUnavailable);
      } finally {
        requestInFlightRef.current = false;
        setThinking(false);
      }
    },
    [config, dict.game.modelUnavailable],
  );

  const startNewGame = useCallback(() => {
    const fresh = new Chess();
    setFen(fresh.fen());
    setPgn('');
    setMoves([]);
    setLastMoveSquares(null);
    setErrorBanner(null);
    setEvalState({});
    setGameOverState({ over: false, result: '*', termination: null });
    setDialogOpen(false);
    setAnalysis(null);
    setSavedInfo(null);
    setTotalTokens(0);
    setPhase('playing');

    if (config.humanColor === 'b') {
      void requestAiTurn('', []);
    }
  }, [config.humanColor, requestAiTurn]);

  const handleHumanMove = (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    if (thinking || gameOverState.over) return;
    const replay = new Chess();
    if (pgn.trim()) replay.loadPgn(pgn);
    if (replay.turn() !== config.humanColor) return;

    const applied = replay.move(move);
    if (!applied) return;

    const nextFen = replay.fen();
    const nextPgn = replay.pgn();
    const entry: MoveLogEntry = {
      ply: moves.length + 1,
      san: applied.san,
      fenAfter: nextFen,
      by: 'human',
    };
    const nextMoves = [...moves, entry];

    setFen(nextFen);
    setPgn(nextPgn);
    setMoves(nextMoves);
    setLastMoveSquares({ from: applied.from, to: applied.to });

    const status = getGameStatus(replay);
    if (status.isGameOver) {
      setGameOverState({
        over: true,
        result: status.result,
        termination: status.termination,
      });
      setDialogOpen(true);
      return;
    }

    void requestAiTurn(nextPgn, nextMoves);
  };

  const handleResign = () => {
    if (gameOverState.over) return;
    const result: GameResult = config.humanColor === 'w' ? '0-1' : '1-0';
    setGameOverState({
      over: true,
      result,
      termination: 'resign',
      resignedBy: config.humanColor,
    });
    setDialogOpen(true);
  };

  const handleTakeback = () => {
    if (thinking || gameOverState.over || moves.length === 0) return;
    const replay = new Chess();
    if (pgn.trim()) replay.loadPgn(pgn);
    // Undo back to human's turn
    replay.undo();
    if (replay.turn() !== config.humanColor && replay.history().length > 0) {
      replay.undo();
    }
    const keptCount = replay.history().length;
    setMoves((prev) => prev.slice(0, keptCount));
    setFen(replay.fen());
    setPgn(replay.pgn());
    setLastMoveSquares(null);
  };

  const handleCopyPgn = async () => {
    try {
      await navigator.clipboard.writeText(pgn);
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadPgn = () => {
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-arena-${config.modelId}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAnalyze = async () => {
    if (!pgn.trim() || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis({ white: data.white, black: data.black });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveGame = async () => {
    if (!pgn.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgn,
          modelId: config.modelId,
          mode: config.mode,
          humanColor: config.humanColor,
          resignedBy: gameOverState.resignedBy,
          forfeitedBy: gameOverState.forfeitedBy,
          illegalAttempts: totalIllegalAttempts,
          fallbackMoves: totalFallbackMoves,
          totalTokens,
          moves: moves.map((m) => ({
            ply: m.ply,
            san: m.san,
            fenAfter: m.fenAfter,
            by: m.by,
            comment: m.comment ?? null,
            latencyMs: m.latencyMs ?? null,
            illegalAttempts: m.illegalAttempts ?? 0,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedInfo({ id: data.id, persisted: Boolean(data.persisted) });
      }
    } finally {
      setSaving(false);
    }
  };

  const isHumanTurn = !thinking && !gameOverState.over && chessInstance.turn() === config.humanColor;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold tracking-tight text-stone-900">
              {dict.appName}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="font-medium text-stone-900">
                {dict.nav.play}
              </Link>
              <Link href="/history" className="hover:text-stone-900">
                {dict.nav.history}
              </Link>
              <Link href="/models" className="hover:text-stone-900">
                {dict.nav.models}
              </Link>
            </nav>
          </div>
          <LanguageToggle locale={locale} label={dict.language.toggleLabel} onToggle={setLocale} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {phase === 'setup' ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-stone-600">{dict.tagline}</p>
            <ArenaSetup
              config={config}
              onChange={setConfig}
              onStart={startNewGame}
              labels={dict.setup}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center gap-3">
              <EvalBar
                evalCp={evalState.evalCp}
                mate={evalState.mate}
                label={dict.game.evalTitle}
              />
              <div className="w-full max-w-[540px] space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900">{modelSpec.displayName}</span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                      {dict.setup.modes[config.mode].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-stone-500">
                    <span>
                      {(config.humanColor === 'w' ? captured.b : captured.w)
                        .map((p) => PIECE_GLYPHS[p])
                        .join(' ')}
                    </span>
                    {thinking ? (
                      <span className="inline-flex items-center gap-1 font-sans text-teal-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {dict.game.thinking}
                      </span>
                    ) : null}
                  </div>
                </div>

                <ChessBoardView
                  fen={fen}
                  orientation={config.humanColor === 'w' ? 'white' : 'black'}
                  interactive={isHumanTurn}
                  lastMove={lastMoveSquares}
                  onPlayerMove={handleHumanMove}
                  labels={dict.promotion}
                />

                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                  <span className="font-semibold text-stone-900">{dict.game.you}</span>
                  <span className="font-mono text-stone-500">
                    {(config.humanColor === 'w' ? captured.w : captured.b)
                      .map((p) => PIECE_GLYPHS[p])
                      .join(' ')}
                  </span>
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              {errorBanner ? (
                <div
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                  role="alert"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
              ) : null}

              {showComments && latestComment ? (
                <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700">
                  <span className="font-semibold text-stone-900">{modelSpec.displayName}: </span>
                  <span>{latestComment}</span>
                </div>
              ) : null}

              <MoveList moves={moves} title={dict.game.movesTitle} activePly={moves.length} />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResign}
                  disabled={gameOverState.over}
                  data-testid="resign-btn"
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>{dict.game.resign}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTakeback}
                  disabled={thinking || gameOverState.over || moves.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>{dict.game.takeback}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowComments((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50"
                >
                  {showComments ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showComments ? dict.game.hideComments : dict.game.showComments}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyPgn}
                  disabled={!pgn}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedPgn ? dict.game.copiedPgn : dict.game.copyPgn}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPgn}
                  disabled={!pgn}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{dict.game.downloadPgn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('setup')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>{dict.game.newGame}</span>
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>

      <GameOverDialog
        open={dialogOpen}
        result={gameOverState.result}
        termination={gameOverState.termination}
        illegalAttempts={totalIllegalAttempts}
        fallbackMoves={totalFallbackMoves}
        avgMoveTimeMs={avgMoveTimeMs}
        analysis={analysis}
        analyzing={analyzing}
        saving={saving}
        savedGameId={savedInfo?.id ?? null}
        savedPersisted={savedInfo?.persisted ?? false}
        onAnalyze={handleAnalyze}
        onSave={handleSaveGame}
        onRematch={startNewGame}
        onClose={() => setDialogOpen(false)}
        labels={dict.gameOver}
        gameLabels={dict.game}
      />
    </div>
  );
}
