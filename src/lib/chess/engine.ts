import { Chess, type Color, type PieceSymbol } from 'chess.js';

export const MAX_PGN_BYTES = 16_384;

export type GameTermination =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'resign'
  | 'forfeit'
  | 'draw_agreement'
  | 'timeout'
  | 'move_limit';

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface GameStatus {
  isGameOver: boolean;
  result: GameResult;
  termination: GameTermination | null;
  inCheck: boolean;
}

export interface CapturedPieces {
  w: PieceSymbol[];
  b: PieceSymbol[];
}

export interface ReplayedPosition {
  chess: Chess;
  fen: string;
  pgn: string;
  turn: Color;
  ply: number;
  historySan: string[];
  recentMovesSan: string[];
  legalMovesSan: string[];
  status: GameStatus;
  captured: CapturedPieces;
}

const STARTING_COUNTS: Record<Exclude<PieceSymbol, 'k'>, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

/**
 * Computes captured pieces for each side by comparing remaining board pieces
 * against a standard starting set.
 */
export function getCapturedPieces(chess: Chess): CapturedPieces {
  const remaining: Record<Color, Record<Exclude<PieceSymbol, 'k'>, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== 'k') {
        remaining[cell.color][cell.type] += 1;
      }
    }
  }

  const captured: CapturedPieces = { w: [], b: [] };
  const order: Array<Exclude<PieceSymbol, 'k'>> = ['q', 'r', 'b', 'n', 'p'];

  for (const piece of order) {
    const missingWhite = Math.max(0, STARTING_COUNTS[piece] - remaining.w[piece]);
    const missingBlack = Math.max(0, STARTING_COUNTS[piece] - remaining.b[piece]);
    for (let i = 0; i < missingWhite; i += 1) captured.w.push(piece);
    for (let i = 0; i < missingBlack; i += 1) captured.b.push(piece);
  }

  return captured;
}

/**
 * Derives standardized game-over status from a Chess instance.
 */
export function getGameStatus(chess: Chess): GameStatus {
  const inCheck = chess.inCheck();

  if (!chess.isGameOver()) {
    return {
      isGameOver: false,
      result: '*',
      termination: null,
      inCheck,
    };
  }

  if (chess.isCheckmate()) {
    // The side to move is checkmated, so the opposite side won.
    const result: GameResult = chess.turn() === 'w' ? '0-1' : '1-0';
    return { isGameOver: true, result, termination: 'checkmate', inCheck };
  }

  if (chess.isStalemate()) {
    return { isGameOver: true, result: '1/2-1/2', termination: 'stalemate', inCheck };
  }

  if (chess.isInsufficientMaterial()) {
    return { isGameOver: true, result: '1/2-1/2', termination: 'insufficient_material', inCheck };
  }

  if (chess.isThreefoldRepetition()) {
    return { isGameOver: true, result: '1/2-1/2', termination: 'threefold_repetition', inCheck };
  }

  return { isGameOver: true, result: '1/2-1/2', termination: 'fifty_move_rule', inCheck };
}

/**
 * Normalizes minor LLM SAN formatting quirks before legality validation.
 */
export function sanitizeSanCandidate(raw: string): string {
  let s = raw.trim();
  // Strip leading move numbers like "1.", "12...", "12. "
  s = s.replace(/^\d+\s*\.{1,3}\s*/, '');
  // Strip trailing annotation glyphs (!, ?, !?, etc.)
  s = s.replace(/[!?]+$/g, '');
  // Normalize zero-castling notation to capital O
  s = s.replace(/^0-0-0([+#]?)$/, 'O-O-O$1');
  s = s.replace(/^0-0([+#]?)$/, 'O-O$1');
  return s.trim();
}

/**
 * Replays a PGN string from the standard starting position and enforces
 * payload size and maximum move limits.
 */
export function replayPgn(pgn: string, maxMoves = 200): ReplayedPosition {
  if (pgn.length > MAX_PGN_BYTES) {
    throw new Error(`PGN exceeds maximum allowed size (${MAX_PGN_BYTES} bytes).`);
  }

  const chess = new Chess();
  const trimmed = pgn.trim();

  if (trimmed.length > 0) {
    try {
      chess.loadPgn(trimmed);
    } catch {
      throw new Error('Invalid PGN: could not replay move history.');
    }
  }

  // Re-verify from a clean starting position when headers could have set a custom FEN.
  const historySan = chess.history();
  if (historySan.length > maxMoves * 2) {
    throw new Error(`Game exceeds maximum move limit (${maxMoves} full moves).`);
  }

  const verified = new Chess();
  for (const san of historySan) {
    const applied = verified.move(san);
    if (!applied) {
      throw new Error(`Illegal move in PGN history: ${san}`);
    }
  }

  return {
    chess: verified,
    fen: verified.fen(),
    pgn: verified.pgn(),
    turn: verified.turn(),
    ply: historySan.length,
    historySan,
    recentMovesSan: historySan.slice(-16),
    legalMovesSan: verified.moves(),
    status: getGameStatus(verified),
    captured: getCapturedPieces(verified),
  };
}

/**
 * Converts a UCI move (e.g., "e2e4" or "e7e8q") into canonical SAN for a FEN.
 */
export function uciToSan(fen: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return null;
  }
  const chess = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4, 5) || undefined;
  try {
    const move = chess.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}
