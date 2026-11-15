import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import {
  getModelSpecById,
  isRankedEligibleModel,
  resolveModelSpec,
} from '@/lib/providers/models.config';
import { isOpenAIReasoningModel } from '@/lib/providers/openai';
import { MissingApiKeyError, resolveProviderApiKey } from '@/lib/providers/registry';
import { buildMovePrompts, sanitizeProviderError } from '@/lib/providers/types';

describe('provider registry and error hygiene', () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    resetEnvCache();
  });

  it('rejects missing x-api-key in production even when server env key exists', () => {
    process.env.ANTHROPIC_API_KEY = 'server-secret';
    // Force production NODE_ENV check via process.env
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    resetEnvCache();

    try {
      expect(() => resolveProviderApiKey('anthropic', undefined)).toThrow(MissingApiKeyError);
      expect(resolveProviderApiKey('anthropic', 'user-byok-key')).toBe('user-byok-key');
      expect(resolveProviderApiKey('mock', undefined)).toBeUndefined();
      expect(resolveProviderApiKey('engine', undefined)).toBeUndefined();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      resetEnvCache();
    }
  });

  it('sanitizes abort, 401, 429, and unknown errors', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(sanitizeProviderError(abort).status).toBe(504);
    expect(sanitizeProviderError({ status: 401 }).code).toBe('unauthorized');
    expect(sanitizeProviderError({ status: 429 }).code).toBe('rate_limited');
    expect(sanitizeProviderError(new Error('raw secret header')).safeMessage).not.toContain('secret');
  });

  it('omits legalMovesSan in pure Attempt 1 and includes candidates in assisted mode', () => {
    const model = getModelSpecById('claude-haiku')!;
    const purePrompt = buildMovePrompts({
      model,
      mode: 'pure',
      color: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      recentMovesSan: [],
    });
    expect(purePrompt.user).not.toContain('Legal moves');

    const assistedPrompt = buildMovePrompts({
      model,
      mode: 'assisted',
      color: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      recentMovesSan: [],
      legalMovesSan: ['e4', 'd4'],
      candidates: [{ san: 'e4', uci: 'e2e4', evalCp: 30 }],
    });
    expect(assistedPrompt.user).toContain('Engine top candidates: e4 (0.30)');
    expect(assistedPrompt.user).toContain('Legal moves');
  });

  it('resolves custom BYOK models and filters ranked-eligible models', () => {
    const custom = resolveModelSpec('claude-opus-4-1-20250805', 'anthropic');
    expect(custom).toMatchObject({
      id: 'anthropic:claude-opus-4-1-20250805',
      provider: 'anthropic',
      apiModelId: 'claude-opus-4-1-20250805',
      isCustom: true,
    });

    expect(resolveModelSpec('bad model with spaces!', 'openai')).toBeUndefined();
    expect(resolveModelSpec('some-model', 'mock')).toBeUndefined();
    expect(isRankedEligibleModel('mock-legal')).toBe(false);
    expect(isRankedEligibleModel('stockfish')).toBe(false);
    expect(isRankedEligibleModel('anthropic:claude-opus-4-1-20250805')).toBe(true);
  });

  it('identifies OpenAI reasoning models requiring max_completion_tokens', () => {
    expect(isOpenAIReasoningModel('o1')).toBe(true);
    expect(isOpenAIReasoningModel('o3-mini')).toBe(true);
    expect(isOpenAIReasoningModel('o4-mini-2025-04-16')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5-mini')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-4o-mini')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4.1')).toBe(false);
  });
});
