import type { DependencyGraph, GraphNode, GraphEdge } from "./graph.js";
import { nodeKey, edgeKey } from "./graph.js";

export interface GraphDiff {
  addedNodes: GraphNode[];
  removedNodes: GraphNode[];
  addedEdges: GraphEdge[];
  removedEdges: GraphEdge[];
}

export function diffGraphs(
  before: DependencyGraph,
  after: DependencyGraph
): GraphDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [nodeKey(n), n]));
  const afterNodes = new Map(after.nodes.map((n) => [nodeKey(n), n]));

  const beforeEdges = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const afterEdges = new Map(after.edges.map((e) => [edgeKey(e), e]));

  const addedNodes: GraphNode[] = [];
  const removedNodes: GraphNode[] = [];
  const addedEdges: GraphEdge[] = [];
  const removedEdges: GraphEdge[] = [];

  for (const [key, node] of afterNodes) {
    if (!beforeNodes.has(key)) {
      addedNodes.push(node);
    }
  }

  for (const [key, node] of beforeNodes) {
    if (!afterNodes.has(key)) {
      removedNodes.push(node);
    }
  }

  for (const [key, edge] of afterEdges) {
    if (!beforeEdges.has(key)) {
      addedEdges.push(edge);
    }
  }

  for (const [key, edge] of beforeEdges) {
    if (!afterEdges.has(key)) {
      removedEdges.push(edge);
    }
  }

  return { addedNodes, removedNodes, addedEdges, removedEdges };
}

export function isDiffEmpty(diff: GraphDiff): boolean {
  return (
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.addedEdges.length === 0 &&
    diff.removedEdges.length === 0
  );
}
