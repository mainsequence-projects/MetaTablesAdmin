import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertCommandCenterPageLayout, verifyCommandCenterPageLayout } from '@dev-mainsequence/command-center-sdk/layout/testing';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
// Set ACCESS_MAP_SCREENSHOTS to a directory to keep one screenshot per theme and width.
const screenshots = process.env.ACCESS_MAP_SCREENSHOTS;
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, HOME: process.env.HOME, METATABLES_API_TARGET: 'http://127.0.0.1:9' }, stdio: 'ignore',
});
const ns = '76bb5bc7-06b4-49b0-a45f-f3787e716ad5';
const viewer = '889cb532-3d40-4261-9921-352336237069';
const table = (uid, name, kind, related = false) => ({ uid, name, kind, namespace_uid: related ? 'other' : ns,
  namespace_name: related ? 'trading' : 'prices', related, viewer_access: related ? 'writer' : 'reader' });
const accessMap = relationships => ({
  namespace: { uid: ns, name: 'prices' }, viewer: { user_uid: viewer, team_uids: ['trading'] },
  table_count: 3, tables_truncated: false,
  tables: [table('daily', 'prices.daily_close', 'relational'), table('intraday', 'prices.intraday', 'time_index'),
    table('assets', 'prices.assets', 'relational'), ...(relationships ? [table('orders', 'trading.orders', 'relational', true)] : [])],
  principals: [
    { kind: 'user', uid: 'job', name: 'prices migrations (Job workload)', identity_type: 'workload' },
    { kind: 'user', uid: 'api', name: 'prices API (Release workload)', identity_type: 'workload' },
    { kind: 'user', uid: viewer, name: 'trading API (Release workload)', identity_type: 'workload' },
    { kind: 'user', uid: 'retired-workload', name: null, identity_type: null },
    { kind: 'team', uid: 'prices', name: 'prices-development', identity_type: null },
    { kind: 'team', uid: 'trading', name: 'trading-development', identity_type: null },
  ],
  grants: [
    { uid: 'g1', target_kind: 'namespace', target_uid: ns, principal_kind: 'team', principal_uid: 'prices', access_level: 'writer' },
    { uid: 'g2', target_kind: 'namespace', target_uid: ns, principal_kind: 'team', principal_uid: 'trading', access_level: 'reader' },
    { uid: 'g3', target_kind: 'table', target_uid: 'daily', principal_kind: 'user', principal_uid: 'retired-workload', access_level: 'writer' },
  ],
  memberships: [{ team_uid: 'prices', user_uid: 'job' }, { team_uid: 'prices', user_uid: 'api' }, { team_uid: 'trading', user_uid: viewer }],
  unreadable_team_uids: [],
  relationships: relationships ? [{ kind: 'foreign_key', source_table_uid: 'orders', target_table_uid: 'daily', name: 'orders_close_fk' },
    { kind: 'update_input', source_table_uid: 'intraday', target_table_uid: 'orders', name: null }] : [],
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  for (const dark of [false, true]) for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, hasTouch: width === 375, isMobile: width === 375 });
    const page = await context.newPage();
    const requests = [];
    let namespaceReads = 0;
    await page.route('**/api/**', async route => {
      const request = new URL(route.request().url()), path = request.pathname;
      let result;
      if (path.endsWith('/runtime-context/')) result = { is_admin: false, user_uid: viewer, local_mode: true, local_mode_available: true,
        data_source: { uid: ns, display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
        bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
      else if (path.endsWith(`/namespaces/${ns}/access-map/`)) { requests.push(request.search); result = accessMap(request.searchParams.get('relationships') === 'true'); }
      else if (path.endsWith(`/namespaces/${ns}/`)) namespaceReads++, result = { uid: ns, name: 'prices', description: 'Prices application', created_at: '2026-10-09T00:00:00Z', relational_table_count: 2, time_index_table_count: 1 };
      else result = { count: 0, results: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto(`${url}/namespaces/${ns}?tab=access-map`);
    const canvas = page.getByLabel('Namespace access map', { exact: true });
    await canvas.waitFor();
    await page.evaluate(async dark => {
      const { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme } = await import('/node_modules/@dev-mainsequence/command-center-sdk/dist/theme/index.js');
      applyThemePresetToRoot(document.documentElement, { theme: dark ? mainSequenceTheme : quartzLightTheme });
    }, dark);
    for (const label of ['prices-development', 'trading-development', 'prices.daily_close', 'User retired-'])
      await canvas.getByText(label, { exact: true }).waitFor();
    assert(requests.every(search => search === ''), 'relationships are off by default');
    if (screenshots) await page.screenshot({ path: `${screenshots}/access-map-${dark ? 'dark' : 'light'}-${width}-fitted.png`, fullPage: true });
    // A phone shows the map at a readable zoom and pans to the rest; trace from a desktop width.
    if (width === 375) {
      // Boxes panned outside the canvas count as clipped to the SDK check; nothing else may fail.
      const layout = await verifyCommandCenterPageLayout(page, { viewports: [{ width, height: 812, pointer: 'coarse' }] });
      assert.deepEqual(layout.violations.filter(item => !(item.code === 'interactive-clipping' && /react-flow__node/.test(item.element ?? ''))), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow on a phone');
      await context.close();
      continue;
    }
    await canvas.scrollIntoViewIfNeeded();
    // Selecting a table explains every grant that reaches it.
    await canvas.getByText('prices.daily_close', { exact: true }).click();
    await page.getByText('Writer: prices-development (namespace grant)', { exact: true }).waitFor();
    await page.getByText('Writer: User retired- (direct grant)', { exact: true }).waitFor();
    assert.equal(await page.locator('.mt-anode[data-state="dim"]').count() > 0, true);
    await page.keyboard.press('Escape');
    // The viewer's own workload is traced through its Team.
    await canvas.getByText('trading API (Release workload)', { exact: true }).click();
    await page.getByText('Reader on namespace prices through trading-development', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Relationships', exact: true }).click();
    await canvas.getByText('trading.orders', { exact: true }).waitFor();
    // Scrolling, loading the assistant and selecting never remount the view: one read each, plus the toggle.
    assert.equal(namespaceReads, 1, 'the namespace is read once');
    assert.deepEqual(requests, ['', '?relationships=true']);
    await canvas.getByText('prices.intraday', { exact: true }).click();
    await page.getByText('Feeds the updater of trading.orders', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open table', exact: true }).getAttribute('href'), '/time-index-meta-tables/intraday');
    await assertCommandCenterPageLayout(page, { viewports: [{ width, height: 900, pointer: 'fine' }] });
    if (screenshots) await page.screenshot({ path: `${screenshots}/access-map-${dark ? 'dark' : 'light'}-${width}-traced.png`, fullPage: true });
    await context.close();
  }
  console.log('Access map browser checks passed: grants, Teams, tracing, explanations and relationships; light/dark at 375/1280.');
} finally { await browser?.close(); vite.kill(); }
