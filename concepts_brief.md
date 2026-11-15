# Chess Arena: Dark Mode, Open BYOK, Player Identity & 3/1/0 Scoreboard

* **Author:** Mohamed Arafa (Mo74x)
* **Date:** 2026-11-15

## Overview

This update expands Chess Arena in four connected areas:
1. **Dark-first theme:** Default to dark mode across all pages (`/`, `/history`, `/models`, `/games/[id]`) with a persisted light/dark toggle and no white-flash on load.
2. **Open BYOK provider and model selection:** Users select a provider (`Anthropic`, `Google`, `OpenAI`, `Engine`, or `Mock`) and either choose a preset model or enter any custom model ID, supplying their own API key (`x-api-key`) with live per-move and per-game token tracking.
3. **Lightweight player identity:** Users set a display handle and pick from curated built-in chess SVG avatars stored locally in the browser alongside an invisible client-generated `player_token` (no login or password).
4. **User-vs-Model 3/1/0 points scoreboard:** A ranked leaderboard per model awarding **3 points per win**, **1 point per draw**, and **0 points per loss**, with guardrails against mock-bot farming, mode mixing, and handle spoofing.

## Analysis

### 1. Dark Mode Default + Persisted Toggle
* `src/app/globals.css` currently hardcodes light `#fafaf9` / `#1c1917` tokens and components use hardcoded `stone-*` and `white` classes. Adding Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *));` with semantic surface/border/text CSS variables lets every page and component switch cleanly.
* Adding a small synchronous `<script>` in `src/app/layout.tsx` `<head>` (with `suppressHydrationWarning` on `<html>`) reads `localStorage.getItem('chess-arena:theme')` and defaults to `'dark'`, preventing flash of unstyled light content before hydration.
* Board themes (`Classic`, `Slate`, `Walnut`) remain selectable and maintain piece contrast against warm charcoal (`stone-950` / `stone-900`) surfaces.

### 2. Open BYOK Provider/Model Selection + Live Token Visibility
* `MoveRequestSchema` (`src/lib/arena/schemas.ts`) and `resolveAiMove()` (`src/lib/arena/resolve-move.ts`) currently reject any `modelId` outside the static `ARENA_MODELS` list. Allowing an explicit `provider` plus either a preset or validated custom `modelId` (`/^[a-zA-Z0-9._:/-]{2,80}$/`) unlocks any Anthropic, Google Gemini, or OpenAI model without hardcoding future releases.
* Storing the user's BYOK key in `sessionStorage` (tab-scoped, cleared on tab close, never sent to Supabase or logged) avoids forcing re-entry on rematch or refresh while keeping XSS/persistence exposure minimal.
* `/api/move` already returns `telemetry.usage` (`inputTokens`, `outputTokens`, `totalTokens`). Surfacing this in `MoveLogEntry`, `MoveList`, and a live header token meter gives BYOK users immediate spend visibility.

### 3. Lightweight Player Identity (Handle + Built-in Avatars)
* Players choose a handle (`3–24` chars) and one of 8–12 curated built-in chess SVG avatars, stored in `localStorage` together with a `crypto.randomUUID()` `player_token`.
* The server hashes `player_token` with SHA-256 (`player_token_hash`) and never stores the raw token. Handles are **first-come, first-served** (case-insensitive): if another `player_token_hash` already owns a handle, `POST /api/games` returns `409 Conflict` prompting the user to pick an unclaimed handle.

### 4. Scoreboard Policy Decisions (Goldfish Synthesis)
* **`mock-*` bots:** Excluded from ranked scoreboard points (`is_ranked = false`). Allowing `mock-always-illegal` or `mock-legal` in ranked scoring would enable zero-cost point farming.
* **`assisted` and `engine` modes:** Partitioned from `pure` mode. The main ranked scoreboard defaults to **`pure` mode** (where the model plays unassisted). `assisted` and `engine` games are still saved and viewable under separate tabs/filters.
* **Model forfeit points:** When an LLM forfeits on illegal moves (`strict` policy), the human earns **3 points** (provided `>= 4` plies were played to prevent trivial 1-move abuse).
* **Custom model threshold:** Custom model IDs appear on the public scoreboard once `>= 3` games have been played against them (preventing typos from cluttering the leaderboard).
* **Anti-farming minimum validity:** Ranked points (`3 / 1 / 0`) require `mode = 'pure'`, non-mock/non-engine model, and either `>= 6` plies played (or `>= 4` plies on model forfeit) or a natural board termination (`checkmate`, `stalemate`, `insufficient_material`, `threefold_repetition`, `fifty_move_rule`), with `POST /api/games` rate-limited per IP.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Dark mode default with persisted light/dark toggle across all routes.
  * Provider + preset/custom model ID selection with BYOK `x-api-key` (`sessionStorage`) and live per-move/game token display.
  * Handle + built-in SVG avatar + `player_token_hash` identity without login.
  * Supabase migration (`0002_scoreboard_identity.sql`) and `/models` scoreboard ranking top users per model by `3 / 1 / 0` points.
* **Out-of-Scope Non-Goals:**
  * Password/OAuth accounts or server-side user sessions.
  * Hosting or proxying paid LLM keys on the server for public users.
  * USD cost tables (raw `input / output / total` token counts are shown instead so pricing never goes stale).

## Alternatives Weighed

* **API key storage (`React state` vs. `sessionStorage` vs. `localStorage`):** `sessionStorage` was chosen over React-state-only so keys survive a same-tab refresh, and over `localStorage` so keys clear automatically when the tab closes.
* **Handle uniqueness (unique claim vs. `handle#xxxx` tag):** `handle#xxxx` derived from `player_token_hash` avoids handle-squatting and login recovery flows while preventing spoofing.
* **Ranked mode scope (all modes combined vs. `pure` default + separate tabs):** Mixing `assisted`, `engine`, and `mock-*` into one `3 / 1 / 0` ranking would invalidate the leaderboard; partitioning by mode preserves fair comparison.

## Key Decisions & Staging for Next Steps

* Implement semantic dark/light theme tokens in `globals.css` + FOUC-free script in `layout.tsx`.
* Extend `MoveRequestSchema`, `ProviderAdapter`, and `resolveAiMove()` to accept `provider` + custom `modelId`.
* Add `supabase/migrations/0002_scoreboard_identity.sql` with `player_handle`, `player_avatar`, `player_token_hash`, `is_ranked`, and the `model_player_scoreboard` view.
* Upgrade `/models` to display both model overview stats and the ranked top-players-per-model (`3 / 1 / 0`) scoreboard.
