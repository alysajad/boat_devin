import { test, expect, webkit, type BrowserContext, type Page } from '@playwright/test';

test('WebKit phone joins a Chromium host, rows, rotates, reconnects and swaps sides', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'This scenario explicitly mixes Chromium and WebKit.');
  const safari = await webkit.launch({ args: [], executablePath: webkit.executablePath() });
  const contexts: BrowserContext[] = [];
  try {
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.push(hostContext);
    const host = await hostContext.newPage(); await host.goto('/'); await host.getByRole('button', { name: 'Host a race' }).click();
    const code = await host.locator('.room-code-display').innerText();
    const players: Page[] = [], errors: string[] = [];
    for (const [i, team] of ['coral', 'gold', 'coral', 'gold'].entries()) {
      const context = await (i === 0 ? safari : browser).newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }); contexts.push(context);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:8080/?room=${code}`); await page.locator('#nickname').fill(`Mixed crew ${i}`);
      await page.locator(`input[value="${team}"]`).check(); await page.getByRole('button', { name: 'Join the crew' }).click();
      await expect(page.getByRole('button', { name: 'I’m ready' })).toBeEnabled({ timeout: 15000 });
      await page.getByRole('button', { name: 'I’m ready' }).click(); players.push(page);
    }
    await expect(host.getByRole('button', { name: 'Start the race' })).toBeEnabled();
    await host.getByRole('button', { name: 'Start the race' }).click();
    const phone = players[0];
    await expect(phone.locator('#phase-label')).toHaveText('RACE IS ON', { timeout: 15000 });
    await expect(phone.locator('#race-river')).toHaveAttribute('data-renderer', '3d');
    await expect(phone.locator('#race-river')).toHaveAttribute('data-side', 'left');
    const paddle = (await phone.locator('.paddle-button').boundingBox())!;
    await phone.mouse.move(paddle.x + paddle.width / 2, paddle.y + 20); await phone.mouse.down();
    await phone.mouse.move(paddle.x + paddle.width / 2, paddle.y + 90, { steps: 4 }); await phone.mouse.up();
    await expect.poll(() => phone.evaluate(c => Number(sessionStorage.getItem(`race-seq:${c}`)), code)).toBe(1);
    await expect.poll(async () => parseInt(await host.locator('#coral-distance').innerText())).toBeGreaterThan(0);
    await phone.getByRole('button', { name: 'Switch to tap controls' }).click();
    await expect(phone.locator('.paddle-button')).not.toHaveClass(/recovering/);
    await phone.locator('.paddle-button').tap();
    await expect.poll(() => phone.evaluate(c => Number(sessionStorage.getItem(`race-seq:${c}`)), code)).toBe(2);
    await phone.setViewportSize({ width: 390, height: 844 });
    await expect(phone.locator('.rotate-tip')).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.emulateMedia({ reducedMotion: 'reduce' });
    await expect(phone.locator('#race-river')).toHaveAttribute('data-motion', 'reduced');
    await phone.getByRole('button', { name: 'Unmute sound' }).click();
    await phone.getByRole('button', { name: 'Mute sound', exact: true }).click();
    await phone.screenshot({ path: 'test-results/webkit-phone-portrait.png', fullPage: true });
    // Close the real socket while retaining this tab's session identity.
    await phone.goto('about:blank');
    await expect(host.locator('#phase-label')).toHaveText('RACE PAUSED', { timeout: 15000 });
    await phone.goto(`http://127.0.0.1:8080/?room=${code}`);
    for (const player of players) {
      await expect(player.getByRole('button', { name: 'Ready to resume', exact: true })).toBeEnabled({ timeout: 20000 });
      await player.getByRole('button', { name: 'Ready to resume', exact: true }).click();
    }
    await expect(host.getByRole('button', { name: 'Resume race' })).toBeEnabled({ timeout: 10000 });
    await host.getByRole('button', { name: 'Resume race' }).click();
    await expect(phone.locator('#phase-label')).toHaveText('RACE IS ON', { timeout: 10000 });
    await host.getByRole('button', { name: 'Pause race', exact: true }).click();
    await host.getByRole('button', { name: 'Return to lobby' }).click();
    await expect(phone.locator('#seat-badge')).toContainText('RIGHT PADDLE');
    await expect(phone.locator('#race-river')).toHaveAttribute('data-side', 'right');
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close())); await safari.close();
  }
});
