# Chess Arena (Human vs AI)

Play chess against Anthropic Claude, Google Gemini, OpenAI GPT, or a Stockfish engine baseline in the browser. `chess.js` enforces every legal move on both client and server, illegal model replies are caught and retried, and a server-side Node Stockfish engine evaluates positions and post-game accuracy.

## Game Modes

- **Pure Model (`pure`):** The model chooses every move from the position without Stockfish candidates. Attempt 1 omits the legal-move list to measure unassisted legality; Retry 1 and Retry 2 inject legal moves for recovery.
- **Assisted Model (`assisted`):** Server Stockfish computes the top 3 candidate moves and evaluations and passes them to the model. Assisted games are labeled separately in the UI and leaderboard.
- **Engine Baseline (`engine`):** Plays directly against Node Stockfish at a configurable skill level (`0`–`20`), with no LLM calls.

## Illegal-Move Policies

- **Strict (`strict`):** Up to 2 retries (3 total attempts). If the model still fails to return a legal SAN move, it forfeits.
- **Friendly (`friendly`):** Up to 2 retries. If retries fail, the server plays the first legal move (`legalMovesSan[0]`) and marks the move as fallback-used.

## BYOK Key Privacy

- Public users supply their own provider API key (`x-api-key`) per request over HTTPS.
- Keys are held in React component state only for the active tab (never written to `localStorage`, cookies, logs, or Supabase).
- In `NODE_ENV=production`, non-mock LLM calls without `x-api-key` are rejected with HTTP `401`.
- Deterministic `mock-*` bots (`mock-legal`, `mock-illegal-once`, `mock-always-illegal`) work with zero API keys for local development and automated tests.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in any optional keys or Supabase credentials.
3. Apply the Supabase migration in `supabase/migrations/0001_init.sql` to your Postgres database if you want persistent history, replay links, and the `/models` leaderboard.
4. Run locally:
   ```bash
   npm run dev
   ```

## Verification & Benchmark

```bash
npm run typecheck
npx eslint src --max-warnings=0
npm run test
npm run build
npm run test:e2e
npm run benchmark -- --dry-run
```

For a real CLI benchmark run against Stockfish (using server environment keys):

```bash
ANTHROPIC_API_KEY=... GEMINI_API_KEY=... OPENAI_API_KEY=... npm run benchmark -- --models=claude-haiku,gemini-flash,gpt-4o-mini --levels=1,5 --games=2
```

## Known Limitations

- **Hosting:** Server-side Node Stockfish requires a persistent Node.js runtime (`runtime = 'nodejs'`) rather than stateless edge functions.
- **Rate Limiting:** The built-in sliding-window rate limiter (`20/min` on `/api/move`, `5/min` on `/api/analyze`) is in-memory per instance.
- **Unauthenticated Persistence:** Anonymous games are saved and read through Next.js server routes using `SUPABASE_SERVICE_ROLE_KEY`; direct `anon` table access is denied by RLS.
