import assert from "node:assert/strict";
import test from "node:test";
import { resolveResourceDetailTabs } from "@dev-mainsequence/command-center-sdk/resource";
import { namespaceDetailTabs, sourceDetailTabs, tableDetailTabs, updateDetailTabs } from "../src/detailTabs.ts";

test("time-index deep links survive loading and resolve against the loaded table", () => {
  for (const activeTabId of ["stats", "updates", "policies"]) {
    const selection = { activeTabId, resource: null };
    const loading = resolveResourceDetailTabs(tableDetailTabs, selection);
    assert.equal(loading.activeTab.id, activeTabId);
    assert.equal(loading.fallback, false);

    const row = resolveResourceDetailTabs(tableDetailTabs, { ...selection, resource: { kind: "relational" } });
    assert.equal(row.activeTab.id, "details");
    assert.equal(row.fallback, true);
    assert.equal(row.tabs.some(tab => ["stats", "updates", "policies"].includes(tab.id)), false);
    assert.equal(selection.activeTabId, activeTabId, "fallback must not overwrite the requested deep link");
  }
});

test("Timescale policies require a time-index table and its advertised capability", () => {
  const timeIndex = { kind: "time_index" };
  for (const capabilities of [undefined, { timescale_policies: false }]) {
    const resolved = resolveResourceDetailTabs(tableDetailTabs, { activeTabId: "policies", resource: { ...timeIndex, capabilities } });
    assert.equal(resolved.activeTab.id, "details");
    assert.equal(resolved.tabs.some(tab => tab.id === "policies"), false);
    assert.equal(resolved.tabs.some(tab => tab.id === "stats"), true);
    assert.equal(resolved.tabs.some(tab => tab.id === "updates"), true);
  }
  const available = resolveResourceDetailTabs(tableDetailTabs, { activeTabId: "policies", resource: { ...timeIndex, capabilities: { timescale_policies: true } } });
  assert.equal(available.activeTab.id, "policies");
  assert.equal(available.fallback, false);
  const row = resolveResourceDetailTabs(tableDetailTabs, { activeTabId: "policies", resource: { kind: "relational", capabilities: { timescale_policies: true } } });
  assert.equal(row.activeTab.id, "details");
});

test("a preserved deep link becomes active again when the record supports it", () => {
  const activeTabId = "policies";
  const unavailable = resolveResourceDetailTabs(tableDetailTabs, { activeTabId, resource: { kind: "time_index" } });
  assert.equal(unavailable.fallback, true);
  const available = resolveResourceDetailTabs(tableDetailTabs, { activeTabId, resource: { kind: "time_index", capabilities: { timescale_policies: true } } });
  assert.equal(available.activeTab.id, activeTabId);
  assert.equal(available.fallback, false);
});

test("namespace, update and DataSource sections have stable defaults and deep links", () => {
  for (const [tabs, defaultId] of [[namespaceDetailTabs, "overview"], [updateDetailTabs, "details"], [sourceDetailTabs, "details"]]) {
    for (const activeTabId of [null, "removed-section"]) {
      const resolved = resolveResourceDetailTabs(tabs, { activeTabId, resource: {} });
      assert.equal(resolved.activeTab.id, defaultId);
      assert.equal(resolved.fallback, activeTabId !== null);
    }
    for (const tab of tabs) {
      const resolved = resolveResourceDetailTabs(tabs, { activeTabId: tab.id, resource: {} });
      assert.equal(resolved.activeTab.id, tab.id);
      assert.equal(resolved.fallback, false);
    }
  }
});

test("removed snapshot deep links resolve to details for every table kind", () => {
  for (const resource of [null, { kind: "row" }, { kind: "time_index" }]) {
    const resolved = resolveResourceDetailTabs(tableDetailTabs, { activeTabId: "data-snapshot", resource });
    assert.equal(resolved.activeTab.id, "details");
    assert.equal(resolved.fallback, true);
    assert.equal(resolved.tabs.some(tab => tab.id === "data-snapshot"), false);
  }
});
