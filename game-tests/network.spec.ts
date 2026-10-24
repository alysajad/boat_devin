import { test, expect } from '@playwright/test';

test('host invite refreshes when moving from Wi-Fi to a hotspot, without changing the room', async ({ page }) => {
  let address = '192.0.2.10';
  await page.route('**/config.json', route => route.fulfill({ json: { addresses: [address], wsPort: 6020, appPort: 8080 } }));
  await page.goto('/');
  // The host's landing page was loaded on the old network.
  address = '192.0.2.20';
  await page.getByRole('button', { name: 'Host a race' }).click();
  await expect(page.locator('.join-url')).toContainText(address);
  const code = await page.locator('.room-code-display').innerText();
  const firstQR = await page.locator('#join-qr').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  address = '192.0.2.30';
  await expect(page.locator('.join-url')).toContainText(address, { timeout: 10000 });
  await expect(page.locator('#join-qr')).toHaveAttribute('data-url', `http://192.0.2.30:8080/?room=${code}`);
  await expect.poll(() => page.locator('#join-qr').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(firstQR);
  await expect(page.locator('.room-code-display')).toHaveText(code);
  await expect(page.getByRole('button', { name: 'Start the race' })).toBeDisabled();
});

test('HTTPS tunnel origin is used in the QR while admin stays on localhost',async({page})=>{
 await page.route('**/config.json',route=>route.fulfill({json:{publicOrigin:'https://event-test.trycloudflare.com',addresses:['192.0.2.1'],appPort:8080}}));
 await page.goto('/');await page.getByRole('button',{name:'Host a race'}).click();
 const code=await page.locator('.room-code-display').innerText();await expect(page.locator('#join-qr')).toHaveAttribute('data-url',`https://event-test.trycloudflare.com/?room=${code}`);expect(new URL(page.url()).hostname).toBe('127.0.0.1');
});

test('host can choose direct Wi-Fi swipe QR or trusted local HTTPS',async({page})=>{
 let localHttpsPort:number|undefined;
 await page.route('**/config.json',route=>route.fulfill({json:{publicOrigin:'https://demo.trycloudflare.com',addresses:['192.0.2.5'],appPort:8080,localHttpsPort}}));
 await page.goto('/');await page.getByRole('button',{name:'Host a race'}).click();const code=await page.locator('.room-code-display').innerText();
 await page.locator('#invite-mode').selectOption('local');await expect(page.locator('#join-qr')).toHaveAttribute('data-url',`http://192.0.2.5:8080/?room=${code}`);await expect(page.locator('#invite-note')).toContainText('use swipe');
 localHttpsPort=8443;await expect(page.locator('#join-qr')).toHaveAttribute('data-url',`https://192.0.2.5:8443/?room=${code}`,{timeout:10000});await expect(page.locator('#invite-note')).toContainText('trust');
 await page.locator('#invite-mode').selectOption('internet');await expect(page.locator('#join-qr')).toHaveAttribute('data-url',`https://demo.trycloudflare.com/?room=${code}`);
});
