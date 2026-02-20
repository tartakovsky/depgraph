import type { GraphNode, GraphEdge } from "../graph.js";

export interface LanguageExtractor {
  extensions: string[];
  parse(source: string, filePath: string): { nodes: GraphNode[]; edges: GraphEdge[] };
}

import { createParser, loadLanguage } from "../parser-loader.js";

// Lazily loaded parser to avoid top-level import issues
let parserInstance: any = null;
let tsLang: any = null;
let tsxLang: any = null;

async function getParser(isTsx: boolean) {
  if (!parserInstance) {
    const tsResult = await loadLanguage("tree-sitter-typescript", "tree-sitter-typescript.wasm", "typescript");
    const tsxResult = await loadLanguage("tree-sitter-typescript", "tree-sitter-tsx.wasm", "tsx");
    tsLang = tsResult.language;
    tsxLang = tsxResult.language;
    parserInstance = await createParser(tsResult.backend === "wasm");
  }
  parserInstance.setLanguage(isTsx ? tsxLang : tsLang);
  return parserInstance;
}

function extractTypeIdentifiers(node: any): string[] {
  const types: string[] = [];

  function walk(n: any) {
    if (n.type === "type_identifier" || n.type === "identifier") {
      types.push(n.text);
      return;
    }
    // Handle qualified names like Outer.Inner
    if (n.type === "nested_type_identifier" || n.type === "member_expression") {
      types.push(n.text);
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i));
    }
  }

  walk(node);
  return types;
}

function extractFromClassOrInterface(
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

  // Heritage clauses (extends / implements)
  // class_heritage wraps extends_clause and/or implements_clause as children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "class_heritage") {
      for (let j = 0; j < child.childCount; j++) {
        const clause = child.child(j);
        if (!clause) continue;
        if (clause.type === "extends_clause") {
          for (const typeId of extractTypeIdentifiers(clause)) {
            edges.push({ from: name, to: typeId, kind: "extends" });
          }
        }
        if (clause.type === "implements_clause") {
          for (const typeId of extractTypeIdentifiers(clause)) {
            edges.push({ from: name, to: typeId, kind: "implements" });
          }
        }
      }
    }

    // Interface extends (extends_type_clause)
    if (child.type === "extends_clause" || child.type === "extends_type_clause") {
      for (const typeId of extractTypeIdentifiers(child)) {
        edges.push({ from: name, to: typeId, kind: "extends" });
      }
    }

    if (child.type === "implements_clause") {
      for (const typeId of extractTypeIdentifiers(child)) {
        edges.push({ from: name, to: typeId, kind: "implements" });
      }
    }
  }

  // Class body — fields and methods
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
      member.type === "public_field_definition" ||
      member.type === "property_definition" ||
      member.type === "field_definition"
    ) {
      const typeAnnotation = member.childForFieldName("type");
      if (typeAnnotation) {
        for (const typeId of extractTypeIdentifiers(typeAnnotation)) {
          edges.push({ from: ownerName, to: typeId, kind: "field_type" });
        }
      }
    }

    if (
      member.type === "method_definition" ||
      member.type === "method_signature"
    ) {
      const params = member.childForFieldName("parameters");
      if (params) {
        for (let j = 0; j < params.childCount; j++) {
          const param = params.child(j);
          if (!param) continue;
          const typeAnnotation = param.childForFieldName("type");
          if (typeAnnotation) {
            for (const typeId of extractTypeIdentifiers(typeAnnotation)) {
              edges.push({
                from: ownerName,
                to: typeId,
                kind: "method_param",
              });
            }
          }
        }
      }

      const returnType = member.childForFieldName("return_type");
      if (returnType) {
        for (const typeId of extractTypeIdentifiers(returnType)) {
          edges.push({
            from: ownerName,
            to: typeId,
            kind: "method_return",
          });
        }
      }
    }

    // Property signatures in interfaces
    if (member.type === "property_signature") {
      const typeAnnotation = member.childForFieldName("type");
      if (typeAnnotation) {
        for (const typeId of extractTypeIdentifiers(typeAnnotation)) {
          edges.push({ from: ownerName, to: typeId, kind: "field_type" });
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
      case "class_declaration":
      case "abstract_class_declaration": {
        const result = extractFromClassOrInterface(node, filePath, "class");
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        return; // Don't walk into class body again
      }

      case "interface_declaration": {
        const result = extractFromClassOrInterface(node, filePath, "interface");
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        return;
      }

      case "type_alias_declaration": {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          const name = nameNode.text;
          nodes.push({
            name,
            kind: "type_alias",
            file: filePath,
            line: node.startPosition.row + 1,
          });
          // Extract type references from the value
          const value = node.childForFieldName("value");
          if (value) {
            for (const typeId of extractTypeIdentifiers(value)) {
              edges.push({ from: name, to: typeId, kind: "extends" });
            }
          }
        }
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

export const typescriptExtractor: LanguageExtractor = {
  extensions: [".ts", ".tsx"],

  parse(source: string, filePath: string) {
    // This will be called after async init
    throw new Error("Use parseAsync instead");
  },
};

export async function parseTypeScript(
  source: string,
  filePath: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const isTsx = filePath.endsWith(".tsx");
  const parser = await getParser(isTsx);
  const tree = parser.parse(source);
  return parseSource(tree, filePath);
}

export const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx"];
