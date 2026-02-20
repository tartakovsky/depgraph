# depgraph

Extract class dependency graphs from source code using tree-sitter. Supports TypeScript, Java, Swift, and Go.

depgraph parses your codebase and produces a structured graph of types (classes, interfaces, protocols, enums, type aliases) and their relationships (inheritance, field types, method signatures). Every command outputs readable markdown by default, or raw JSON with `--json`.

## Why

- **Give agents a codebase map.** Feed `depgraph scan` output into an agent's system prompt so it understands your architecture before touching code.
- **Review what agents did to coupling.** Run `depgraph diff` after a work session to see what dependencies were added, removed, and whether coupling increased.
- **Understand unfamiliar codebases.** Scan a project and immediately see which types depend on which, what the hubs are, and how things are distributed.

## Install

```bash
npm install -g @tartakovsky/depgraph
```

Or run directly:

```bash
npx @tartakovsky/depgraph scan ./src
```

No C++ compiler needed — native tree-sitter bindings are used when available (faster), with automatic fallback to WebAssembly grammars.

## Commands

### `depgraph scan <dir>`

Scan a directory and output its dependency graph.

```bash
depgraph scan ./src
```

Default output (markdown summary):

```
## Dependency Graph Summary

**376** types across **210** files, **636** dependencies

**Types:** 141 type_aliases, 117 classes, 114 interfaces, 4 enums
**Edges:** 274 method_param, 150 method_return, 129 field_type, 50 implements, 33 extends

### Most connected types

- **PostgresConfigRepository** (class) — 44 connections (44 out, 0 in) — `infrastructure/persistence/PostgresConfigRepository.java`
- **ConfigRepository** (interface) — 39 connections (12 out, 27 in) — `domain/repository/ConfigRepository.java`
- **BackendClient** (class) — 20 connections (20 out, 0 in) — `web/src/lib/backend-client.ts`

### Most depended-on types

- **ConfigRepository** — used by 15 types: ApplicationConfig, PostgresConfigRepository, ...
- **Platform** — used by 19 types: TransformContext, PostgresReviewItemRepository, ...

### Type distribution

- `web/src/types/` — 102 types
- `web/src/lib/` — 38 types
- `web/src/repositories/` — 31 types

*94 types with no dependencies (standalone).*
```

JSON output:

```bash
depgraph scan ./src --json           # Full JSON graph to stdout
depgraph scan ./src -o graph.json    # Write JSON to file
```

Filter by language:

```bash
depgraph scan ./src -l ts            # TypeScript only
depgraph scan ./src -l java          # Java only
depgraph scan ./src -l ts,java,go    # Multiple
```

### `depgraph diff <dir>`

Show dependency graph changes vs a previous commit.

```bash
depgraph diff .
```

Default output (markdown with coupling context):

```
## Architecture Changes

**Before:** 372 types, 620 dependencies
**After:** 376 types, 636 dependencies
**Delta:** +4 types, +16 dependencies

### New types

+ **UserService** (class) in `src/services/user.ts` — 8 connections
+ **UserRepository** (interface) in `src/repos/user.ts` — 5 connections

### New dependencies

+ UserService → UserRepository (field_type) — UserService now has 8 outgoing deps (was 5)
+ UserService → Config (field_type) — UserService now has 8 outgoing deps (was 5)

### Coupling changes

- **UserService**: 5 → 13 connections (+8)
- **UserRepository**: 0 → 5 connections (+5)

### Summary
2 types added, 2 deps added. Net coupling: +16.
```

Compare against a specific ref:

```bash
depgraph diff . --ref HEAD~3
depgraph diff . --ref main
depgraph diff . --json              # Raw JSON diff
```

### `depgraph hook [dir]`

Same as `diff` but silent when nothing changed — designed for git hooks.

```bash
depgraph hook                       # Compare against HEAD
depgraph hook --ref HEAD~1          # Compare against specific ref
depgraph hook --json                # Raw JSON output
```

## How to use it

### 1. Feed architecture context to an agent

Run `depgraph scan` and paste the output into your agent's context. The agent immediately knows your type hierarchy, coupling hotspots, and module boundaries.

```bash
# Add to system prompt or paste into a session
depgraph scan ./src
```

Or save the JSON for programmatic use:

```bash
depgraph scan ./src -o .depgraph.json
```

### 2. Review coupling after an agent work session

After an agent makes changes, run `diff` to see what it did to your architecture:

```bash
depgraph diff . --ref HEAD~5   # Compare against 5 commits ago
```

The output shows not just what changed, but how it affected coupling — "UserService now has 8 outgoing deps (was 5)" tells you whether the agent over-coupled things.

You can pipe this to a review agent:

```bash
depgraph diff . --ref HEAD~5 | claude "Review these architectural changes. \
  Were any of these couplings unnecessary? Could the same goal have been \
  achieved with fewer dependencies?"
```

### 3. Post-commit hook for continuous awareness

Add to `.claude/settings.json` to surface architecture changes during development:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["depgraph hook"]
      }
    ]
  }
}
```

### 4. CI check

Add to your CI pipeline to track architectural changes in PRs:

```bash
# In CI script
depgraph diff . --ref origin/main
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

- Node.js >= 18 (recommended: Node 22)

## License

MIT
