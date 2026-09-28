# MetaTables Admin

An independent Vite/React frontend for the MetaTables catalog. It has Tables, Data Updates, Namespaces, and Data Sources views, including detail routes. The Command Center SDK supplies the navigation shell, theme, page layout, controls, feedback, and resource views. Application data is requested only from the adjacent MetaTables API.

## Run locally

```sh
npm ci
cp .env.example .env.local
```

Open this project in VS Code, install the recommended Python and Python Debugger
extensions, and select **MetaTables: API (8001) + Admin (5175)** in Run and Debug.
Press F5 to launch both services on loopback. Open `http://127.0.0.1:5175/tables`.
Stopping the launcher stops both services; if either service exits, the other
is stopped too. Python subprocess debugging enables breakpoints in the API.

Set `metatables.backendPath` in `.vscode/settings.json` to the Python project
path relative to this folder if your checkout is elsewhere. The configuration
uses that project's `.venv/bin/python` and working directory. Install
the backend dependencies and sign in or refresh credentials in the Main Sequence
VS Code extension. Both launch configurations explicitly pass
`--sdk-session-source vscode`: the launcher loads the extension's `token.json`
session and configured backend into the API process before SDK model imports.
This extension version stores credentials separately from the Python CLI's
Keychain session. The launcher does not fall back to that CLI session if the
extension session is missing. It overrides inherited SDK token variables and
uses the credential-free `.vscode/local-debug.env` instead of the backend `.env`.
For a terminal launch using a Python CLI login, explicitly select
`--sdk-session-source cli`.

Local mode selects a Git workspace and creates separate SQLite catalog and
application files; it needs neither a registered branch nor PostgreSQL. Catalog
migrations run during API startup.
`METATABLES_LOCAL_RUNTIME` is the API's only runtime switch: `true` selects local
execution; `false` or unset selects hosted execution. Both VS Code configurations
use `scripts/dev.py`, which sets it to `true` automatically. No separate runtime
profile variable is required.
Local actor scope comes directly from the SDK; no membership setup command is
required. The backend's `docs/operations/local-runtime.md` contains the complete
local runtime setup, configuration, and troubleshooting guide.

This project's `scripts/dev.py` supplies the private launch plumbing for
`.vscode/launch.json`: it prebinds the API socket and provides a process-lifetime
token to Vite as `METATABLES_LOCAL_TOKEN`. The API resolves the local SDK identity
once. Vite proxies `/api/*` to `http://127.0.0.1:8001` and adds the private token
from the server process, replacing browser-supplied values. The browser uses the
API-selected workspace and needs no Git source header; Vite strips that header
if a browser supplies one. The API validates its own checkout against its startup
source. Never put tokens or SDK
credentials in `VITE_*` variables, browser storage, or source control. The
example file contains no credential values.

The backend checkout provides the same launch configuration, with
`metatables.adminPath` identifying this admin checkout. Both configurations run
the same launcher and enable Python subprocess debugging.

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

- DataSource registration and configuration for PostgreSQL and TimescaleDB, connection validation, default selection, disablement, and removal. Credentials are referenced by ordinary platform Secret UIDs; the form never accepts secret values. The API enforces creator-only management and protects referenced sources. Local SQLite paths are controlled by the launcher.
- Table list search, kind and namespace filters, server sort and pagination; detail metadata, description, snapshot, graph, stats, updates, Timescale policies, permissions, and server-advertised action preflight.
- Data Update list and detail, dependency graph, historical runs, and bounded logs.
- Namespace list and detail, combined table inventory, and permissions with explicit propagation.
- URL-backed detail tabs, cross-links, loading/empty/error states, and a shared typed API client.

The final API paths, response schemas, permission flags, and hosted identity exchange must be settled and implemented in MetaTables before these screens can deliver full parity. Reconcile `src/api.ts` with the published OpenAPI contract when those routes land.

## Build

```sh
npm run build
```

## Embedded deployment

Build the site with `VITE_COMMAND_CENTER_ORIGIN` set to the exact trusted host origin and `VITE_METATABLES_RESOURCE_RELEASE_UID` set to the deployed MetaTables FastAPI ResourceRelease UID. The child site waits for the SDK's validated iframe context, inherits the host's SDK theme, and sends its MetaTables requests through `fetchFastApi`. A deployed direct link without that host context displays an unavailable state. The Vite development proxy and its `METATABLES_*` variables are local server settings.

The SDK's pinned `0.5.6` skills are installed in `.agents/skills/command-center`. Use those instructions and the public SDK exports for any new navigation, layout, controls, theme, feedback, or resource view. Keep the existing MetaTables mark as the one local visual asset.
