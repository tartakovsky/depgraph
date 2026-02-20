# depgraph

Tree-sitter class dependency graph extractor for TypeScript, Java, and Swift.

Scans source code using tree-sitter to extract class/interface/protocol/enum declarations and their relationships (extends, implements, field types, method parameters, return types). Outputs a JSON dependency graph.

## Install

```bash
npm install -g depgraph-cli
```

Or use directly:

```bash
npx depgraph-cli scan ./src
```

## Usage

### Scan a directory

```bash
depgraph scan ./src
depgraph scan ./src -o graph.json
depgraph scan ./src -l ts,java
```

### Diff against previous commit

```bash
depgraph diff .
depgraph diff . --ref HEAD~3
depgraph diff . --json
```

### Pre-commit hook mode

```bash
depgraph hook
```

## How it works

Uses tree-sitter to parse source files and extract:
- **Nodes**: classes, interfaces, protocols, enums, type aliases
- **Edges**: extends, implements, field_type, method_param, method_return

Native tree-sitter bindings are used when available (faster). Falls back to WebAssembly grammars automatically if native bindings can't be built (no C++ compiler).

## Supported languages

- TypeScript / TSX
- Java
- Swift

## License

MIT
