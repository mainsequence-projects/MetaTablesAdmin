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
const ns = '0d4c1a7e-5b2f-4c33-8f0e-1a2b3c4d5e6f';
const managedNs = '9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const user = '889cb532-3d40-4261-9921-352336237069';
const otherUser = 'e2a4f38a-1b5f-40a3-974f-70bc8f065b3f';
const worker = '3c0b6f1e-7f43-4b8e-9a51-5d2c1e9a0b77';
const research = '5a6b7c8d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const workload = { uid: worker, name: 'Job 8b1f (workload)', email: null, identity_type: 'workload' };
const roleNames = ['metadata_viewer', 'data_viewer', 'data_writer', 'editor', 'owner'];
const tableActions = { 'tables.get': 0, 'tables.get_data': 1, 'tables.update_data': 2, 'tables.update': 3, 'tables.migrate': 3,
  'tables.operate_updaters': 3, 'tables.delete': 3, 'tables.get_access': 3, 'tables.set_access': 4 };
const namespaceActions = { 'namespaces.get': 0, 'namespaces.update': 3, 'tables.create': 3, 'namespaces.get_access': 3, 'namespaces.set_access': 4 };
const allowed = (actions, role) => role ? Object.keys(actions).filter(action => actions[action] <= roleNames.indexOf(role)) : [];
const roles = (actions, noun) => roleNames.map(role => ({ role, actions: allowed(actions, role),
  principals: role === 'owner' ? ['user', 'team'] : ['user', 'workload', 'team'],
  summary: `${role} summary for this ${noun}.`, impact: `${role} impact on this ${noun}.`, not_included: `${role} excludes something.` }));
const catalog = {
  metatables: { actions: [], roles: [] },
  tables: { actions: Object.keys(tableActions).map(action => ({ action, level: 'read', covers: `covers ${action}` })), roles: roles(tableActions, 'table') },
  namespaces: { actions: Object.keys(namespaceActions).map(action => ({ action, level: 'read', covers: `covers ${action}` })), roles: roles(namespaceActions, 'namespace'), inheritance: '' },
};
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
    page.setDefaultTimeout(10000);
    let isAdmin = false, role = 'owner', manages = false, conflict = false, nameTaken = false;
    const changes = [], accessReads = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let bindings = [
      { uid: 'b1', source: 'direct', principal_kind: 'user', principal_uid: user, role: 'owner', granted_by_user_uid: user, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
      { uid: 'b2', source: 'direct', principal_kind: 'user', principal_uid: otherUser, role: 'data_viewer', granted_by_user_uid: user, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' },
    ];
    // A namespace the workload's registration created: the caller manages that workload and holds no role.
    const managerSource = { source: 'manager', role: null, actions: ['namespaces.get', 'namespaces.get_access', 'namespaces.set_access'], workload_user_uid: worker };
    let managedBindings = [{ uid: 'm1', source: 'direct', principal_kind: 'user', principal_uid: worker, role: 'editor', granted_by_user_uid: null,
      created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z' }];
    const managerMe = () => ({ role: null, allowed_actions: managerSource.actions, sources: [managerSource], revision: 'managed-1' });
    const managedDocument = () => ({ kind: 'namespace', uid: managedNs, revision: 'managed-1', can_manage: true, inherited: [], bindings: managedBindings,
      me: managerMe(), created_by_workload_uid: worker, candidate_teams: [{ uid: research, name: 'Research' }],
      candidate_users: [{ uid: user, name: 'Alice', email: 'alice@example.test', identity_type: 'person' }, { uid: otherUser, name: 'Bob', email: 'bob@example.test', identity_type: 'person' },
        { ...workload, managed_by_caller: true }] });
    const inherited = [{ uid: 'b3', source: 'namespace', namespace_uid: ns, principal_kind: 'team', principal_uid: research, role: 'editor',
      granted_by_user_uid: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }];
    const me = () => ({ role: isAdmin ? 'owner' : role, allowed_actions: allowed(tableActions, isAdmin ? 'owner' : role), revision: 'revision-1',
      sources: [...(role ? [{ grant_uid: 'b1', source: 'direct', namespace_uid: null, principal_kind: 'user', principal_uid: user, role }] : []),
        ...(isAdmin ? [{ source: 'admin', role: 'owner' }] : [])] });
    const document = () => ({ kind: 'table', uid, revision: 'revision-1', can_manage: isAdmin || role === 'owner', bindings, inherited, me: me(),
      candidate_users: [{ uid: user, name: 'Alice', email: 'alice@example.test', identity_type: 'person' }, { uid: otherUser, name: 'Bob', email: 'bob@example.test', identity_type: 'person' },
        ...(manages ? [{ ...workload, managed_by_caller: true }] : [])],
      candidate_teams: [{ uid: research, name: 'Research' }] });
    await page.route('**/api/**', async route => {
      const request = route.request(), address = new URL(request.url()), path = address.pathname;
      let result, status = 200;
      if (path.endsWith('/runtime-context/')) result = { is_admin: isAdmin, user_uid: user, local_mode: true, local_mode_available: true,
        data_source: { uid, display_name: 'Local', class_type: 'sqlite', status: 'AVAILABLE', storage_access_mode: 'read_write' }, data_source_error: null,
        bootstrap: { active: true }, dialect: 'sqlite', paramstyle: 'named', default_schema: 'public' };
      else if (path === '/api/access/roles/') result = catalog;
      else if (path.endsWith(`/meta-tables/${uid}/access/me/`)) result = me();
      else if (path.endsWith(`/meta-tables/${uid}/access/changes/`)) {
        const body = request.postDataJSON();
        assert.equal(body.revision, 'revision-1');
        changes.push(body);
        if (conflict) { status = 409; result = { detail: 'Access changed. Reload before saving.' }; }
        else {
          for (const revoked of body.revoke) bindings = bindings.filter(item => item.principal_uid !== revoked.principal_uid);
          for (const granted of body.grant) bindings = [...bindings.filter(item => item.principal_uid !== granted.principal_uid),
            { uid: `b-${granted.principal_uid}`, source: 'direct', ...granted, granted_by_user_uid: user, created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z' }];
          result = document();
        }
      } else if (path.endsWith(`/meta-tables/${uid}/access/explain/`)) {
        const subject = address.searchParams.get('user_uid');
        assert.equal(address.searchParams.get('action'), 'tables.get_data');
        result = subject === otherUser
          ? { user_uid: otherUser, action: 'tables.get_data', allowed: false, role: null, sources: [], unreadable_team_uids: [research], admin_status: 'not shown for other Users' }
          : { user_uid: user, action: 'tables.get_data', allowed: true, role: 'owner', sources: me().sources, unreadable_team_uids: [], admin_status: false };
      } else if (path.endsWith(`/meta-tables/${uid}/access/`)) { accessReads.push(role); result = document(); }
      else if (path.endsWith('/security/principals/')) {
        assert.equal(address.searchParams.get('search'), 'nightly');
        result = { users: [{ ...workload, managed_by_caller: manages }], teams: [] };
      } else if (path.endsWith(`/meta-tables/${uid}/access-history/`)) result = [];
      else if (path.endsWith('/security/access-history/')) {
        assert.deepEqual([address.searchParams.get('kind'), address.searchParams.get('uid')], ['table', uid]);
        result = [{ uid: 'h1', actor_user_uid: user, principal_kind: 'user', principal_uid: otherUser, previous_access: null, new_access: 'data_viewer', created_at: '2026-10-02T00:00:00Z', reason: 'grant' }];
      } else if (path.endsWith('/security/resources/')) result = { tables: [{ uid, name: 'Prices' }], namespaces: [] };
      else if (path.endsWith('/security/database-permissions/')) result = { status: 'ready', sql_enabled: true, synchronization_pending: false,
        data_source_uid: uid, data_source_name: 'Local', engine: 'sqlite', enforcement: 'sqlite_authorizer', active_tables: 1, covered_tables: 1,
        missing_policies: 0, tables: [{ uid, name: 'prices', schema: null, policy_present: true, writes_supported: true }] };
      else if (path === '/api/namespaces/' && request.method() === 'POST') {
        assert.deepEqual(request.postDataJSON(), { name: 'crm', description: 'Customer data' });
        if (nameTaken) { status = 409; result = { detail: { code: 'namespace_name_taken', namespace: 'crm', owners: [{ principal_kind: 'user', principal_uid: otherUser }] } }; }
        else result = { uid: ns, name: 'crm', description: 'Customer data', created_at: '2026-10-19T00:00:00Z', relational_table_count: 0, time_index_table_count: 0 };
      } else if (path.endsWith(`/namespaces/${managedNs}/access/me/`)) result = managerMe();
      else if (path.endsWith(`/namespaces/${managedNs}/access/changes/`)) {
        const body = request.postDataJSON();
        assert.equal(body.revision, 'managed-1');
        changes.push(body);
        for (const granted of body.grant) managedBindings = [...managedBindings.filter(item => item.principal_uid !== granted.principal_uid),
          { uid: `m-${granted.principal_uid}`, source: 'direct', ...granted, granted_by_user_uid: user, created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z' }];
        result = managedDocument();
      } else if (path.endsWith(`/namespaces/${managedNs}/access/explain/`)) {
        const other = address.searchParams.get('user_uid') === otherUser, hidden = 'not shown for other Users';
        result = { user_uid: other ? otherUser : user, action: address.searchParams.get('action'), allowed: !other, role: null, sources: other ? [] : [managerSource],
          unreadable_team_uids: [], admin_status: other ? hidden : false, manager_status: other ? hidden : true };
      } else if (path.endsWith(`/namespaces/${managedNs}/access/`)) result = managedDocument();
      else if (path.endsWith(`/namespaces/${managedNs}/`)) result = { uid: managedNs, name: 'nightly-prices', description: '', created_at: '2026-10-19T00:00:00Z', relational_table_count: 0, time_index_table_count: 0 };
      else if (path.endsWith(`/namespaces/${ns}/access/me/`)) result = { role: 'owner', allowed_actions: allowed(namespaceActions, 'owner'), revision: 'ns-1',
        sources: [{ uid: 'n1', grant_uid: 'n1', source: 'direct', principal_kind: 'user', principal_uid: user, role: 'owner' }] };
      else if (path.endsWith(`/namespaces/${ns}/access/`)) result = { kind: 'namespace', uid: ns, revision: 'ns-1', can_manage: true, inherited: [],
        bindings: [{ uid: 'n1', source: 'direct', principal_kind: 'user', principal_uid: user, role: 'owner', granted_by_user_uid: user, created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z' }],
        me: null, candidate_users: [{ uid: user, name: 'Alice' }], candidate_teams: [] };
      else if (path.endsWith(`/namespaces/${ns}/`)) result = { uid: ns, name: 'crm', description: 'Customer data', created_at: '2026-10-19T00:00:00Z', relational_table_count: 0, time_index_table_count: 0 };
      else if (path.includes(`/meta-tables/${uid}`)) result = { uid, physical_table_name: 'prices', identifier: 'Prices', management_mode: 'platform_managed',
        schema_management_mode: 'alembic_managed', provisioning_status: 'active', table_kind: 'relational', namespace: 'prices', namespace_uid: ns,
        role: isAdmin ? 'owner' : role, allowed_actions: allowed(tableActions, isAdmin ? 'owner' : role), columns: [], labels: [], data_source: { uid }, creation_date: '2026-09-29T00:00:00Z' };
      else result = { count: 0, results: [] };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
    });
    const pick = async (picker, option) => {
      await page.locator(`button[aria-label="${picker}"]`).click();
      await page.getByRole('listbox', { name: picker }).getByRole('option', { name: option }).click();
    };
    const dialog = page.getByRole('dialog');

    // An owner sees every binding with its role texts, its source and who granted it.
    await page.goto(`${url}/tables/${uid}?tab=permissions`);
    await page.getByRole('heading', { name: 'Who has access', exact: true }).waitFor();
    await page.evaluate(async dark => {
      const { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme } = await import('/node_modules/@dev-mainsequence/command-center-sdk/dist/theme/index.js');
      applyThemePresetToRoot(document.documentElement, { theme: dark ? mainSequenceTheme : quartzLightTheme });
    }, dark);
    await assertCommandCenterPageLayout(page, { rootSelector: "[data-security-access]", viewports: [{ width, height: width === 375 ? 812 : 800, pointer: width === 375 ? "coarse" : "fine" }] });
    await page.getByText('Your role: Owner', { exact: true }).waitFor();
    await page.getByText('data_viewer summary for this table.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'From the namespace', exact: true }).waitFor();
    await page.getByText('Research', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('link', { name: 'prices', exact: true }).getAttribute('href'), `/namespaces/${ns}?tab=permissions`);

    // A workload found by its Job name is granted a role after its texts are shown; owner is not for workloads.
    await page.getByLabel('Find people, Teams or workloads', { exact: true }).fill('nightly');
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await page.getByText('1 found. Choose one under User or Team.', { exact: true }).waitFor();
    await pick('Grant to', /^Job 8b1f \(workload\)/);
    await page.locator('button[aria-label="Role to grant"]').click();
    assert.equal(await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Owner/ }).isDisabled(), true);
    await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Data writer/ }).click();
    await page.getByText('data_writer impact on this table.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Review grant', exact: true }).click();
    await dialog.getByText('data_writer impact on this table.', { exact: true }).first().waitFor();
    await dialog.getByText('data_writer excludes something.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Grant role' }).click();
    await page.getByText('Job 8b1f (workload) now holds Data writer.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1), { revision: 'revision-1', grant: [{ principal_kind: 'user', principal_uid: worker, role: 'data_writer' }], revoke: [] });

    // Changing Bob's role says which role it replaces; revoking asks first.
    const row = text => page.locator('[data-cc-data-table-row]').filter({ hasText: text });
    const bob = row('Bob');
    await bob.getByRole('button', { name: 'Change role', exact: true }).click();
    await page.locator('button[aria-label="Role to grant"]').click();
    await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Editor/ }).click();
    await page.getByRole('button', { name: 'Review grant', exact: true }).click();
    await dialog.getByText("Replaces Bob's current role, Data viewer.", { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Grant role' }).click();
    await page.getByText('Bob now holds Editor.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1).grant, [{ principal_kind: 'user', principal_uid: otherUser, role: 'editor' }]);
    await row('Bob').getByRole('button', { name: 'Revoke', exact: true }).click();
    await dialog.getByRole('button', { name: 'Revoke role' }).click();
    await page.getByText('Bob no longer holds Editor here.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1), { revision: 'revision-1', grant: [], revoke: [{ principal_kind: 'user', principal_uid: otherUser }] });

    // A stale revision is refused and offers a reload instead of retrying silently.
    conflict = true;
    await row('Job 8b1f').getByRole('button', { name: 'Revoke', exact: true }).click();
    await dialog.getByRole('button', { name: 'Revoke role' }).click();
    await dialog.getByText('Access changed. Reload before saving.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    conflict = false;

    // Explain: yourself, then another User; Teams whose members you cannot see are named.
    await page.locator('summary').filter({ hasText: 'Explain access' }).click();
    await pick('Action to explain', /^tables\.get_data/);
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByText('You can tables.get_data', { exact: true }).waitFor();
    await pick('User to explain', /^Bob/);
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByText('Bob cannot tables.get_data', { exact: true }).waitFor();
    await page.getByText(/one bound Team whose members you cannot see/).waitFor();
    await page.locator('summary').filter({ hasText: 'Access history' }).click();
    await page.getByRole('button', { name: 'Load access history', exact: true }).click();
    await page.getByText('No role changes recorded.', { exact: true }).waitFor();

    // A data viewer sees only their own access: no bindings are read, and they can remove their role.
    role = 'data_viewer';
    accessReads.length = 0;
    await page.reload();
    await page.getByText('Your role: Data viewer', { exact: true }).waitFor();
    assert.deepEqual(accessReads, []);
    assert.equal(await page.getByRole('heading', { name: 'Who has access', exact: true }).count(), 0);
    await page.getByRole('tab', { name: 'Rows' }).waitFor();
    await page.getByRole('button', { name: 'Remove my role', exact: true }).click();
    await dialog.getByText('You lose the Data viewer role on this table. Roles through Teams or the namespace still apply.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Revoke role' }).click();
    await page.getByText('You no longer hold Data viewer here.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1).revoke, [{ principal_kind: 'user', principal_uid: user }]);

    // A data viewer who manages a workload grants it up to their own role.
    manages = true;
    await page.reload();
    await page.getByText('You can grant a role to the workloads you manage, up to your own role.', { exact: true }).waitFor();
    await page.getByLabel('Find people, Teams or workloads', { exact: true }).fill('nightly');
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await pick('Grant to', /^Job 8b1f \(workload\)/);
    await page.locator('button[aria-label="Role to grant"]').click();
    assert.equal(await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Editor/ }).isDisabled(), true);
    await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Data viewer/ }).click();
    await page.getByRole('button', { name: 'Review grant', exact: true }).click();
    await dialog.getByRole('button', { name: 'Grant role' }).click();
    await page.getByText('Job 8b1f (workload) now holds Data viewer.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1).grant, [{ principal_kind: 'user', principal_uid: worker, role: 'data_viewer' }]);
    manages = false;

    // A metadata viewer has no data tabs.
    role = 'metadata_viewer';
    await page.reload();
    await page.getByText('Your role: Metadata viewer', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Rows' }).count(), 0);

    // Every person creates a namespace and lands on its Access panel as its owner.
    await page.goto(`${url}/namespaces`);
    await page.getByRole('button', { name: 'Create namespace', exact: true }).click();
    await dialog.getByLabel('Name').fill('crm');
    await dialog.getByLabel('Description').fill('Customer data');
    nameTaken = true;
    await dialog.getByRole('button', { name: 'Create namespace' }).click();
    await dialog.getByText(new RegExp(`already exists.*Its owners: User ${otherUser}\\.`)).waitFor();
    nameTaken = false;
    await dialog.getByRole('button', { name: 'Create namespace' }).click();
    await page.getByText('Your role: Owner', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).search, '?tab=permissions');
    assert.equal(new URL(page.url()).pathname, `/namespaces/${ns}`);
    await page.getByText('owner summary for this namespace.', { exact: true }).first().waitFor();

    // A manager of the workload that created a namespace holds no role, sees that workload and grants owner to a person.
    await page.goto(`${url}/namespaces/${managedNs}?tab=permissions`);
    await page.getByText('Your role: No role', { exact: true }).waitFor();
    await page.getByText('Manages the creating workload, Job 8b1f (workload)', { exact: true }).waitFor();
    await page.getByText(/^Created by the workload Job 8b1f \(workload\)\. The people who manage it decide who has access here/).waitFor();
    await pick('Grant to', /^Bob/);
    await page.locator('button[aria-label="Role to grant"]').click();
    await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Owner/ }).click();
    await page.getByRole('button', { name: 'Review grant', exact: true }).click();
    await dialog.getByRole('button', { name: 'Grant role' }).click();
    await page.getByText('Bob now holds Owner.', { exact: true }).waitFor();
    assert.deepEqual(changes.at(-1), { revision: 'managed-1', grant: [{ principal_kind: 'user', principal_uid: otherUser, role: 'owner' }], revoke: [] });
    // Owner is still never offered to a workload.
    await pick('Grant to', /^Job 8b1f \(workload\)/);
    await page.locator('button[aria-label="Role to grant"]').click();
    assert.equal(await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Owner/ }).isDisabled(), true);
    await page.getByRole('listbox', { name: 'Role to grant' }).getByRole('option', { name: /^Editor/ }).click();
    // Explain names the manager authority for the caller only.
    await page.locator('summary').filter({ hasText: 'Explain access' }).click();
    await pick('Action to explain', /^namespaces\.set_access/);
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByText('You can namespaces.set_access', { exact: true }).waitFor();
    await page.getByText('Manages the creating workload, Job 8b1f (workload): namespaces.get, namespaces.get_access, namespaces.set_access.', { exact: true }).waitFor();
    await page.getByText('You manage the workload that created this namespace, which lets you see it and decide who has access to it.', { exact: true }).waitFor();
    await pick('User to explain', /^Bob/);
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await page.getByText('Bob cannot namespaces.set_access', { exact: true }).waitFor();
    await page.getByText(/^Whether Bob manages the workload that created this namespace is not shown/).waitFor();

    // Security is administration only: no namespace creation or grant editing there.
    await page.goto(`${url}/settings`);
    await page.getByText('Admin access required', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/settings');
    await page.goto(`${url}/security`);
    await page.getByText('Admin access required', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/security');
    isAdmin = true;
    await page.reload();
    await page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
    await pick('Security resource', /^Prices/);
    await page.getByText('No role → Data viewer', { exact: true }).waitFor();
    assert.equal(await page.getByText('Create namespace', { exact: true }).count(), 0);
    await assertCommandCenterPageLayout(page, { viewports: [{ width, height: width === 375 ? 812 : 800, pointer: width === 375 ? "coarse" : "fine" }] });
    await page.getByRole('button', { name: 'Open its Access panel', exact: true }).click();
    await page.getByText('Your role: Owner', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, `/tables/${uid}?tab=permissions`);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Security browser checks passed: role bindings, grants with texts, changes, revokes, revision conflicts, Explain, manager grants, data tabs, namespace creation, creating-workload managers, admin Security; light/dark at 375/1280.');
} finally { await browser?.close(); vite.kill(); }
