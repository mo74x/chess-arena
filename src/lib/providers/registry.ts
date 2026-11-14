import 'server-only';
import { getServerEnv } from '@/lib/env';
import { AnthropicAdapter } from './anthropic';
import { GoogleGeminiAdapter } from './google';
import { MockProviderAdapter } from './mock';
import { type ProviderId } from './models.config';
import { OpenAIAdapter } from './openai';
import { type ProviderAdapter } from './types';

const adapters: Record<Exclude<ProviderId, 'engine'>, ProviderAdapter> = {
  anthropic: new AnthropicAdapter(),
  google: new GoogleGeminiAdapter(),
  openai: new OpenAIAdapter(),
  mock: new MockProviderAdapter(),
};

export function getProviderAdapter(provider: Exclude<ProviderId, 'engine'>): ProviderAdapter {
  return adapters[provider];
}

export class MissingApiKeyError extends Error {
  readonly status = 401;
  readonly code = 'missing_key' as const;

  constructor(provider: ProviderId) {
    super(`API key is required for ${provider}.`);
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Resolves the API key for a provider call.
 * In production, non-mock LLM calls MUST provide a user BYOK key (`x-api-key`)
 * unless `allowServerFallback` is explicitly true (e.g., CLI benchmark).
 */
export function resolveProviderApiKey(
  provider: ProviderId,
  requestApiKey?: string,
  options?: { allowServerFallback?: boolean },
): string | undefined {
  if (provider === 'mock' || provider === 'engine') {
    return undefined;
  }

  const trimmedRequestKey = requestApiKey?.trim();
  if (trimmedRequestKey && trimmedRequestKey.length > 0) {
    return trimmedRequestKey;
  }

  const env = getServerEnv();
  if (env.NODE_ENV === 'production' && !options?.allowServerFallback) {
    throw new MissingApiKeyError(provider);
  }

  let serverKey: string | undefined;
  switch (provider) {
    case 'anthropic':
      serverKey = env.ANTHROPIC_API_KEY?.trim();
      break;
    case 'google':
      serverKey = env.GEMINI_API_KEY?.trim();
      break;
    case 'openai':
      serverKey = env.OPENAI_API_KEY?.trim();
      break;
  }

  if (!serverKey) {
    throw new MissingApiKeyError(provider);
  }

  return serverKey;
}
