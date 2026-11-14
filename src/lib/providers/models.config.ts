export type ProviderId = 'anthropic' | 'google' | 'openai' | 'mock' | 'engine';
export type GameMode = 'pure' | 'assisted' | 'engine';
export type IllegalMovePolicy = 'strict' | 'friendly';

export const ENGINE_SKILL_MIN = 0;
export const ENGINE_SKILL_MAX = 20;
export const ENGINE_SKILL_DEFAULT = 5;

export interface ArenaModelSpec {
  id: string;
  provider: ProviderId;
  displayName: string;
  badge: string;
  description: string;
  /** Actual upstream model string sent to the provider SDK */
  apiModelId: string;
  /** Max output tokens (sized to accommodate minimal internal reasoning + JSON reply) */
  maxOutputTokens: number;
  temperature: number;
  isMock?: boolean;
  isEngine?: boolean;
}

/**
 * NOTE: Providers periodically update model snapshots.
 * Verify current model IDs in Anthropic, Google Gemini, and OpenAI docs before release.
 */
export const ARENA_MODELS: readonly ArenaModelSpec[] = [
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    badge: 'Anthropic',
    description: 'Strong positional awareness and low illegal-move rate in pure play.',
    apiModelId: 'claude-sonnet-4-5-20250929',
    maxOutputTokens: 350,
    temperature: 0.2,
  },
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    badge: 'Anthropic · Fast',
    description: 'Low-latency tactical responses at a fraction of flagship token cost.',
    apiModelId: 'claude-haiku-4-5-20251001',
    maxOutputTokens: 300,
    temperature: 0.2,
  },
  {
    id: 'gemini-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    badge: 'Google',
    description: 'Fast multimodal reasoning model with structured JSON schema output.',
    apiModelId: 'gemini-2.5-flash',
    maxOutputTokens: 400,
    temperature: 0.2,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    badge: 'OpenAI',
    description: 'Compact, high-speed baseline opponent for rapid games.',
    apiModelId: 'gpt-4o-mini',
    maxOutputTokens: 300,
    temperature: 0.2,
  },
  {
    id: 'stockfish',
    provider: 'engine',
    displayName: 'Stockfish Engine',
    badge: 'Engine Baseline',
    description: 'Classical UCI chess engine at configurable skill level (0–20).',
    apiModelId: 'stockfish',
    maxOutputTokens: 0,
    temperature: 0,
    isEngine: true,
  },
  // Deterministic Mock models for zero-cost local development & automated testing
  {
    id: 'mock-legal',
    provider: 'mock',
    displayName: 'Mock Bot (Always Legal)',
    badge: 'Test Harness',
    description: 'Selects deterministic legal moves (captures and checks prioritized) at zero API cost.',
    apiModelId: 'mock-legal',
    maxOutputTokens: 100,
    temperature: 0,
    isMock: true,
  },
  {
    id: 'mock-illegal-once',
    provider: 'mock',
    displayName: 'Mock Bot (Blunders 1st Try)',
    badge: 'Test Harness',
    description: 'Deliberately proposes an illegal move on attempt 1, then plays a legal move on retry.',
    apiModelId: 'mock-illegal-once',
    maxOutputTokens: 100,
    temperature: 0,
    isMock: true,
  },
  {
    id: 'mock-always-illegal',
    provider: 'mock',
    displayName: 'Mock Bot (Always Illegal)',
    badge: 'Test Harness',
    description: 'Always proposes illegal moves to test strict forfeit and friendly fallback policies.',
    apiModelId: 'mock-always-illegal',
    maxOutputTokens: 100,
    temperature: 0,
    isMock: true,
  },
] as const;

export function getModelSpecById(modelId: string): ArenaModelSpec | undefined {
  return ARENA_MODELS.find((m) => m.id === modelId);
}