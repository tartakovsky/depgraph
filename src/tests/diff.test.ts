import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffGraphs, isDiffEmpty } from "../diff.js";
import type { DependencyGraph } from "../graph.js";

function makeGraph(
  nodes: Array<{ name: string; kind: "class" | "interface" }>,
  edges: Array<{ from: string; to: string; kind: "extends" | "field_type" }>
): DependencyGraph {
  return {
    nodes: nodes.map((n) => ({ ...n, file: "test.ts", line: 1 })),
    edges,
    scannedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("diffGraphs", () => {
  it("detects added nodes", () => {
    const before = makeGraph(
      [{ name: "A", kind: "class" }],
      []
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      []
    );

    const diff = diffGraphs(before, after);
    assert.equal(diff.addedNodes.length, 1);
    assert.equal(diff.addedNodes[0].name, "B");
    assert.equal(diff.removedNodes.length, 0);
  });

  it("detects removed nodes", () => {
    const before = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      []
    );
    const after = makeGraph(
      [{ name: "A", kind: "class" }],
      []
    );

    const diff = diffGraphs(before, after);
    assert.equal(diff.removedNodes.length, 1);
    assert.equal(diff.removedNodes[0].name, "B");
    assert.equal(diff.addedNodes.length, 0);
  });

  it("detects added edges", () => {
    const before = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      []
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      [{ from: "A", to: "B", kind: "extends" }]
    );

    const diff = diffGraphs(before, after);
    assert.equal(diff.addedEdges.length, 1);
    assert.equal(diff.addedEdges[0].from, "A");
    assert.equal(diff.addedEdges[0].to, "B");
  });

  it("detects removed edges", () => {
    const before = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      [{ from: "A", to: "B", kind: "extends" }]
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      []
    );

    const diff = diffGraphs(before, after);
    assert.equal(diff.removedEdges.length, 1);
    assert.equal(diff.removedEdges[0].from, "A");
  });

  it("returns empty diff for identical graphs", () => {
    const graph = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "interface" },
      ],
      [{ from: "A", to: "B", kind: "field_type" }]
    );

    const diff = diffGraphs(graph, graph);
    assert.equal(diff.addedNodes.length, 0);
    assert.equal(diff.removedNodes.length, 0);
    assert.equal(diff.addedEdges.length, 0);
    assert.equal(diff.removedEdges.length, 0);
  });

  it("detects edge kind changes as add+remove", () => {
    const before = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      [{ from: "A", to: "B", kind: "extends" }]
    );
    const after = makeGraph(
      [
        { name: "A", kind: "class" },
        { name: "B", kind: "class" },
      ],
      [{ from: "A", to: "B", kind: "field_type" }]
    );

    const diff = diffGraphs(before, after);
    assert.equal(diff.addedEdges.length, 1);
    assert.equal(diff.removedEdges.length, 1);
    assert.equal(diff.addedEdges[0].kind, "field_type");
    assert.equal(diff.removedEdges[0].kind, "extends");
  });
});

describe("isDiffEmpty", () => {
  it("returns true for empty diff", () => {
    assert.equal(
      isDiffEmpty({
        addedNodes: [],
        removedNodes: [],
        addedEdges: [],
        removedEdges: [],
      }),
      true
    );
  });

  it("returns false when there are added nodes", () => {
    assert.equal(
      isDiffEmpty({
        addedNodes: [{ name: "X", kind: "class", file: "x.ts", line: 1 }],
        removedNodes: [],
        addedEdges: [],
        removedEdges: [],
      }),
      false
    );
  });
});
