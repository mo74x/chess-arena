import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Chess } from 'chess.js';
import { resolveAiMove } from '../src/lib/arena/resolve-move';
import { getGameStatus } from '../src/lib/chess/engine';
import { getServerEnv } from '../src/lib/env';
import {
  ARENA_MODELS,
  type GameMode,
  type IllegalMovePolicy,
} from '../src/lib/providers/models.config';
import { disposeStockfishWorkers, getBestMove } from '../src/lib/stockfish/engine';

interface BenchmarkArgs {
  models: string[];
  levels: number[];
  games: number;
  mode: Exclude<GameMode, 'engine'>;
  policy: IllegalMovePolicy;
  dryRun: boolean;
  resume: boolean;
  yes: boolean;
}

interface MatchRecord {
  id: string;
  modelId: string;
  level: number;
  modelColor: 'w' | 'b';
  result: string;
  termination: string;
  plies: number;
  illegalAttempts: number;
  fallbackMoves: number;
  tokens: number;
}

interface CheckpointFile {
  records: MatchRecord[];
  totalTokens: number;
}

const CHECKPOINT_PATH = path.join(process.cwd(), 'scripts', 'benchmark-results.json');

function parseArgs(argv: string[]): BenchmarkArgs {
  const getFlag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const dryRun = argv.includes('--dry-run');
  const resume = argv.includes('--resume');
  const yes = argv.includes('--yes');

  const modelsRaw = getFlag('models');
  const models = modelsRaw
    ? modelsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : dryRun
      ? ['mock-legal']
      : ['claude-haiku', 'gemini-flash', 'gpt-4o-mini'];

  const levelsRaw = getFlag('levels');
  const levels = levelsRaw
    ? levelsRaw.split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n))
    : dryRun
      ? [1]
      : [1, 5, 10];

  const games = Math.max(1, Number(getFlag('games') ?? (dryRun ? '1' : '2')));
  const mode = (getFlag('mode') === 'assisted' ? 'assisted' : 'pure') as Exclude<GameMode, 'engine'>;
  const policy = (getFlag('policy') === 'friendly' ? 'friendly' : 'strict') as IllegalMovePolicy;

  return { models, levels, games, mode, policy, dryRun, resume, yes };
}

function loadCheckpoint(resume: boolean): CheckpointFile {
  if (!resume || !fs.existsSync(CHECKPOINT_PATH)) {
    return { records: [], totalTokens: 0 };
  }
  try {
    const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
    return JSON.parse(raw) as CheckpointFile;
  } catch {
    return { records: [], totalTokens: 0 };
  }
}

function saveCheckpoint(data: CheckpointFile): void {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function confirmRun(estimateUsd: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Estimated max cost: ${estimateUsd}. Proceed? (y/N) `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

async function playBenchmarkGame(
  modelId: string,
  level: number,
  modelColor: 'w' | 'b',
  mode: Exclude<GameMode, 'engine'>,
  policy: IllegalMovePolicy,
  maxTokensPerGame: number,
  maxMovesPerGame: number,
  maxPliesOverride?: number,
): Promise<MatchRecord> {
  const chess = new Chess();
  let illegalAttempts = 0;
  let fallbackMoves = 0;
  let tokens = 0;
  let termination = 'unknown';
  let result = '*';

  const maxPlies = maxPliesOverride ?? maxMovesPerGame * 2;

  for (let ply = 0; ply < maxPlies; ply += 1) {
    const status = getGameStatus(chess);
    if (status.isGameOver) {
      result = status.result;
      termination = status.termination ?? 'checkmate';
      break;
    }

    if (tokens >= maxTokensPerGame) {
      result = '1/2-1/2';
      termination = 'token_cap';
      break;
    }

    if (chess.turn() === modelColor) {
      const ai = await resolveAiMove({
        pgn: chess.pgn(),
        modelId,
        mode,
        policy,
        allowServerFallback: true,
        includeEval: false,
      });
      illegalAttempts += ai.telemetry.illegalAttempts;
      if (ai.telemetry.fallbackUsed) fallbackMoves += 1;
      tokens += ai.telemetry.usage.totalTokens;

      if (ai.san) {
        chess.move(ai.san);
      }
      if (ai.gameOver) {
        result = ai.result;
        termination = ai.termination ?? 'forfeit';
        break;
      }
    } else {
      const engineMove = await getBestMove(chess.fen(), level, 80);
      chess.move(engineMove.san);
    }
  }

  if (result === '*') {
    const finalStatus = getGameStatus(chess);
    result = finalStatus.isGameOver ? finalStatus.result : '1/2-1/2';
    termination = finalStatus.termination ?? 'move_limit';
  }

  return {
    id: `${modelId}:L${level}:${modelColor}`,
    modelId,
    level,
    modelColor,
    result,
    termination,
    plies: chess.history().length,
    illegalAttempts,
    fallbackMoves,
    tokens,
  };
}

function renderMarkdownSummary(records: MatchRecord[]): string {
  const byModel = new Map<string, MatchRecord[]>();
  for (const r of records) {
    const list = byModel.get(r.modelId) ?? [];
    list.push(r);
    byModel.set(r.modelId, list);
  }

  const lines = [
    '| Model | Games | Wins | Draws | Losses | Illegal Attempts | Avg Plies | Tokens |',
    '| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const [modelId, list] of byModel.entries()) {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let illegal = 0;
    let plies = 0;
    let tokens = 0;

    for (const r of list) {
      illegal += r.illegalAttempts;
      plies += r.plies;
      tokens += r.tokens;
      if (r.result === '1/2-1/2') draws += 1;
      else if ((r.modelColor === 'w' && r.result === '1-0') || (r.modelColor === 'b' && r.result === '0-1')) wins += 1;
      else losses += 1;
    }

    lines.push(
      `| ${modelId} | ${list.length} | ${wins} | ${draws} | ${losses} | ${illegal} | ${Math.round(plies / list.length)} | ${tokens} |`,
    );
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = getServerEnv();

  for (const modelId of args.models) {
    if (!ARENA_MODELS.some((m) => m.id === modelId)) {
      throw new Error(`Unknown modelId in --models: ${modelId}`);
    }
  }

  const totalMatchups = args.models.length * args.levels.length * args.games;
  const estTokens = args.dryRun ? 0 : totalMatchups * 12_000;
  const estCost = args.dryRun ? '$0.00 (dry-run)' : `~$${((estTokens / 1_000_000) * 3).toFixed(2)} USD`;

  console.log(`Benchmark plan: ${totalMatchups} games across [${args.models.join(', ')}] vs Stockfish levels [${args.levels.join(', ')}]`);

  if (!args.dryRun && !args.yes) {
    const ok = await confirmRun(estCost);
    if (!ok) {
      console.log('Benchmark cancelled.');
      return;
    }
  }

  const checkpoint = loadCheckpoint(args.resume);
  const doneKeys = new Set(checkpoint.records.map((r) => r.id));

  try {
    for (const modelId of args.models) {
      for (const level of args.levels) {
        for (let g = 0; g < args.games; g += 1) {
          if (checkpoint.totalTokens >= env.DAILY_GLOBAL_TOKEN_BUDGET) {
            console.warn('Reached DAILY_GLOBAL_TOKEN_BUDGET. Stopping benchmark.');
            break;
          }
          const modelColor: 'w' | 'b' = g % 2 === 0 ? 'w' : 'b';
          const key = `${modelId}:L${level}:${modelColor}:${g}`;
          if (doneKeys.has(key)) continue;

          const record = await playBenchmarkGame(
            modelId,
            level,
            modelColor,
            args.mode,
            args.policy,
            env.MAX_TOKENS_PER_GAME,
            env.MAX_MOVES_PER_GAME,
            args.dryRun ? 8 : undefined,
          );
          record.id = key;
          checkpoint.records.push(record);
          checkpoint.totalTokens += record.tokens;
          if (!args.dryRun) {
            saveCheckpoint(checkpoint);
          }
        }
      }
    }

    console.log('\n' + renderMarkdownSummary(checkpoint.records));
  } finally {
    disposeStockfishWorkers();
  }
}

void main();
