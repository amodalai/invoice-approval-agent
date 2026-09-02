import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const usesTools = (tool: string) =>
  (JSON.parse(readFileSync(new URL(`../amodal/tools/${tool}/tool.json`, import.meta.url), "utf8")) as {
    uses: { tools: string[] };
  }).uses.tools;

const exercised = new Map<string, Set<string>>();

/** Assert every store tool a handler called is declared in its tool.json `uses`; undeclared calls fail closed at runtime. */
export function assertDeclared(tool: string, called: Iterable<string>) {
  const names = [...new Set(called)];
  const seen = exercised.get(tool) ?? new Set<string>();
  for (const n of names) seen.add(n);
  exercised.set(tool, seen);
  const undeclared = names.filter((n) => !usesTools(tool).includes(n));
  assert.deepEqual(undeclared, [], `${tool} calls tools its uses.tools does not declare`);
}

/** The other direction, over every run this file passed to `assertDeclared`: a grant no path reaches is a capability the tool should not hold. */
export function assertUsesReachable(tool: string) {
  const seen = exercised.get(tool) ?? new Set<string>();
  const unreachable = usesTools(tool).filter((n) => !seen.has(n));
  assert.deepEqual(unreachable, [], `${tool} declares tools no run reaches`);
}
