# Extract depgraph into standalone GitHub repo

**Date:** 2026-02-20 22:22
**Scope:** All files — new standalone repo

## Summary
Extracted depgraph from kb monorepo (`packages/depgraph/`) into standalone GitHub repo `tartakovsky/depgraph`, publishable as `depgraph-cli` on npm. Added WASM fallback via `parser-loader.ts` so native tree-sitter bindings are optional.

## Context & Problem
depgraph was embedded in the kb monorepo with hard dependency on native tree-sitter. Needed to be a standalone, npm-publishable package that works without a C++ compiler.

## Decisions Made

### Package naming
- **Chose:** npm name `depgraph-cli`, binary `depgraph`
- **Why:** `depgraph` was taken on npm; `depgraph-cli` is available and the binary still installs as `depgraph`

### Native + WASM fallback architecture
- **Chose:** `parser-loader.ts` that detects native tree-sitter at runtime, falls back to web-tree-sitter + WASM grammars per-language
- **Why:** Some environments can't compile native addons. Per-language fallback handles cases where only some native grammars install (e.g. tree-sitter-swift failed to build on this machine)
- **Alternatives considered:**
  - WASM-only — rejected, native is 5-10x faster
  - Separate packages for native/WASM — rejected, too complex for users

### Dependency strategy
- **Chose:** `web-tree-sitter` as regular dep, all native `tree-sitter*` and `tree-sitter-wasms` as `optionalDependencies`
- **Why:** WASM always installs (pure JS), native tries but gracefully skips on failure

### tree-sitter version pinning
- **Chose:** `tree-sitter@^0.21.1`, `tree-sitter-swift@^0.6.0`, `tree-sitter-java@^0.23.4`
- **Why:** Peer dependency conflicts — swift 0.7.x wants tree-sitter ^0.22.x while java/typescript want ^0.21.x. Using 0.6.0 for swift aligns all on ^0.21.1

### Node.js version support
- **Chose:** Node 18/20/22 in CI, not 24
- **Why:** Node 24 has a V8 Turboshaft bug that OOMs on large WASM modules (swift grammar). All 48 tests pass on Node 22.

## Architectural Notes
- `parser-loader.ts` is the single abstraction point — language files call `createParser()` and `loadLanguage()` without knowing the backend
- `loadLanguage()` returns `{ language, backend }` so the caller can create the matching parser type (native parser for native language, WASM parser for WASM language)
- Per-language fallback: if native grammar import fails, that specific language falls back to WASM while others may still use native

## Information Sources
- Existing code in `packages/depgraph/` in kb monorepo
- npm registry for package availability and peer dependency constraints
- web-tree-sitter 0.25 API: uses named exports (`Parser`, `Language`), not default export

## Key Files for Context
- `src/parser-loader.ts` — native/WASM abstraction layer
- `src/languages/typescript.ts` — example of language file using parser-loader
- `package.json` — dependency structure with optional native deps
- `.github/workflows/ci.yml` — CI with WASM-only test job

## Next Steps / Continuation Plan
1. Push to GitHub `tartakovsky/depgraph`
2. Verify CI passes on GitHub Actions
3. Set up NPM_TOKEN secret for publish workflow
4. Test `npx depgraph-cli scan` on a real project
