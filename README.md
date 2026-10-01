<p align="center">
  <img src="public/favicon.svg" alt="MetaTables logo" width="80" height="80" />
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/branding/mainsequence-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/branding/mainsequence-light.png" />
    <img src="docs/assets/branding/mainsequence-light.png" alt="Main Sequence logo" width="280" />
  </picture>
</p>

# MetaTables Admin

## Runs and historical graphs

**Runs** places timestamped attempts on the left and the selected Run on the right,
with updater, outcome, start-time and root-only filters heading the history list. Dependency attempts are indented under
their invocation's root. The header names the Run's updater, outcome, duration,
start time and UID, and whether it is a root or dependency attempt; dependency
attempts have a separate **Parent execution** action. Header actions and permalinks
stay attached to the selected Run, including records with no captured graph.
`/runs/{run_uid}` preserves the selection. The table **Updates** tab and updater
**Historical Updates** tab use the same view scoped to their resource, including
dependency attempts. **Invocation** draws the saved graph as a timeline on the
invocation's clock: one row per updater attempt with its attempt record,
calculation, dependency wait and log events, colored from the active theme's
status tokens. A row's name opens that attempt. **Lineage graph** opens the saved
topology canvas on demand. **Logs** reads the whole invocation through
`/table-update-runs/{run_uid}/invocation-logs/`, or only the selected attempt,
with level filtering, refresh and load-more; hovering a line highlights its tick.
**Hide history** gives the Run the full width while preserving selection and
pagination. The definition graph continues to show current relationships
and explicitly labels latest state, with a link to the latest recorded run.

Completed graphs do not change when an updater runs again or dependencies are
edited. Pending, blocked, skipped and not-run nodes are distinct from success.
An unfinished record is last reported progress, not proof that a process is alive.
Expired logs do not erase catalog outcomes. Earlier records without snapshots
show historical graph unavailable, and current permissions filter every read.

The API requires migration `0004_historical_run_graphs`, applied explicitly in
Settings after restart. Scheduling remains with Main Sequence Jobs.

## Runtime and Settings

The application initializes through the MetaTables API's `/runtime-context/`.
**Settings** shows the API mode and endpoint, the verified hosted Environment,
and its DataSource setting. Settings and Admin Data Sources remain available before
initialization. Data Sources shows the selected runtime connection and its migration
status, and allows hosted connections to be registered. Tables and updates wait
for initialization. A configured SQLite file with pending migrations
is shown as requiring migrations, rather than as an absent DataSource. Configure the runtime
DataSource, check it, and explicitly run MetaTables migrations or select an already
initialized database. Local uses one SQLite file; hosted uses PostgreSQL/TimescaleDB.
That database contains both system records and user tables. Startup never migrates it.

In Local mode, **Destroy local database** removes the selected workspace's database
and any marked files from its earlier two-file layout. The confirmation shows the
path and requires typing `DESTROY`. After deletion, explicitly run MetaTables
migrations to initialize again. Hosted mode never offers database destruction.

An independent Vite/React frontend for the MetaTables catalog. It has MetaTables, Time Index MetaTables, Time Index Table Updates, Namespaces, and Data Sources views, including detail routes. MetaTables lists all registered tables; Time Index MetaTables uses the dedicated `/time-index-meta-tables/` API to list only the time-indexed subtype. The Command Center SDK supplies the navigation shell, theme, page layout, controls, feedback, and resource views. Application data is requested only from the adjacent MetaTables API.

## Run locally

```sh
npm ci
cp .env.example .env.local
```

Open this project in VS Code, install the recommended Python and Python Debugger
extensions, and select **MetaTables: API (18473) + Admin (19473)** in Run and Debug.
Press F5 to launch both services on loopback. Open `http://127.0.0.1:19473/tables`.
The defaults are API port `18473` and admin port `19473`. Change `--api-port`
and `--admin-port` in the selected launch configuration if either is occupied;
the launcher derives the proxy target and allowed browser origin from them.
The launcher prints each service's URL and port in the Debug Console and
integrated terminal before checking credentials or starting the services.
Stopping the launcher stops both services; if either service exits, the other
is stopped too. Python subprocess debugging enables breakpoints in the API.

For **MetaTables Examples** in the Python workspace, the launcher publishes its
current API URL and process token in the ignored backend
`.local/development-client.json` (permissions `0600`) and removes it on shutdown.
The example reads this connection automatically; tokens are never printed or
stored in `launch.json`. Its Debug Console opens on session start, with no input
prompts. The default is `read` for `SPY`; change the Examples configuration's
`args` to select another step or symbol. Restart a launcher started before this
support was added once to create the connection file.

Set `metatables.backendPath` in `.vscode/settings.json` to the Python project
path relative to this folder if your checkout is elsewhere. The configuration
uses that project's `.venv/bin/python` and working directory. Install
the backend dependencies and sign in or refresh credentials in the Main Sequence
VS Code extension. The local launch configuration explicitly passes
`--sdk-session-source vscode`: extension 0.1.44 stores its session in VS Code
SecretStorage and exports it into the backend repository's managed `.env` block.
Select that backend code repository in the extension and refresh its tokens to
update this projection. The launcher reads only `MAINSEQUENCE_ENDPOINT`,
`MAINSEQUENCE_ACCESS_TOKEN`, and `MAINSEQUENCE_REFRESH_TOKEN` from the backend
`.env`. Plain exports (including extension 0.1.43) are accepted. When present,
the block between `# BEGIN MAINSEQUENCE AUTH (managed by VS Code)` and
`# END MAINSEQUENCE AUTH` takes precedence over values outside it.
These values reach the API before SDK model imports and replace inherited SDK
token variables. VS Code also loads the backend `.env` as private process
configuration. The legacy `token.json`
is no longer used. Missing session values produce one launch error naming the
backend `.env` path and missing variable names, without a chained traceback.
Malformed managed blocks also stop the launch. The launcher does not select a CLI session.
The backend `.env` stays outside version control; its values are never sent to the browser.
For a terminal launch using a Python CLI login, explicitly select
`--sdk-session-source cli`.

Local mode selects a Git workspace and prefills one SQLite file; it needs neither
a registered branch nor PostgreSQL. Settings explicitly initializes or resets the
database. Data Sources displays the fixed SQLite registration as read-only;
Settings owns changes to the complete runtime binding. In hosted mode, remote source management
is available and SQLite registrations are rejected.
The backend's `configuration.yaml` controls `local_mode_available`. Set it to
`true` for this developer workflow; environment injection cannot enable the
capability or select the runtime. Mode selection is saved in the backend's ignored
`.local/runtime-selection.json`. A fresh launch selects Local.
Local actor scope comes directly from the SDK; no membership setup command is
required. The backend's `docs/operations/local-runtime.md` contains the complete
local runtime setup, configuration, and troubleshooting guide.

This project's `scripts/dev.py` supplies the private launch plumbing for
`.vscode/launch.json`: it prebinds the API socket and provides a process-lifetime
token to Vite as `METATABLES_LOCAL_TOKEN`. The API resolves the local SDK identity
once. Vite proxies `/api/*` to `http://127.0.0.1:18473` and adds the private token
from the server process, replacing browser-supplied values. The browser uses the
API-selected workspace and needs no Git source header; Vite strips that header
if a browser supplies one. The API validates its own checkout against its startup
source. Never put tokens or SDK
credentials in `VITE_*` variables, browser storage, or source control. The
example file contains no credential values.

The backend checkout provides the same local launch configuration, with
`metatables.adminPath` identifying this admin checkout. Both configurations run
the same launcher and enable Python subprocess debugging.

## Switch to hosted storage

Use **Settings → Runtime mode → Hosted → Apply runtime mode**. One Vite site and
API address serve both modes; there is no second hosted launch configuration.
Configure the hosted runtime DataSource in Settings using connection settings and
platform Secret references, then explicitly initialize it or select an already
initialized database. There is no independent catalog URL. The supervised developer API uses the
existing SDK developer session and loopback token in either storage mode.

The API rejects switching during active requests, unfinished updates, open
migration connections, reserved migrations or unresolved physical operations. The old worker exits before its
replacement starts. Vite remains running; the UI blocks work, reloads context and
clears cached views. Failed activation restores the previous worker and shows an
error. Catalogs and table data remain in their respective bindings.

Shared deployments set `local_mode_available: false`; their API keeps signed
caller verification and does not expose the selector. The API independently
rejects switching, so hiding the UI is not the enforcement boundary.

For frontend-only work against an already configured API, use `npm run dev`.
Set `METATABLES_API_TARGET` in `.env.local` to change that API target.

## Current API boundary

The registries use the mounted MetaTables table/update routes and the namespace
list, detail, and table reads. `src/apiContract.ts` maps the Python API's public
field names and filter syntax into SDK view records. Local slash redirects stay
inside Vite's `/api` proxy so subsequent requests receive its private token.
The broader parity plan remains in [ADR 0001](docs/adr/0001-independent-metatables-admin.md).
Some detail actions and permission endpoints remain unavailable. A missing route
appears as “API capability pending”; an unavailable service appears as an API
connection error. No sample records or alternate data backend are used.

The pages already implement:

- DataSource registration and configuration for PostgreSQL, TimescaleDB, MySQL and Microsoft SQL Server (MSSQL), connection validation, disablement, and removal. Default selection is available for table-capable engines. MySQL and MSSQL currently support connection management; their table read/write/migration adapters are not yet implemented. Credentials are referenced by ordinary platform Secret UIDs; the form never accepts secret values. The API enforces admin-only management and protects referenced sources. Local SQLite paths are configured in Admin Settings.
- Table list search, kind and namespace filters, server sort and pagination; detail metadata, description, graph, stats, updates, Timescale policies, permissions, and server-advertised action preflight.
- Data Update list and detail, dependency graph, historical runs, and bounded logs.
- Namespace list and detail, combined table inventory, and admin-managed grants with live inheritance.
- URL-backed detail tabs, cross-links, loading/empty/error states, and a shared typed API client.

The final API paths, response schemas, permission flags, and hosted identity exchange must be settled and implemented in MetaTables before these screens can deliver full parity. Reconcile `src/api.ts` with the published OpenAPI contract when those routes land.

## Manage DataSources

As an Organization admin, open **MetaTables → Data Sources → Add DataSource** at
`/data-sources/new`. Select PostgreSQL, TimescaleDB, MySQL,
or Microsoft SQL Server, then enter the host, database, username and password
Secret UID. The form selects the engine's default port and schema and displays
only its TLS options. MySQL uses its database name as the schema; MSSQL defaults
to `dbo`, encrypted connections and certificate verification.

Save the registration and choose **Validate connection** on its detail page.
Validation opens a connection from the API server and runs `SELECT 1`. A failed
check displays an error and records `FAILED`; correcting the configuration and
validating again can recover it. Connection success does not enable unimplemented
table operations. MySQL and MSSQL display this limitation and cannot become the
table-workflow default.

The API server needs the `mysql` or `mssql` Python extra for those engines. MSSQL
also needs Microsoft ODBC Driver 18 for SQL Server and the OS ODBC driver manager.
Database drivers and Secret values are never installed or resolved in the browser.

Use the detail form to edit connection settings, **Disable** to block connections,
and **Remove registration** for an unused source. Management requires Organization
admin status; being the registration's creator grants no administrative rights.
The API protects referenced and default sources and preserves database contents
and platform Secrets on removal. Configuration edits replace the complete engine
configuration; switching engines requires a new registration.

## Build

```sh
npm run build
```

The build first runs TypeScript, SDK boundary checks, and the SDK's theme audit.
`npm run check` runs those checks without producing a bundle. Standard controls,
pickers, cards, page layout, lists, detail shells, summaries, confirmation dialogs,
and feedback use public Command Center SDK exports. Application CSS is limited
to the MetaTables mark, domain diagrams/charts, and code/document rendering.
The boundary check rejects native UI controls, custom interactive HTML controls,
unpublished SDK imports, and CSS overrides of SDK components.

The SDK detail shell owns the tab surface and its default content inset. Compose
tab bodies with open `DetailSection` / `ApplicationPageStack` sections. Do not
nest `ApplicationCard` or custom card frames inside that surface; embedded
feedback also stays flat.

The table **Updates** tab reads paginated attempts from
`/table-update-runs/?output_table_uid=...` and the selected attempt's saved graph
from `/table-update-runs/{run_uid}/graph/`. Dependency attempts resolve to their
root invocation with the corresponding node selected. Changing selection clears
the previous node and logs; refresh retains the selected invocation. On narrow
screens, the run list stacks above the graph.

The Data Update **Dependencies Graphs** tab retains the current-definition graph
from `/meta-tables/{uid}/update-graph/`, with an Upstream / Downstream / Both
picker. Historical and definition views share the React Flow renderer, themed
nodes, table links, minimap and lineage inspector. Selecting a node highlights
lineage without hiding upstream producers' output tables. The inspector separates
update dependencies, input tables, output tables and consumers. Execution priority
and foreign keys do not create dependency edges.

## Embedded deployment

`.mainsequence/workflows/metatables-admin.yaml` defines this application as a Vite
static-site release with SPA routing to `/index.html`, Node 24, and `dist` output.
Automatic deployment is enabled for every commit to the connected repository
branch. The browser icon uses the same MetaTables mark as the application.
The platform supplies the exact trusted host origin as `VITE_COMMAND_CENTER_ORIGIN`
and sets the gateway's iframe CSP. That variable is platform-reserved; do not
configure it in frontend environment files or the release's build environment.

The child waits for the SDK's validated iframe context, inherits every host theme
update, and sends MetaTables requests through delegated `fetchFastApi`. Changing
the host user remounts the API runtime and clears the previous person's page state.
A deployed direct link without host context displays an unavailable state. The
Vite development proxy and its `METATABLES_*` variables are local server settings.

The target MetaTables API release is separate from the host origin. This binding
currently uses the public `VITE_METATABLES_RESOURCE_RELEASE_UID` value. It must
identify an existing MetaTables FastAPI release; an undeployed API cannot receive
delegated requests. Local Vite development requires neither embed value. Once a
stable API release exists, its UID can be owned by the application in source, as
the Mexico Fund Competition site does, rather than requiring a per-build setting.

The SDK's pinned `0.5.10` skills are installed in `.agents/skills/command-center`. Use those instructions and the public SDK exports for any new navigation, layout, controls, theme, feedback, or resource view. Keep the existing MetaTables mark as the one local visual asset.

## Security model

The API supplies current User/Team access and admin facts. Settings, DataSource
management, and global Security require Organization admin. Table Writers own
their table lifecycle and Reader/Writer sharing, independently of admin status.
The Access tab uses Command Center's sharing assignment matrix: available and
selected users/teams for Reader and Writer roles, with named principals, search,
and add/remove controls. Changes stay local until **Save access**; **Discard changes**
restores the saved assignments. Writers are also Readers; removing Reader access
removes Writer access, while removing Writer access retains Reader access.
Namespace inheritance is displayed separately. Effective-access checks and durable
audit history are available in disclosures below the matrix. Missing directory
entries remain visible and removable as unavailable users/teams, never UUID labels.
Global Security recovers orphaned tables and administers namespace grants.
Data Sources appears once in the MetaTables menu, at `/data-sources` with details
at `/data-sources/{uid}`. All authenticated users can browse sources, including
before runtime initialization. Admins register and manage sources in these same
pages; there is no separate administration view. The old `/admin/data-sources/*`
routes are removed and do not redirect.

The Admin menu is absent for non-admins, including in the mobile drawer. It contains
`/admin/settings` and `/admin/security`. Selecting the runtime DataSource in Settings
remains admin-only. Old `/settings` and `/security` links redirect to these guarded
routes, retaining query parameters and fragments. A route-level guard rejects
non-admin visits before mounting their page components.
Settings remains available to admins before initialization. Non-admins with an
unconfigured runtime see a request to contact an admin, without a Settings action.

The embedded shell waits for host context, delegated transport, and API runtime
facts before mounting any navigation or page. Admins have two work areas (catalog
and Admin) using the SDK depth-two shell; ordinary users have one catalog area
using its depth-one panel shell. Both use SDK-owned responsive drawers and native
destination links. Loading or failed identity requests show no navigation. A new
host user remounts the readiness gate; a runtime response reporting revoked admin
status removes Admin navigation. The API caches platform User facts for one hour
per caller and runtime, seeded by the developer's startup lookup. Platform role
and Team changes become visible after expiry or an API restart. Table and namespace
grants are checked live. Environment display metadata uses a separate one-hour cache;
runtime mode, bootstrap and DataSource state remain current.

Identical overlapping GET requests share one pending request. Each consumer can
cancel independently, including during development effect remounts. Completed
responses are not retained, and mutations or transport/runtime changes separate
subsequent reads from older pending work. This requires no cache configuration.

Grant saves include the API revision to reject stale updates. UI controls consume
API permissions; the API enforces every operation. Application-table migration
connections are currently disabled pending API-mediated execution; system
migrations remain available in Settings.


### Update run logs

Run history uses `/table-update-runs/?table_update_uid=...` and translates the
catalog timestamps, outcome and actor into the view. Logs use the update-scoped
MetaTables log endpoint with level/exact-event filters and cursor navigation.
Refresh starts a fresh snapshot; cursor expiration asks the user to refresh.
Availability and truncation are visible, including missing capture and expired
local files. The UI uses the same response for local files and hosted SDK reads.
Local API and producer must share the API-selected workspace; hosted collection
requires a platform JobRun and the matching generic SDK operation filter.
