import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { INVOICES, PURCHASE_ORDERS, invoiceRow, poRow } from "../amodal/_lib/demo-data.js";

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

/** The store tools over one Map: `store__<store>__<get|set|query>`, with the runtime's error envelope for a miss. `seedAt` preloads the demo rows as received then. */
export function fakeStore(seedAt?: string) {
  const store = new Map<string, Record<string, unknown>>();
  if (seedAt) {
    for (const p of PURCHASE_ORDERS) store.set(`purchase_orders:${p.po_number}`, poRow(p, seedAt));
    for (const i of INVOICES) store.set(`invoices:${i.invoice_id}`, invoiceRow(i, seedAt));
  }
  const calls: Array<[string, Record<string, unknown>]> = [];
  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    calls.push([name, args]);
    const m = /^store__(\w+)__(get|set|query)$/.exec(name)!;
    const key = `${m[1]}:${String(args.key)}`;
    if (m[2] === "get") return (store.get(key) ?? { error: "not found" }) as T;
    if (m[2] === "set") {
      store.set(key, args.value as Record<string, unknown>);
      return {} as T;
    }
    const where = (args.where ?? {}) as Record<string, unknown>;
    return {
      documents: [...store.entries()]
        .filter(([k]) => k.startsWith(`${m[1]}:`))
        .map(([, payload]) => ({ payload }))
        .filter(({ payload }) => Object.entries(where).every(([f, v]) => payload[f] === v)),
    } as T;
  }
  return { store, calls, callTool };
}
