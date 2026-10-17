import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";

export function loadTsx() {
  return registerHooks({
    resolve(name, context, next) {
      if (name.startsWith("@/")) {
        const base = new URL("../../src/" + name.slice(2), import.meta.url);
        for (const extension of [".ts", ".tsx"]) {
          const file = new URL(base.href + extension);
          if (existsSync(file)) return { url: file.href, shortCircuit: true };
        }
      }
      return next(name, context);
    },
    load(url, context, next) {
      if (url.startsWith("file:") && url.endsWith(".tsx") && !url.includes("/node_modules/")) {
        return {
          format: "module",
          shortCircuit: true,
          source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
            compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
          }).outputText,
        };
      }
      return next(url, context);
    },
  });
}
