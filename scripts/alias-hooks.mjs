// Node's built-in test runner runs source files directly (no bundler), so
// it doesn't know about tsconfig's "@/*" -> "./src/*" path alias that every
// file in this codebase is written against. This resolve hook teaches
// Node's module loader that one mapping - nothing else - so tests can
// import the same "@/lib/..." specifiers the app itself uses, without
// pulling in a bundler/test-framework dependency just for path aliases.
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC_ROOT = pathToFileURL(`${path.resolve(import.meta.dirname, "../src")}/`).href;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const candidate = new URL(specifier.slice(2), SRC_ROOT).href;
  let lastError;
  for (const ext of EXTENSIONS) {
    try {
      return await nextResolve(candidate + ext, context);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
