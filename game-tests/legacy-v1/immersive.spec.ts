import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
const sessions: BrowserContext[] = [];
async function pageFor(browser: Browser, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
  // Fullscreen and lock APIs have their own tests; keep the native window resizable here.
  await context.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable in rotation harness'); }; });
  sessions.push(context); return context.newPage();
}
async function setup(browser: Browser) {
  const host = await pageFor(browser); await host.goto('/'); await host.getByRole('button', { name: 'Host a race' }).click();
  const code = await host.locator('.room-code-display').innerText();
  const players: Page[] = [];
  for (const [i, team] of ['coral', 'gold', 'coral', 'gold'].entries()) {
    const p = await pageFor(browser, true); await p.goto(`/?room=${code}`);
    await p.locator('#nickname').fill(`Rower ${i}`); await p.locator(`input[value="${team}"]`).check();
    await p.getByRole('button', { name: 'Join the crew' }).click();
    await expect(p.getByRole('button', { name: 'I’m ready' })).toBeEnabled({ timeout: 15000 });
    await p.getByRole('button', { name: 'I’m ready' }).click(); players.push(p);
  }
  await expect(host.getByRole('button', { name: 'Start the race' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start the race' }).click();
  await expect(players[0].locator('#phase-label')).toHaveText('RACE IS ON', { timeout: 10000 });
  return { host, players, code };
}
const seq = (p: Page, code: string) => p.evaluate(c => Number(sessionStorage.getItem(`race-seq:${c}`) || 0), code);
test.afterEach(async () => { await Promise.all(sessions.splice(0).map(c => c.close())); });
test('simultaneous touch look and rowing, cancellation, rotation and reduced motion', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP exercises actual multi-touch in Chromium; WebKit uses the shared controls suite.');
  const { host, players, code } = await setup(browser), p = players[0];
  await expect(p.locator('#race-river')).toHaveAttribute('data-renderer', '3d');
  const riverBounds=await p.locator('#race-river').boundingBox();
  expect(riverBounds?.width).toBe(844);expect(riverBounds?.height).toBe(390);
  const paddle = (await p.locator('.paddle-button').boundingBox())!;
  const look = (await p.locator('.look-zone').boundingBox())!;
  const cdp = await p.context().newCDPSession(p);
  const rowPoint = { x: paddle.x + paddle.width / 2, y: paddle.y + 20, id: 1 };
  const lookPoint = { x: look.x + look.width * .65, y: look.y + look.height * .45, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rowPoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rowPoint, lookPoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...rowPoint, y: rowPoint.y + 60 }, { ...lookPoint, x: lookPoint.x + 50 }] });
  await expect.poll(() => seq(p, code)).toBe(1);
  await expect.poll(async () => Math.abs(Number(await p.locator('#race-river').getAttribute('data-look-yaw')))).toBeGreaterThan(.1);
  await p.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...rowPoint, y: rowPoint.y + 90 }, lookPoint] });
  expect(await seq(p, code)).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.getByRole('button', { name: 'Recenter view' }).click();
  await expect(p.locator('#race-river')).toHaveAttribute('data-look-yaw', '0');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rowPoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...rowPoint, y: rowPoint.y + 25 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await seq(p, code)).toBe(1);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await expect(p.locator('#race-river')).toHaveAttribute('data-motion', 'reduced');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rowPoint] });
  await p.setViewportSize({ width: 390, height: 844 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...rowPoint, y: rowPoint.y + 80 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await seq(p, code)).toBe(1);
  await expect(p.locator('.rotate-tip')).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await host.getByRole('button', { name: 'Pause race', exact: true }).click();
  await expect(p.locator('.paddle-button')).toHaveCount(0);
  await cdp.detach();
});
test('WebGL unavailable still permits room joining and shows an explicit 2D fallback', async ({ browser }) => {
  const p = await pageFor(browser);
  await p.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind === 'webgl2' || kind === 'webgl') return null;
      return original.call(this, kind as '2d', ...args);
    } as typeof original;
  });
  await p.goto('/'); await p.getByRole('button', { name: 'Host a race' }).click();
  await expect(p.locator('#race-river')).toHaveAttribute('data-renderer', '2d');
  await expect(p.locator('#renderer-notice')).toContainText('3D is unavailable');
  await expect(p.locator('#race-river canvas')).toBeVisible();
  await expect(p.locator('.room-code-display')).toBeVisible();
});
test('losing a WebGL context replaces the canvas without ending the room', async ({ browser }) => {
  const p = await pageFor(browser); await p.goto('/'); await p.getByRole('button', { name: 'Host a race' }).click();
  await expect(p.locator('#race-river')).toHaveAttribute('data-renderer', '3d');
  const code = await p.locator('.room-code-display').innerText();
  await p.locator('#race-river canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Test browser does not expose context loss');
    extension.loseContext();
  });
  await expect(p.locator('#race-river')).toHaveAttribute('data-renderer', '2d');
  await expect(p.locator('#renderer-notice')).toContainText('3D connection was lost');
  await expect(p.locator('#race-river canvas')).toHaveCount(1);
  await expect(p.locator('.room-code-display')).toHaveText(code);
  await expect(p.locator('#phase-label')).toHaveText('IN THE LOBBY');
});
