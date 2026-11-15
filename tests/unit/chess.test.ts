import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  getCapturedPieces,
  getGameStatus,
  MAX_PGN_BYTES,
  replayPgn,
  sanitizeSanCandidate,
  uciToSan,
} from '@/lib/chess/engine';
import { detectOpening } from '@/lib/chess/openings';

describe('chess engine wrapper', () => {
  it('handles castling, en passant, and promotion in replayPgn', () => {
    const chess = new Chess();
    // Play a short legal sequence covering castling and en passant
    const moves = [
      'e4', 'a6',
      'Bc4', 'b5',
      'Bb3', 'c5',
      'Nf3', 'c4',
      'O-O', 'd5',
      'd4', 'cxd3', // en passant
    ];
    for (const m of moves) {
      expect(chess.move(m)).toBeTruthy();
    }

    const replayed = replayPgn(chess.pgn(), 200);
    expect(replayed.ply).toBe(12);
    expect(replayed.status.isGameOver).toBe(false);
    expect(replayed.historySan).toEqual(moves);
  });

  it('detects promotion via uciToSan', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(uciToSan(fen, 'a7a8q')).toBe('a8=Q+');
  });

  it('detects checkmate (Fool’s Mate)', () => {
    const replayed = replayPgn('1. f3 e5 2. g4 Qh4#', 200);
    expect(replayed.status.isGameOver).toBe(true);
    expect(replayed.status.result).toBe('0-1');
    expect(replayed.status.termination).toBe('checkmate');
    expect(replayed.status.inCheck).toBe(true);
  });

  it('detects stalemate and insufficient material', () => {
    const stalemateChess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const stalemateStatus = getGameStatus(stalemateChess);
    expect(stalemateStatus.isGameOver).toBe(true);
    expect(stalemateStatus.result).toBe('1/2-1/2');
    expect(stalemateStatus.termination).toBe('stalemate');

    const insufficientChess = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const insufficientStatus = getGameStatus(insufficientChess);
    expect(insufficientStatus.isGameOver).toBe(true);
    expect(insufficientStatus.result).toBe('1/2-1/2');
    expect(insufficientStatus.termination).toBe('insufficient_material');
  });

  it('detects threefold repetition and fifty-move rule', () => {
    const rep = new Chess();
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (let i = 0; i < 2; i += 1) {
      for (const m of cycle) rep.move(m);
    }
    expect(getGameStatus(rep).termination).toBe('threefold_repetition');

    const fifty = new Chess('4k3/8/8/8/8/8/R7/4K3 w - - 100 60');
    expect(getGameStatus(fifty).termination).toBe('fifty_move_rule');
  });

  it('sanitizes common LLM SAN formatting quirks', () => {
    expect(sanitizeSanCandidate('1. Nf3!')).toBe('Nf3');
    expect(sanitizeSanCandidate('12... 0-0+')).toBe('O-O+');
    expect(sanitizeSanCandidate('0-0-0')).toBe('O-O-O');
  });

  it('rejects oversized PGNs and invalid move histories', () => {
    expect(() => replayPgn('a'.repeat(MAX_PGN_BYTES + 1), 200)).toThrow();
    expect(() => replayPgn('1. e4 e5 2. Ke9', 200)).toThrow();
  });

  it('computes captured pieces', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('d5');
    chess.move('exd5');
    const captured = getCapturedPieces(chess);
    expect(captured.b).toEqual(['p']);
    expect(captured.w).toEqual([]);
  });

  it('detects longest matching ECO opening name', () => {
    expect(detectOpening(['e4', 'c5'])).toEqual({ eco: 'B20', name: 'Sicilian Defense' });
    expect(detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])).toEqual({
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
    expect(detectOpening(['a3'])).toBeNull();
  });
});
