import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nodeKey,
  edgeKey,
  serializeGraph,
  deserializeGraph,
  type GraphNode,
  type GraphEdge,
  type DependencyGraph,
} from "../graph.js";

describe("nodeKey", () => {
  it("combines name and kind", () => {
    const node: GraphNode = {
      name: "UserService",
      kind: "class",
      file: "src/user.ts",
      line: 1,
    };
    assert.equal(nodeKey(node), "UserService:class");
  });

  it("distinguishes same name with different kinds", () => {
    const cls: GraphNode = {
      name: "Foo",
      kind: "class",
      file: "a.ts",
      line: 1,
    };
    const iface: GraphNode = {
      name: "Foo",
      kind: "interface",
      file: "a.ts",
      line: 5,
    };
    assert.notEqual(nodeKey(cls), nodeKey(iface));
  });
});

describe("edgeKey", () => {
  it("combines from, to, and kind", () => {
    const edge: GraphEdge = {
      from: "UserService",
      to: "UserRepository",
      kind: "field_type",
    };
    assert.equal(edgeKey(edge), "UserService->UserRepository:field_type");
  });

  it("distinguishes different edge kinds between same nodes", () => {
    const e1: GraphEdge = {
      from: "A",
      to: "B",
      kind: "extends",
    };
    const e2: GraphEdge = {
      from: "A",
      to: "B",
      kind: "implements",
    };
    assert.notEqual(edgeKey(e1), edgeKey(e2));
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a graph", () => {
    const graph: DependencyGraph = {
      nodes: [
        { name: "Foo", kind: "class", file: "foo.ts", line: 1 },
        { name: "Bar", kind: "interface", file: "bar.ts", line: 10 },
      ],
      edges: [{ from: "Foo", to: "Bar", kind: "implements" }],
      scannedAt: "2026-01-01T00:00:00.000Z",
      commitSha: "abc123",
    };

    const json = serializeGraph(graph);
    const restored = deserializeGraph(json);

    assert.deepEqual(restored, graph);
  });

  it("produces valid JSON", () => {
    const graph: DependencyGraph = {
      nodes: [],
      edges: [],
      scannedAt: "2026-01-01T00:00:00.000Z",
    };

    const json = serializeGraph(graph);
    assert.doesNotThrow(() => JSON.parse(json));
  });
});
