import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

export type Element = { type: string | ((props: any) => Element); props: Record<string, any> };

const jsx = (type: Element["type"], props: Element["props"]) => ({ type, props });
export const jsxRuntime = { jsx, jsxs: jsx };

export function hooks() {
  const state: any[] = [];
  let cursor = 0;
  return {
    reset() { cursor = 0; },
    react: {
      useState(initial: any) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (value: any) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        }];
      },
    },
  };
}

export function loadUI(path: URL, modules: Record<string, unknown>): Record<string, (...args: any[]) => any> {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name: string) => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

export function walk(node: unknown, renderComponents = false): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => walk(child, renderComponents));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  if (renderComponents && typeof element.type === "function") return walk(element.type(element.props), true);
  return [element, ...walk(element.props.children, renderComponents)];
}
