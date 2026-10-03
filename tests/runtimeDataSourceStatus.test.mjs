import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import ts from "typescript";

// Render the real route and SDK components without operating a browser. These
// hooks provide Vite's TSX/asset loading and expose private composition boundaries
// only in this test process; production exports and authentication stay unchanged.
const sourceRoot = new URL("../src/", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith(".")) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", ".tsx"]) {
        const candidate = new URL(base.href + suffix);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
    if (url.startsWith(sourceRoot) && /\.(svg|png)$/.test(url)) {
      return { format: "module", source: `export default ${JSON.stringify(url)};`, shortCircuit: true };
    }
    if (url.startsWith(sourceRoot) && /\.tsx?$/.test(url)) {
      let source = readFileSync(new URL(url), "utf8");
      if (url.endsWith("/runtimeContext.tsx")) source += "\nexport const TestRuntimeContext = RuntimeContextValue;";
      if (url.endsWith("/App.tsx")) source += "\nexport { AuthorizedApplication };";
      return { format: "module", shortCircuit: true, source: ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
      } }).outputText };
    }
    return next(url, context);
  },
});
const { AuthorizedApplication } = await import("../src/App.tsx");
const { TestRuntimeContext } = await import("../src/runtimeContext.tsx");
hooks.deregister();

const local = {
  is_admin: true, local_mode: true, data_source: null, data_source_error: "runtime_not_initialized",
  bootstrap: { active: false, status: "migration_required", managed_by: "settings", declaration: null, can_configure: true,
    error: null, migration_status: "pending", current_revisions: [], required_revisions: ["initial"],
    candidate: { display_name: "Local workspace", class_type: "sqlite", configuration: { path: "/tmp/workspace.sqlite" } } },
};

// Hosted: the deployment declares the database and its migration Job applies pending migrations.
const hosted = {
  is_admin: true, local_mode: false, data_source: null, data_source_error: "runtime_not_initialized",
  api_endpoint: "https://metatables.example.test",
  hosted_environment: { uid: "environment", status: "verified", name: "Development", is_production: false, required_repository_branch: "development" },
  bootstrap: { active: false, status: "migration_required", managed_by: "deployment", can_configure: false, selected_source_uid: null,
    error: "The runtime database has pending MetaTables migrations. The next deployment applies them.",
    declaration: { engine: "timescale_db", uri_secret: "METATABLES_RUNTIME_DATABASE", default_schema: "public",
      tls: { mode: "verify-full", ca_secret: "METATABLES_RUNTIME_CA", client_certificate_secret: null, client_key_secret: null } },
    candidate: { display_name: "MetaTables", class_type: "timescale_db", configuration: {
      host: "runtime-db.example.test", port: 20989, database_name: "metatables_development", database_user: "metatables_dev", default_schema: "public" } },
    current_revisions: ["0008_previous"], required_revisions: ["0009_timescale"], pending_revisions: ["0009_timescale"],
    migration_status: "pending", migration_error: null },
};

function render(runtime, path = "/data-sources") {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(TestRuntimeContext.Provider, { value: { runtime } }, createElement(AuthorizedApplication))));
}

test("Data Sources shows configured local storage before catalog initialization", () => {
  const html = render(local);
  assert.match(html, /DataSource requires migrations/);
  assert.match(html, /Local workspace/);
  assert.match(html, /SQLite/);
  assert.match(html, /\/tmp\/workspace\.sqlite/);
  assert.match(html, /Open Settings/);
  assert.match(html, /Add DataSource/, "hosted connection management remains reachable");
  assert.match(html, /Search data source name/);
  assert.doesNotMatch(html, /No DataSource configured/);
});

test("table workflows report pending migrations rather than a missing local source", () => {
  const html = render(local, "/tables");
  assert.match(html, /DataSource requires migrations/);
  assert.doesNotMatch(html, /No DataSource configured/);
});

test("an active local catalog renders its source registry", () => {
  const html = render({ ...local, data_source_error: null,
    data_source: { uid: "local", class_type: "sqlite", display_name: "Local workspace", status: "AVAILABLE" },
    bootstrap: { ...local.bootstrap, active: true, status: "ready" } });
  assert.match(html, /Search data source name/);
  assert.doesNotMatch(html, /DataSource requires migrations|No DataSource configured/);
});

test("hosted DataSources wait for the deployment to activate the runtime database", () => {
  const html = render(hosted);
  assert.match(html, /DataSource requires migrations/);
  assert.match(html, /The next deployment applies them\./, "the API's error is shown verbatim");
  assert.match(html, /Search data source name/);
  assert.doesNotMatch(html, /Add DataSource|No DataSource configured/);
  const form = render(hosted, "/data-sources/new");
  assert.match(form, /Runtime database not active/);
  assert.doesNotMatch(form, /Register DataSource/);
});

test("an active hosted runtime registers additional DataSources", () => {
  const html = render({ ...hosted, data_source_error: null,
    data_source: { uid: "runtime", class_type: "timescale_db", display_name: "MetaTables", status: "AVAILABLE", storage_access_mode: "read_write" },
    bootstrap: { ...hosted.bootstrap, active: true, status: "ready", error: null, selected_source_uid: "runtime",
      current_revisions: ["0009_timescale"], pending_revisions: [], migration_status: "up_to_date" } });
  assert.match(html, /Add DataSource/);
  assert.doesNotMatch(html, /DataSource requires migrations/);
});

test("hosted Settings shows the deployment-declared runtime database read-only", () => {
  const html = render(hosted, "/admin/settings");
  for (const expected of [/2\. Runtime database/, /TigerData \/ TimescaleDB/, /METATABLES_RUNTIME_DATABASE/, /verify-full/,
    /METATABLES_RUNTIME_CA/, /runtime-db\.example\.test/, /20989/, /metatables_development/, /metatables_dev/,
    /The next deployment applies them\./, /A deployment applies the pending migrations/, /runtime_database/, /configuration\.yaml/,
    /MetaTables system migrations Job/, /0008_previous/, /0009_timescale/, /Migrations pending/]) {
    assert.match(html, expected);
  }
  assert.doesNotMatch(html, /Client key Secret/, "unset certificate Secrets are omitted");
  assert.doesNotMatch(html, /Select DataSource|Hosted DataSource|Use this DataSource|Finish DataSource setup|Run MetaTables migrations|Check DataSource|Edit configuration|Destroy local database/);
});

test("local Settings keeps configuring and migrating the workspace database", () => {
  const html = render(local, "/admin/settings");
  assert.match(html, /\/tmp\/workspace\.sqlite/);
  assert.match(html, /Edit configuration/);
  assert.match(html, /Run MetaTables migrations/);
  assert.doesNotMatch(html, /Runtime database|runtime_database|Environment Secret/);
});

test("configured but incompatible storage is reported as unavailable", () => {
  const html = render({ ...local, bootstrap: { ...local.bootstrap,
    status: "incompatible", error: "Unsupported migration history" } });
  assert.match(html, /DataSource unavailable/);
  assert.match(html, /Unsupported migration history/);
  assert.match(html, /Local workspace/);
  assert.doesNotMatch(html, /No DataSource configured/);
});

for (const local_mode of [true, false]) {
  test(`ordinary users can browse DataSources before ${local_mode ? "local" : "hosted"} initialization`, () => {
    const runtime = { ...local, is_admin: false, local_mode };
    const html = render(runtime);
    assert.match(html, /Search data source name/);
    assert.doesNotMatch(html, /Admin access required/);
    assert.doesNotMatch(html, /href="\/admin/);
    assert.doesNotMatch(html, /Open Settings|Add DataSource/);
    assert.match(render(runtime, "/admin/settings"), /Admin access required/);
  });
}

test("Data Sources is declared once in the catalog and is absent from Admin", () => {
  const html = render(local);
  assert.equal((html.match(/href="\/data-sources"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /href="\/admin\/data-sources/);
});

test("removed Admin DataSource routes have no page or redirect", () => {
  for (const path of ["/admin/data-sources", "/admin/data-sources/new", "/admin/data-sources/example?tab=details"]) {
    const html = render(local, path);
    assert.match(html, /Page not found/);
    assert.doesNotMatch(html, /Search data source name|Register DataSource|Data Source details/);
  }
});
