import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanDirectory } from "../parse.js";

function makeTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "depgraph-test-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
  return dir;
}

describe("scanDirectory", () => {
  it("scans multiple files and merges results", async () => {
    const dir = makeTempProject({
      "models.ts": `
        class User { name: string = ""; }
        class Post { author: User; }
      `,
      "services.ts": `
        class UserService { user: User; }
      `,
    });

    const graph = await scanDirectory(dir);
    const names = graph.nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["Post", "User", "UserService"]);

    // Post -> User (field_type) should exist
    const postEdge = graph.edges.find(
      (e) => e.from === "Post" && e.to === "User"
    );
    assert.ok(postEdge, "Should have cross-file edge Post -> User");
  });

  it("deduplicates nodes with the same name", async () => {
    // Same class name in two files — should keep first occurrence only
    const dir = makeTempProject({
      "a.ts": `class Config { x: number = 0; }`,
      "b.ts": `class Config { y: string = ""; }`,
    });

    const graph = await scanDirectory(dir);
    const configs = graph.nodes.filter((n) => n.name === "Config");
    assert.equal(configs.length, 1, "Should deduplicate by name");
  });

  it("filters edges to types not in the scanned codebase", async () => {
    // Logger is referenced but not defined — edge should be filtered
    const dir = makeTempProject({
      "app.ts": `
        class App {
          logger: Logger;
          config: Config;
        }
        class Config {}
      `,
    });

    const graph = await scanDirectory(dir);
    const loggerEdge = graph.edges.find((e) => e.to === "Logger");
    assert.equal(loggerEdge, undefined, "Should filter edge to undefined type Logger");

    const configEdge = graph.edges.find((e) => e.to === "Config");
    assert.ok(configEdge, "Should keep edge to defined type Config");
  });

  it("filters self-referential edges", async () => {
    const dir = makeTempProject({
      "tree.ts": `
        class TreeNode {
          children: TreeNode[] = [];
        }
      `,
    });

    const graph = await scanDirectory(dir);
    const selfEdge = graph.edges.find(
      (e) => e.from === "TreeNode" && e.to === "TreeNode"
    );
    assert.equal(selfEdge, undefined, "Should filter self-referential edges");
  });

  it("deduplicates identical edges", async () => {
    const dir = makeTempProject({
      "svc.ts": `
        class Query {}
        class Service {
          run(a: Query, b: Query): Query { return a; }
        }
      `,
    });

    const graph = await scanDirectory(dir);
    const queryEdges = graph.edges.filter(
      (e) => e.from === "Service" && e.to === "Query" && e.kind === "method_param"
    );
    // Two params of same type should produce only one edge after dedup
    assert.equal(queryEdges.length, 1, "Should deduplicate identical edges");
  });

  it("respects language filter", async () => {
    const dir = makeTempProject({
      "model.ts": `class TsModel {}`,
      "Model.java": `class JavaModel {}`,
    });

    const tsOnly = await scanDirectory(dir, { languages: ["ts"] });
    assert.equal(tsOnly.nodes.length, 1);
    assert.equal(tsOnly.nodes[0].name, "TsModel");

    const javaOnly = await scanDirectory(dir, { languages: ["java"] });
    assert.equal(javaOnly.nodes.length, 1);
    assert.equal(javaOnly.nodes[0].name, "JavaModel");
  });

  it("skips files that fail to parse without crashing", async () => {
    const dir = makeTempProject({
      "good.ts": `class Valid {}`,
      // Binary garbage that tree-sitter will choke on or produce empty results
      "bad.ts": `\x00\x01\x02\x03`,
    });

    const graph = await scanDirectory(dir);
    // Should still get the valid class
    const valid = graph.nodes.find((n) => n.name === "Valid");
    assert.ok(valid, "Should parse good files even when bad files exist");
  });

  it("ignores node_modules and dist directories", async () => {
    const dir = makeTempProject({
      "src/app.ts": `class App {}`,
      "node_modules/dep/index.ts": `class Dependency {}`,
      "dist/app.ts": `class CompiledApp {}`,
    });

    const graph = await scanDirectory(dir);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].name, "App");
  });
});
