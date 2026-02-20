# depgraph

Extract class dependency graphs from source code using tree-sitter. Supports TypeScript, Java, and Swift.

depgraph parses your codebase and produces a structured JSON graph of types (classes, interfaces, protocols, enums, type aliases) and their relationships (inheritance, field types, method signatures). It also diffs graphs between commits to detect architectural changes.

## Why

- **Feed architecture context to AI agents.** Give coding assistants a compact, structured view of your type hierarchy instead of making them grep through files.
- **Catch architectural drift in CI.** Run `depgraph diff` in pre-commit hooks or CI to surface when someone adds a new dependency between modules.
- **Understand unfamiliar codebases.** Scan a project and immediately see which types depend on which.

## Install

```bash
npm install -g @tartakovsky/depgraph
```

Or run directly:

```bash
npx @tartakovsky/depgraph scan ./src
```

Works without a C++ compiler — native tree-sitter bindings are used when available (faster), with automatic fallback to WebAssembly grammars.

## Usage

### Scan a directory

```bash
depgraph scan ./src
```

Output:

```json
{
  "nodes": [
    { "name": "GraphNode", "kind": "interface", "file": "graph.ts", "line": 1 },
    { "name": "GraphEdge", "kind": "interface", "file": "graph.ts", "line": 8 },
    { "name": "DependencyGraph", "kind": "interface", "file": "graph.ts", "line": 20 },
    { "name": "GraphDiff", "kind": "interface", "file": "diff.ts", "line": 4 }
  ],
  "edges": [
    { "from": "DependencyGraph", "to": "GraphNode", "kind": "field_type" },
    { "from": "DependencyGraph", "to": "GraphEdge", "kind": "field_type" },
    { "from": "GraphDiff", "to": "GraphNode", "kind": "field_type" },
    { "from": "GraphDiff", "to": "GraphEdge", "kind": "field_type" }
  ],
  "scannedAt": "2026-02-20T22:24:28.402Z",
  "commitSha": "a0d8c7e"
}
```

Write to a file:

```bash
depgraph scan ./src -o graph.json
```

Filter by language:

```bash
depgraph scan ./src -l ts        # TypeScript only
depgraph scan ./src -l java      # Java only
depgraph scan ./src -l ts,java   # Both
```

### Diff against a previous commit

```bash
depgraph diff .
```

Output:

```
## Architecture Changes

### New types
+ UserService (class) in src/services/user.ts
+ UserRepository (interface) in src/repos/user.ts

### Removed types
- OldHelper (class) was in src/utils/old.ts

### New dependencies
+ UserService -> UserRepository (field_type)

### Summary
2 type(s) added. 1 type(s) removed. 1 dependency(ies) added.
```

Compare against a specific ref:

```bash
depgraph diff . --ref HEAD~3
depgraph diff . --ref main
```

Get raw JSON instead of formatted text:

```bash
depgraph diff . --json
```

### Pre-commit hook

The `hook` command outputs architecture changes only when they exist, designed for pre-commit hooks that feed context to AI agents:

```bash
depgraph hook
```

Example in a Claude Code hook (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["depgraph hook"]
      }
    ]
  }
}
```

## What it extracts

**Node types:**

| Kind | Languages |
|------|-----------|
| `class` | TypeScript, Java, Swift, Go (structs) |
| `interface` | TypeScript, Java, Go |
| `protocol` | Swift |
| `enum` | TypeScript, Java, Swift |
| `type_alias` | TypeScript |

**Edge types:**

| Kind | Meaning | Example |
|------|---------|---------|
| `extends` | Class/interface inheritance, struct/interface embedding | `class Dog extends Animal`, `type Dog struct { Animal }` |
| `implements` | Interface/protocol conformance | `class User implements Serializable` |
| `field_type` | Type used in a field | `address: Address` |
| `method_param` | Type used as method parameter | `execute(query: Query)` |
| `method_return` | Type used as return type | `getResult(): Result` |

Only edges between types defined in the scanned codebase are included — references to external/stdlib types are filtered out.

## Supported languages

- TypeScript / TSX
- Java
- Swift
- Go

## Requirements

- Node.js >= 18

No C++ compiler needed. Native tree-sitter bindings are optional — if they can't be built, depgraph automatically uses WebAssembly grammars instead (slightly slower, same results).

## License

MIT
