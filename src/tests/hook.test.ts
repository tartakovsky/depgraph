import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDiffForAgent } from "../hook.js";
import type { GraphDiff } from "../diff.js";

describe("formatDiffForAgent", () => {
  it("formats added nodes", () => {
    const diff: GraphDiff = {
      addedNodes: [
        { name: "UserService", kind: "class", file: "src/user.ts", line: 5 },
      ],
      removedNodes: [],
      addedEdges: [],
      removedEdges: [],
    };

    const output = formatDiffForAgent(diff);
    assert.ok(output.includes("## Architecture Changes"));
    assert.ok(output.includes("### New types"));
    assert.ok(output.includes("+ UserService (class) in src/user.ts"));
    assert.ok(output.includes("1 type(s) added"));
  });

  it("formats removed nodes", () => {
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [
        { name: "OldHelper", kind: "class", file: "src/old.ts", line: 1 },
      ],
      addedEdges: [],
      removedEdges: [],
    };

    const output = formatDiffForAgent(diff);
    assert.ok(output.includes("### Removed types"));
    assert.ok(output.includes("- OldHelper (class) was in src/old.ts"));
    assert.ok(output.includes("1 type(s) removed"));
  });

  it("formats added and removed edges", () => {
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      addedEdges: [
        { from: "A", to: "B", kind: "extends" },
      ],
      removedEdges: [
        { from: "C", to: "D", kind: "field_type" },
      ],
    };

    const output = formatDiffForAgent(diff);
    assert.ok(output.includes("### New dependencies"));
    assert.ok(output.includes("+ A -> B (extends)"));
    assert.ok(output.includes("### Removed dependencies"));
    assert.ok(output.includes("- C -> D (field_type)"));
  });

  it("shows no changes message for empty diff", () => {
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      addedEdges: [],
      removedEdges: [],
    };

    const output = formatDiffForAgent(diff);
    assert.ok(output.includes("No architectural changes detected."));
  });

  it("formats full summary line with all change types", () => {
    const diff: GraphDiff = {
      addedNodes: [
        { name: "X", kind: "class", file: "x.ts", line: 1 },
        { name: "Y", kind: "interface", file: "y.ts", line: 1 },
      ],
      removedNodes: [
        { name: "Z", kind: "class", file: "z.ts", line: 1 },
      ],
      addedEdges: [
        { from: "X", to: "Y", kind: "extends" },
      ],
      removedEdges: [
        { from: "Z", to: "X", kind: "field_type" },
      ],
    };

    const output = formatDiffForAgent(diff);
    assert.ok(output.includes("2 type(s) added"));
    assert.ok(output.includes("1 type(s) removed"));
    assert.ok(output.includes("1 dependency(ies) added"));
    assert.ok(output.includes("1 dependency(ies) removed"));
  });
});
