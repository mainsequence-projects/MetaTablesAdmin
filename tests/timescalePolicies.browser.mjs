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
const table = '0b6c2f5e-4c1a-4c55-9d43-2a1f2a1c7e10';
const source = 'a3d1f0b2-8f6e-4f0c-bb0e-6c1b9a1f3d22';
const job = (job_id, kind, status, fields = {}) => ({ job_id, kind, proc_name: `policy_${kind}`, table_uid: table, table_identifier: 'Daily close',
  hypertable_schema: 'public', hypertable_name: 'daily_close', scheduled: status !== 'Paused', status, schedule_interval: '12:00:00',
  last_run_status: status === 'Failed' ? 'Failed' : 'Success', last_run_started_at: '2026-10-02T09:00:00Z', last_successful_finish: '2026-10-01T09:00:00Z',
  next_start: '2026-10-02T21:00:00Z', total_runs: 10, total_failures: status === 'Failed' ? 2 : 0, last_error: status === 'Failed' ? 'permission denied for table daily_close' : null, ...fields });
const policies = (overrides = {}) => ({ table_uid: table, can_edit: true, eligibility: { eligible: true, reason: null, timescale_version: '2.17.2' },
  compression: { after: '7 days', schedule_interval: '12:00:00', initial_start: null, timezone: null, job_id: 1000 },
  retention: { after: '30 days', schedule_interval: null, initial_start: null, timezone: null, job_id: 1001 },
  compression_settings: { segmentby: ['ticker'], orderby: 'time DESC' },
  compression_stats: { total_chunks: 12, compressed_chunks: 9, before_bytes: 12 * 1024 ** 3, after_bytes: 1.5 * 1024 ** 3 },
  jobs: [job(1000, 'compression', 'Scheduled'), job(1001, 'retention', 'Failed')], ...overrides });
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  page.setDefaultTimeout(10000);
  const errors = [], puts = [];
  let document = policies();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let result;
    if (path.endsWith('/runtime-context/')) result = { is_admin: false, user_uid: 'user', local_mode: true, local_mode_available: true,
      data_source: { uid: 'local', display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
      bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
    else if (path.endsWith(`/meta-tables/${table}/timescale-policies/`)) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        puts.push(body);
        document = { ...document, compression: { ...body.compression, job_id: 1000 }, retention: { ...body.retention, job_id: 1001 } };
      }
      result = document;
    } else if (path.endsWith(`/meta-tables/${table}/`) || path.endsWith(`/time-index-meta-tables/${table}/`)) result = { uid: table, physical_table_name: 'daily_close',
      identifier: 'Daily close', management_mode: 'platform_managed', provisioning_status: 'active', table_kind: 'time_indexed', time_indexed: true,
      capabilities: { timescale_policies: true }, columns: [], labels: [], data_source: { uid: source } };
    else if (path.endsWith(`/data-sources/${source}/timescale-jobs/`)) result = { data_source_uid: source, timescale_version: '2.17.2', policy_count: 2, failed_count: 1,
      jobs: [job(1000, 'compression', 'Scheduled'), job(1001, 'retention', 'Failed'), { ...job(3, 'other', 'Scheduled'), proc_name: 'policy_refresh', table_uid: null, table_identifier: null, hypertable_name: 'unmanaged' }] };
    else if (path.endsWith(`/data-sources/${source}/summary/`)) result = { entity: { id: source, type: 'DataSource', title: 'Timescale' }, badges: [], inline_fields: [], highlight_fields: [], stats: [] };
    else if (path.endsWith(`/data-sources/${source}/`)) result = { uid: source, display_name: 'Timescale', class_type: 'timescale_db', status: 'AVAILABLE',
      storage_access_mode: 'read_write', is_default: false, can_manage: false, configuration: null };
    else result = { count: 0, results: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });

  // Writer: edit, validate, confirm retention, save.
  await page.goto(`${origin}/tables/${table}?tab=policies`);
  const save = page.getByRole('button', { name: 'Save policies', exact: true });
  await save.waitFor();
  assert.equal(await page.getByLabel('Compress after').inputValue(), '7');
  assert.equal(await page.getByLabel('Drop after').inputValue(), '30');
  await page.getByText('12 GB → 1.5 GB', { exact: true }).waitFor();
  await page.getByText('9 of 12 chunks compressed', { exact: true }).waitFor();
  await page.getByText('permission denied for table daily_close', { exact: true }).waitFor();
  assert.equal(await save.isDisabled(), true, 'nothing changed yet');
  await page.getByLabel('Drop after').fill('3');
  await page.getByText(/Retention must be longer than compression/).waitFor();
  assert.equal(await save.isDisabled(), true, 'an invalid order blocks saving');
  await page.getByLabel('Drop after').fill('60');
  await save.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/Chunks older than .* will be permanently dropped now and on every run/).waitFor();
  await dialog.getByRole('button', { name: 'Save and drop chunks' }).click();
  await page.getByText('Policies saved.', { exact: true }).waitFor();
  assert.equal(await dialog.count(), 0);
  assert.deepEqual(puts.at(-1), { compression: { after: '7 days', schedule_interval: '12:00:00', initial_start: null, timezone: null },
    retention: { after: '60 days', schedule_interval: null, initial_start: null, timezone: null } });

  // Compression-only changes save without the retention confirmation; turning a policy off sends after: null.
  await page.getByRole('group', { name: 'Compression policy' }).getByRole('button', { name: 'Off', exact: true }).click();
  await save.click();
  await page.getByText('Policies saved.', { exact: true }).waitFor();
  assert.equal(await dialog.count(), 0);
  assert.deepEqual(puts.at(-1).compression, { after: null, schedule_interval: null, initial_start: null, timezone: null });
  assert.equal(puts.at(-1).retention.after, '60 days');

  // Reader: read-only, no save.
  document = policies({ can_edit: false });
  await page.reload();
  await page.getByText('Only Writers on a read-write DataSource can change policies.', { exact: true }).waitFor();
  assert.equal(await save.count(), 0);
  assert.equal(await page.getByLabel('Compress after').isDisabled(), true);

  // Ineligible table: the reason only.
  document = policies({ eligibility: { eligible: false, reason: 'timescale_version_unsupported', timescale_version: '2.9.0' } });
  await page.reload();
  await page.getByText(/require TimescaleDB 2\.11 or later; this DataSource runs 2\.9\.0/).waitFor();
  assert.equal(await page.getByLabel('Compress after').count(), 0);

  // DataSource Jobs: counts, table links, failed-only filter.
  await page.goto(`${origin}/data-sources/${source}?tab=timescale-jobs`);
  await page.getByText('Failed: 1', { exact: true }).waitFor();
  await page.getByText('TimescaleDB 2.17.2', { exact: true }).waitFor();
  const links = page.getByRole('link', { name: 'Daily close', exact: true });
  assert.equal(await links.count(), 2);
  assert.equal(await links.first().getAttribute('href'), `/time-index-meta-tables/${table}?tab=policies`);
  await page.getByText('public.unmanaged', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Failed only', exact: true }).click();
  await page.getByText('public.unmanaged', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(await links.count(), 1);
  assert.deepEqual(errors, []);
  console.log('Timescale policies: edit, order validation, retention confirmation, removal, read-only and ineligible states; DataSource Jobs table and failed filter passed.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
