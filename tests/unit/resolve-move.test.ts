import { afterEach, describe, expect, it } from 'vitest';
import {
  ArenaValidationError,
  parseLlmMoveReply,
  resolveAiMove,
} from '@/lib/arena/resolve-move';
import { resetEnvCache } from '@/lib/env';
import type { ProviderAdapter } from '@/lib/providers/types';

describe('resolveAiMove pipeline', () => {
  afterEach(() => {
    delete process.env.MOVE_TIMEOUT_MS;
    resetEnvCache();
  });

  it('parses JSON after stripping code fences', () => {
    expect(parseLlmMoveReply('```json\n{"move":"e4","comment":"Center"}\n```')).toEqual({
      move: 'e4',
      comment: 'Center',
    });
    expect(parseLlmMoveReply('')).toBeNull();
    expect(parseLlmMoveReply('not json')).toBeNull();
  });

  it('plays a valid move on Attempt 1 with mock-legal', async () => {
    const out = await resolveAiMove({
      pgn: '1. e4',
      modelId: 'mock-legal',
      mode: 'pure',
      policy: 'strict',
    });

    expect(out.san).toBeTruthy();
    expect(out.telemetry.illegalAttempts).toBe(0);
    expect(out.telemetry.retriesUsed).toBe(0);
    expect(out.telemetry.fallbackUsed).toBe(false);
  });

  it('retries once and succeeds with mock-illegal-once', async () => {
    const out = await resolveAiMove({
      pgn: '1. e4',
      modelId: 'mock-illegal-once',
      mode: 'pure',
      policy: 'strict',
    });

    expect(out.san).toBeTruthy();
    expect(out.telemetry.illegalAttempts).toBe(1);
    expect(out.telemetry.retriesUsed).toBe(1);
    expect(out.telemetry.attemptedIllegalMoves).toEqual(['Qx9']);
  });

  it('forfeits under strict policy when retries are exhausted', async () => {
    const out = await resolveAiMove({
      pgn: '1. e4',
      modelId: 'mock-always-illegal',
      mode: 'pure',
      policy: 'strict',
    });

    expect(out.san).toBeNull();
    expect(out.gameOver).toBe(true);
    expect(out.termination).toBe('forfeit');
    expect(out.result).toBe('1-0');
    expect(out.telemetry.illegalAttempts).toBe(3);
    expect(out.telemetry.retriesUsed).toBe(2);
  });

  it('plays deterministic fallback under friendly policy when retries are exhausted', async () => {
    const out = await resolveAiMove({
      pgn: '1. e4',
      modelId: 'mock-always-illegal',
      mode: 'pure',
      policy: 'friendly',
    });

    expect(out.san).toBeTruthy();
    expect(out.gameOver).toBe(false);
    expect(out.telemetry.fallbackUsed).toBe(true);
    expect(out.telemetry.illegalAttempts).toBe(3);
  });

  it('handles malformed JSON then valid retry', async () => {
    let calls = 0;
    const flakyAdapter: ProviderAdapter = {
      async getMove() {
        calls += 1;
        if (calls === 1) {
          return {
            rawText: 'I think e5 is nice',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          };
        }
        return {
          rawText: '{"move":"e5","comment":"Solid"}',
          usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
        };
      },
    };

    const out = await resolveAiMove(
      {
        pgn: '1. e4',
        modelId: 'claude-haiku',
        mode: 'pure',
        policy: 'strict',
        apiKey: 'test-key',
      },
      {
        getAdapter: () => flakyAdapter,
        resolveApiKey: () => 'test-key',
      },
    );

    expect(out.san).toBe('e5');
    expect(out.telemetry.illegalAttempts).toBe(1);
    expect(out.telemetry.retriesUsed).toBe(1);
  });

  it('sanitizes provider errors without leaking API keys', async () => {
    const failingAdapter: ProviderAdapter = {
      async getMove() {
        throw Object.assign(new Error('Unauthorized with key sk-secret-123'), { status: 401 });
      },
    };

    await expect(
      resolveAiMove(
        {
          pgn: '',
          modelId: 'gpt-4o-mini',
          mode: 'pure',
          policy: 'strict',
          apiKey: 'sk-secret-123',
        },
        {
          getAdapter: () => failingAdapter,
          resolveApiKey: () => 'sk-secret-123',
        },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: 'Provider rejected the API key.',
    } satisfies Partial<ArenaValidationError>);
  });

  it('supports engine baseline mode via injected getEngineBestMove', async () => {
    const out = await resolveAiMove(
      {
        pgn: '',
        modelId: 'stockfish',
        mode: 'engine',
        policy: 'strict',
        skillLevel: 8,
      },
      {
        getEngineBestMove: async () => ({ san: 'e4', uci: 'e2e4', evalCp: 25 }),
      },
    );

    expect(out.san).toBe('e4');
    expect(out.evalCp).toBe(25);
    expect(out.comment).toContain('Skill 8');
  });
});
