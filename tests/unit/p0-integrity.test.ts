import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  extractClientIp,
  getRateLimitBucketCount,
  resetRateLimits,
} from '@/lib/arena/rate-limit';
import {
  signMoveReceipt,
  verifyMoveReceipt,
  verifyPgnProgression,
} from '@/lib/arena/receipt';
import { resetEnvCache } from '@/lib/env';
import {
  deriveAuthoritativeOutcome,
  InvalidReceiptError,
  verifySubmittedReceipt,
} from '@/lib/supabase/games';

describe('P0 scoreboard integrity and rate limiting', () => {
  afterEach(() => {
    delete process.env.ARENA_SIGNING_SECRET;
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    resetEnvCache();
    resetRateLimits();
  });

  it('signs and verifies move receipts and rejects tampering', () => {
    process.env.ARENA_SIGNING_SECRET = 'test-secret-key-for-hmac-32bytes';
    resetEnvCache();

    const token = signMoveReceipt({
      v: 1,
      gameSessionId: '11111111-1111-4111-8111-111111111111',
      pgn: '1. e4 e5',
      ply: 2,
      modelId: 'claude-sonnet',
      mode: 'pure',
      policy: 'strict',
      illegalAttempts: 1,
      fallbackMoves: 0,
      totalTokens: 240,
      forfeitedBy: null,
      verifiedFromStart: true,
      issuedAt: 1_700_000_000_000,
    });

    expect(token).toBeTruthy();
    const verified = verifyMoveReceipt(token!);
    expect(verified).toMatchObject({
      ply: 2,
      modelId: 'claude-sonnet',
      illegalAttempts: 1,
      verifiedFromStart: true,
    });

    // Tamper signature
    const tampered = `${token!.slice(0, -4)}aaaa`;
    expect(verifyMoveReceipt(tampered)).toBeNull();
  });

  it('fails closed in production when ARENA_SIGNING_SECRET is missing', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.ARENA_SIGNING_SECRET;
    resetEnvCache();

    const token = signMoveReceipt({
      v: 1,
      gameSessionId: '11111111-1111-4111-8111-111111111111',
      pgn: '1. e4 e5',
      ply: 2,
      modelId: 'claude-sonnet',
      mode: 'pure',
      policy: 'strict',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 100,
      forfeitedBy: null,
      verifiedFromStart: true,
      issuedAt: 1_700_000_000_000,
    });
    expect(token).toBeNull();
  });

  it('verifies PGN progression allowing 0 or 1 trailing human ply', () => {
    const same = verifyPgnProgression('1. e4 e5', '1. e4 e5');
    expect(same).toMatchObject({ valid: true, deltaPlies: 0 });

    const oneAhead = verifyPgnProgression('1. e4 e5', '1. e4 e5 2. Nf3');
    expect(oneAhead).toMatchObject({ valid: true, deltaPlies: 1, baseTurn: 'w', nextPly: 3 });

    const twoAhead = verifyPgnProgression('1. e4 e5', '1. e4 e5 2. Nf3 Nc6');
    expect(twoAhead.valid).toBe(false);

    const branched = verifyPgnProgression('1. e4 e5', '1. d4 e5 2. Nf3');
    expect(branched.valid).toBe(false);
  });

  it('validates trailing human checkmate against receipt and rejects AI resignation', () => {
    process.env.ARENA_SIGNING_SECRET = 'test-secret-key-for-hmac-32bytes';
    resetEnvCache();

    const sessionId = '33333333-3333-4333-8333-333333333333';
    const receipt = signMoveReceipt({
      v: 1,
      gameSessionId: sessionId,
      pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6',
      ply: 6,
      modelId: 'claude-sonnet',
      mode: 'pure',
      policy: 'strict',
      illegalAttempts: 0,
      fallbackMoves: 0,
      totalTokens: 300,
      forfeitedBy: null,
      verifiedFromStart: true,
      issuedAt: Date.now(),
    })!;

    const verified = verifySubmittedReceipt(
      {
        pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
        modelId: 'claude-sonnet',
        mode: 'pure',
        humanColor: 'w',
        gameSessionId: sessionId,
        moveReceipt: receipt,
        illegalAttempts: 0,
        fallbackMoves: 0,
        totalTokens: 0,
        moves: [],
      },
      '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
    );
    expect(verified?.verifiedFromStart).toBe(true);

    // Model mismatch rejected
    expect(() =>
      verifySubmittedReceipt(
        {
          pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
          modelId: 'gpt-4o',
          mode: 'pure',
          humanColor: 'w',
          gameSessionId: sessionId,
          moveReceipt: receipt,
          illegalAttempts: 0,
          fallbackMoves: 0,
          totalTokens: 0,
          moves: [],
        },
        '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
      ),
    ).toThrow(InvalidReceiptError);

    // AI resignation spoof rejected
    expect(() =>
      deriveAuthoritativeOutcome({
        pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
        modelId: 'claude-sonnet',
        mode: 'pure',
        humanColor: 'w',
        resignedBy: 'b',
        illegalAttempts: 0,
        fallbackMoves: 0,
        totalTokens: 0,
        moves: [],
      }),
    ).toThrow();
  });

  it('bounds rate-limiter buckets and prioritizes trusted proxy headers', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 10_050; i += 1) {
      checkRateLimit(`ip:${i}`, 5, now);
    }
    expect(getRateLimitBucketCount()).toBeLessThanOrEqual(10_000);

    const headers = new Headers({
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      'x-vercel-forwarded-for': '9.9.9.9',
    });
    expect(extractClientIp(headers)).toBe('9.9.9.9');
  });
});
