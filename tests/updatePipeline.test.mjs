import assert from "node:assert/strict";
import test from "node:test";
import { layoutUpdatePipeline, pipelineLineage, pipelineNodeLabel } from "../src/updatePipeline.ts";

const node = (id, kind = "table") => ({ id, uid: id, label: id, kind });
const edge = (source, target, kind = "reads") => ({ source, target, kind });

test("pipeline titles match short table titles while preserving unrelated physical names", () => {
  assert.equal(pipelineNodeLabel({ ...node("uid"), label: "tutorial__daily_return", namespace: "tutorial" }), "daily_return");
  assert.equal(pipelineNodeLabel({ ...node("uid"), label: "other__daily_return", namespace: "tutorial" }), "other__daily_return");
  assert.equal(pipelineNodeLabel({ ...node("uid", "update"), label: "tutorial__producer", namespace: "tutorial" }), "tutorial__producer");
});

test("pipeline layout orders reads, updates, writes and consumers without overlapping branches", () => {
  const nodes = [node("source-a"), node("source-b"), node("producer-a", "update"), node("producer-b", "update"), node("output"), node("consumer", "update"), node("downstream")];
  const edges = [edge("source-a", "producer-a"), edge("source-b", "producer-b"), edge("producer-a", "output", "writes"), edge("producer-b", "output", "writes"), edge("output", "consumer"), edge("consumer", "downstream", "writes")];
  const layout = layoutUpdatePipeline(nodes, edges, "output");
  for (const link of edges) assert.ok(layout.boxes.get(link.source).x < layout.boxes.get(link.target).x);
  for (const a of nodes) for (const b of nodes) {
    if (a.id >= b.id) continue;
    const boxA = layout.boxes.get(a.id), boxB = layout.boxes.get(b.id);
    if (boxA.x === boxB.x) assert.ok(Math.abs(boxA.y - boxB.y) >= boxA.height);
  }
  assert.equal(layout.lanes[2].label, "Output tables");
  assert.equal(layout.lanes[3].label, "Consumer updates");
  assert.deepEqual([...layout.boxes], [...layoutUpdatePipeline([...nodes].reverse(), [...edges].reverse(), "output").boxes]);
});

test("lineage follows only directed ancestors and descendants, excluding sibling producers", () => {
  const edges = [edge("input", "update"), edge("update", "output"), edge("sibling", "output"), edge("output", "consumer")];
  const trace = pipelineLineage("update", edges);
  assert.deepEqual([...trace.upstream], ["input"]);
  assert.deepEqual([...trace.downstream], ["output", "consumer"]);
  assert.ok(!trace.downstream.has("sibling"));
});

test("an update-rooted graph labels its own lane before downstream consumers", () => {
  const nodes = [node("input"), node("producer", "update"), node("output"), node("consumer", "update")];
  const edges = [edge("input", "producer"), edge("producer", "output", "writes"), edge("output", "consumer")];
  const layout = layoutUpdatePipeline(nodes, edges, "producer");
  assert.deepEqual(layout.lanes.map(lane => lane.label), ["Input tables", "Updates", "Downstream tables", "Consumer updates"]);
});

test("empty, isolated and corrupt cyclic graphs keep finite geometry and terminate", () => {
  assert.equal(layoutUpdatePipeline([], [], "none").boxes.size, 0);
  const graph = layoutUpdatePipeline([node("a"), node("b"), node("isolated")], [edge("a", "b"), edge("b", "a"), edge("missing", "a")], "a");
  assert.equal(graph.boxes.size, 3);
  for (const box of graph.boxes.values()) assert.ok(Object.values(box).every(Number.isFinite));
  const trace = pipelineLineage("a", [edge("a", "b"), edge("b", "a")]);
  assert.deepEqual([...trace.upstream], ["b"]);
  assert.deepEqual([...trace.downstream], ["b"]);
});
