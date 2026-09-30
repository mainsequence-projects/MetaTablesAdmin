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
  bootstrap: { active: false, status: "migration_required", error: null, migration_status: "pending",
    current_revisions: [], required_revisions: ["initial"],
    candidate: { display_name: "Local workspace", class_type: "sqlite", configuration: { path: "/tmp/workspace.sqlite" } } },
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

test("an empty hosted runtime still permits registering its first connection", () => {
  const runtime = { ...local, local_mode: false, bootstrap: { ...local.bootstrap, status: "unconfigured", candidate: null } };
  const html = render(runtime);
  assert.match(html, /No DataSource configured/);
  assert.match(html, /Add DataSource/);
  assert.match(html, /Search data source name/);
  assert.match(render(runtime, "/data-sources/new?scope=runtime"), /Register DataSource/);
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
