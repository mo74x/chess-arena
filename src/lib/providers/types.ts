import type { ArenaModelSpec, GameMode } from './models.config';

export interface StockfishCandidate {
  san: string;
  uci: string;
  evalCp: number;
  mate?: number;
}

export interface MovePromptRequest {
  model: ArenaModelSpec;
  mode: Exclude<GameMode, 'engine'>;
  color: 'white' | 'black';
  fen: string;
  recentMovesSan: string[];
  /** Omitted on Attempt 1 in pure mode; always provided on Retry 1+ and assisted mode */
  legalMovesSan?: string[];
  /** Provided in assisted mode */
  candidates?: StockfishCandidate[];
  /** Present on Retry 1 and Retry 2 */
  retryContext?: {
    rejectedMove: string;
    reason: string;
    attemptNumber: number;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface MoveProviderResult {
  rawText: string;
  usage: TokenUsage;
}

export interface ProviderAdapterOptions {
  apiKey?: string;
  signal: AbortSignal;
}

export interface ProviderAdapter {
  getMove(request: MovePromptRequest, options: ProviderAdapterOptions): Promise<MoveProviderResult>;
}

export interface SanitizedProviderError {
  code: 'missing_key' | 'unauthorized' | 'rate_limited' | 'timeout' | 'provider_unavailable';
  status: number;
  safeMessage: string;
}

/**
 * Strips headers, keys, and raw SDK payloads before logging or returning errors.
 */
export function sanitizeProviderError(err: unknown): SanitizedProviderError {
  if (err instanceof Error && err.name === 'AbortError') {
    return {
      code: 'timeout',
      status: 504,
      safeMessage: 'Model request timed out.',
    };
  }

  const maybeStatus =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;

  if (maybeStatus === 401 || maybeStatus === 403) {
    return {
      code: 'unauthorized',
      status: 401,
      safeMessage: 'Provider rejected the API key.',
    };
  }

  if (maybeStatus === 429) {
    return {
      code: 'rate_limited',
      status: 429,
      safeMessage: 'Provider rate limit reached. Try again shortly.',
    };
  }

  return {
    code: 'provider_unavailable',
    status: 502,
    safeMessage: 'Model provider is temporarily unavailable.',
  };
}

/**
 * Builds the compact system + user prompt shared across LLM adapters.
 */
export function buildMovePrompts(request: MovePromptRequest): { system: string; user: string } {
  const system =
    'You are a chess engine opponent. Reply with valid JSON only, no markdown fences or extra text: {"move":"<SAN>","comment":"<one short sentence>"}';

  const lines = [
    `Side to move: ${request.color}`,
    `Position (FEN): ${request.fen}`,
    `Recent moves: ${request.recentMovesSan.length > 0 ? request.recentMovesSan.join(' ') : '(start)'}`,
  ];

  if (request.mode === 'assisted' && request.candidates && request.candidates.length > 0) {
    const formatted = request.candidates
      .map((c) => {
        const score = c.mate !== undefined ? `M${c.mate}` : `${(c.evalCp / 100).toFixed(2)}`;
        return `${c.san} (${score})`;
      })
      .join(', ');
    lines.push(`Engine top candidates: ${formatted}`);
  }

  if (request.legalMovesSan && request.legalMovesSan.length > 0) {
    lines.push(`Legal moves (choose exactly one in SAN): ${request.legalMovesSan.join(', ')}`);
  }

  if (request.retryContext) {
    lines.push(
      `Previous move "${request.retryContext.rejectedMove}" is invalid (${request.retryContext.reason}). Choose a legal SAN move from the list.`,
    );
  }

  return { system, user: lines.join('\n') };
}
