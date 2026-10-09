import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertCommandCenterPageLayout } from '@dev-mainsequence/command-center-sdk/layout/testing';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
// Set CALLER_SCREENSHOTS to a directory to keep one screenshot per theme and width.
const screenshots = process.env.CALLER_SCREENSHOTS;
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, HOME: process.env.HOME, METATABLES_API_TARGET: 'http://127.0.0.1:9' }, stdio: 'ignore',
});
const uid = '76bb5bc7-06b4-49b0-a45f-f3787e716ad5';
const user = '889cb532-3d40-4261-9921-352336237069';
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  for (const dark of [false, true]) for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, hasTouch: width === 375, isMobile: width === 375 });
    const page = await context.newPage();
    let callerRequests = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let result;
      if (path.endsWith('/runtime-context/')) result = { is_admin: true, user_uid: 'not-shown', local_mode: true, local_mode_available: true,
        data_source: { uid, display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
        bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
      else if (path.endsWith('/caller/')) { callerRequests++; result = { user_uid: user, name: 'Ada Lovelace', email: 'ada@example.com', identity_type: 'person',
        is_admin: true, teams: [{ uid: 'team-1', name: 'ledger-development' }, { uid: 'f00dfeed-0000', name: null }], identified_by: 'local_sdk_session' }; }
      else result = { count: 0, results: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto(`${url}/tables`);
    const summary = page.getByLabel('Signed in as Ada Lovelace, as the API sees it', { exact: true });
    await summary.waitFor();
    await page.evaluate(async dark => {
      const { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme } = await import('/node_modules/@dev-mainsequence/command-center-sdk/dist/theme/index.js');
      applyThemePresetToRoot(document.documentElement, { theme: dark ? mainSequenceTheme : quartzLightTheme });
    }, dark);
    // The box sits at the top right of the page and names the API's caller, not the runtime context's.
    const box = await summary.boundingBox();
    assert(box.x + box.width > width * 0.6 && box.y < 120, `the box is at the top right: ${JSON.stringify(box)}`);
    assert.equal(await page.getByText('not-shown').count(), 0);
    await summary.click();
    for (const text of [user, 'ada@example.com', 'Yes, Organization admin', 'ledger-development, Team f00dfeed', 'Local SDK session', 'Not embedded; nothing to compare'])
      await page.getByText(text, { exact: true }).waitFor();
    assert.equal(callerRequests, 1);
    await assertCommandCenterPageLayout(page, { viewports: [{ width, height: width === 375 ? 812 : 800, pointer: width === 375 ? 'coarse' : 'fine' }] });
    if (screenshots) await page.screenshot({ path: `${screenshots}/caller-${dark ? 'dark' : 'light'}-${width}.png` });
    await context.close();
  }
  console.log('Caller identity browser checks passed: API-admitted user, Teams and admin flag at the top right; light/dark at 375/1280.');
} finally { await browser?.close(); vite.kill(); }
