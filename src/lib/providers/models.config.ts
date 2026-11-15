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
  isCustom?: boolean;
}

export const CUSTOM_MODEL_ID_REGEX = /^[a-zA-Z0-9._:/-]{2,80}$/;

export const BYOK_PROVIDERS: ReadonlyArray<{
  id: Extract<ProviderId, 'anthropic' | 'google' | 'openai'>;
  label: string;
  placeholderModel: string;
}> = [
  { id: 'anthropic', label: 'Anthropic Claude', placeholderModel: 'claude-sonnet-4-5-20250929' },
  { id: 'google', label: 'Google Gemini', placeholderModel: 'gemini-2.5-flash' },
  { id: 'openai', label: 'OpenAI GPT', placeholderModel: 'gpt-4o-mini' },
];

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

/**
 * Resolves either a curated preset model ID or a user-supplied custom model ID
 * for an explicit LLM provider (`anthropic` | `google` | `openai`).
 */
export function resolveModelSpec(
  modelId: string,
  provider?: ProviderId,
): ArenaModelSpec | undefined {
  const preset = getModelSpecById(modelId);
  if (preset) {
    if (provider && preset.provider !== provider) {
      return undefined;
    }
    return preset;
  }

  // Also support canonical "provider:apiModelId" strings
  let resolvedProvider = provider;
  let apiModelId = modelId.trim();
  const colonIdx = apiModelId.indexOf(':');
  if (!resolvedProvider && colonIdx > 0) {
    const prefix = apiModelId.slice(0, colonIdx) as ProviderId;
    if (prefix === 'anthropic' || prefix === 'google' || prefix === 'openai') {
      resolvedProvider = prefix;
      apiModelId = apiModelId.slice(colonIdx + 1);
    }
  }

  if (
    resolvedProvider !== 'anthropic' &&
    resolvedProvider !== 'google' &&
    resolvedProvider !== 'openai'
  ) {
    return undefined;
  }

  if (!CUSTOM_MODEL_ID_REGEX.test(apiModelId)) {
    return undefined;
  }

  return {
    id: `${resolvedProvider}:${apiModelId}`,
    provider: resolvedProvider,
    displayName: apiModelId,
    badge: `Custom · ${resolvedProvider}`,
    description: 'User-selected custom model via BYOK.',
    apiModelId,
    maxOutputTokens: 450,
    temperature: 0.2,
    isCustom: true,
  };
}

export function isRankedEligibleModel(modelId: string): boolean {
  const trimmed = modelId.trim().toLowerCase();
  if (!trimmed || trimmed === 'stockfish' || trimmed.startsWith('mock-')) {
    return false;
  }
  return true;
}