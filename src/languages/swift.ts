import type { GraphNode, GraphEdge } from "../graph.js";

import { createParser, loadLanguage } from "../parser-loader.js";

let parserInstance: any = null;
let swiftLang: any = null;

async function getParser() {
  if (!parserInstance) {
    const result = await loadLanguage("tree-sitter-swift", "tree-sitter-swift.wasm");
    swiftLang = result.language;
    parserInstance = await createParser(result.backend === "wasm");
  }
  parserInstance.setLanguage(swiftLang);
  return parserInstance;
}

function extractTypeIdentifiers(node: any): string[] {
  const types: string[] = [];

  function walk(n: any) {
    if (n.type === "user_type" || n.type === "type_identifier") {
      // Get the simple name (first type_identifier child or the node itself)
      const nameChild = n.childForFieldName("name");
      if (nameChild) {
        types.push(nameChild.text);
      } else if (n.type === "type_identifier") {
        types.push(n.text);
      } else {
        // user_type without a name field — look for type_identifier children
        for (let i = 0; i < n.childCount; i++) {
          const child = n.child(i);
          if (child && child.type === "type_identifier") {
            types.push(child.text);
            break;
          }
        }
      }
      // Also walk into type arguments for generics
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child && child.type === "type_arguments") {
          walk(child);
        }
      }
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i));
    }
  }

  walk(node);
  return types;
}

function extractDeclaration(
  node: any,
  filePath: string,
  kind: GraphNode["kind"]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const nameNode = node.childForFieldName("name");
  if (!nameNode) return { nodes, edges };

  const name = nameNode.text;
  nodes.push({ name, kind, file: filePath, line: node.startPosition.row + 1 });

  // Inheritance clause
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (
      child.type === "type_inheritance_clause" ||
      child.type === "inheritance_specifier"
    ) {
      for (const typeId of extractTypeIdentifiers(child)) {
        const edgeKind = kind === "protocol" ? "extends" : "implements";
        edges.push({ from: name, to: typeId, kind: edgeKind });
      }
    }
  }

  // Body — properties and methods
  const body = node.childForFieldName("body");
  if (body) {
    extractBodyMembers(body, name, edges);
  }

  return { nodes, edges };
}

function extractBodyMembers(body: any, ownerName: string, edges: GraphEdge[]) {
  for (let i = 0; i < body.childCount; i++) {
    const member = body.child(i);
    if (!member) continue;

    if (
      member.type === "property_declaration" ||
      member.type === "variable_declaration"
    ) {
      // Look for type annotation
      const typeAnnotation = member.childForFieldName("type");
      if (typeAnnotation) {
        for (const typeId of extractTypeIdentifiers(typeAnnotation)) {
          edges.push({ from: ownerName, to: typeId, kind: "field_type" });
        }
      }
      // Also check for pattern bindings with type annotations
      for (let j = 0; j < member.childCount; j++) {
        const child = member.child(j);
        if (child && child.type === "pattern_binding") {
          const ta = child.childForFieldName("type");
          if (ta) {
            for (const typeId of extractTypeIdentifiers(ta)) {
              edges.push({ from: ownerName, to: typeId, kind: "field_type" });
            }
          }
        }
      }
    }

    if (member.type === "function_declaration") {
      // Return type
      const returnType = member.childForFieldName("return_type");
      if (returnType) {
        for (const typeId of extractTypeIdentifiers(returnType)) {
          edges.push({ from: ownerName, to: typeId, kind: "method_return" });
        }
      }

      // Parameters
      const params = member.childForFieldName("parameters");
      if (params) {
        for (let j = 0; j < params.childCount; j++) {
          const param = params.child(j);
          if (!param) continue;
          const paramType = param.childForFieldName("type");
          if (paramType) {
            for (const typeId of extractTypeIdentifiers(paramType)) {
              edges.push({
                from: ownerName,
                to: typeId,
                kind: "method_param",
              });
            }
          }
        }
      }
    }
  }
}

function parseSource(
  tree: any,
  filePath: string
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const root = tree.rootNode;

  function walk(node: any) {
    switch (node.type) {
      case "class_declaration": {
        // Swift grammar uses class_declaration for both class and enum
        // Detect by checking for "enum" keyword child
        let kind: GraphNode["kind"] = "class";
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && !child.isNamed && child.text === "enum") {
            kind = "enum";
            break;
          }
        }
        if (kind === "enum") {
          const nameNode = node.childForFieldName("name");
          if (nameNode) {
            nodes.push({
              name: nameNode.text,
              kind: "enum",
              file: filePath,
              line: node.startPosition.row + 1,
            });
          }
          return;
        }
        const result = extractDeclaration(node, filePath, "class");
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        return;
      }

      case "protocol_declaration": {
        const result = extractDeclaration(node, filePath, "protocol");
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        return;
      }

      case "enum_declaration": {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          nodes.push({
            name: nameNode.text,
            kind: "enum",
            file: filePath,
            line: node.startPosition.row + 1,
          });
        }
        return;
      }

      // Handle extensions — they add conformances to existing types
      case "extension_declaration": {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          const name = nameNode.text;
          // Extract protocol conformances from the extension
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (
              child &&
              (child.type === "type_inheritance_clause" ||
                child.type === "inheritance_specifier")
            ) {
              for (const typeId of extractTypeIdentifiers(child)) {
                edges.push({ from: name, to: typeId, kind: "implements" });
              }
            }
          }
        }
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i));
    }
  }

  walk(root);
  return { nodes, edges };
}

export async function parseSwift(
  source: string,
  filePath: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const parser = await getParser();
  const tree = parser.parse(source);
  return parseSource(tree, filePath);
}

export const SWIFT_EXTENSIONS = [".swift"];
