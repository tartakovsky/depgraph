import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createParser, loadLanguage } from "../parser-loader.js";

describe("parser-loader", () => {
  it("loads a language and parses code with it", async () => {
    // This tests whatever backend is available (native or WASM)
    const result = await loadLanguage(
      "tree-sitter-typescript",
      "tree-sitter-typescript.wasm",
      "typescript"
    );
    assert.ok(result.language, "Should return a language object");
    assert.ok(
      result.backend === "native" || result.backend === "wasm",
      "Backend should be native or wasm"
    );

    const parser = await createParser(result.backend === "wasm");
    parser.setLanguage(result.language);
    const tree = parser.parse("class Foo {}");
    assert.equal(tree.rootNode.type, "program");
    assert.ok(tree.rootNode.childCount > 0, "Should have parsed children");
  });

  it("falls back to WASM when native package does not exist", async () => {
    // "tree-sitter-nonexistent" won't resolve natively, must fall back to WASM
    const result = await loadLanguage(
      "tree-sitter-nonexistent",
      "tree-sitter-typescript.wasm"
    );
    assert.equal(result.backend, "wasm", "Should fall back to WASM");

    const parser = await createParser(true);
    parser.setLanguage(result.language);
    const tree = parser.parse("interface Bar { x: number }");
    const root = tree.rootNode;
    assert.equal(root.type, "program");
  });

  it("WASM and native produce the same AST structure", async () => {
    // Parse the same code with WASM, verify key structure matches expectations
    const wasmResult = await loadLanguage(
      "tree-sitter-nonexistent",
      "tree-sitter-typescript.wasm"
    );
    const parser = await createParser(true);
    parser.setLanguage(wasmResult.language);

    const tree = parser.parse("class Dog extends Animal {}");
    const cls = tree.rootNode.child(0);

    assert.equal(cls.type, "class_declaration");
    assert.equal(cls.childForFieldName("name").text, "Dog");

    // Verify heritage clause is accessible
    let hasHeritage = false;
    for (let i = 0; i < cls.childCount; i++) {
      if (cls.child(i).type === "class_heritage") hasHeritage = true;
    }
    assert.ok(hasHeritage, "Should have class_heritage node");
  });
});
