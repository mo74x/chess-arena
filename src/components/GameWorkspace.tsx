'use client';

import { Chess } from 'chess.js';
import {
  AlertTriangle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flag,
  Handshake,
  Loader2,
  PlusCircle,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GameResult,
  type GameTermination,
  getCapturedPieces,
  getGameStatus,
} from '@/lib/chess/engine';
import { detectOpening } from '@/lib/chess/openings';
import { playChessSound } from '@/lib/chess/sound';
import { getDictionary, type Locale } from '@/lib/i18n';
import {
  getOrCreatePlayerIdentity,
  type PlayerIdentity,
  savePlayerIdentity,
} from '@/lib/player/identity';
import { ARENA_MODELS, ENGINE_SKILL_DEFAULT } from '@/lib/providers/models.config';
import { ArenaSetup, type MatchConfig, type TimeControlOption } from './ArenaSetup';
import { type BoardTheme, ChessBoardView } from './ChessBoardView';
import { EvalBar } from './EvalBar';
import { type AnalysisSummary, GameOverDialog } from './GameOverDialog';
import { LanguageToggle } from './LanguageToggle';
import { MoveList, type MoveLogEntry } from './MoveList';
import { PlayerAvatar } from './PlayerAvatar';
import { ThemeToggle } from './ThemeToggle';

const PIECE_GLYPHS: Record<string, string> = {
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: 'P',
};

function getClockConfig(tc: TimeControlOption): { baseMs: number; incMs: number } | null {
  switch (tc) {
    case 'blitz5':
      return { baseMs: 5 * 60_000, incMs: 0 };
    case 'rapid10':
      return { baseMs: 10 * 60_000, incMs: 0 };
    case 'rapid15':
      return { baseMs: 15 * 60_000, incMs: 10_000 };
    default:
      return null;
  }
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function GameWorkspace() {
  const [locale, setLocale] = useState<Locale>('en');
  const dict = useMemo(() => getDictionary(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const [player, setPlayer] = useState<PlayerIdentity>(() => getOrCreatePlayerIdentity());
  const handlePlayerChange = useCallback((next: PlayerIdentity) => {
    setPlayer(next);
    savePlayerIdentity(next);
  }, []);

  const [config, setConfig] = useState<MatchConfig>({
    provider: 'mock',
    modelId: 'mock-legal',
    customModelId: '',
    humanColor: 'w',
    mode: 'pure',
    policy: 'strict',
    skillLevel: ENGINE_SKILL_DEFAULT,
    timeControl: 'none',
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('classic');
  const [drawNotice, setDrawNotice] = useState<string | null>(null);
  const [whiteMs, setWhiteMs] = useState<number | null>(null);
  const [blackMs, setBlackMs] = useState<number | null>(null);
  const [evalState, setEvalState] = useState<{ evalCp?: number; mate?: number }>({});
  const [copiedPgn, setCopiedPgn] = useState(false);

  const [gameOverState, setGameOverState] = useState<{
    over: boolean;
    result: GameResult;
    termination: GameTermination | null;
    resignedBy?: 'w' | 'b';
    forfeitedBy?: 'w' | 'b';
    timedOutBy?: 'w' | 'b';
    drawAgreed?: boolean;
  }>({ over: false, result: '*', termination: null });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ id: string; persisted: boolean } | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [tokenBreakdown, setTokenBreakdown] = useState<{ input: number; output: number }>({
    input: 0,
    output: 0,
  });

  const requestInFlightRef = useRef(false);

  const modelSpec = useMemo(
    () => ARENA_MODELS.find((m) => m.id === config.modelId) ?? ARENA_MODELS[0]!,
    [config.modelId],
  );
  const usingCustomModel = config.customModelId.trim().length > 0;
  const activeModelId = usingCustomModel ? config.customModelId.trim() : config.modelId;
  const canonicalModelId = usingCustomModel
    ? `${config.provider}:${config.customModelId.trim()}`
    : config.modelId;
  const activeDisplayName = usingCustomModel ? config.customModelId.trim() : modelSpec.displayName;

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

  const opening = useMemo(
    () => detectOpening(moves.map((m) => m.san)),
    [moves],
  );

  useEffect(() => {
    if (phase !== 'playing' || gameOverState.over || config.timeControl === 'none') {
      return;
    }

    const activeColor = chessInstance.turn();
    let lastTick = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;

      if (activeColor === 'w') {
        setWhiteMs((prev) => {
          if (prev === null) return null;
          const next = Math.max(0, prev - delta);
          if (next === 0) {
            setGameOverState({
              over: true,
              result: '0-1',
              termination: 'timeout',
              timedOutBy: 'w',
            });
            setDialogOpen(true);
            playChessSound('gameover', soundEnabled);
          }
          return next;
        });
      } else {
        setBlackMs((prev) => {
          if (prev === null) return null;
          const next = Math.max(0, prev - delta);
          if (next === 0) {
            setGameOverState({
              over: true,
              result: '1-0',
              termination: 'timeout',
              timedOutBy: 'b',
            });
            setDialogOpen(true);
            playChessSound('gameover', soundEnabled);
          }
          return next;
        });
      }
    }, 100);

    return () => clearInterval(timer);
  }, [chessInstance, config.timeControl, gameOverState.over, phase, soundEnabled]);

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
            modelId: activeModelId,
            provider: config.provider,
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

        const moveTotalTokens = Number(data.telemetry?.usage?.totalTokens ?? 0);
        const moveInputTokens = Number(data.telemetry?.usage?.inputTokens ?? 0);
        const moveOutputTokens = Number(data.telemetry?.usage?.outputTokens ?? 0);
        if (moveTotalTokens > 0) {
          setTotalTokens((prev) => prev + moveTotalTokens);
          setTokenBreakdown((prev) => ({
            input: prev.input + moveInputTokens,
            output: prev.output + moveOutputTokens,
          }));
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
            if (replay.inCheck()) {
              playChessSound('check', soundEnabled);
            } else if (applied.captured) {
              playChessSound('capture', soundEnabled);
            } else {
              playChessSound('move', soundEnabled);
            }
          }

          const clockCfg = getClockConfig(config.timeControl);
          if (clockCfg && clockCfg.incMs > 0) {
            const aiColor = config.humanColor === 'w' ? 'b' : 'w';
            if (aiColor === 'w') {
              setWhiteMs((prev) => (prev !== null ? prev + clockCfg.incMs : null));
            } else {
              setBlackMs((prev) => (prev !== null ? prev + clockCfg.incMs : null));
            }
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
            totalTokens: moveTotalTokens > 0 ? moveTotalTokens : undefined,
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
          playChessSound('gameover', soundEnabled);
        }
      } catch {
        setErrorBanner(dict.game.modelUnavailable);
      } finally {
        requestInFlightRef.current = false;
        setThinking(false);
      }
    },
    [activeModelId, config, dict.game.modelUnavailable, soundEnabled],
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
    setTokenBreakdown({ input: 0, output: 0 });
    setDrawNotice(null);
    const clockCfg = getClockConfig(config.timeControl);
    setWhiteMs(clockCfg ? clockCfg.baseMs : null);
    setBlackMs(clockCfg ? clockCfg.baseMs : null);
    setPhase('playing');

    if (config.humanColor === 'b') {
      void requestAiTurn('', []);
    }
  }, [config.humanColor, config.timeControl, requestAiTurn]);

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
    setDrawNotice(null);

    const clockCfg = getClockConfig(config.timeControl);
    if (clockCfg && clockCfg.incMs > 0) {
      if (config.humanColor === 'w') {
        setWhiteMs((prev) => (prev !== null ? prev + clockCfg.incMs : null));
      } else {
        setBlackMs((prev) => (prev !== null ? prev + clockCfg.incMs : null));
      }
    }

    const status = getGameStatus(replay);
    if (status.isGameOver) {
      playChessSound('gameover', soundEnabled);
      setGameOverState({
        over: true,
        result: status.result,
        termination: status.termination,
      });
      setDialogOpen(true);
      return;
    }

    if (replay.inCheck()) {
      playChessSound('check', soundEnabled);
    } else if (applied.captured) {
      playChessSound('capture', soundEnabled);
    } else {
      playChessSound('move', soundEnabled);
    }

    void requestAiTurn(nextPgn, nextMoves);
  };

  const handleOfferDraw = () => {
    if (thinking || gameOverState.over) return;
    // Accept draw after move 10 when position is balanced or human is ahead
    const cpFromWhite = evalState.evalCp ?? 0;
    const cpForHuman = config.humanColor === 'w' ? cpFromWhite : -cpFromWhite;
    const canAccept = moves.length >= 20 && cpForHuman >= -50;
    if (canAccept) {
      playChessSound('gameover', soundEnabled);
      setGameOverState({
        over: true,
        result: '1/2-1/2',
        termination: 'draw_agreement',
        drawAgreed: true,
      });
      setDialogOpen(true);
    } else {
      setDrawNotice(dict.game.drawDeclined);
    }
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
          modelId: canonicalModelId,
          provider: config.provider,
          mode: config.mode,
          humanColor: config.humanColor,
          playerHandle: player.handle.trim() || undefined,
          playerAvatar: player.avatarId,
          playerToken: player.playerToken || undefined,
          resignedBy: gameOverState.resignedBy,
          forfeitedBy: gameOverState.forfeitedBy,
          timedOutBy: gameOverState.timedOutBy,
          drawAgreed: gameOverState.drawAgreed,
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
      const data = await res.json();
      if (res.ok) {
        setSavedInfo({ id: data.id, persisted: Boolean(data.persisted) });
      } else if (data?.error) {
        setErrorBanner(data.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const isHumanTurn = !thinking && !gameOverState.over && chessInstance.turn() === config.humanColor;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {dict.appName}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600 dark:text-stone-400">
              <Link href="/" className="font-medium text-stone-900 dark:text-stone-100">
                {dict.nav.play}
              </Link>
              <Link href="/history" className="hover:text-stone-900 dark:hover:text-stone-100">
                {dict.nav.history}
              </Link>
              <Link href="/models" className="hover:text-stone-900 dark:hover:text-stone-100">
                {dict.nav.models}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle locale={locale} label={dict.language.toggleLabel} onToggle={setLocale} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {phase === 'setup' ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-stone-600 dark:text-stone-400">{dict.tagline}</p>
            <ArenaSetup
              config={config}
              player={player}
              onPlayerChange={handlePlayerChange}
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
                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-stone-800 dark:bg-stone-900">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{activeDisplayName}</span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {dict.setup.modes[config.mode].label}
                    </span>
                    {totalTokens > 0 ? (
                      <span
                        data-testid="live-token-meter"
                        title={`In: ${tokenBreakdown.input} / Out: ${tokenBreakdown.output}`}
                        className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                      >
                        {totalTokens.toLocaleString()} {dict.game.tokensLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-stone-500 dark:text-stone-400">
                    <span>
                      {(config.humanColor === 'w' ? captured.b : captured.w)
                        .map((p) => PIECE_GLYPHS[p])
                        .join(' ')}
                    </span>
                    {thinking ? (
                      <span className="inline-flex items-center gap-1 font-sans text-teal-700 dark:text-teal-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {dict.game.thinking}
                      </span>
                    ) : null}
                    {config.timeControl !== 'none' ? (
                      <span
                        data-testid="ai-clock"
                        className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      >
                        {formatClock((config.humanColor === 'w' ? blackMs : whiteMs) ?? 0)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <ChessBoardView
                  fen={fen}
                  orientation={config.humanColor === 'w' ? 'white' : 'black'}
                  interactive={isHumanTurn}
                  lastMove={lastMoveSquares}
                  theme={boardTheme}
                  onPlayerMove={handleHumanMove}
                  labels={dict.promotion}
                />

                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-stone-800 dark:bg-stone-900">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar avatarId={player.avatarId} size="sm" />
                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                      {player.handle.trim() || dict.game.you}
                    </span>
                    {opening ? (
                      <span
                        data-testid="opening-badge"
                        className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                      >
                        {opening.eco} · {opening.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-500 dark:text-stone-400">
                      {(config.humanColor === 'w' ? captured.w : captured.b)
                        .map((p) => PIECE_GLYPHS[p])
                        .join(' ')}
                    </span>
                    {config.timeControl !== 'none' ? (
                      <span
                        data-testid="human-clock"
                        className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      >
                        {formatClock((config.humanColor === 'w' ? whiteMs : blackMs) ?? 0)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              {errorBanner ? (
                <div
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
                  role="alert"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
              ) : null}

              {drawNotice ? (
                <div
                  data-testid="draw-notice"
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
                >
                  {drawNotice}
                </div>
              ) : null}

              {showComments && latestComment ? (
                <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
                  <span className="font-semibold text-stone-900 dark:text-stone-100">{activeDisplayName}: </span>
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>{dict.game.resign}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOfferDraw}
                  disabled={thinking || gameOverState.over}
                  data-testid="offer-draw-btn"
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Handshake className="h-3.5 w-3.5" />
                  <span>{dict.game.offerDraw}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  data-testid="sound-toggle-btn"
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  <span>{soundEnabled ? dict.game.soundOn : dict.game.soundOff}</span>
                </button>
                <select
                  aria-label={dict.game.boardTheme}
                  value={boardTheme}
                  onChange={(e) => setBoardTheme(e.target.value as BoardTheme)}
                  data-testid="board-theme-select"
                  className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                >
                  {(['classic', 'slate', 'walnut'] as const).map((themeKey) => (
                    <option key={themeKey} value={themeKey}>
                      {dict.game.boardTheme}: {dict.game.themes[themeKey]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTakeback}
                  disabled={thinking || gameOverState.over || moves.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>{dict.game.takeback}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowComments((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {showComments ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showComments ? dict.game.hideComments : dict.game.showComments}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyPgn}
                  disabled={!pgn}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedPgn ? dict.game.copiedPgn : dict.game.copyPgn}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPgn}
                  disabled={!pgn}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{dict.game.downloadPgn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('setup')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
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
