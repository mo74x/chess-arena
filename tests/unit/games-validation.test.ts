import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache, validateProductionEnv } from '@/lib/env';
import { deriveAuthoritativeOutcome } from '@/lib/supabase/games';

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
});
