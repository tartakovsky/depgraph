export interface GraphNode {
  name: string;
  kind: "class" | "interface" | "protocol" | "enum" | "type_alias";
  file: string;
  line: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind:
    | "extends"
    | "implements"
    | "field_type"
    | "method_param"
    | "method_return"
    | "import";
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  scannedAt: string;
  commitSha?: string;
}

export function serializeGraph(graph: DependencyGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function deserializeGraph(json: string): DependencyGraph {
  return JSON.parse(json) as DependencyGraph;
}

export function nodeKey(node: GraphNode): string {
  return `${node.name}:${node.kind}`;
}

export function edgeKey(edge: GraphEdge): string {
  return `${edge.from}->${edge.to}:${edge.kind}`;
}
