# User-guide verification

Checked on 2026-09-30 using the Command Center SDK 0.5.10 documentation scaffold.

## Coverage

The guide follows the navigation superset in `src/metatablesNavigation.tsx`:

- MetaTables → Catalog → Data Sources, MetaTables, Time Index MetaTables, Time Index Table Updates, Runs, Namespaces.
- Admin → Admin → Security, Settings.

The manifest uses the local suffix of each scoped navigation ID for folder names. All eight destinations have feature pages. Six additional task pages cover registration, queries, imports, sharing, run investigation, and runtime selection. Home and section landings bring the total to 19 authored pages.

Engineering notes were moved from `docs/adr/` and `docs/sdk-resource-list-issues.md` into this directory. Only user-facing content is included in the guide.

## Checks performed

- `npm run docs:sync` and `npm run docs:check`: all 19 pages validated.
- `npm run build`: TypeScript, 79 frontend tests, SDK theme audit, Vite build, and Docusaurus build passed. Both `dist/index.html` and `dist/docs/index.html` were produced.
- `npm run build:docs` passed again after adjusting guide link contrast.
- Loaded all 19 production guide routes in Chrome from Vite preview on port 19474. Each rendered its expected heading; nested links and navigation were traversed from the rendered guide.
- Inspected the registration instructions at desktop size and at 390 × 844 in light and dark modes. No horizontal document overflow at the narrow size. Mobile menu and desktop sidebar expose the guide hierarchy.
- Verified the application User guide link, feature-to-application link, and Back to application link on the development site at port 19473.
- Verified the production return link loads the application bundle. Standalone production application shows its expected Command Center embed requirement.

## Verification limits

The development runtime currently reports pending migration `0008_upload_receipts`, with `0007_external_relation_names` applied. The live Settings recovery view, Data Sources list, and registration form were inspected. Catalog workflows gated by that migration were checked against their current implementation and earlier UI evidence; they were not executed again for this documentation task. No migration, database reset, password submission, import, query, or access change was performed.

Production application workflows require the trusted Command Center embed, which was not available in the standalone preview. The guide itself was verified from the production build.

## Maintaining the guide

Update the guide whenever labels or workflows change. Keep the manifest synchronized with navigation, verify affected screens in the browser, and run the SDK docs checks before the combined build. Keep developer instructions and verification notes outside the served `docs/` tree.

## Selected Run details — 2026-10-01

- The Runs feature and investigation task now explain each attempt's identity, selected-record metrics and actions, optional parent navigation, execution context, and logs after clearing node selection. The published Runs guide URLs are preserved.
- Verified live Run `4d43f2a0-cb12-4046-b434-9e338039d95b`: RecordedPrices, October 1 at 11:08:52 local time, succeeded, 0.7 seconds. The separate parent action opens `338c34ef-7034-46b6-b2e8-947aa47e1270`, showing DailyReturns and 2.0 seconds. Returning restores the selected child.
- Combined build passed: TypeScript, 81 frontend tests, theme audit, 20 documentation pages, Vite and Docusaurus. The focused browser regression covers differing parent outcomes/metrics, selected updater/output/permalink actions, parent navigation, exact logs after graph selection, legacy and failed graph reads, pagination, refresh and selection races.
- Desktop SDK page geometry and the selected summary's geometry passed. The broader mobile verifier still reports graph touch targets, existing filter input sizing, and overflow at 320 pixels; this change does not establish full explorer mobile conformance. The updated investigation guide rendered at 375 pixels without horizontal overflow.
- Inspected both affected guide routes from the combined artifact served by Vite. No backend runtime, migration, database or container test was run.

## Navigation integration — 2026-10-01

- Removed the page-content footer link and its custom CSS. The SDK main navigation rail now renders **User guide** with a book icon through `footerApplications`, at the bottom of the rail. It is absent from Catalog. Plain clicks load `/docs/`; modified clicks retain the SDK's native link behavior.
- Aligned the guide with the current **Catalog** and **Monitoring** groups. Runs sources now belong to Monitoring; explicit slugs preserve both existing published Runs guide URLs. The global User guide landing documents the bottom navigation shortcut. The guide contains 20 authored pages.
- The corrected combined `npm run build` passed using Node 24: TypeScript, frontend tests, the SDK theme audit, validation of 20 documentation pages, Vite, and Docusaurus.
- Verified the desktop book link inside the main rail footer, at the bottom of the viewport, with no matching link in the Catalog panel. Clicking it opened the built guide. The application was available again for this corrected verification.
- Earlier in this task, the guide's mobile menu was verified at 390 × 844 with no horizontal document overflow. A temporary local API Git-source restart requirement limited the earlier return check. No API restart, database operation, or container test was performed for this change.
