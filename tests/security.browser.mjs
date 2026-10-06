import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertCommandCenterPageLayout } from '@dev-mainsequence/command-center-sdk/layout/testing';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
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
const otherUser = 'e2a4f38a-1b5f-40a3-974f-70bc8f065b3f';
const worker = '3c0b6f1e-7f43-4b8e-9a51-5d2c1e9a0b77';
const workload = { uid: worker, name: 'Job 8b1f (workload)', email: null, identity_type: 'workload' };
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
    let isAdmin = false, writer = true, manages = false, saves = 0;
    let assignments = { view: { users: [user], teams: [] }, edit: { users: [user], teams: [] } };
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let result;
      if (path.endsWith('/runtime-context/')) result = { is_admin: isAdmin, user_uid: user, local_mode: true, local_mode_available: true,
        data_source: { uid, display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
        bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
      else if (path.endsWith('/permissions')) {
        if (request.method() === 'PUT') { assert.equal(request.postDataJSON().revision, 'revision-1'); assignments = request.postDataJSON().assignments; saves++; }
        result = { revision: 'revision-1', assignments: writer ? assignments : { ...assignments, edit: { users: [], teams: [] } },
          candidate_users: [{ uid: user, name: 'Alice' }, { uid: otherUser, name: 'Bob' }, ...(manages ? [{ ...workload, managed_by_caller: true }] : [])],
          candidate_teams: [], can_edit: writer || isAdmin, effective_access: writer ? 'writer' : 'reader',
          inherited: [], contributions: [{ grant_uid: uid, source: 'direct', namespace_uid: null, principal_kind: 'user', principal_uid: user, access_level: writer ? 'writer' : 'reader' }] };
      } else if (path.endsWith('/security/principals/')) {
        assert.equal(new URL(request.url()).searchParams.get('search'), 'nightly');
        result = { users: [workload], teams: [] };
      } else if (path.endsWith('/effective-access/')) result = { effective_access: 'writer', remaining_access: 'writer', remaining_contributions: [] };
      else if (path.endsWith('/access-history/')) result = [];
      else if (path.endsWith('/security/resources/')) result = { tables: [{ uid, name: 'Prices' }], namespaces: [] };
      else if (path.includes(`/meta-tables/${uid}`)) result = { uid, physical_table_name: 'prices', identifier: 'Prices', management_mode: 'platform_managed', schema_management_mode: 'alembic_managed', provisioning_status: 'active', table_kind: 'relational', columns: [], labels: [], data_source: { uid }, creation_date: '2026-09-29T00:00:00Z' };
      else result = { count: 0, results: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto(`${url}/tables/${uid}?tab=permissions`);
    await page.getByRole('button', { name: 'Save access', exact: true }).waitFor();
    await page.evaluate(async dark => {
      const { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme } = await import('/node_modules/@dev-mainsequence/command-center-sdk/dist/theme/index.js');
      applyThemePresetToRoot(document.documentElement, { theme: dark ? mainSequenceTheme : quartzLightTheme });
    }, dark);
    await assertCommandCenterPageLayout(page, { rootSelector: "[data-security-access]", viewports: [{ width, height: width === 375 ? 812 : 800, pointer: width === 375 ? "coarse" : "fine" }] });
    assert.equal(await page.getByRole('button', { name: 'Save access', exact: true }).isEnabled(), false);
    assert.equal(await page.getByText('Grant to exclude (optional)', { exact: true }).count(), 0);
    // A workload is found by its Job name and joins the candidates.
    await page.getByLabel('Find people, Teams or workloads', { exact: true }).fill('nightly');
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await page.getByText('1 found. They are listed under Available.', { exact: true }).waitFor();
    await page.getByRole('listbox', { name: /^Available reader users/ }).getByRole('option', { name: 'Job 8b1f (workload)', exact: true }).waitFor();
    await page.getByRole('listbox', { name: /^Available writer users/ }).getByRole('option', { name: 'Bob', exact: true }).click();
    await page.getByRole('button', { name: 'Add selected writer users', exact: true }).click();
    await page.getByRole('listbox', { name: /^Selected reader users/ }).getByRole('option', { name: /Bob/ }).waitFor();
    await page.getByText('Unsaved changes', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save access', exact: true }).click();
    await page.getByText('Access saved.', { exact: false }).waitFor();
    assert.equal(saves, 1);
    await page.locator('summary').filter({ hasText: 'Access history' }).click();
    await page.getByRole('button', { name: 'Load access history', exact: true }).click();
    await page.getByText('No grant changes recorded.', { exact: true }).waitFor();
    await page.locator('summary').filter({ hasText: "Check a user's access" }).click();
    await page.locator('button[aria-label="Access preview user"]').click();
    await page.getByRole('option', { name: 'Alice', exact: true }).click();
    await page.getByRole('button', { name: 'Check access', exact: true }).click();
    await page.getByText('Effective access: Writer', { exact: true }).waitFor();
    writer = false;
    await page.reload();
    await page.getByText('Your table access: Reader', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save access', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Add selected reader users', exact: true }).getAttribute('aria-disabled'), 'true');
    // A Reader who manages a workload gives it Reader access, and nothing else moves.
    manages = true;
    await page.reload();
    await page.getByRole('button', { name: 'Save access', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add selected writer users', exact: true }).getAttribute('aria-disabled'), 'true');
    await page.getByRole('listbox', { name: /^Available reader users/ }).getByRole('option', { name: 'Job 8b1f (workload)', exact: true }).click();
    await page.getByRole('button', { name: 'Add selected reader users', exact: true }).click();
    await page.getByRole('listbox', { name: /^Selected reader users/ }).getByRole('option', { name: /Job 8b1f/ }).waitFor();
    await page.getByRole('button', { name: 'Save access', exact: true }).click();
    await page.getByText('Access saved.', { exact: false }).waitFor();
    assert.equal(saves, 2);
    assert(assignments.view.users.includes(worker) && !assignments.edit.users.includes(worker));
    manages = false;
    await page.goto(`${url}/settings`);
    await page.getByText('Admin access required', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/settings');
    await page.goto(`${url}/security`);
    await page.getByText('Admin access required', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/security');
    isAdmin = true;
    await page.reload();
    await page.getByText('Create namespace', { exact: true }).first().waitFor();
    await assertCommandCenterPageLayout(page, { viewports: [{ width, height: width === 375 ? 812 : 800, pointer: width === 375 ? "coarse" : "fine" }] });
    await context.close();
  }
  console.log('Security browser checks passed: Writer sharing, workload search, manager grants, Reader restrictions, admin routes; light/dark at 375/1280.');
} finally { await browser?.close(); vite.kill(); }
