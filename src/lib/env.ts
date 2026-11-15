import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Provider keys (optional so local dev and CI work with MockProvider or BYOK)
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Supabase credentials
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Stockfish binary override & worker pool (optional; defaults to bundled stockfish npm package)
  STOCKFISH_PATH: z.string().optional(),
  STOCKFISH_POOL_SIZE: z.coerce.number().int().min(1).max(4).default(2),

  // Scoreboard integrity & proxy headers
  ARENA_SIGNING_SECRET: z.string().optional(),
  TRUSTED_PROXY_HEADERS: z.string().optional(),

  // Cost & abuse guardrails
  MOVE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(25000),
  MAX_TOKENS_PER_GAME: z.coerce.number().int().min(1000).default(25000),
  MAX_MOVES_PER_GAME: z.coerce.number().int().min(10).max(400).default(200),
  RATE_LIMIT_MOVES_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
  DAILY_GLOBAL_TOKEN_BUDGET: z.coerce.number().int().min(10000).default(1000000),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() must only be called on the server.');
  }

  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export interface EnvValidationReport {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Non-throwing production environment check for /api/health.
 * Supabase is reported in `warnings` when unconfigured so CI E2E can run without it.
 */
export function validateProductionEnv(): EnvValidationReport {
  try {
    const env = getServerEnv();
    const missing: string[] = [];
    const warnings: string[] = [];

    const hasSupabaseUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim());
    const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());

    if (!hasSupabaseUrl || !hasServiceRole) {
      warnings.push('Supabase persistence is disabled (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing).');
    }

    if (env.NODE_ENV === 'production' && !env.ARENA_SIGNING_SECRET?.trim()) {
      warnings.push('ARENA_SIGNING_SECRET is missing; ranked scoreboard receipts are disabled.');
    }

    return { ok: missing.length === 0, missing, warnings };
  } catch (error) {
    return {
      ok: false,
      missing: [error instanceof Error ? error.message : 'Invalid environment configuration'],
      warnings: [],
    };
  }
}

/**
 * Checks whether a specific provider's API key is configured on the server.
 */
export function isProviderConfigured(
  provider: 'anthropic' | 'google' | 'openai' | 'mock' | 'engine',
): boolean {
  if (provider === 'mock' || provider === 'engine') return true;
  const env = getServerEnv();
  switch (provider) {
    case 'anthropic':
      return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim().length > 0);
    case 'google':
      return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
    case 'openai':
      return Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0);
  }
}

const globalForSecret = globalThis as typeof globalThis & {
  __arenaEphemeralSigningSecret?: string;
};

/**
 * Returns the HMAC signing secret for move receipts.
 * Fails closed (`null`) in production if `ARENA_SIGNING_SECRET` is unset;
 * uses a shared process-wide ephemeral secret in dev/test.
 */
export function getSigningSecret(): string | null {
  const env = getServerEnv();
  const configured = env.ARENA_SIGNING_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (env.NODE_ENV === 'production') {
    return null;
  }
  if (!globalForSecret.__arenaEphemeralSigningSecret) {
    globalForSecret.__arenaEphemeralSigningSecret = randomBytes(32).toString('hex');
  }
  return globalForSecret.__arenaEphemeralSigningSecret;
}
