import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, HOME: process.env.HOME, METATABLES_API_TARGET: 'http://127.0.0.1:9' }, stdio: 'ignore',
});
const table = '8531c8a0-350c-4045-bcc8-a78d081da0b2';
const run = (uid, failed = false) => ({ uid, root_run_uid: uid, table_update_uid: 'returns', updater_label: 'DailyReturns',
  update_time_start: uid === 'new-run' ? '2026-09-30T09:00:00Z' : '2026-09-29T09:00:00Z', update_time_end: '2026-09-30T09:00:03Z', duration_seconds: 3,
  error_on_update: failed, outcome: failed ? 'failed' : 'succeeded', graph_availability: 'available' });
const graph = (uid) => ({ availability: uid === 'legacy-run' ? 'unavailable' : 'available', root_run_uid: uid, run_uid: uid, root_update_uid: 'returns',
  root_id: 'update:returns', selected_node_id: 'update:returns', started_at: run(uid).update_time_start, ended_at: run(uid).update_time_end,
  duration_seconds: 3, outcome: uid === 'old-run' ? 'failed' : 'succeeded', partial: false,
  nodes: [
    { id: `table:${table}`, uid: table, kind: 'time_index_table', label: 'daily_close' },
    { id: 'table:output', uid: 'output', kind: 'time_index_table', label: 'daily_return' },
    { id: 'update:prices', uid: 'prices', kind: 'update', label: 'RecordedPrices', output_table_uid: table, run_uid: `${uid}-prices`, status: uid === 'old-run' ? 'failed' : 'succeeded' },
    { id: 'update:returns', uid: 'returns', kind: 'update', label: 'DailyReturns', output_table_uid: 'output', run_uid: uid, status: uid === 'old-run' ? 'blocked' : 'succeeded' },
  ], edges: [
    { source: 'update:prices', target: `table:${table}`, kind: 'writes' },
    { source: 'update:prices', target: 'update:returns', kind: 'depends_on' },
    { source: 'update:returns', target: 'table:output', kind: 'writes' },
  ] });
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    requests.push(path + url.search);
    let result;
    if (path.endsWith('/runtime-context/')) result = { is_admin: true, user_uid: 'user', local_mode: true, local_mode_available: true,
      data_source: { uid: 'source', display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
      bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
    else if (/\/table-update-runs\/.+\/graph\/$/.test(path)) {
      const uid = path.split('/').at(-3);
      if (uid === 'old-run') await new Promise(resolve => setTimeout(resolve, 100));
      result = graph(uid);
    } else if (/\/table-update-runs\/.+\/logs\/$/.test(path)) {
      const uid = path.split('/').at(-3);
      result = { rows: [{ uid: 'log-1', run_uid: uid, timestamp: '2026-09-30T09:00:01Z', level: 'info', message: `Captured log from ${uid}`, context: {} }], availability: 'available', next_cursor: null, truncated: false };
    }
    else if (path.endsWith('/table-update-runs/')) result = { count: 26, results: url.searchParams.get('offset') === '25' ? [run('legacy-run')] : [run('new-run'), run('old-run', true)] };
    else if ((path.endsWith(`/meta-tables/${table}/`) || path.endsWith(`/time-index-meta-tables/${table}/`))) result = { uid: table, physical_table_name: 'daily_close', identifier: 'Daily close', management_mode: 'platform_managed',
      schema_management_mode: 'alembic_managed', provisioning_status: 'active', table_kind: 'time_indexed', time_indexed: true, columns: [], labels: [], data_source: { uid: 'source' } };
    else if (path.endsWith('/time-index-table-updates/prices/')) result = { uid: 'prices', update_hash: 'RecordedPrices', output_table: { uid: table } };
    else result = { count: 0, results: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const canvas = page.locator('[aria-label="Historical run graph"]');
  const selectRun = uid => page.getByRole('button', { name: new RegExp(`, ${uid}$`) });
  await page.goto(`${origin}/time-index-meta-tables/${table}?tab=updates`);
  await canvas.waitFor();
  assert.match(page.url(), /tab=updates/);
  assert.match(page.url(), /run=new-run/);
  assert(requests.some(path => path.includes(`output_table_uid=${table}`)));
  assert.equal(await canvas.locator('.react-flow__node').count(), 4, 'root selection must retain upstream output tables');
  await canvas.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' });
  assert.equal(await canvas.locator('.react-flow__edge-path').count(), 3);
  for (const path of await canvas.locator('.react-flow__edge-path').evaluateAll(items => items.map(item => item.getAttribute('d')))) assert(path && !path.includes('NaN'));
  const left = await page.locator('.mt-runs__history').boundingBox(), right = await page.locator('.mt-runs__detail').boundingBox();
  assert(left.x + left.width < right.x, 'run list must be left of the graph on desktop');
  assert((await selectRun('new-run').boundingBox()).height <= 40, 'history entries must stay compact');
  assert.equal(await selectRun('new-run').locator('.mt-runs__source').innerText(), 'DailyReturns');
  assert.equal(await canvas.getByRole('link', { name: 'Open table daily_close' }).getAttribute('href'), `/time-index-meta-tables/${table}`);
  assert.equal(await canvas.locator('[data-id="update:prices"]').getByRole('link', { name: 'Open updater RecordedPrices' }).getAttribute('href'), '/data-updates/prices');
  const inspector = canvas.getByRole('region', { name: 'Selected node details' });
  const logs = page.getByRole('region', { name: 'Run logs', exact: true });
  await inspector.waitFor();
  await logs.getByText('Captured log from new-run', { exact: true }).waitFor();
  assert.equal(await inspector.getByRole('heading', { name: 'Run logs' }).count(), 0, 'logs are not squeezed inside the node inspector');
  assert((await logs.boundingBox()).width >= (await canvas.boundingBox()).width, 'logs use the full graph column width');
  const bounds = await canvas.boundingBox(), panel = await canvas.locator(".mt-pipeline__inspector-scroll").boundingBox();
  assert(panel.x >= bounds.x && panel.x < bounds.x + 25, 'node details stay in the lower-left corner');
  assert(panel.y > bounds.y + 30 && panel.y + panel.height <= bounds.y + bounds.height && bounds.y + bounds.height - panel.y - panel.height < 20, 'node details stay inside the graph');
  const selectedURL = page.url();
  await page.getByRole('button', { name: 'Hide history', exact: true }).click();
  assert.equal(await page.locator('.mt-runs__history').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Show history', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.equal(page.url(), selectedURL);
  assert((await canvas.boundingBox()).width > bounds.width + 200, 'collapsing history expands the graph');
  await logs.getByText('Captured log from new-run', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show history', exact: true }).click();
  assert.equal(await selectRun('new-run').getAttribute('aria-current'), 'true');
  await canvas.locator('[data-id="update:prices"]').click();
  await page.waitForURL(/node=update%3Aprices/);
  await logs.getByText('RecordedPrices · Exact attempt new-run-prices.', { exact: false }).waitFor();
  await logs.getByText('Captured log from new-run-prices', { exact: true }).waitFor();
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/new-run-prices/logs/') && response.url().includes('level=error')),
    logs.getByRole('button', { name: 'error', exact: true }).click(),
  ]);
  await inspector.getByRole('button', { name: 'Close node details', exact: true }).click();
  await logs.getByText('DailyReturns · Exact attempt new-run.', { exact: false }).waitFor();
  await logs.getByText('Captured log from new-run', { exact: true }).waitFor();
  await canvas.locator(`[data-id="table:${table}"]`).click();
  await logs.getByText('Captured log from new-run', { exact: true }).waitFor();
  assert.equal(await canvas.locator('.react-flow__node').count(), 4);
  await selectRun('old-run').click();
  await page.locator('.mt-runs__identity').filter({ hasText: 'old-run' }).waitFor();
  assert.equal(await canvas.locator('[data-id="update:returns"] .mt-pnode__status').getAttribute('data-status'), 'blocked');
  await logs.getByText('Exact attempt old-run.', { exact: false }).waitFor();
  await logs.getByText('Captured log from old-run', { exact: true }).waitFor();
  assert.equal(await logs.getByText('Captured log from new-run', { exact: true }).count(), 0);
  assert(requests.some(path => path.includes('/old-run/logs/')));
  await page.getByRole('button', { name: 'Refresh runs', exact: true }).click();
  await canvas.waitFor();
  assert.match(page.url(), /run=old-run/);
  // A later response from the previous selection must not replace the current graph.
  await selectRun('new-run').click();
  await selectRun('old-run').click();
  await selectRun('new-run').click();
  await page.locator('.mt-runs__identity').filter({ hasText: 'new-run' }).waitFor();
  await page.waitForTimeout(200);
  assert.equal(await canvas.locator('[data-id="update:returns"] .mt-pnode__status').getAttribute('data-status'), 'succeeded');
  await page.getByRole('group', { name: 'Run history pages' }).getByRole('button', { name: 'Next' }).click();
  await selectRun('legacy-run').click();
  await page.getByText('Historical graph unavailable', { exact: true }).waitFor();
  await page.getByText('Captured log from legacy-run', { exact: true }).waitFor();
  assert.equal(await canvas.count(), 0);
  assert(requests.some(path => path.includes('offset=25')));
  await page.goto(`${origin}/runs/old-run`);
  await canvas.waitFor();
  assert.equal(await canvas.locator('.react-flow__node').count(), 4);
  assert.equal(await page.getByRole('link', { name: 'Open root updater' }).getAttribute('href'), '/data-updates/returns');
  await page.getByRole('link', { name: 'Open updater RecordedPrices', exact: true }).last().click();
  await page.waitForURL(/\/data-updates\/prices$/);
  await page.goto(`${origin}/data-updates/prices?tab=historical-updates`);
  await canvas.waitFor();
  assert(requests.some(path => path.includes('table_update_uid=prices')));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow on mobile');
  const mobileCanvas = await canvas.boundingBox(), mobilePanel = await canvas.locator(".mt-pipeline__inspector-scroll").boundingBox();
  assert(mobilePanel.x >= mobileCanvas.x && mobilePanel.x + mobilePanel.width <= mobileCanvas.x + mobileCanvas.width, 'inspector fits the mobile graph');
  await inspector.getByRole('button', { name: 'Close node details', exact: true }).click();
  assert.equal(await inspector.count(), 0);
  await logs.getByText('Captured log from new-run', { exact: true }).waitFor();
  assert.equal(await canvas.locator('.react-flow__node').count(), 4, 'closing details leaves the complete graph visible');
  assert.deepEqual(errors, []);
  console.log('Run explorer: history, complete graphs, links, pagination, refresh, races, collapsible history, in-canvas details, always-visible exact-attempt logs and mobile layout passed.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
