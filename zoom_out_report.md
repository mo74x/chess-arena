# Stage 5: Initial Zoom Out Review Report

* **Target Document:** `docs/designs/chess-arena.md`
* **Date:** 2026-11-14
* **Reviewers:** `egm-zoom-out`, `egm-inventive-catalyst`

---

## Part 1: Zoom Out Architecture Review (`egm-zoom-out`)

Overall, the design has clear context, strong root-problem focus (`chess.js` as single move-legality authority, bounded retries with `strict`/`friendly` policies, `pure`/`assisted`/`engine` separation), and reuse of `src/lib/env.ts` and `src/lib/providers/models.config.ts`. However, several areas introduce YAGNI complexity, architectural contradictions, or unnecessary surface area.

### 1. Major — Unbuilt Auth Model vs. `auth.uid()` RLS & Anonymous Game Contradiction
* **Affected Scope:** `src/lib/supabase/` (lines 128–131), `supabase/migrations/0001_init.sql` (lines 221–223), `src/app/history/page.tsx` (lines 241–243)
* **Simplicity Rationale:** The design defines RLS policies for `user_id = auth.uid()` alongside anonymous games (`user_id IS NULL`) readable only by exact UUID, yet there is no authentication flow, login UI, or session handling anywhere in the CUJs, components, or implementation plan. Designing multi-tenant `auth.uid()` RLS without auth is YAGNI, and forbidding list queries on `user_id IS NULL` directly conflicts with `GET /api/games` and `/history` for unauthenticated users. Either omit user-scoped RLS for v1 (or use a simple client-generated session/anonymous token if needed) or explicitly add auth to scope.

### 2. Major — `StockfishPool` Mutex Bottleneck & Synchronous Full-Game `POST /api/analyze`
* **Affected Scope:** `src/lib/stockfish/` (lines 114–120, 213–216), `POST /api/analyze` (line 143), Open Question 2 (line 46)
* **Simplicity Rationale:** Managing a `StockfishPool` child process behind an async mutex in Next.js Route Handlers (`runtime = 'nodejs'`) creates a single-process bottleneck: a 100-ply `analyzeGame` call at `80 ms/ply` holds the mutex for 8+ seconds, blocking concurrent `/api/move` (`assisted`/`engine`) requests and risking route timeouts. Meanwhile, Open Question 2 shows the Stockfish binary/package strategy is not settled yet. Simplify to a lightweight on-demand or single-purpose wrapper (or spawn per-request / cap analysis plies) and resolve Stockfish packaging before committing to a stateful pool.

### 3. Major — Redundant GET API Endpoints Alongside App Router Pages
* **Affected Scope:** Route Handler Contracts (lines 138–148), Items 10, 12, 15 (lines 221–231, 241–243)
* **Simplicity Rationale:** The plan defines Next.js App Router pages (`/history`, `/games/[id]`, `/models`) and separate HTTP GET route handlers (`GET /api/games`, `GET /api/games/[id]`, `GET /api/models`) plus a `model_results` SQL view. In Next.js App Router, Server Components can call `src/lib/supabase/games.ts` directly without an extra HTTP/JSON API layer. Unless client-side polling/filtering requires REST endpoints, drop the redundant GET route handlers and keep only `POST /api/move`, `POST /api/analyze`, `POST /api/games`, and (optionally) `/api/health`.

### 4. Major — Contradictory BYOK Key Storage & Unwired Rate-Limit / Token-Budget Guardrails
* **Affected Scope:** Goals (line 31), High-Level Data Flow (line 75), NFRs (lines 151–152), `src/lib/arena/rate-limit.ts` (lines 217–219)
* **Simplicity Rationale:**
  * Goals/NFRs state BYOK keys are held strictly in memory and never written to browser storage, but the Mermaid diagram (line 75) specifies `React State / sessionStorage only`. Keep it in React state only to match the security requirement and avoid `sessionStorage` XSS exposure.
  * `DAILY_GLOBAL_TOKEN_BUDGET` (from `src/lib/env.ts`) is cited in NFRs (line 152), but no module or table tracks a global daily token counter. Similarly, an in-memory per-IP sliding-window `rate-limit.ts` does not work across serverless/multi-instance deployments. Drop `DAILY_GLOBAL_TOKEN_BUDGET` enforcement from the web app (keep it for `scripts/benchmark.ts` only, if needed) and treat in-memory rate limiting explicitly as a best-effort single-instance guard.

### 5. Nit — Altitude & Minor Weeds in Detailed Implementation Plan
* **Affected Scope:** `Detailed Implementation Plan` (lines 181–256), `Module Boundaries` (lines 103–127)
* **Simplicity Rationale:** Keep implementation details like `thinkingBudget: 0`, `80 ms` per-ply movetime, `2,000 ms` remaining-time cutoff, and minor helpers like `getCapturedPieces(chess)` as high-level invariants in `FeatureRange` rather than repeating magic numbers across sections.

### 6. Nit — Resolve Open Question 1 Before Implementing `resolveAiMove`
* **Affected Scope:** Open Question 1 (line 45), `src/lib/arena/` (line 125)
* **Simplicity Rationale:** Open Question 1 asks whether Attempt 1 in `pure` mode omits `legal_moves_san`, while line 125 already prescribes retrying with the legal-moves list on failure. Pick one behavior upfront rather than building configurable prompt variants.

---

## Part 2: Inventive Catalyst (TRIZ) Review (`egm-inventive-catalyst`)

### 1. Major — Server/Node Stockfish Pool vs. Serverless Execution & Multi-Ply Latency
* **False Compromise:** Pinning `StockfishPool` behind a single async UCI mutex inside Next.js `nodejs` route handlers causes head-of-line blocking where a multi-second `analyzeGame` starves concurrent `/api/move` turns and risks route timeouts.
* **Proposed Resolution (Segmentation):** Segment `StockfishPool` into `N` independent UCI worker processes (or separate the fast-turn `/api/move` pool from `/api/analyze`), and bound `/api/analyze` into chunked/capped ply evaluations.
* **Secondary Liabilities:** Multiple Stockfish workers increase server RAM and require crash/restart lifecycle management.

### 2. Major — Browser-Held Live Game State vs. Tamper-Resistant `/models` Leaderboard
* **False Compromise:** `chess.js` PGN replay on `POST /api/games` proves the moves are legal chess, not that the LLM actually played them or that `mode` and `illegalAttempts` are truthful. Any client could submit a fabricated PGN claiming `claude-sonnet` in `pure` mode won in 4 moves with `0` illegal attempts, polluting `/models`.
* **Proposed Resolution (Preliminary Action + Stateless Signed Move Receipts):** Have `POST /api/move` return a compact HMAC-SHA256 receipt over `(prevFen, san, modelId, mode, illegalAttempts, fallbackUsed, timestamp)` using a server-only secret, and have `POST /api/games` verify the receipt chain to mark games `verified` for `/models` aggregation.
* **Secondary Liabilities:** Requires managing an HMAC signing secret on the server and adds slight payload size per move response.

### 3. Major — Sequential Retry Latency vs. Fixed `MOVE_TIMEOUT_MS` (25,000 ms)
* **False Compromise:** Sharing a single 25,000 ms deadline across `getTopCandidates` and up to 3 sequential LLM attempts means a slow Attempt 1 (18–23 s) starves Retry 1/2 and forces a `strict` forfeit or `friendly` fallback, conflating network latency with chess illegality.
* **Proposed Resolution (Dynamics + Preliminary Action):** On Retry 1+, dynamically switch to minimal-output mode (drop commentary, reduce `maxOutputTokens` to ~100, use structured JSON `enum` constraints over `legalMovesSan` where supported), and cap `getTopCandidates` in `assisted` mode to a strict sub-budget (e.g., `<= 500 ms`).
* **Secondary Liabilities:** Retried moves will have minimal or omitted AI commentary, and `enum` constraints introduce slight per-provider adapter divergence.

### 4. Nit — Pure Mode Prompting vs. Illegal-Move Rate (Open Question 1)
* **Proposed Resolution (Segmentation):** Omit `legal_moves_san` on Attempt 1 in `pure` mode so `illegalAttempts` honestly measures unassisted board tracking, and inject `legal_moves_san` on Retry 1+ for recovery, relying on `sanitizeSanCandidate` before Attempt 1 legality checks.

### 5. Nit — In-Memory IP Rate Limiting vs. Multi-Instance CPU Protection
* **Proposed Resolution (Beforehand Cushioning):** Keep the in-memory limiter for single-node/dev, and add queue-depth load shedding at `StockfishPool` returning `429 Retry-After` when pending UCI queue depth exceeds a bound `K`.
