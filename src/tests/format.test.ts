import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatScanSummary, formatDiffSummary } from "../format.js";
import type { DependencyGraph } from "../graph.js";
import type { GraphDiff } from "../diff.js";

function makeGraph(
  nodes: { name: string; kind: string; file: string }[],
  edges: { from: string; to: string; kind: string }[]
): DependencyGraph {
  return {
    nodes: nodes.map((n) => ({ ...n, line: 1 }) as any),
    edges: edges as any,
    scannedAt: new Date().toISOString(),
  };
}

describe("formatScanSummary", () => {
  it("includes type and edge counts", () => {
    const graph = makeGraph(
      [
        { name: "User", kind: "class", file: "user.ts" },
        { name: "Post", kind: "class", file: "post.ts" },
      ],
      [{ from: "Post", to: "User", kind: "field_type" }]
    );
    const output = formatScanSummary(graph);
    assert.ok(output.includes("**2** types"));
    assert.ok(output.includes("**1** dependencies"));
  });

  it("shows most connected types", () => {
    const graph = makeGraph(
      [
        { name: "Hub", kind: "class", file: "hub.ts" },
        { name: "A", kind: "class", file: "a.ts" },
        { name: "B", kind: "class", file: "b.ts" },
      ],
      [
        { from: "Hub", to: "A", kind: "field_type" },
        { from: "Hub", to: "B", kind: "field_type" },
      ]
    );
    const output = formatScanSummary(graph);
    assert.ok(output.includes("**Hub**"));
    assert.ok(output.includes("Most connected types"));
  });

  it("reports orphan count", () => {
    const graph = makeGraph(
      [
        { name: "Connected", kind: "class", file: "a.ts" },
        { name: "Target", kind: "class", file: "b.ts" },
        { name: "Orphan", kind: "interface", file: "c.ts" },
      ],
      [{ from: "Connected", to: "Target", kind: "extends" }]
    );
    const output = formatScanSummary(graph);
    assert.ok(output.includes("1 type with no dependencies"));
  });

  it("shows directory distribution", () => {
    const graph = makeGraph(
      [
        { name: "A", kind: "class", file: "src/models/a.ts" },
        { name: "B", kind: "class", file: "src/models/b.ts" },
        { name: "C", kind: "class", file: "src/services/c.ts" },
      ],
      []
    );
    const output = formatScanSummary(graph);
    assert.ok(output.includes("src/models/"));
  });

  it("handles empty graph", () => {
    const graph = makeGraph([], []);
    const output = formatScanSummary(graph);
    assert.ok(output.includes("**0** types"));
  });
});

describe("formatDiffSummary", () => {
  it("shows before/after/delta stats", () => {
    const before = makeGraph(
      [{ name: "A", kind: "class", file: "a.ts" }],
      []
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class", file: "a.ts" },
        { name: "B", kind: "class", file: "b.ts" },
      ],
      [{ from: "B", to: "A", kind: "extends" }]
    );
    const diff: GraphDiff = {
      addedNodes: [{ name: "B", kind: "class", file: "b.ts", line: 1 }],
      removedNodes: [],
      addedEdges: [{ from: "B", to: "A", kind: "extends" as any }],
      removedEdges: [],
    };
    const output = formatDiffSummary(diff, before, after);
    assert.ok(output.includes("**Before:** 1 types"));
    assert.ok(output.includes("**After:** 2 types"));
    assert.ok(output.includes("+1 types"));
    assert.ok(output.includes("+1 dependencies"));
  });

  it("shows connection count for new types", () => {
    const before = makeGraph(
      [{ name: "A", kind: "class", file: "a.ts" }],
      []
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class", file: "a.ts" },
        { name: "B", kind: "class", file: "b.ts" },
      ],
      [{ from: "B", to: "A", kind: "field_type" }]
    );
    const diff: GraphDiff = {
      addedNodes: [{ name: "B", kind: "class", file: "b.ts", line: 1 }],
      removedNodes: [],
      addedEdges: [{ from: "B", to: "A", kind: "field_type" as any }],
      removedEdges: [],
    };
    const output = formatDiffSummary(diff, before, after);
    assert.ok(output.includes("**B**"));
    assert.ok(output.includes("1 connection"));
  });

  it("shows coupling context for new edges on existing types", () => {
    const before = makeGraph(
      [
        { name: "Svc", kind: "class", file: "svc.ts" },
        { name: "A", kind: "class", file: "a.ts" },
        { name: "B", kind: "class", file: "b.ts" },
      ],
      [{ from: "Svc", to: "A", kind: "field_type" }]
    );
    const after = makeGraph(
      [
        { name: "Svc", kind: "class", file: "svc.ts" },
        { name: "A", kind: "class", file: "a.ts" },
        { name: "B", kind: "class", file: "b.ts" },
      ],
      [
        { from: "Svc", to: "A", kind: "field_type" },
        { from: "Svc", to: "B", kind: "field_type" },
      ]
    );
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      addedEdges: [{ from: "Svc", to: "B", kind: "field_type" as any }],
      removedEdges: [],
    };
    const output = formatDiffSummary(diff, before, after);
    assert.ok(output.includes("Svc now has 2 outgoing deps (was 1)"));
  });

  it("handles empty diff", () => {
    const graph = makeGraph(
      [{ name: "A", kind: "class", file: "a.ts" }],
      []
    );
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      addedEdges: [],
      removedEdges: [],
    };
    const output = formatDiffSummary(diff, graph, graph);
    assert.ok(output.includes("No architectural changes detected."));
  });
});
