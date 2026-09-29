# MetaTable ULM explorer

`layout.ts` ports the layered layout, expansion sizing, column anchors, fit transform,
and curved foreign-key geometry from Command Center's
`apps/mainsequence-foundry/src/extensions/workbench/features/tables/MainSequenceTableUmlExplorer.tsx`.
`UlmDiagramTab.tsx` adapts its canvas, pan/zoom, table cards, legend, and inspector to
the public Command Center SDK controls and the MetaTables catalog API.

This renderer belongs only to the MetaTable ULM tab. Update dependency graphs retain
the separate `GraphPanel` renderer.

The schema-graph endpoint determines visible nodes and relationships. The root
reuses the detail already loaded by the resource shell; other visible tables load
metadata on expansion or inspection. Those reads use the normal API transport,
deduplicate pending reads, abort on unmount, and show retryable errors without
removing the graph. Metadata never expands the authorized graph.

The domain layout is independent of React and SDK presentation. Its regressions
cover real public API fields, column ordering, permission-filtered edges, fit,
and column-level foreign-key endpoints. SDK buttons, badges, fields, and cards own
ordinary controls and inspector surfaces; scoped ULM CSS owns canvas geometry.
