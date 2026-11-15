import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache, validateProductionEnv } from '@/lib/env';
import { computeIsRanked, deriveAuthoritativeOutcome } from '@/lib/supabase/games';
import type { MoveReceiptPayload } from '@/lib/arena/receipt';

describe('server PGN validation and env checks', () => {
  afterEach(() => {
    resetEnvCache();
  });

  it('derives authoritative checkmate outcome from PGN regardless of client claims', () => {
    const outcome = deriveAuthoritativeOutcome({
      pgn: '1. f3 e5 2. g4 Qh4#',
      modelId: 'mock-legal',
      mode: 'pure',
      humanColor: 'w',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 0,
      moves: [],
    });

    expect(outcome.result).toBe('0-1');
    expect(outcome.termination).toBe('checkmate');
  });

  it('derives resign outcome when resignedBy is specified', () => {
    const outcome = deriveAuthoritativeOutcome({
      pgn: '1. e4 e5',
      modelId: 'mock-legal',
      mode: 'pure',
      humanColor: 'w',
      resignedBy: 'w',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 0,
      moves: [],
    });

    expect(outcome.result).toBe('0-1');
    expect(outcome.termination).toBe('resign');
  });

  it('rejects unfinished games without resign or forfeit', () => {
    expect(() =>
      deriveAuthoritativeOutcome({
        pgn: '1. e4 e5',
        modelId: 'mock-legal',
        mode: 'pure',
        humanColor: 'w',
        illegalAttempts: 0,
        fallbackMoves: 0,
        totalTokens: 0,
        moves: [],
      }),
    ).toThrow();
  });

  it('validateProductionEnv returns non-throwing report when Supabase is omitted', () => {
    const report = validateProductionEnv();
    expect(report.ok).toBe(true);
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('derives draw_agreement and timeout outcomes', () => {
    const drawOutcome = deriveAuthoritativeOutcome({
      pgn: '1. e4 e5',
      modelId: 'mock-legal',
      mode: 'pure',
      humanColor: 'w',
      drawAgreed: true,
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 0,
      moves: [],
    });
    expect(drawOutcome.result).toBe('1/2-1/2');
    expect(drawOutcome.termination).toBe('draw_agreement');

    const timeoutOutcome = deriveAuthoritativeOutcome({
      pgn: '1. e4 e5',
      modelId: 'mock-legal',
      mode: 'pure',
      humanColor: 'w',
      timedOutBy: 'w',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 0,
      moves: [],
    });
    expect(timeoutOutcome.result).toBe('0-1');
    expect(timeoutOutcome.termination).toBe('timeout');
  });

  it('evaluates ranked eligibility for pure LLM games, model forfeits, and mock/assisted exclusions', () => {
    const baseMoves = [
      { ply: 1, san: 'e4', fenAfter: 'f1', by: 'human' as const, illegalAttempts: 0 },
      { ply: 2, san: 'e5', fenAfter: 'f2', by: 'model' as const, illegalAttempts: 0 },
      { ply: 3, san: 'Nf3', fenAfter: 'f3', by: 'human' as const, illegalAttempts: 0 },
      { ply: 4, san: 'Nc6', fenAfter: 'f4', by: 'model' as const, illegalAttempts: 0 },
    ];
    const baseInput = {
      pgn: '1. e4 e5 2. Nf3 Nc6',
      modelId: 'claude-sonnet',
      mode: 'pure' as const,
      humanColor: 'w' as const,
      playerHandle: 'Mo74x',
      playerToken: '11111111-1111-4111-8111-111111111111',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 100,
      moves: baseMoves,
    };

    const validReceipt: MoveReceiptPayload = {
      v: 1,
      gameSessionId: '22222222-2222-4222-8222-222222222222',
      pgn: '1. e4 e5 2. Nf3 Nc6',
      ply: 4,
      modelId: 'claude-sonnet',
      mode: 'pure',
      policy: 'strict',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 100,
      forfeitedBy: null,
      verifiedFromStart: true,
      issuedAt: Date.now(),
    };

    expect(computeIsRanked(baseInput, 'checkmate', validReceipt)).toBe(true);
    expect(
      computeIsRanked(
        { ...baseInput, forfeitedBy: 'b' },
        'forfeit',
        { ...validReceipt, forfeitedBy: 'b' },
      ),
    ).toBe(true);
    expect(computeIsRanked({ ...baseInput, resignedBy: 'w' }, 'resign', validReceipt)).toBe(false);
    expect(computeIsRanked({ ...baseInput, usedTakeback: true }, 'checkmate', validReceipt)).toBe(false);
    expect(computeIsRanked({ ...baseInput, timedOutBy: 'b' }, 'timeout', validReceipt)).toBe(false);
    expect(computeIsRanked({ ...baseInput, drawAgreed: true }, 'draw_agreement', validReceipt)).toBe(false);
    expect(computeIsRanked(baseInput, 'checkmate', { ...validReceipt, verifiedFromStart: false })).toBe(false);
    expect(computeIsRanked({ ...baseInput, mode: 'assisted' }, 'checkmate', validReceipt)).toBe(false);
    expect(computeIsRanked({ ...baseInput, modelId: 'mock-legal' }, 'checkmate', validReceipt)).toBe(false);
  });
});
