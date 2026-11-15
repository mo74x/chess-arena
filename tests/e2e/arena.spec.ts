import { expect, test } from '@playwright/test';

test.describe('Chess Arena E2E', () => {
  test('health endpoint reports Stockfish ready', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stockfish).toBe(true);
  });

  test('analyze endpoint computes ACPL and accuracy for a short PGN', async ({ request }) => {
    const res = await request.post('/api/analyze', {
      data: { pgn: '1. e4 e5 2. Nf3 Nc6' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plies).toHaveLength(4);
    expect(typeof body.white.accuracy).toBe('number');
    expect(typeof body.black.accuracy).toBe('number');
  });

  test('plays a move against mock-legal and resigns cleanly', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('model-card-mock-legal').click();
    await page.getByTestId('start-match-btn').click();

    await expect(page.getByTestId('chessboard-container')).toBeVisible();

    // Click e2 then e4 to play 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();

    // Wait for mock-legal reply to appear in move list
    await expect(page.locator('button', { hasText: 'e4' })).toBeVisible();

    await page.getByTestId('resign-btn').click();
    await expect(page.getByTestId('game-over-dialog')).toBeVisible();
    await expect(page.getByTestId('game-over-dialog')).toContainText('0-1');
  });

  test('strict policy triggers forfeit against mock-always-illegal', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('model-card-mock-always-illegal').click();
    await page.getByTestId('policy-strict').click();
    await page.getByTestId('start-match-btn').click();

    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();

    await expect(page.getByTestId('game-over-dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-over-dialog')).toContainText('1-0');
  });

  test('keeps chessboard dir="ltr" when UI switches to Arabic RTL', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-toggle').click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByTestId('model-card-mock-legal').click();
    await page.getByTestId('start-match-btn').click();

    await expect(page.getByTestId('chessboard-container')).toHaveAttribute('dir', 'ltr');
  });

  test('supports time controls, board themes, sound toggle, draw offer, and captures screenshots', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    await page.getByTestId('model-card-mock-legal').click();
    await page.getByTestId('time-control-blitz5').click();
    await page.screenshot({ path: 'docs/screenshots/setup.png', fullPage: true });

    await page.getByTestId('start-match-btn').click();
    await expect(page.getByTestId('human-clock')).toBeVisible();
    await expect(page.getByTestId('ai-clock')).toBeVisible();

    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(page.locator('button', { hasText: 'e4' })).toBeVisible();

    await page.getByTestId('board-theme-select').selectOption('walnut');
    await page.getByTestId('sound-toggle-btn').click();
    await page.getByTestId('offer-draw-btn').click();
    await expect(page.getByTestId('draw-notice')).toBeVisible();

    await page.screenshot({ path: 'docs/screenshots/game-en.png', fullPage: true });

    await page.goto('/models');
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: 'docs/screenshots/models.png', fullPage: true });

    await page.goto('/history');
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: 'docs/screenshots/history.png', fullPage: true });
  });

  test('defaults to dark mode, toggles light mode, and supports handle, avatar, and custom model input', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByTestId('player-handle-input').fill('Mo74x');
    await page.getByTestId('avatar-king').click();
    await page.getByTestId('custom-provider-select').selectOption('anthropic');
    await page.getByTestId('custom-model-input').fill('claude-opus-4-1-20250805');
    await expect(page.getByTestId('byok-key-input')).toBeVisible();
  });
});
