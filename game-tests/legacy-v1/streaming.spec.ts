import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

// The harness uses the real renderer with deterministic state, without exposing debug APIs in the game.
let harness = '';
test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { mountRaceScene } from './app/scene';
      import { newRace } from './app/engine';
      const race = newRace('ABC234', 'host'); race.phase = 'racing';
      for (const team of ['coral','gold']) for(let i=0;i<6;i++) race.players.push({id:team+i,name:'Crew '+i,team,side:i%2?'right':'left',ready:true,connected:true,strokes:0});
      const view = mountRaceScene(document.querySelector('#river'), {getRace:()=>race,playerId:'coral4',view:'player'});
      window.teleportRiver = distance => { race.boats.coral.distance=distance; race.boats.gold.distance=distance+8; race.revision++; };
      window.removeRiver = () => view.remove();
      window.rowRiver = () => view.stroke();
    ` },
    bundle: true, write: false, format: 'iife', target: 'es2022', define: { global: 'window' },
  });
  harness = result.outputFiles[0].text;
});
test('nearby scenery stays bounded as the boat moves and rendering sleeps in a hidden tab', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.route('**/__renderer_test', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="river" style="width:100vw;height:100vh"></div><script src="/__renderer_test.js"></script></body>' }));
    await page.route('**/__renderer_test.js', route => route.fulfill({ contentType: 'application/javascript', body: harness }));
    await page.goto('/__renderer_test');
    const scene = page.locator('#river');
    await expect(scene).toHaveAttribute('data-renderer', '3d');
    await expect(scene).toHaveAttribute('data-antialias', 'true');
    await expect(scene).toHaveAttribute('data-surface-assets', '3');
    await expect.poll(async () => Number(await scene.getAttribute('data-active-chunks'))).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const distance of [0, 80, 240, 560, 0]) {
      await page.evaluate(d => (window as any).teleportRiver(d), distance);
      await page.waitForTimeout(700);
      const chunks = Number(await scene.getAttribute('data-active-chunks'));
      expect(chunks).toBeGreaterThan(0); expect(chunks).toBeLessThanOrEqual(9);
      const instances = Number(await scene.getAttribute('data-resident-instances'));
      expect(instances).toBeGreaterThan(0); expect(instances).toBeLessThan(5000);
      keys.add((await scene.getAttribute('data-chunk-keys')) || '');
      const pixels = await scene.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height);
      expect(pixels).toBeLessThanOrEqual(844 * 390 * 1.5 * 1.5 + 1000);
    }
    expect(keys.size).toBeGreaterThan(2);
    await page.screenshot({ path: 'test-results/streamed-player-landscape.png' });
    await page.evaluate(() => (window as any).rowRiver());
    await expect(scene).toHaveAttribute('data-stroke-phase', 'drive');
    expect(Number(await scene.getAttribute('data-blade-height'))).toBeLessThan(-.12);
    await expect(scene).toHaveAttribute('data-stroke-phase', 'ready');
    expect(Number(await scene.getAttribute('data-blade-height'))).toBeGreaterThan(-.12);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    const stoppedAt = await scene.getAttribute('data-render-frames');
    expect(Number(stoppedAt)).toBeGreaterThan(0);
    await page.waitForTimeout(250);
    await expect(scene).toHaveAttribute('data-render-frames', stoppedAt!);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => Number(await scene.getAttribute('data-render-frames'))).toBeGreaterThan(Number(stoppedAt));
    await page.evaluate(() => (window as any).removeRiver());
    await expect(scene.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
test('a phone downloads the 3D module only after joining a room', async ({ browser }) => {
  const hostContext = await browser.newContext(), phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const host = await hostContext.newPage(); await host.goto('/'); await host.getByRole('button', { name: 'Host a race' }).click();
    const code = await host.locator('.room-code-display').innerText();
    const phone = await phoneContext.newPage(); const scripts: string[] = [], surfaces: string[] = [];
    phone.on('request', request => { if(request.url().includes('/assets/river/'))surfaces.push(request.url()); });
    phone.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await phone.goto(`/?room=${code}`); await expect(phone.locator('#nickname')).toBeVisible();
    await phone.waitForTimeout(200);
    expect(scripts.some(url => /\/chunks\/(scene|river)-/.test(url))).toBe(false);
    expect(surfaces).toEqual([]);
    await phone.locator('#nickname').fill('Lazy crew'); await phone.getByRole('button', { name: 'Join the crew' }).click();
    await expect(phone.locator('#race-river')).toHaveAttribute('data-renderer', '3d');
    expect(scripts.some(url => /\/chunks\/scene-/.test(url))).toBe(true);
    await expect(phone.locator('#race-river')).toHaveAttribute('data-surface-assets', '3');
    expect(surfaces).toHaveLength(3);
    expect(scripts.some(url => /\/chunks\/river-/.test(url))).toBe(false);
  } finally { await phoneContext.close(); await hostContext.close(); }
});
