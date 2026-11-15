import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Chess } from 'chess.js';
import { z } from 'zod';
import { getSigningSecret } from '@/lib/env';
import type { GameMode, IllegalMovePolicy } from '@/lib/providers/models.config';

export const MoveReceiptPayloadSchema = z.object({
  v: z.literal(1),
  gameSessionId: z.string().uuid(),
  pgn: z.string().max(16_384),
  ply: z.number().int().min(0),
  modelId: z.string().min(1).max(100),
  mode: z.enum(['pure', 'assisted', 'engine']),
  policy: z.enum(['strict', 'friendly']),
  illegalAttempts: z.number().int().min(0),
  fallbackMoves: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  forfeitedBy: z.enum(['w', 'b']).nullable(),
  verifiedFromStart: z.boolean(),
  issuedAt: z.number().int().min(0),
});

export type MoveReceiptPayload = z.infer<typeof MoveReceiptPayloadSchema>;

/**
 * Signs a move receipt as `v1.<payload_b64url>.<sig_b64url>`.
 * Returns `null` if signing is unavailable (e.g., production without `ARENA_SIGNING_SECRET`).
 */
export function signMoveReceipt(payload: MoveReceiptPayload): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `v1.${payloadB64}`;
  const sigB64 = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sigB64}`;
}

/**
 * Verifies an HMAC-SHA256 move receipt using constant-time comparison.
 * Returns `null` on missing secret, malformed token, signature mismatch, or schema failure.
 */
export function verifyMoveReceipt(token: string): MoveReceiptPayload | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return null;
  }

  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return null;
  }

  const signingInput = `v1.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest();

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }

  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }

  try {
    const rawJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const parsed = MoveReceiptPayloadSchema.safeParse(JSON.parse(rawJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function hashReceipt(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type PgnProgressionResult =
  | { valid: true; deltaPlies: 0 | 1; baseTurn: 'w' | 'b'; nextPly: number }
  | { valid: false };

/**
 * Verifies that `nextPgn` has the exact move history of `basePgn` plus 0 or 1 legal ply.
 */
export function verifyPgnProgression(basePgn: string, nextPgn: string): PgnProgressionResult {
  try {
    const baseChess = new Chess();
    if (basePgn.trim().length > 0) {
      baseChess.loadPgn(basePgn.trim());
    }
    const baseHistory = baseChess.history();

    const nextChess = new Chess();
    if (nextPgn.trim().length > 0) {
      nextChess.loadPgn(nextPgn.trim());
    }
    const nextHistory = nextChess.history();

    const delta = nextHistory.length - baseHistory.length;
    if (delta !== 0 && delta !== 1) {
      return { valid: false };
    }

    for (let i = 0; i < baseHistory.length; i += 1) {
      if (baseHistory[i] !== nextHistory[i]) {
        return { valid: false };
      }
    }

    return {
      valid: true,
      deltaPlies: delta as 0 | 1,
      baseTurn: baseChess.turn(),
      nextPly: nextHistory.length,
    };
  } catch {
    return { valid: false };
  }
}

export type { GameMode, IllegalMovePolicy };
