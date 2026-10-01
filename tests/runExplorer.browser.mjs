import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { verifyCommandCenterPageLayout } from '@dev-mainsequence/command-center-sdk/layout/testing';
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
const at = (day, seconds) => new Date(Date.parse(`${day}T09:00:00Z`) + seconds * 1000).toISOString();
// old-run: RecordedPrices (child-run) succeeded, FxRates failed, so the DailyReturns root was blocked.
const records = {
  'new-run': { root: 'new-run', update: 'returns', label: 'DailyReturns', day: '2026-09-30', start: 0, end: 3, failed: false },
  'old-run': { root: 'old-run', update: 'returns', label: 'DailyReturns', day: '2026-09-29', start: 0, end: 3, failed: true },
  'child-run': { root: 'old-run', update: 'prices', label: 'RecordedPrices', day: '2026-09-29', start: 0.5, end: 1.152, failed: false },
  'legacy-run': { root: null, update: 'returns', label: 'DailyReturns', day: '2026-09-28', start: 0, end: 3, failed: false },
  'graph-error-run': { root: 'graph-error-run', update: 'returns', label: 'DailyReturns', day: '2026-09-27', start: 0, end: 3, failed: false },
};
const run = uid => {
  const record = records[uid];
  return { uid, root_run_uid: record.root, table_update_uid: record.update, updater_label: record.label,
    update_time_start: at(record.day, record.start), update_time_end: at(record.day, record.end),
    error_on_update: record.failed, outcome: record.failed ? 'failed' : 'succeeded', graph_availability: record.root ? 'available' : 'unavailable' };
};
const graph = uid => {
  const root = records[uid].root;
  if (!root) return { availability: 'unavailable', run_uid: uid, root_run_uid: null, nodes: [], edges: [], root_id: '', partial: false };
  const { day } = records[root], failed = root === 'old-run';
  const update = (id, label, output, fields) => ({ id: `update:${id}`, uid: id, kind: 'update', label, namespace: 'tutorial', output_table_uid: output, status: fields.state, ...fields });
  return { availability: 'available', run_uid: uid, root_run_uid: root, root_update_uid: 'returns', root_id: 'update:returns',
    selected_node_id: `update:${records[uid].update}`, started_at: at(day, 0), ended_at: at(day, 3), duration_seconds: 3,
    outcome: failed ? 'failed' : 'succeeded', partial: false,
    nodes: [
      { id: `table:${table}`, uid: table, kind: 'time_index_table', label: 'daily_close' },
      { id: 'table:fx', uid: 'fx', kind: 'time_index_table', label: 'fx_rates' },
      { id: 'table:output', uid: 'output', kind: 'time_index_table', label: 'daily_return' },
      update('prices', 'RecordedPrices', table, { state: 'succeeded', run_uid: failed ? 'child-run' : `${root}-prices`,
        attempt_started_at: at(day, 0.5), attempt_ended_at: at(day, 1.152), started_at: at(day, 0.8), ended_at: at(day, 1.152) }),
      update('fx', 'FxRates', 'fx', { state: failed ? 'failed' : 'succeeded', reason: failed ? 'calculation_failed' : null, run_uid: `${root}-fx`,
        attempt_started_at: at(day, 1.2), attempt_ended_at: at(day, 1.9), started_at: at(day, 1.3), ended_at: at(day, 1.9) }),
      update('returns', 'DailyReturns', 'output', failed
        ? { state: 'blocked', reason: 'dependency_failed', run_uid: root, attempt_started_at: at(day, 0), attempt_ended_at: at(day, 3), started_at: null, ended_at: at(day, 3) }
        : { state: 'succeeded', run_uid: root, attempt_started_at: at(day, 0), attempt_ended_at: at(day, 3), started_at: at(day, 2.4), ended_at: at(day, 3) }),
    ], edges: [
      { source: 'update:prices', target: `table:${table}`, kind: 'writes' },
      { source: 'update:fx', target: 'table:fx', kind: 'writes' },
      { source: 'update:prices', target: 'update:returns', kind: 'depends_on' },
      { source: 'update:fx', target: 'update:returns', kind: 'depends_on' },
      { source: 'update:returns', target: 'table:output', kind: 'writes' },
    ] };
};
const logs = (uid, params) => {
  const saved = graph(uid), day = records[records[uid].root ?? uid].day;
  const attempts = saved.availability === 'available' ? saved.nodes.filter(node => node.run_uid).map(node => [node.run_uid, node]) : [[uid, { state: 'succeeded' }]];
  const rows = attempts.map(([runUid, node], index) => ({ uid: `log-${runUid}`, run_uid: runUid, timestamp: at(day, 0.1 + index * 0.6),
    level: node.state === 'failed' ? 'error' : 'info', event: 'example', message: `Captured log from ${runUid}`, source: 'test',
    context: node.state === 'failed' ? { exception: `RuntimeError: ${runUid} failed` } : {} }))
    .filter(row => (!params.get('run_uid') || row.run_uid === params.get('run_uid')) && (!params.get('level') || row.level === params.get('level')))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { rows, availability: 'available', next_cursor: null, truncated: false, run_statuses: {}, start_time: at(day, -3600), end_time: at(day, 3600) };
};
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, timezoneId: 'UTC' });
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
    } else if (/\/table-update-runs\/.+\/invocation-logs\/$/.test(path)) result = logs(path.split('/').at(-3), url.searchParams);
    else if (/\/table-update-runs\/[^/]+\/$/.test(path)) result = run(path.split('/').at(-2));
    else if (path.endsWith('/table-update-runs/')) result = { count: 26, results: url.searchParams.get('offset') === '25' ? [run('legacy-run')]
      : url.searchParams.get('table_update_uid') === 'prices' ? [run('child-run')] : [run('new-run'), run('old-run'), run('child-run')] };
    else if ((path.endsWith(`/meta-tables/${table}/`) || path.endsWith(`/time-index-meta-tables/${table}/`))) result = { uid: table, physical_table_name: 'daily_close', identifier: 'Daily close', management_mode: 'platform_managed',
      schema_management_mode: 'alembic_managed', provisioning_status: 'active', table_kind: 'time_indexed', time_indexed: true, columns: [], labels: [], data_source: { uid: 'source' } };
    else if (path.endsWith('/time-index-table-updates/prices/')) result = { uid: 'prices', update_hash: 'RecordedPrices', output_table: { uid: table } };
    else result = { count: 0, results: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const timeline = page.locator('.mt-timeline');
  const rows = timeline.locator('.mt-timeline__row');
  const row = label => rows.filter({ has: page.locator('.mt-timeline__label', { hasText: new RegExp(`^${label}$`) }) });
  const summary = page.locator('[aria-label="Selected run summary"]');
  const logList = page.getByRole('list', { name: 'Log events' });
  const selectRun = uid => page.getByRole('button', { name: new RegExp(`, ${uid}$`) });
  const scope = name => page.getByRole('group', { name: 'Log scope' }).getByRole('button', { name, exact: true });

  // Table history: the selected root reads as dependencies first on one clock.
  await page.goto(`${origin}/time-index-meta-tables/${table}?tab=updates`);
  await timeline.waitFor();
  assert.match(page.url(), /tab=updates/);
  assert.match(page.url(), /run=new-run/);
  assert(requests.some(path => path.includes(`output_table_uid=${table}`)));
  assert.deepEqual(await rows.locator('.mt-timeline__label').allInnerTexts(), ['RecordedPrices', 'FxRates', 'DailyReturns']);
  assert.equal(await row('DailyReturns').getAttribute('data-current'), 'true');
  assert.equal(await row('RecordedPrices').locator('.mt-timeline__meta').innerText(), '→ daily_close');
  assert.equal(await row('DailyReturns').locator('.mt-timeline__calculation').count(), 1);
  assert.equal(await row('DailyReturns').locator('.mt-timeline__wait').count(), 1, 'the root waits for its last dependency');
  assert.equal(await row('DailyReturns').locator('.mt-timeline__duration').innerText(), '3.00s');
  assert.deepEqual(await timeline.locator('.mt-timeline__axis span[style]').allInnerTexts(), ['0s', '1s', '2s', '3s']);
  assert.equal(await page.getByRole('link', { name: /^RecordedPrices,/ }).getAttribute('href'), `/time-index-meta-tables/${table}?tab=updates&run=new-run-prices`);
  const left = await page.locator('.mt-runs__history').boundingBox(), right = await page.locator('.mt-runs__detail').boundingBox();
  assert(left.x + left.width < right.x, 'run list must be left of the run on desktop');
  assert((await selectRun('new-run').boundingBox()).height <= 40, 'history entries must stay compact');
  assert.equal(await selectRun('new-run').locator('.mt-runs__source').innerText(), 'DailyReturns');
  assert.equal(await page.locator('.mt-runs__list > li[data-child]').count(), 1, 'child-run is indented under old-run');
  assert.equal(await page.locator('.mt-runs__list > li').nth(2).locator('.mt-runs__source').innerText(), 'RecordedPrices');
  await summary.getByRole('heading', { name: 'DailyReturns', exact: true }).waitFor();
  assert.match(await summary.innerText(), /Root attempt/i);

  // One invocation-wide stream marks each attempt, and narrows to the selected record.
  await logList.getByText('Captured log from new-run-prices', { exact: true }).waitFor();
  await logList.getByText('Captured log from new-run', { exact: true }).waitFor();
  assert.equal(await row('RecordedPrices').locator('.mt-timeline__event').count(), 1, 'log events sit on their attempt row');
  await logList.locator('details', { hasText: 'Captured log from new-run-prices' }).hover();
  assert.equal(await row('RecordedPrices').locator('.mt-timeline__event').getAttribute('data-hot'), 'true');
  await Promise.all([page.waitForResponse(response => response.url().includes('/new-run/invocation-logs/') && response.url().includes('run_uid=new-run')),
    scope('This attempt').click()]);
  await logList.getByText('Captured log from new-run', { exact: true }).waitFor();
  assert.equal(await logList.getByText('Captured log from new-run-prices', { exact: true }).count(), 0);
  await page.locator('button[aria-label="Log level"]').click();
  await Promise.all([page.waitForResponse(response => response.url().includes('/invocation-logs/') && response.url().includes('level=error')),
    page.getByRole('option', { name: 'Error', exact: true }).click()]);
  await page.getByText('No matching log events', { exact: true }).waitFor();
  const selectedURL = page.url();
  const detailWidth = right.width;
  await page.getByRole('button', { name: 'Hide history', exact: true }).click();
  assert.equal(await page.locator('.mt-runs__history').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Show history', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.equal(page.url(), selectedURL);
  assert((await page.locator('.mt-runs__detail').boundingBox()).width > detailWidth + 200, 'collapsing history widens the run');
  await page.getByRole('button', { name: 'Show history', exact: true }).click();
  assert.equal(await selectRun('new-run').getAttribute('aria-current'), 'true');

  // A failed dependency blocks the root: the failure, its error tick and the block stay distinct.
  const identity = uid => summary.locator('.mt-run-header__uid', { hasText: new RegExp(`Run ${uid}$`) });
  await selectRun('old-run').click();
  await identity('old-run').waitFor();
  await page.locator('.mt-timeline__row[data-state="blocked"]').waitFor();
  assert.equal(await row('FxRates').getAttribute('data-state'), 'failed');
  assert.equal(await row('DailyReturns').getAttribute('data-state'), 'blocked');
  assert.equal(await row('DailyReturns').locator('.mt-timeline__resolved').count(), 1);
  assert.equal(await row('DailyReturns').locator('.mt-timeline__calculation').count(), 0);
  assert.match(await row('DailyReturns').locator('.mt-timeline__meta').innerText(), /dependency failed/);
  assert.match(await summary.innerText(), /Failed/);
  await logList.getByText('Captured log from old-run-fx', { exact: true }).waitFor();
  assert.equal(await row('FxRates').locator('.mt-timeline__event').getAttribute('data-level'), 'error');
  await logList.locator('summary', { hasText: 'Captured log from old-run-fx' }).click();
  await logList.getByText('RuntimeError: old-run-fx failed', { exact: true }).waitFor();
  assert(requests.some(path => path.includes('/old-run/invocation-logs/')));
  await page.getByRole('button', { name: 'Refresh runs', exact: true }).click();
  await timeline.waitFor();
  assert.match(page.url(), /run=old-run/);
  // A later response from the previous selection must not replace the current run.
  await selectRun('new-run').click();
  await selectRun('old-run').click();
  await selectRun('new-run').click();
  await identity('new-run').waitFor();
  await row('FxRates').waitFor();
  await page.waitForTimeout(200);
  assert.equal(await row('DailyReturns').getAttribute('data-state'), 'succeeded');
  await page.getByRole('group', { name: 'Run history pages' }).getByRole('button', { name: 'Next' }).click();
  await selectRun('legacy-run').click();
  await page.getByText('Historical graph unavailable', { exact: true }).waitFor();
  await summary.getByRole('heading', { name: 'DailyReturns', exact: true }).waitFor();
  assert.match(await summary.innerText(), /3\.00s/);
  await page.getByText('Captured log from legacy-run', { exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Log scope' }).count(), 0, 'a run without an invocation has one stream');
  assert.equal(await timeline.count(), 0);
  assert(requests.some(path => path.includes('offset=25')));

  // The global Runs page and an updater's history keep the selected record's identity.
  await page.goto(`${origin}/runs/old-run`);
  await timeline.waitFor();
  assert.equal(await rows.count(), 3);
  assert.equal(await summary.getByRole('button', { name: 'Open updater', exact: true }).getAttribute('title'), '/data-updates/returns');
  assert.equal(await summary.getByText('Parent execution', { exact: true }).count(), 0, 'a root run has no self-parent link');
  assert.equal(await page.getByRole('link', { name: /^RecordedPrices,/ }).getAttribute('href'), '/runs/child-run');
  // Filters head the history rail they narrow, and every choice is kept in the URL.
  const filterBar = page.getByRole('group', { name: 'Run filters' });
  const historyBox = await page.locator('.mt-runs__history').boundingBox(), filterBox = await filterBar.boundingBox();
  assert(filterBox.x >= historyBox.x && filterBox.x + filterBox.width <= historyBox.x + historyBox.width + 1 && filterBox.y < (await page.locator('.mt-runs__list').boundingBox()).y,
    'filters sit inside the history rail, above its list');
  assert.equal(await page.getByRole('heading', { name: 'Run history', exact: true }).count(), 0, 'one page heading, not a second history heading');
  const filterResponse = predicate => page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/table-update-runs/') && predicate(url.searchParams);
  });
  await Promise.all([filterResponse(params => params.get('outcome') === 'failed'),
    filterBar.getByRole('group', { name: 'Outcome' }).getByRole('button', { name: 'Failed', exact: true }).click()]);
  assert.equal(await filterBar.getByRole('button', { name: 'Failed', exact: true }).getAttribute('aria-pressed'), 'true');
  await Promise.all([filterResponse(params => params.get('root_only') === 'true'), filterBar.getByRole('button', { name: 'Root invocations only' }).click()]);
  await filterBar.locator('button[aria-label="Started"]').click();
  await Promise.all([filterResponse(params => params.has('start_time') && !params.has('end_time')),
    page.getByRole('option', { name: 'Last 24 hours', exact: true }).click()]);
  assert.match(page.url(), /outcome=failed/);
  assert.match(page.url(), /root_only=true/);
  assert.match(page.url(), /since=24h/);
  assert.equal(await filterBar.getByLabel('From (local time)').count(), 0, 'a relative range needs no date fields');
  await filterBar.locator('button[aria-label="Started"]').click();
  await page.getByRole('option', { name: 'Custom range', exact: true }).click();
  await filterBar.getByLabel('From (local time)').waitFor();
  await Promise.all([filterResponse(params => !params.has('outcome') && !params.has('root_only') && !params.has('start_time')),
    filterBar.getByRole('button', { name: 'Clear 3 filters', exact: true }).click()]);
  assert.doesNotMatch(page.url(), /outcome=|root_only=|since=/);
  assert.match(page.url(), /\/runs\/old-run$/, 'clearing filters keeps the selected run');
  await page.goto(`${origin}/data-updates/prices?tab=historical-updates`);
  await timeline.waitFor();
  assert(requests.some(path => path.includes('table_update_uid=prices')));
  const assertChildSummary = async (scoped = true) => {
    await summary.getByRole('heading', { name: 'RecordedPrices', exact: true }).waitFor();
    const text = await summary.innerText();
    assert.match(text, /Dependency attempt · DailyReturns invocation/i);
    assert.match(text, /Succeeded/);
    assert.doesNotMatch(text, /Failed|3\.00s/);
    assert.match(text, /0\.65s/);
    assert.match(text, /Started Sep 29, 2026, 9:00:00\.500 AM/);
    assert.match(text, /Run child-run/);
    assert.equal(await summary.getByRole('button', { name: 'Open updater', exact: true }).getAttribute('title'), '/data-updates/prices');
    if (scoped) assert.equal(await summary.getByRole('button', { name: 'Run permalink' }).getAttribute('title'), '/runs/child-run');
    else assert.equal(await summary.getByRole('button', { name: 'Run permalink' }).count(), 0, 'the Runs URL is already the permalink');
    assert.equal(await summary.getByRole('button', { name: 'All runs of this updater' }).getAttribute('title'), '/runs?updater=prices');
    assert.equal(await summary.getByRole('button', { name: 'Output: daily_close' }).getAttribute('title'), `/time-index-meta-tables/${table}`);
    assert.equal(await summary.getByRole('button', { name: 'Parent execution', exact: true }).getAttribute('title'), '/runs/old-run');
  };
  await assertChildSummary();
  assert.equal(await row('RecordedPrices').getAttribute('data-current'), 'true');
  assert.equal(await page.getByRole('link', { name: /^DailyReturns,/ }).getAttribute('href'), '/runs/old-run', 'another updater opens in Runs');
  // The lineage graph is on demand and labels the selected record, not the invocation root.
  await page.getByRole('button', { name: 'Lineage graph', exact: true }).click();
  const canvas = page.locator('[aria-label="Historical run graph"]');
  await canvas.waitFor();
  assert.equal(await canvas.locator('.react-flow__node').count(), 6);
  assert.match(await canvas.locator('[data-id="update:prices"]').innerText(), /This update/);
  assert.doesNotMatch(await canvas.locator('[data-id="update:returns"]').innerText(), /This update/);
  await assertChildSummary();
  await summary.getByRole('button', { name: 'Parent execution', exact: true }).click();
  await page.waitForURL(/\/runs\/old-run$/);
  await summary.getByRole('heading', { name: 'DailyReturns', exact: true }).waitFor();
  assert.match(await summary.innerText(), /Failed/);
  await page.goto(`${origin}/runs/child-run`);
  await timeline.waitFor();
  await assertChildSummary(false);
  const layout = await verifyCommandCenterPageLayout(page);
  assert(layout.reports.filter(view => view.viewport.pointer === 'fine').every(view => view.ok), 'desktop SDK layout must conform');
  const summaryLayout = await verifyCommandCenterPageLayout(page, { rootSelector: '[aria-label="Selected run summary"]' });
  assert.deepEqual(summaryLayout.violations.filter(item => item.code !== 'horizontal-overflow' || item.element), [], 'the summary must have no overflow, clipped or undersized controls');
  const existingMobileIssues = layout.violations.map(({ code, element, viewport }) => ({ code, element, width: viewport.width }));
  if (existingMobileIssues.length) console.log('Broader explorer mobile layout findings:', JSON.stringify(existingMobileIssues));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow on mobile');
  const mobileRow = await row('RecordedPrices').boundingBox(), mobileTrack = await row('RecordedPrices').locator('.mt-timeline__track').boundingBox();
  assert(mobileTrack.y > mobileRow.y + 10 && mobileTrack.x + mobileTrack.width <= mobileRow.x + mobileRow.width, 'the mobile track sits below its name');
  await page.setViewportSize({ width: 1600, height: 1000 });

  // A graph failure must not hide the selected record or its logs.
  await page.route('**/table-update-runs/graph-error-run/graph/', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ detail: 'Execution context is temporarily unavailable.' }) }));
  await page.goto(`${origin}/runs/graph-error-run`);
  await summary.getByRole('heading', { name: 'DailyReturns', exact: true }).waitFor();
  assert.match(await summary.innerText(), /3\.00s/);
  await page.getByText('Execution context is temporarily unavailable.', { exact: true }).waitFor();
  await page.getByText('Captured log from graph-error-run', { exact: true }).waitFor();
  assert.equal(await timeline.count(), 0, 'graph failure must not invent a timeline');
  assert.deepEqual(errors, []);
  console.log('Run explorer: invocation timeline order, states, waits and events; invocation and attempt logs; hover linking; failure and blocked states; history grouping, races and scopes; on-demand lineage; layout and mobile passed.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
