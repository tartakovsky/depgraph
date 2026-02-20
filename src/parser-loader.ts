import { createRequire } from "node:module";

type Backend = "native" | "wasm";

let detectedBackend: Backend | null = null;
let nativeTreeSitter: any = null;
let WasmParser: any = null;
let WasmLanguage: any = null;
let wasmInitialized = false;

async function detectBackend(): Promise<Backend> {
  if (detectedBackend) return detectedBackend;

  try {
    const pkg = "tree-sitter";
    nativeTreeSitter = (await import(/* webpackIgnore: true */ pkg)).default;
    detectedBackend = "native";
  } catch {
    detectedBackend = "wasm";
  }

  return detectedBackend;
}

async function initWasm(): Promise<void> {
  if (wasmInitialized) return;

  const mod = await import("web-tree-sitter");
  WasmParser = mod.Parser;
  WasmLanguage = mod.Language;
  await WasmParser.init();
  wasmInitialized = true;
}

/**
 * Create a parser instance. If useWasm is true, forces WASM backend
 * regardless of whether native tree-sitter is available.
 */
export async function createParser(useWasm?: boolean): Promise<any> {
  const backend = await detectBackend();

  if (backend === "native" && !useWasm) {
    return new nativeTreeSitter();
  }

  await initWasm();
  return new WasmParser();
}

/**
 * Load a language grammar. Tries native first (if available), falls back to WASM.
 * Returns { language, backend } so callers know which parser type to use.
 */
export async function loadLanguage(
  nativePackage: string,
  wasmFileName: string,
  nativeSubExport?: string
): Promise<{ language: any; backend: Backend }> {
  const backend = await detectBackend();

  if (backend === "native") {
    try {
      const mod = await import(nativePackage);
      const resolved = mod.default ?? mod;
      const language = nativeSubExport ? resolved[nativeSubExport] : resolved;
      return { language, backend: "native" };
    } catch {
      // Native grammar package not available, fall back to WASM
    }
  }

  // WASM path: resolve .wasm file from tree-sitter-wasms package
  await initWasm();
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve(`tree-sitter-wasms/out/${wasmFileName}`);
  const language = await WasmLanguage.load(wasmPath);
  return { language, backend: "wasm" };
}

export async function getBackend(): Promise<Backend> {
  return detectBackend();
}
