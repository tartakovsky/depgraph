import type { GraphNode, GraphEdge } from "../graph.js";
import { createParser, loadLanguage } from "../parser-loader.js";

let parserInstance: any = null;
let goLang: any = null;

async function getParser() {
  if (!parserInstance) {
    const result = await loadLanguage("tree-sitter-go", "tree-sitter-go.wasm");
    goLang = result.language;
    parserInstance = await createParser(result.backend === "wasm");
  }
  parserInstance.setLanguage(goLang);
  return parserInstance;
}

function extractTypeIdentifier(node: any): string | null {
  if (node.type === "type_identifier") {
    return node.text;
  }
  if (node.type === "pointer_type") {
    // *Foo → Foo
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "type_identifier") {
        return child.text;
      }
    }
  }
  if (node.type === "slice_type" || node.type === "array_type" || node.type === "map_type") {
    // []Foo, [N]Foo, map[K]V — extract element types
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "type_identifier") {
        return child.text;
      }
    }
  }
  if (node.type === "qualified_type") {
    // pkg.Type — take the type part
    const nameNode = node.childForFieldName("name");
    if (nameNode) return nameNode.text;
  }
  return null;
}

function extractAllTypeIdentifiers(node: any): string[] {
  const types: string[] = [];

  function walk(n: any) {
    const id = extractTypeIdentifier(n);
    if (id) {
      types.push(id);
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i));
    }
  }

  walk(node);
  return types;
}

const BUILTIN_TYPES = new Set([
  "string", "int", "int8", "int16", "int32", "int64",
  "uint", "uint8", "uint16", "uint32", "uint64",
  "float32", "float64", "complex64", "complex128",
  "bool", "byte", "rune", "error", "any",
  "uintptr", "comparable",
]);

function isUserType(name: string): boolean {
  return !BUILTIN_TYPES.has(name);
}

function extractStruct(
  nameText: string,
  typeNode: any,
  filePath: string,
  startRow: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({ name: nameText, kind: "class", file: filePath, line: startRow + 1 });

  const fieldList = typeNode.childForFieldName("fields") ??
    findChild(typeNode, "field_declaration_list");
  if (!fieldList) return { nodes, edges };

  for (let i = 0; i < fieldList.childCount; i++) {
    const field = fieldList.child(i);
    if (!field || field.type !== "field_declaration") continue;

    const nameNode = field.childForFieldName("name");
    const typeChild = field.childForFieldName("type");

    if (!nameNode && typeChild) {
      // Embedded type (no name = struct embedding)
      const id = extractTypeIdentifier(typeChild);
      if (id && isUserType(id)) {
        edges.push({ from: nameText, to: id, kind: "extends" });
      }
    } else if (!nameNode && !typeChild) {
      // Embedded pointer type: field_declaration with "*" and type_identifier but no name
      for (let j = 0; j < field.childCount; j++) {
        const c = field.child(j);
        if (c && c.type === "type_identifier") {
          if (isUserType(c.text)) {
            edges.push({ from: nameText, to: c.text, kind: "extends" });
          }
        }
      }
    } else if (nameNode && typeChild) {
      // Named field
      for (const id of extractAllTypeIdentifiers(typeChild)) {
        if (isUserType(id)) {
          edges.push({ from: nameText, to: id, kind: "field_type" });
        }
      }
    }
  }

  return { nodes, edges };
}

function extractInterface(
  nameText: string,
  typeNode: any,
  filePath: string,
  startRow: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({ name: nameText, kind: "interface", file: filePath, line: startRow + 1 });

  for (let i = 0; i < typeNode.childCount; i++) {
    const child = typeNode.child(i);
    if (!child) continue;

    if (child.type === "constraint_elem") {
      // Embedded interface
      for (let j = 0; j < child.childCount; j++) {
        const c = child.child(j);
        if (c && c.type === "type_identifier" && isUserType(c.text)) {
          edges.push({ from: nameText, to: c.text, kind: "extends" });
        }
      }
    }

    if (child.type === "method_spec") {
      extractMethodEdges(child, nameText, edges);
    }
  }

  return { nodes, edges };
}

function extractMethodEdges(method: any, ownerName: string, edges: GraphEdge[]) {
  // Parameters
  const params = method.childForFieldName("parameters");
  if (params) {
    for (let i = 0; i < params.childCount; i++) {
      const param = params.child(i);
      if (!param || param.type !== "parameter_declaration") continue;
      const paramType = param.childForFieldName("type");
      if (paramType) {
        for (const id of extractAllTypeIdentifiers(paramType)) {
          if (isUserType(id)) {
            edges.push({ from: ownerName, to: id, kind: "method_param" });
          }
        }
      }
    }
  }

  // Return type
  const result = method.childForFieldName("result");
  if (result) {
    for (const id of extractAllTypeIdentifiers(result)) {
      if (isUserType(id)) {
        edges.push({ from: ownerName, to: id, kind: "method_return" });
      }
    }
  }
}

function findChild(node: any, type: string): any {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

function getReceiverType(method: any): string | null {
  // First parameter_list is the receiver
  let paramListCount = 0;
  for (let i = 0; i < method.childCount; i++) {
    const child = method.child(i);
    if (child && child.type === "parameter_list") {
      if (paramListCount === 0) {
        // This is the receiver
        for (let j = 0; j < child.childCount; j++) {
          const param = child.child(j);
          if (param && param.type === "parameter_declaration") {
            const t = param.childForFieldName("type");
            if (t) return extractTypeIdentifier(t);
          }
        }
      }
      paramListCount++;
    }
  }
  return null;
}

function parseSource(
  tree: any,
  filePath: string
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const root = tree.rootNode;

  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (!child) continue;

    if (child.type === "type_declaration") {
      // type_declaration contains one or more type_spec children
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j);
        if (!spec || spec.type !== "type_spec") continue;

        const nameNode = spec.childForFieldName("name");
        const typeNode = spec.childForFieldName("type");
        if (!nameNode || !typeNode) continue;

        const name = nameNode.text;

        if (typeNode.type === "struct_type") {
          const result = extractStruct(name, typeNode, filePath, spec.startPosition.row);
          nodes.push(...result.nodes);
          edges.push(...result.edges);
        } else if (typeNode.type === "interface_type") {
          const result = extractInterface(name, typeNode, filePath, spec.startPosition.row);
          nodes.push(...result.nodes);
          edges.push(...result.edges);
        }
        // Skip type aliases (type Foo = Bar), function types, etc.
      }
    }

    if (child.type === "method_declaration") {
      // Method on a struct: func (s *Service) Process(...)
      const receiverType = getReceiverType(child);
      if (receiverType) {
        extractMethodEdges(child, receiverType, edges);
      }
    }
  }

  return { nodes, edges };
}

export async function parseGo(
  source: string,
  filePath: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const parser = await getParser();
  const tree = parser.parse(source);
  return parseSource(tree, filePath);
}

export const GO_EXTENSIONS = [".go"];
