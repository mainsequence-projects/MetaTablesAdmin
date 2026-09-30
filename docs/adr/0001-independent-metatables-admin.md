# ADR 0001: Independent MetaTables administration site

- Status: Proposed
- Date: 2026-09-27
- Scope: `metatablesadmin` Vite/React application and its adjacent `MetaTables` API

## Context

The Vite application is currently a React scaffold. Command Center's Main Sequence Foundry owns the user experience for [Tables](http://localhost:5173/app/main-sequence-foundry/tables), [Data Updates](http://localhost:5173/app/main-sequence-foundry/data-updates), and [Namespaces](http://localhost:5173/app/main-sequence-foundry/namespaces). We want the same useful list, detail, and action flows in this independent site.

Command Center Foundry is the feature reference. The independent site uses the packaged Command Center SDK as its UI and embedded-host runtime. Its Foundry client currently calls Django `/api/v1/...` endpoints. The adjacent `MetaTables` FastAPI application currently mounts only `POST /meta-tables/validate-contract` and `GET /time-index-table-update-constants` in addition to `/`. Its catalog, grants, snapshot, schema graph, and update-run code is largely internal and does not yet form a browser-ready HTTP contract. Similar model or route names do not imply parity.

The live Command Center pages were inspected on 2026-09-27. The Tables registry and Data Updates registry loaded. Some selected detail requests returned HTTP 500; the Namespaces registry showed a discovery renderer error. The feature source and README files below are therefore the fuller parity reference; these observed failures are not behavior to reproduce.

## Decision

1. `metatablesadmin` is a standalone Vite/React site with its own routes and resource state. It implements Tables, Data Updates, and Namespaces, including detail views and cross-links. The packaged Command Center SDK owns its navigation, page layout, controls, theme, feedback, and resource presentation. The MetaTables mark is the only app-owned visual identity treatment. SDK skills pinned to the package version live in `.agents/skills/command-center`.
2. **All application data reads, searches, discovery, permissions, graphs, logs, and mutations go exclusively through the API in the adjacent `MetaTables` project.** The browser must not call Django `/api/v1`, `mainsequence` SDK HTTP models, a database, or a Command Center proxy as a data fallback. No iframe of the Foundry pages is part of the solution. In a hosted iframe, the SDK may transport a delegated request to the deployed MetaTables FastAPI release; this does not change the data owner.
3. The API must expose explicit, versioned, documented contracts for the capabilities below. This ADR names required operations, not existing endpoints. Frontend work may be built incrementally, but a control is enabled only after its MetaTables API operation is implemented and contract-tested. It must never silently route an unsupported operation to the old backend.
4. The MetaTables API owns identity admission and authorization. Hosted deployments need a trusted way to carry the existing Main Sequence user identity to the API; this does not require separate user accounts. The current short-lived `X-MainSequence-Caller-Assertion` is minted for a trusted gateway, not a credential for a standalone browser to forge or store. Local debugging instead uses the `METATABLES_LOCAL_RUNTIME=true` boundary in the adjacent Python API's `docs/adr/0001-unified-api-storage-and-local-sqlite.md`: the API resolves the developer's authenticated SDK identity once at startup, then uses the same routes and grant checks without a gateway assertion on each request. `METATABLES_LOCAL_RUNTIME=true` is never a hosted login path. Never put `MAINSEQUENCE_ACCESS_TOKEN`, `MAINSEQUENCE_REFRESH_TOKEN`, assertion material, SDK credentials, local development tokens, or workload credentials in `VITE_*`, static assets, local storage, or source control.
5. One typed frontend API client owns application requests. In top-level local Vite development it calls `/api/...` through the loopback proxy to the adjacent API. In a deployed trusted iframe it waits for the SDK's validated context, then calls `fetchFastApi` for the configured MetaTables ResourceRelease. A deployed direct link has no delegated identity and displays an unavailable state. Both paths reach the same MetaTables API routes. Parse the service's own response and error envelopes; do not assume Django's DRF shapes or `/api/v1` paths.

## Scope and parity inventory

Every page has loading, empty, error, retry, forbidden, and stale-selection states. Search, filters, sorting, and pagination are server backed and remain scoped to the authenticated organization/environment. Selection and action availability are based on capabilities returned by the MetaTables API. Detail selection and active tab are URL backed so refresh, back/forward, and links work.

### Tables

The catalog is one superset of time-indexed storage tables, platform-managed row tables, and externally registered tables. Use the MetaTable UID as the resource identity; distinguish `time_index` from relational kind and `external_registered` from platform-managed mode. Show provisioning state such as `reserved` without treating it as an active physical table.

| Surface | Required behavior |
| --- | --- |
| Registry | Search physical name, identifier, namespace, or exact UID; server pagination and sortable name, identifier, and creation date; kind facet (`all`, `time_indexed`, `row`, `external`) with counts; namespace filter; columns for table name/UID, identifier/description, kind/status, data source, namespace/frequency, and created date. |
| Header and Details | Breadcrumb/back link; UID, physical schema/table, identifier, namespace, data source/engine, management mode, description, deletion protection, labels, counts; column metadata (order, label, type/backend, nullable/PK/unique, description), indexes, outgoing foreign keys, and incoming references. |
| Description | Render the generated search document and its availability; refresh its index only if the API advertises that action. |
| Data Snapshot | Bounded, permission-checked preview with column-aware rendering, filter/search where supported, pagination/limit, and clear unsupported-engine or request errors. No arbitrary SQL from the browser. |
| ULM diagram | Permission-filtered foreign-key graph with depth, incoming-edge toggle, node links, zoom/fit, and delete-policy legend. |
| Stats | Time-indexed tables only: current multi-index and column stats with refresh and expandable JSON/details. |
| Updates | Time-indexed tables only: update processes targeting the table, with links to each Data Update detail. |
| TimeScale Policies | Only for a supported Timescale engine: read and save compression and retention configuration, with validation and unsupported state. |
| Permissions | Current view/edit grants, candidate users/teams, and authorized assignment changes. The API decides visibility and mutation rights. |
| Actions | Server-advertised label changes, sync/introspect from physical, set index stats, refresh search index, delete, cascade delete, bulk clear data, and bulk actions. Use API preflight/impact counts and explicit confirmation for destructive operations. Time-indexed tail deletion needs the API's scoped `delete_after_date` semantics; never issue raw SQL or an unscoped full-stream delete. |

The reference detail tab IDs are `details`, `stats`, `description`, `data-snapshot`, `ulm-diagram`, `updates`, `policies`, and `permissions`. `stats`, `updates`, and `policies` are capability-gated; `policies` additionally requires Timescale support. Preserve deep-link compatibility where practical with `msTableUid`, `msTableTab`, and nested `msLocalUpdateUid`/`msLocalUpdateTab`, while allowing cleaner canonical site paths such as `/tables/:uid/:tab`.

### Data Updates

A Data Update is a `TimeIndexTableUpdate` process, separate from its output table. Multiple updates may target one time-indexed table. The site must preserve that distinction and link between the process and the table.

| Surface | Required behavior |
| --- | --- |
| Registry | Organization-wide authorized update list, server search/pagination, update hash/UID, output table name/UID, status, last and next update, scheduler, and relevant run configuration summary. Search covers hash, source-code hash, and output-table identifier. |
| Details | UID, update hash, output table link, dependency-linked state, active/status/error state, process ID, last/next update, scheduler, priority, last actor, source-code hash, and available configuration. Display only server-safe fields; the list uses a bounded summary projection. |
| Dependencies Graphs | Reuse the output table's Updates pipeline component and `GET /meta-tables/{output_table_uid}/update-graph/`, resolving the table UID from update detail and passing `update_uid` to root the graph at the current update. The SDK direction picker requests `direction=upstream\|downstream\|both`. Share the authorized table/update graph model, read/write/dependency edges, legend, category toggles, lineage selection, drill-down, zoom/fit/minimap. A missing output table is an explicit error. |
| Historical Updates | Newest-first runs, completion/error counts, average duration, duration chart, start/end/duration/result/trace/actor rows, bounded pagination, and empty/error states. |
| Logs | Resource-scoped logs with level filters (`all`, `info`, `warning`, `error`, `debug`), text filter, timestamp/message/source/context, bounded pagination, and safe structured-detail display. |

The reference URL state is `msLocalUpdateUid` and `msLocalUpdateTab=details|graphs|historical-updates|logs`. The same detail component should open from this registry and from a table's Updates tab. The current MetaTables internal update repository records some status and runs, but it has no HTTP read route, logs projection, or full graph API yet.

### Namespaces

| Surface | Required behavior |
| --- | --- |
| Registry | Environment-scoped, server-paginated search by name or UID; namespace name/UID and relational/time-indexed table counts. Use actual list response columns, not generic discovery metadata without a renderer. |
| Overview | URL-backed detail with name, description, UID, table counts, creation date, visibility, and breadcrumb/back navigation. |
| Tables | One server-paginated combined inventory, search, type filter (`all`, relational, time-indexed), and links to the Table detail. |
| Permissions | View/edit assignment matrix for users and teams; candidate lookup; save full assignments; explicit propagation to assigned tables; success/error feedback. Editing implies viewing. Explain that the current MetaTables namespace propagation model is additive: revocation or unlink does not automatically retract previously copied table grants. |

Reference URL state is `msNamespaceUid` and `msNamespaceTab=overview|tables|permissions`. Namespace deletion is **not** inferred from an empty or missing discovery response; show it only if the MetaTables API later explicitly authorizes and advertises it.

## MetaTables API contract required for this site

The following names describe capabilities. The API team should settle final paths, request/response schemas, and OpenAPI IDs in the adjacent project. `GET /meta-tables`, `GET /namespaces`, and `GET /time-index-table-updates` below are *proposed* route families and are not claims that those HTTP routes work today.

An initial route sketch for contract review is:

| Page need | Proposed service-owned operations |
| --- | --- |
| Tables registry and detail | `GET /meta-tables`, `GET /meta-tables/{uid}`, `GET /meta-tables/{uid}/summary`, with `search`, `kind`, `namespace_uid`, `ordering`, `limit`, and `offset` where relevant. |
| Table detail extras | `GET /meta-tables/{uid}/search-document`, `/snapshot`, `/schema-graph`, `/stats`, `/updates`, and `/policies` where the table capability allows them. |
| Table mutations | Service-advertised `GET /meta-tables/{uid}/actions`, action preflight/execution, label mutations, physical sync, search-index refresh, Timescale policy updates, and scoped tail deletion. Exact mutation paths must be set by the API's OpenAPI contract. |
| Data Updates | `GET /time-index-table-updates`, `GET /time-index-table-updates/{uid}`, plus `/summary`, `/runs`, and `/logs`; list requests use a bounded `summary` projection. Graphs reuse `GET /meta-tables/{output_table_uid}/update-graph/`. |
| Namespaces | `GET /namespaces`, `GET /namespaces/{uid}`, `GET /namespaces/{uid}/tables`, and service-owned permission read/save/propagate operations. |

List responses need `count`, `results`, and stable next/previous or limit/offset metadata; detail responses need resource UID, scope, granted capabilities, and typed nullable fields. Counts, sort keys, search semantics, maximum page size, and error codes must be fixed in OpenAPI and checked by frontend contract tests. Graph, run, log, and snapshot pages need server bounds; no client-side union of every table or unbounded data fetch is an acceptable substitute.

| Area | Required MetaTables API capability | Current state in adjacent project |
| --- | --- | --- |
| Session and scope | Trusted hosted identity admission; `METATABLES_LOCAL_RUNTIME` for local debugging; current actor, authorized organization/environment scope, permission-aware capability data | Local runtime admission is implemented through the single `METATABLES_LOCAL_RUNTIME` switch; hosted requests still require trusted caller assertions. |
| Tables list/detail | Visible list with exact UID search, kind/namespace facets, count, deterministic page/sort; detail/summary, schema metadata, labels | Internal permission-filtered query repository exists; no HTTP catalog routes. |
| Table extras | Generated description, bounded snapshot, schema graph, time-index stats, tail preview/delete, Timescale policies | Some PostgreSQL snapshot/schema graph/time-index operations exist internally; no HTTP parity. |
| Table actions | Introspection/sync, label mutations, search refresh, stats refresh, delete/cascade, bulk preflight/execution, protection checks | Catalog and some physical operations exist internally; HTTP actions and parity contracts remain open. |
| Updates | Visible summary list/detail, output-table relation, infra graph, bounded runs and logs | Internal update node/dependency/run persistence exists; no update data HTTP routes or logs projection. |
| Namespaces | Visible list/detail, combined tables page, permissions/candidates, save and propagate | Internal namespace catalog and additive grants exist; no HTTP routes or trusted directory admission. |
| Shared contracts | Pagination envelope, error codes, capability/action descriptors, scope rules, OpenAPI schemas | Only validation and constants routes are mounted. |

The two currently mounted endpoints are useful for contract validation and status labels; neither can populate these pages. The Django action inventory in the adjacent project is a migration inventory, not an approved target URL list. Port behavior into the MetaTables API with its own authenticated, permission-checked contracts; do not proxy requests to Django as the site implementation.

Each protected operation must derive actor and scope from the service's authenticated session and current grants, then authorize the specific read or mutation. An `environment_uid` query parameter can select among allowed environments, but cannot grant access. The existing release configuration is pinned to one Environment; the Data Updates organization-wide monitor needs an explicitly authorized multi-Environment API contract or a documented per-Environment product decision before parity can be claimed.

For each route: publish OpenAPI request/response/error schemas, pagination and ordering limits, supported engines, grant and operation checks, side effects, and capability flags. Use stable UID identifiers. Return the same scope and permission decisions for list, detail, graph expansion, and actions. Avoid leaking inaccessible nodes or counts through graphs or discovery.

## Frontend implementation plan

1. Compose app navigation and three local routes with the Command Center SDK's navigation and layout primitives. Build an API client with typed schemas, session handling, explicit scope, consistent errors, cancellation, and cache keys containing scope and UID. Use SDK controls, views, feedback, and theme tokens throughout.
2. Implement the three list/detail shells and URL state against mock contract fixtures while the MetaTables API routes are developed. Keep unsupported controls hidden or disabled with a clear reason; do not seed production screens with fake data.
3. Integrate real MetaTables API operations by resource, including snapshots/graphs/history/logs and permission edits. Revalidate action capability at execution time. Invalidate only affected scoped queries after mutations.
4. Complete parity checks against the three Foundry references for both a relational/external table and a time-indexed table, an update with runs, and a namespace with assigned tables. Verify search, filters, pagination, deep links, cross-links, role restrictions, errors, and destructive-action preflight. Network inspection must show calls only to the MetaTables API origin for application data.

## Consequences

- The site can deploy and evolve independently while sharing the Command Center SDK's visual and embedded runtime contract. Full parity waits for substantial MetaTables API work and a trusted hosted release. Local API debugging uses `METATABLES_LOCAL_RUNTIME=true`; `false` or unset selects hosted execution. This is the only runtime environment switch, and the profile is derived internally.
- Existing local MetaTables code is a foundation, not an HTTP compatibility promise. The site must expose missing capability honestly instead of emulating it with direct DB access or old API calls.
- The API becomes the single place for grants, scope, engine support, destructive-action impact, and audit semantics. The browser remains a presentation client.

## Sources checked

- Command Center Foundry source at `d89aff95e439a5574af67433dab1f12cdd9ef591`: `apps/mainsequence-foundry/src/extensions/workbench/features/{tables,data-updates,namespaces}/README.md`, the three page/detail implementations, and `apps/mainsequence-foundry/src/common/api/index.ts`.
- Adjacent MetaTables working tree on 2026-09-27: `api/app/main.py`, `api/app/routes/`, `docs/python_package/http_operation_map.md`, `docs/permissions/caller_assertions.md`, `docs/metatables/README.md`, `docs/namespaces/README.md`, and `docs/time_index_table_updates/README.md`.
- The three linked local Command Center pages were inspected in the user's existing browser session on 2026-09-27; the source files above fill in detail views affected by current request errors.

## DataSource engine management (2026-09-28)

The Data Sources view manages PostgreSQL, TimescaleDB, MySQL and MSSQL through the
same MetaTables API routes. The engine controls port/schema defaults and TLS
fields. The browser submits platform Secret UIDs only. Table capabilities remain
API-owned: MySQL and MSSQL support connection management and validation, display
their missing table workflow support, and cannot be made the default.
