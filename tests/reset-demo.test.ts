import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDemo } from "../amodal/_lib/reset.js";
import { STORE_KEYS, seedRows } from "../amodal/_lib/demo-data.js";
import { assertDeclared } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";

test("removes every row in the four stores before seeding blind, then records the reset", async () => {
  const existing: Record<string, string[]> = { invoices: ["inv_a", "inv_b"], purchase_orders: ["PO-1"], reviews: ["rev_1"], events: ["evt_1", "evt_2", "evt_3"] };
  const calls: Array<[string, Record<string, unknown>]> = [];
  const out = await resetDemo({
    async callTool(name, args) {
      calls.push([name, args]);
      const m = /^store__(\w+)__list$/.exec(name);
      if (!m) return {};
      const field = STORE_KEYS[m[1] as keyof typeof STORE_KEYS];
      return { documents: existing[m[1]].map((k) => ({ payload: { [field]: k } })) };
    },
    now: () => new Date(NOW),
    random: () => 0.5,
  });
  assert.deepEqual(out.removed, { invoices: 2, purchase_orders: 1, reviews: 1, events: 3 });
  assert.equal(out.seeded, seedRows(NOW).invoices.length);
  const names = calls.map(([n]) => n);
  const removes = calls.filter(([n]) => n.endsWith("__remove")).map(([n, a]) => `${n}:${a.key}`);
  assert.deepEqual(removes.sort(), Object.entries(existing).flatMap(([s, ks]) => ks.map((k) => `store__${s}__remove:${k}`)).sort());
  assert.ok(!names.some((n) => n.endsWith("__query")), "the seed runs blind");
  assert.ok(names.lastIndexOf("store__events__remove") < names.indexOf("store__purchase_orders__set"), "every remove precedes the first seed write");
  const sets = calls.filter(([n]) => n.endsWith("__set"));
  const last = sets[sets.length - 1];
  assert.equal(last[0], "store__events__set");
  assert.deepEqual([(last[1].value as { kind: string }).kind, (last[1].value as { actor: string }).actor], ["reset", "system"]);
  assert.equal(sets.filter(([, a]) => (a.value as { kind?: string }).kind === "reset").length, 1);
  assertDeclared("reset_demo", names);
});
