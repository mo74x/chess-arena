import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Chess } from 'chess.js';
import { uciToSan } from '@/lib/chess/engine';
import { getServerEnv } from '@/lib/env';
import { ENGINE_SKILL_MAX, ENGINE_SKILL_MIN } from '@/lib/providers/models.config';
import type { StockfishCandidate } from '@/lib/providers/types';

export const MATE_CLAMP_CP = 1000;

export function clampCentipawns(cp: number, mate?: number): number {
  if (mate !== undefined) {
    return mate > 0 ? MATE_CLAMP_CP : -MATE_CLAMP_CP;
  }
  return Math.max(-MATE_CLAMP_CP, Math.min(MATE_CLAMP_CP, cp));
}

/**
 * Standard Lichess-style accuracy formula from Average Centipawn Loss (ACPL).
 */
export function centipawnLossToAccuracy(acpl: number): number {
  const safeAcpl = Math.max(0, acpl);
  const raw = 103.1668 * Math.exp(-0.04354 * safeAcpl) - 3.1669;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

export interface PlyEvaluation {
  ply: number;
  san: string;
  by: 'w' | 'b';
  evalCp: number;
  mate?: number;
  cpLoss: number;
}

export interface SideAnalysisSummary {
  acpl: number;
  accuracy: number;
}

export interface GameAnalysisResult {
  plies: PlyEvaluation[];
  white: SideAnalysisSummary;
  black: SideAnalysisSummary;
}

/**
 * Computes per-ply centipawn loss and side accuracy from White-perspective evaluations
 * (index 0 is starting position before ply 1; index i is position after ply i).
 */
export function computeGameAccuracy(
  evalsWhitePov: Array<{ evalCp: number; mate?: number }>,
  sans: string[],
): GameAnalysisResult {
  const plies: PlyEvaluation[] = [];
  let whiteLossSum = 0;
  let whiteCount = 0;
  let blackLossSum = 0;
  let blackCount = 0;

  for (let i = 0; i < sans.length; i += 1) {
    const before = evalsWhitePov[i] ?? { evalCp: 0 };
    const after = evalsWhitePov[i + 1] ?? { evalCp: 0 };
    const beforeCp = clampCentipawns(before.evalCp, before.mate);
    const afterCp = clampCentipawns(after.evalCp, after.mate);
    const by: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';

    // Loss is positive when the moving side's evaluation drops.
    const rawLoss = by === 'w' ? beforeCp - afterCp : afterCp - beforeCp;
    const cpLoss = Math.max(0, rawLoss);

    if (by === 'w') {
      whiteLossSum += cpLoss;
      whiteCount += 1;
    } else {
      blackLossSum += cpLoss;
      blackCount += 1;
    }

    plies.push({
      ply: i + 1,
      san: sans[i] ?? '',
      by,
      evalCp: afterCp,
      mate: after.mate,
      cpLoss,
    });
  }

  const whiteAcpl = whiteCount > 0 ? Math.round((whiteLossSum / whiteCount) * 10) / 10 : 0;
  const blackAcpl = blackCount > 0 ? Math.round((blackLossSum / blackCount) * 10) / 10 : 0;

  return {
    plies,
    white: {
      acpl: whiteAcpl,
      accuracy: centipawnLossToAccuracy(whiteAcpl),
    },
    black: {
      acpl: blackAcpl,
      accuracy: centipawnLossToAccuracy(blackAcpl),
    },
  };
}

interface ParsedInfoLine {
  multipv: number;
  evalCp: number;
  mate?: number;
  uci?: string;
}

function parseInfoLine(line: string): ParsedInfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) {
    return null;
  }

  const multipvMatch = /\bmultipv (\d+)/.exec(line);
  const cpMatch = /\bscore cp (-?\d+)/.exec(line);
  const mateMatch = /\bscore mate (-?\d+)/.exec(line);
  const pvMatch = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);

  if (!pvMatch) {
    return null;
  }

  const multipv = multipvMatch ? Number(multipvMatch[1]) : 1;
  const mate = mateMatch ? Number(mateMatch[1]) : undefined;
  const evalCp = cpMatch ? Number(cpMatch[1]) : mate !== undefined ? (mate > 0 ? MATE_CLAMP_CP : -MATE_CLAMP_CP) : 0;

  return {
    multipv,
    evalCp,
    mate,
    uci: pvMatch[1],
  };
}

function resolveEngineLaunch(): { command: string; args: string[] } {
  const env = getServerEnv();
  const customPath = env.STOCKFISH_PATH?.trim();
  if (customPath) {
    return { command: customPath, args: [] };
  }

  const bundledScript = path.join(
    process.cwd(),
    'node_modules',
    'stockfish',
    'bin',
    'stockfish-19-lite-single.js',
  );
  if (!fs.existsSync(bundledScript)) {
    throw new Error(`Bundled Stockfish script not found at ${bundledScript}`);
  }
  return { command: process.execPath, args: [bundledScript] };
}

/**
 * Single UCI child process wrapper with an internal async mutex queue,
 * per-command timeout, and automatic respawn on crash.
 */
class UciWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lineListeners = new Set<(line: string) => void>();
  private ready = false;
  private pendingCount = 0;

  get load(): number {
    return this.pendingCount;
  }

  private ensureProcess(): void {
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return;
    }

    const { command, args } = resolveEngineLaunch();
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = child;
    this.ready = false;

    const rl = readline.createInterface({ input: child.stdout });
    this.rl = rl;
    rl.on('line', (line) => {
      for (const listener of this.lineListeners) {
        listener(line);
      }
    });

    child.on('exit', () => {
      this.cleanup();
    });
    child.on('error', () => {
      this.cleanup();
    });
  }

  private cleanup(): void {
    this.ready = false;
    this.lineListeners.clear();
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
      this.proc = null;
    }
  }

  private sendRaw(cmd: string): void {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error('Stockfish process is not writable.');
    }
    this.proc.stdin.write(`${cmd}\n`);
  }

  private waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      const timer = setTimeout(() => {
        this.lineListeners.delete(onLine);
        this.cleanup();
        reject(new Error(`Stockfish UCI command timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      const onLine = (line: string) => {
        collected.push(line);
        if (predicate(line)) {
          clearTimeout(timer);
          this.lineListeners.delete(onLine);
          resolve(collected);
        }
      };

      this.lineListeners.add(onLine);
    });
  }

  private async ensureReady(): Promise<void> {
    this.ensureProcess();
    if (this.ready) return;

    const uciPromise = this.waitForLine((l) => l === 'uciok', 5000);
    this.sendRaw('uci');
    await uciPromise;

    const readyPromise = this.waitForLine((l) => l === 'readyok', 5000);
    this.sendRaw('isready');
    await readyPromise;

    this.ready = true;
  }

  async run<T>(
    task: (helpers: {
      send: (cmd: string) => void;
      exec: (cmd: string, until: (line: string) => boolean, timeoutMs: number) => Promise<string[]>;
    }) => Promise<T>,
  ): Promise<T> {
    this.pendingCount += 1;
    const runTask = async (): Promise<T> => {
      try {
        await this.ensureReady();
        const send = (cmd: string) => {
          this.sendRaw(cmd);
        };
        const exec = async (cmd: string, until: (line: string) => boolean, timeoutMs: number) => {
          const waiter = this.waitForLine(until, timeoutMs);
          this.sendRaw(cmd);
          return waiter;
        };
        return await task({ send, exec });
      } finally {
        this.pendingCount = Math.max(0, this.pendingCount - 1);
      }
    };

    const next = this.queue.then(runTask, runTask);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  dispose(): void {
    this.cleanup();
  }
}

/**
 * Bounded pool of UCI workers that routes each request to the least-loaded worker
 * so concurrent live /api/move calls do not serialize behind a single process.
 */
class UciWorkerPool {
  private workers: UciWorker[] = [];

  private ensureWorkers(): UciWorker[] {
    const targetSize = getServerEnv().STOCKFISH_POOL_SIZE;
    while (this.workers.length < targetSize) {
      this.workers.push(new UciWorker());
    }
    return this.workers;
  }

  private pickWorker(): UciWorker {
    const pool = this.ensureWorkers();
    let best = pool[0]!;
    for (let i = 1; i < pool.length; i += 1) {
      if (pool[i]!.load < best.load) {
        best = pool[i]!;
      }
    }
    return best;
  }

  run<T>(
    task: (helpers: {
      send: (cmd: string) => void;
      exec: (cmd: string, until: (line: string) => boolean, timeoutMs: number) => Promise<string[]>;
    }) => Promise<T>,
  ): Promise<T> {
    return this.pickWorker().run(task);
  }

  dispose(): void {
    for (const worker of this.workers) {
      worker.dispose();
    }
    this.workers = [];
  }
}

// Pooled fast workers handle concurrent live /api/move turns; batchAnalysisWorker stays isolated for /api/analyze.
const fastMoveWorker = new UciWorkerPool();
const batchAnalysisWorker = new UciWorker();

export async function checkStockfishHealth(): Promise<boolean> {
  try {
    await fastMoveWorker.run(async ({ exec }) => {
      await exec('isready', (l) => l === 'readyok', 3000);
    });
    return true;
  } catch {
    return false;
  }
}

export async function getTopCandidates(
  fen: string,
  multiPv = 3,
  movetimeMs = 250,
): Promise<StockfishCandidate[]> {
  const pvCount = Math.max(1, Math.min(5, multiPv));
  const boundedTime = Math.max(50, Math.min(2000, movetimeMs));
  const chess = new Chess(fen);
  const sideToMove = chess.turn();

  return fastMoveWorker.run(async ({ send, exec }) => {
    send(`setoption name MultiPV value ${pvCount}`);
    send('setoption name Skill Level value 20');
    await exec('isready', (l) => l === 'readyok', 2000);
    send(`position fen ${fen}`);
    const lines = await exec(
      `go movetime ${boundedTime}`,
      (l) => l.startsWith('bestmove '),
      boundedTime + 3000,
    );

    const byPv = new Map<number, ParsedInfoLine>();
    for (const line of lines) {
      const parsed = parseInfoLine(line);
      if (parsed && parsed.uci) {
        byPv.set(parsed.multipv, parsed);
      }
    }

    const candidates: StockfishCandidate[] = [];
    for (let idx = 1; idx <= pvCount; idx += 1) {
      const info = byPv.get(idx);
      if (!info?.uci) continue;
      const san = uciToSan(fen, info.uci);
      if (!san) continue;
      // Convert Stockfish side-to-move POV to White POV for consistent eval bar.
      const sign = sideToMove === 'w' ? 1 : -1;
      candidates.push({
        san,
        uci: info.uci,
        evalCp: clampCentipawns(info.evalCp * sign, info.mate !== undefined ? info.mate * sign : undefined),
        mate: info.mate !== undefined ? info.mate * sign : undefined,
      });
    }

    return candidates;
  });
}

export async function getBestMove(
  fen: string,
  skillLevel: number,
  movetimeMs = 250,
): Promise<{ san: string; uci: string; evalCp: number; mate?: number }> {
  const clampedSkill = Math.max(ENGINE_SKILL_MIN, Math.min(ENGINE_SKILL_MAX, Math.round(skillLevel)));
  const boundedTime = Math.max(50, Math.min(2000, movetimeMs));
  const chess = new Chess(fen);
  const sideToMove = chess.turn();

  return fastMoveWorker.run(async ({ send, exec }) => {
    send('setoption name MultiPV value 1');
    send(`setoption name Skill Level value ${clampedSkill}`);
    await exec('isready', (l) => l === 'readyok', 2000);
    send(`position fen ${fen}`);
    const lines = await exec(
      `go movetime ${boundedTime}`,
      (l) => l.startsWith('bestmove '),
      boundedTime + 3000,
    );

    const bestLine = [...lines].reverse().find((l) => l.startsWith('bestmove '));
    const bestUci = bestLine?.split(/\s+/)[1];
    if (!bestUci || bestUci === '(none)') {
      throw new Error('Stockfish returned no legal move.');
    }

    const san = uciToSan(fen, bestUci);
    if (!san) {
      throw new Error(`Stockfish returned invalid UCI move: ${bestUci}`);
    }

    let lastInfo: ParsedInfoLine | null = null;
    for (const line of lines) {
      const parsed = parseInfoLine(line);
      if (parsed) lastInfo = parsed;
    }

    const sign = sideToMove === 'w' ? 1 : -1;
    const evalCp = lastInfo
      ? clampCentipawns(lastInfo.evalCp * sign, lastInfo.mate !== undefined ? lastInfo.mate * sign : undefined)
      : 0;
    const mate = lastInfo?.mate !== undefined ? lastInfo.mate * sign : undefined;

    return { san, uci: bestUci, evalCp, mate };
  });
}

export async function analyzeGame(pgn: string, movetimeMs = 80): Promise<GameAnalysisResult> {
  const boundedTime = Math.max(30, Math.min(300, movetimeMs));
  const source = new Chess();
  if (pgn.trim().length > 0) {
    source.loadPgn(pgn.trim());
  }
  const sans = source.history();

  const replay = new Chess();
  const fens: string[] = [replay.fen()];
  const turns: Array<'w' | 'b'> = [replay.turn()];

  for (const san of sans) {
    replay.move(san);
    fens.push(replay.fen());
    turns.push(replay.turn());
  }

  const evalsWhitePov: Array<{ evalCp: number; mate?: number }> = [];

  await batchAnalysisWorker.run(async ({ send, exec }) => {
    send('setoption name MultiPV value 1');
    send('setoption name Skill Level value 20');
    await exec('isready', (l) => l === 'readyok', 2000);

    for (let idx = 0; idx < fens.length; idx += 1) {
      const fen = fens[idx]!;
      const turn = turns[idx]!;
      const posCheck = new Chess(fen);
      if (posCheck.isCheckmate()) {
        // Side to move is checkmated
        const mateScore = turn === 'w' ? -MATE_CLAMP_CP : MATE_CLAMP_CP;
        evalsWhitePov.push({ evalCp: mateScore, mate: turn === 'w' ? -1 : 1 });
        continue;
      }
      if (posCheck.isDraw()) {
        evalsWhitePov.push({ evalCp: 0 });
        continue;
      }

      send(`position fen ${fen}`);
      const lines = await exec(
        `go movetime ${boundedTime}`,
        (l) => l.startsWith('bestmove '),
        boundedTime + 2000,
      );

      let lastInfo: ParsedInfoLine | null = null;
      for (const line of lines) {
        const parsed = parseInfoLine(line);
        if (parsed) lastInfo = parsed;
      }

      const sign = turn === 'w' ? 1 : -1;
      const evalCp = lastInfo
        ? clampCentipawns(lastInfo.evalCp * sign, lastInfo.mate !== undefined ? lastInfo.mate * sign : undefined)
        : 0;
      const mate = lastInfo?.mate !== undefined ? lastInfo.mate * sign : undefined;
      evalsWhitePov.push({ evalCp, mate });
    }
  });

  return computeGameAccuracy(evalsWhitePov, sans);
}

export function disposeStockfishWorkers(): void {
  fastMoveWorker.dispose();
  batchAnalysisWorker.dispose();
}
