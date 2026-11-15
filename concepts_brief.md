# Chess Arena P0: Scoreboard Integrity & Rate Limiting

* **Author:** Mohamed Arafa (Mo74x)
* **Date:** 2026-11-15

## Overview

This P0 hardening pass secures the 3/1/0 ranked scoreboard against forged game submissions, replay attacks, and rate-limiter bypasses without adding server-side per-move database writes. It introduces chained HMAC-SHA256 move receipts (`v1.<payload>.<sig>`) issued by `/api/move` and verified by `POST /api/games`, deduplicates ranked submissions in Postgres (`0003_scoreboard_integrity.sql`), fixes an existing `nowMs` bug in `POST /api/games` rate limiting, and bounds the in-memory rate-limiter buckets.

## Analysis

### 1. Bugs Found in Current Code
* **`POST /api/games` rate-limit clock bug:** `src/app/api/games/route.ts` calls `checkRateLimit(\`games:\${ip}\`, 20, 60_000)`, passing `60_000` as the `nowMs` parameter instead of `Date.now()`, so timestamps never expire after the first 20 saves.
* **Client-spoofable AI resignation:** `deriveAuthoritativeOutcome()` in `src/lib/supabase/games.ts` accepts any `resignedBy` (`'w'` or `'b'`), allowing a client to claim the AI resigned after 6 moves. Ranked games must reject `resignedBy !== humanColor`.
* **Unbounded rate-limiter map & spoofable `x-forwarded-for`:** `src/lib/arena/rate-limit.ts` stores IP buckets in an unbounded `Map` and trusts `x-forwarded-for` unconditionally.

### 2. Chained HMAC Move Receipts & Replay Protection
* `/api/move` accepts an optional `gameSessionId` (UUID) and `prevReceipt`, verifies the previous receipt's HMAC signature and PGN progression (0 or 1 legal human ply ahead), accumulates `illegalAttempts`, `fallbackMoves`, and `totalTokens`, and issues a new signed receipt (`v1.<payload_b64url>.<sig_b64url>`).
* `verifiedFromStart` is `true` only when the chain started at ply `0` or `1` (`fresh game`), blocking mid-game crafted PGN injection.
* On `POST /api/games`, ranked eligibility (`is_ranked = true`) requires:
  * A valid HMAC receipt with `verifiedFromStart === true`, matching `modelId`, `mode`, and `gameSessionId`.
  * Submitted PGN matching the receipt PGN (`S === R`) or being exactly 1 legal human ply ahead (`S === R + 1` with `receiptTurn === humanColor`, e.g. human delivers checkmate or resigns).
  * `!usedTakeback`, `!timedOutBy`, `!drawAgreed`, and `resignedBy === humanColor` (if resigned).
  * Server-authoritative `forfeitedBy`, `illegalAttempts`, `fallbackMoves`, and `totalTokens` taken from the verified receipt.
* `supabase/migrations/0003_scoreboard_integrity.sql` adds `game_session_id` and `receipt_hash` with partial `UNIQUE` indexes so a winning receipt cannot be replayed to farm points.

### 3. Production Secret & Rate Limiter Hardening
* `ARENA_SIGNING_SECRET` and `TRUSTED_PROXY_HEADERS` are added to `src/lib/env.ts` and `.env.example`. In `NODE_ENV === 'production'`, `validateProductionEnv()` flags missing `ARENA_SIGNING_SECRET`, and `getSigningSecret()` fails closed (`null`, disabling ranked receipts) rather than using an ephemeral key. In development/test, a shared ephemeral secret is cached on `globalThis`.
* `src/lib/arena/rate-limit.ts` bounds the bucket map to `10,000` entries with expired-entry pruning + LRU eviction, and `extractClientIp()` prioritizes trusted proxy headers (`x-vercel-forwarded-for`, `cf-connecting-ip`) before `x-forwarded-for` / `x-real-ip`.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Chained HMAC-SHA256 move receipts between `/api/move`, `GameWorkspace.tsx`, and `POST /api/games`.
  * Postgres unique deduplication (`0003_scoreboard_integrity.sql`) on `game_session_id` and `receipt_hash`.
  * Graceful deranking (`is_ranked = false`) for casual/takeback/clock/draw games; HTTP `400`/`403`/`409` rejection for tampered or duplicate submissions.
  * Bounded LRU/TTL rate limiter + fix `POST /api/games` `checkRateLimit` call + trusted proxy IP extraction.
* **Out-of-Scope Non-Goals:**
  * Server-side chess clocks or Redis-backed distributed rate limiting (covered by single-instance Node deployment assumption).
  * P1/P2/P3 items (Stockfish worker pool, OpenAI reasoning model handling, `/games/[id]` dark mode, Dockerfile).

## Alternatives Weighed

* **Per-move Postgres session table vs. Stateless Chained HMAC Receipts:** Chained HMAC receipts achieve start-of-game integrity and cumulative telemetry without adding database round-trips to every `/api/move` call.
* **Rejecting casual games vs. Graceful Deranking:** Deranking (`is_ranked = false`) keeps casual takeback/clock/draw-agreement games playable and saveable to `/history` while strictly protecting the `3/1/0` scoreboard.

## Key Decisions & Staging for Next Steps

* Implement `src/lib/arena/receipt.ts`, update `src/lib/env.ts`, `.env.example`, `src/lib/arena/schemas.ts`, `src/lib/arena/rate-limit.ts`, `src/app/api/move/route.ts`, `src/lib/supabase/games.ts`, `src/app/api/games/route.ts`, `src/components/GameWorkspace.tsx`, and `supabase/migrations/0003_scoreboard_integrity.sql`.
* Add unit tests covering receipt chaining, tampering rejection, human-last-move checkmate, takeback/clock deranking, AI-resign rejection, and rate-limiter eviction.
