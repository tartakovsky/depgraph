import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { glob } from "glob";
import type { DependencyGraph, GraphNode, GraphEdge } from "./graph.js";
import { edgeKey } from "./graph.js";
import { parseTypeScript, TYPESCRIPT_EXTENSIONS } from "./languages/typescript.js";
import { parseJava, JAVA_EXTENSIONS } from "./languages/java.js";
import { parseSwift, SWIFT_EXTENSIONS } from "./languages/swift.js";

type ParseFn = (source: string, filePath: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;

interface LanguageEntry {
  extensions: string[];
  parse: ParseFn;
}

const LANGUAGES: LanguageEntry[] = [
  { extensions: TYPESCRIPT_EXTENSIONS, parse: parseTypeScript },
  { extensions: JAVA_EXTENSIONS, parse: parseJava },
  { extensions: SWIFT_EXTENSIONS, parse: parseSwift },
];

function getParserForFile(filePath: string): ParseFn | null {
  for (const lang of LANGUAGES) {
    if (lang.extensions.some((ext) => filePath.endsWith(ext))) {
      return lang.parse;
    }
  }
  return null;
}

function getAllExtensions(): string[] {
  return LANGUAGES.flatMap((l) => l.extensions);
}

function getCommitSha(dir: string): string | undefined {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return undefined;
  }
}

export async function scanDirectory(
  dir: string,
  options: { languages?: string[] } = {}
): Promise<DependencyGraph> {
  const absDir = resolve(dir);
  const extensions = options.languages
    ? LANGUAGES.filter((l) =>
        options.languages!.some((lang) =>
          l.extensions.some((ext) => ext.includes(lang))
        )
      ).flatMap((l) => l.extensions)
    : getAllExtensions();

  const patterns = extensions.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: absDir,
    nodir: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
  });

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];

  for (const file of files) {
    const absFile = resolve(absDir, file);
    const relFile = relative(absDir, absFile);
    const parser = getParserForFile(file);
    if (!parser) continue;

    try {
      const source = readFileSync(absFile, "utf-8");
      const { nodes, edges } = await parser(source, relFile);
      allNodes.push(...nodes);
      allEdges.push(...edges);
    } catch (err) {
      // Skip files that fail to parse
      console.error(`Warning: Failed to parse ${relFile}: ${err}`);
    }
  }

  return filterAndDedupe(allNodes, allEdges, absDir);
}

function getGitRoot(dir: string): string {
  return execSync("git rev-parse --show-toplevel", {
    cwd: dir,
    encoding: "utf-8",
  }).trim();
}

export async function scanFromGit(
  dir: string,
  ref: string = "HEAD~1"
): Promise<DependencyGraph> {
  const absDir = resolve(dir);
  const extensions = getAllExtensions();

  // Resolve paths relative to git repo root
  let gitRoot: string;
  try {
    gitRoot = getGitRoot(absDir);
  } catch {
    return { nodes: [], edges: [], scannedAt: new Date().toISOString() };
  }

  const dirPrefix = relative(gitRoot, absDir);
  const prefixWithSlash = dirPrefix ? dirPrefix + "/" : "";

  // Get list of files at the given ref
  let fileList: string[];
  try {
    const output = execSync(`git ls-tree -r --name-only ${ref}`, {
      cwd: gitRoot,
      encoding: "utf-8",
    });
    fileList = output
      .trim()
      .split("\n")
      .filter(
        (f) =>
          f.startsWith(prefixWithSlash) &&
          extensions.some((ext) => f.endsWith(ext)) &&
          !f.includes("node_modules/") &&
          !f.includes("dist/") &&
          !f.includes("build/")
      );
  } catch {
    // If ref doesn't exist (e.g., first commit), return empty graph
    return {
      nodes: [],
      edges: [],
      scannedAt: new Date().toISOString(),
    };
  }

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];

  for (const file of fileList) {
    const parser = getParserForFile(file);
    if (!parser) continue;

    try {
      const source = execSync(`git show ${ref}:${file}`, {
        cwd: gitRoot,
        encoding: "utf-8",
      });
      // Use path relative to scanned dir for consistency with scanDirectory
      const relFile = dirPrefix ? relative(dirPrefix, file) : file;
      const { nodes, edges } = await parser(source, relFile);
      allNodes.push(...nodes);
      allEdges.push(...edges);
    } catch {
      // Skip files that fail to parse or don't exist at that ref
    }
  }

  let commitSha: string | undefined;
  try {
    commitSha = execSync(`git rev-parse ${ref}`, {
      cwd: gitRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    // ignore
  }

  return filterAndDedupe(allNodes, allEdges, absDir, commitSha);
}

function filterAndDedupe(
  allNodes: GraphNode[],
  allEdges: GraphEdge[],
  dir: string,
  commitSha?: string
): DependencyGraph {
  // Deduplicate nodes by name (keep first occurrence)
  const nodeMap = new Map<string, GraphNode>();
  for (const node of allNodes) {
    if (!nodeMap.has(node.name)) {
      nodeMap.set(node.name, node);
    }
  }
  const nodes = Array.from(nodeMap.values());
  const nodeNames = new Set(nodes.map((n) => n.name));

  // Filter edges: only keep edges where both from and to exist as nodes
  // This removes references to external/stdlib types
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const edge of allEdges) {
    if (!nodeNames.has(edge.from) || !nodeNames.has(edge.to)) continue;
    if (edge.from === edge.to) continue; // Skip self-references

    const key = edgeKey(edge);
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push(edge);
    }
  }

  return {
    nodes,
    edges,
    scannedAt: new Date().toISOString(),
    commitSha: commitSha ?? getCommitSha(dir),
  };
}
