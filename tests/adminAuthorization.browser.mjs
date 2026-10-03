import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertCommandCenterApplicationShell } from '@dev-mainsequence/command-center-sdk/navigation/testing';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { PATH: process.env.PATH, HOME: process.env.HOME, METATABLES_API_TARGET: 'http://127.0.0.1:9' }, stdio: 'ignore',
});
const uid = '76bb5bc7-06b4-49b0-a45f-f3787e716ad5';
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    assert(attempt < 100, 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
  for (const local of [false, true]) for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375, isMobile: width === 375 });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    let isAdmin = false, initialized = true, identityFailure = false;
    let releaseReadiness;
    let readiness = new Promise(resolve => { releaseReadiness = resolve; });
    const requests = [], errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    const source = { uid, display_name: 'Analytics', class_type: 'postgresql', status: 'AVAILABLE',
      storage_access_mode: 'read_write', is_default: false, can_manage: true,
      configuration: { host: 'db.example.test', port: 5432, database_name: 'analytics', database_user: 'reader', default_schema: 'public', ssl_mode: 'require' } };
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      requests.push({ method: request.method(), path });
      let result;
      if (path === '/api/runtime-context/') {
        await readiness;
        if (identityFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Current identity facts unavailable.' }) });
        result = { is_admin: isAdmin, user_uid: uid, local_mode: local, local_mode_available: true,
          api_endpoint: url, runtime_instance_id: 'worker-1',
          data_source: initialized ? source : null, data_source_error: initialized ? null : 'runtime_not_initialized',
          bootstrap: { active: initialized, status: initialized ? 'ready' : 'unconfigured', managed_by: local ? 'settings' : 'deployment', declaration: null,
            candidate: null, current_revisions: [], required_revisions: [] },
          dialect: local ? 'sqlite' : 'postgresql', paramstyle: 'named', default_schema: 'public' };
      } else if (path === '/api/security/resources/') result = { tables: [], namespaces: [] };
      else if (path === `/api/data-sources/${uid}/summary/`) result = {
        entity: { id: uid, title: 'Analytics' }, inline_fields: [], highlight_fields: [], badges: [], labels: [], stats: [],
      };
      else if (path === `/api/data-sources/${uid}/`) result = source;
      else if (path === '/api/data-sources/') result = { count: 1, results: [source] };
      else result = { count: 0, results: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    async function noAdminNavigation() {
      assert.equal(await page.locator('a[href^="/admin"]').count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Admin', exact: true }).count(), 0);
    }
    async function openMenu() {
      if (width === 375) await page.getByRole('button', { name: /^Open .*navigation$/ }).click();
    }
    async function closeMenu() {
      if (width === 375) await page.keyboard.press('Escape');
    }

    // Until runtime identity arrives, neither shell nor protected page is mounted.
    await page.goto(`${url}/admin/settings`);
    await page.getByText('Reading API runtime', { exact: true }).waitFor();
    await assertCommandCenterApplicationShell(page, { navigationDepth: 1, phase: 'startup' });
    await noAdminNavigation();
    releaseReadiness(); readiness = Promise.resolve();
    await page.getByText('Admin access required', { exact: true }).waitFor();
    await assertCommandCenterApplicationShell(page, { navigationDepth: 1, phase: 'ready' });
    await openMenu(); await noAdminNavigation(); await closeMenu();

    // All admin variants and old links stop before protected component requests.
    for (const path of ['/admin', '/admin/settings', '/admin/settings/', '/ADMIN/SETTINGS',
      '/admin/security', '/admin/security/', '/admin/data-sources', '/admin/data-sources/new',
      `/admin/data-sources/${uid}`, '/admin/unknown', '/settings/', '/Settings', '/security/', '/data-sources/new/']) {
      requests.length = 0;
      await page.goto(url + path);
      await page.getByText('Admin access required', { exact: true }).waitFor();
      await noAdminNavigation();
      assert(requests.every(request => request.path === '/api/runtime-context/'), `Protected component requested data at ${path}`);
    }
    for (const flag of [undefined, 'true', 1]) {
      isAdmin = flag;
      await page.reload();
      await page.getByText('Admin access required', { exact: true }).waitFor();
      await noAdminNavigation();
    }
    isAdmin = false;

    // Source management facts cannot override the authenticated user's role.
    await page.goto(`${url}/data-sources/${uid}`);
    await page.getByRole('heading', { name: 'Data Source details', exact: true }).waitFor();
    for (const name of ['Save changes', 'Validate connection', 'Disable', 'Remove registration', 'Manage source']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
    }
    await page.goto(`${url}/data-sources`);
    await page.getByText('Analytics', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /Register source|Manage sources/ }).count(), 0);

    // Browsing sources remains available before initialization.
    initialized = false;
    await page.goto(`${url}/data-sources`);
    await page.getByText('Analytics', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('Admin access required', { exact: true }).count(), 0);
    await noAdminNavigation();

    // Configuration errors must not send an ordinary user to Settings.
    await page.goto(`${url}/tables`);
    await page.getByText('Ask an application admin to configure or restore the runtime DataSource.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Open Settings', exact: true }).count(), 0);
    isAdmin = true;
    await page.goto(`${url}/settings?tab=runtime#database`);
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    assert.equal(page.url(), `${url}/admin/settings?tab=runtime#database`);
    await assertCommandCenterApplicationShell(page, { navigationDepth: 2, phase: 'ready' });
    await openMenu();
    for (const href of ['/admin/settings', '/admin/security']) {
      assert(await page.locator(`a[href="${href}"]`).count(), `Missing native admin destination ${href}`);
    }
    assert.equal(await page.locator('a[href="/settings"], a[href="/security"], a[href^="/admin/data-sources"]').count(), 0);
    await closeMenu();

    // Refreshing changed facts removes the menu and the already-mounted page.
    isAdmin = false;
    await page.getByRole('button', { name: 'Refresh runtime', exact: true }).click();
    await page.getByText('Admin access required', { exact: true }).waitFor();
    await assertCommandCenterApplicationShell(page, { navigationDepth: 1, phase: 'ready' });
    assert.equal(await page.getByRole('heading', { name: 'Settings', exact: true }).count(), 0);
    await openMenu(); await noAdminNavigation(); await closeMenu();

    // Failed identity does not leave the previous admin shell visible; retry restores it.
    isAdmin = true; identityFailure = true;
    await page.reload();
    await page.getByText('Could not initialize MetaTables', { exact: true }).waitFor();
    await assertCommandCenterApplicationShell(page, { navigationDepth: 2, phase: 'startup' });
    await noAdminNavigation();
    identityFailure = false; initialized = true;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await openMenu();
    await page.locator('a[href="/admin/security"]').click();
    await page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/security');
    await assertCommandCenterApplicationShell(page, { navigationDepth: 2, phase: 'ready' });
    if (width === 375) assert.equal(await page.locator('[data-cc-navigation-drawer]').count(), 0);

    // Removed Admin DataSource paths do not redirect or mount the catalog view.
    for (const path of ['/admin/data-sources', '/admin/data-sources/new', `/admin/data-sources/${uid}?tab=details#database`]) {
      requests.length = 0;
      await page.goto(url + path);
      await page.getByText('Page not found', { exact: true }).waitFor();
      assert.equal(page.url(), url + path);
      assert(requests.every(request => request.path === '/api/runtime-context/'));
    }

    if (!local) {
      await page.goto(`${url}/data-sources/${uid}`);
      await page.getByRole('heading', { name: 'Data Source editor', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/data-sources/${uid}`);
      assert(await page.getByRole('button', { name: 'Save changes', exact: true }).isVisible());
      await page.goto(`${url}/data-sources`);
      await page.getByRole('button', { name: 'Add DataSource', exact: true }).click();
      await page.getByRole('button', { name: 'Create DataSource', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/data-sources/new');
    }
    assert(requests.every(request => request.method === 'GET'), 'Route visits must not mutate the API');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Admin authorization passed: startup/retry, menu visibility, role revocation, URL guards/redirects, source management; local/hosted at 375/1280.');
} finally {
  await browser?.close();
  vite.kill();
}
