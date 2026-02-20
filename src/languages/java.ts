import type { GraphNode, GraphEdge } from "../graph.js";

import { createParser, loadLanguage } from "../parser-loader.js";

let parserInstance: any = null;
let javaLang: any = null;

async function getParser() {
  if (!parserInstance) {
    const result = await loadLanguage("tree-sitter-java", "tree-sitter-java.wasm");
    javaLang = result.language;
    parserInstance = await createParser(result.backend === "wasm");
  }
  parserInstance.setLanguage(javaLang);
  return parserInstance;
}

function extractTypeIdentifiers(node: any): string[] {
  const types: string[] = [];

  function walk(n: any) {
    if (n.type === "type_identifier") {
      types.push(n.text);
      return;
    }
    if (n.type === "scoped_type_identifier") {
      // Handle qualified names — take the last identifier as the type name
      const nameNode = n.childForFieldName("name");
      if (nameNode) {
        types.push(nameNode.text);
      }
      return;
    }
    if (n.type === "generic_type") {
      // Extract the base type and type arguments
      for (let i = 0; i < n.childCount; i++) {
        walk(n.child(i));
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

function extractClass(
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

  // Superclass
  const superclass = node.childForFieldName("superclass");
  if (superclass) {
    for (const typeId of extractTypeIdentifiers(superclass)) {
      edges.push({ from: name, to: typeId, kind: "extends" });
    }
  }

  // Interfaces
  const interfaces = node.childForFieldName("interfaces");
  if (interfaces) {
    for (const typeId of extractTypeIdentifiers(interfaces)) {
      edges.push({ from: name, to: typeId, kind: "implements" });
    }
  }

  // For interface declarations, check extends
  const extendsClause = node.childForFieldName("extends_interfaces");
  if (extendsClause) {
    for (const typeId of extractTypeIdentifiers(extendsClause)) {
      edges.push({ from: name, to: typeId, kind: "extends" });
    }
  }

  // Body — fields and methods
  const body = node.childForFieldName("body");
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      if (!member) continue;

      if (member.type === "field_declaration") {
        const type = member.childForFieldName("type");
        if (type) {
          for (const typeId of extractTypeIdentifiers(type)) {
            edges.push({ from: name, to: typeId, kind: "field_type" });
          }
        }
      }

      if (
        member.type === "method_declaration" ||
        member.type === "constructor_declaration"
      ) {
        // Return type
        const type = member.childForFieldName("type");
        if (type) {
          for (const typeId of extractTypeIdentifiers(type)) {
            edges.push({ from: name, to: typeId, kind: "method_return" });
          }
        }

        // Parameters
        const params = member.childForFieldName("parameters");
        if (params) {
          for (let j = 0; j < params.childCount; j++) {
            const param = params.child(j);
            if (!param || param.type !== "formal_parameter") continue;
            const paramType = param.childForFieldName("type");
            if (paramType) {
              for (const typeId of extractTypeIdentifiers(paramType)) {
                edges.push({ from: name, to: typeId, kind: "method_param" });
              }
            }
          }
        }
      }
    }
  }

  return { nodes, edges };
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
        const result = extractClass(node, filePath, "class");
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        return;
      }

      case "interface_declaration": {
        const result = extractClass(node, filePath, "interface");
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
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i));
    }
  }

  walk(root);
  return { nodes, edges };
}

export async function parseJava(
  source: string,
  filePath: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const parser = await getParser();
  const tree = parser.parse(source);
  return parseSource(tree, filePath);
}

export const JAVA_EXTENSIONS = [".java"];
