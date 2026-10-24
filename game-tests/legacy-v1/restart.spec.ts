import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
async function start(): Promise<ChildProcess> {
  const local = resolve('.tools/node_modules/node/bin/node');
  const child = spawn(existsSync(local) ? local : process.execPath, ['scripts/run.mjs','--production'], { env: {...process.env,APP_PORT:'8081',WS_PORT:'6021'}, stdio:'ignore' });
  await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:8081/session')).ok}catch{return false}}, {timeout:20000}).toBe(true);
  return child;
}
async function stop(child:ChildProcess) { if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM')}); }
test('a server restart ends existing rooms instead of replaying stale game state',async({browser})=>{
  let server=await start(); const context=await browser.newContext();
  try {
    const page=await context.newPage();await page.goto('http://127.0.0.1:8081');await page.getByRole('button',{name:'Host a race'}).click();await expect(page.locator('.room-code-display')).toBeVisible();
    const code=await page.locator('.room-code-display').innerText();
    await stop(server);server=await start();
    await expect(page.getByRole('heading',{name:'THIS RACE HAS ENDED.'})).toBeVisible({timeout:15000});
    const guest=await context.newPage();await guest.goto(`http://127.0.0.1:8081/?room=${code}`);await guest.getByRole('button',{name:'Just watch the race'}).click();await expect(guest.getByRole('alert')).toContainText('Room not found');
  } finally {await context.close();await stop(server);}
});
