import { test } from "node:test";
import assert from "node:assert/strict";
import review_invoice from "../amodal/tools/review_invoice/handler.js";
import { INVOICES, PURCHASE_ORDERS, invoiceRow, poRow } from "../amodal/_lib/demo-data.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";

const NOW = "2026-09-01T12:00:00.000Z";
const REPLY = JSON.stringify({ recommendation: "approve", summary: "Fine.", checks: [], issues: [] });

function fakeCtx() {
  const store = new Map<string, Record<string, unknown>>();
  for (const p of PURCHASE_ORDERS) store.set(`purchase_orders:${p.po_number}`, poRow(p, NOW));
  for (const i of INVOICES) store.set(`invoices:${i.invoice_id}`, invoiceRow(i, NOW));
  const seen = { policyPath: "", input: undefined as unknown, reasoning: [] as string[] };
  const ctx: CustomToolContext = {
    log() {},
    signal: new AbortController().signal,
    sessionId: "sess-1",
    now: () => Date.parse(NOW),
    emitReasoning: (t) => seen.reasoning.push(t),
    fs: {
      async readRepoFile(p) {
        seen.policyPath = p;
        return "# policy";
      },
    },
    async callTool(name, args) {
      const m = /^store__(\w+)__(get|set|query)$/.exec(name)!;
      const key = (k: string) => `${m[1]}:${k}`;
      if (m[2] === "get") return (store.get(key(String(args.key))) ?? { error: "not found" }) as never;
      if (m[2] === "set") {
        store.set(key(String(args.key)), args.value as Record<string, unknown>);
        return {} as never;
      }
      const where = (args.where ?? {}) as Record<string, unknown>;
      return {
        documents: [...store.entries()]
          .filter(([k]) => k.startsWith(`${m[1]}:`))
          .map(([, payload]) => ({ payload }))
          .filter(({ payload }) => Object.entries(where).every(([f, v]) => payload[f] === v)),
      } as never;
    },
    async callSubagent(_ref, _task, input) {
      seen.input = input;
      return REPLY;
    },
  };
  return { ctx, store, seen };
}

test("wires the composite context into the review flow", async () => {
  const { ctx, store, seen } = fakeCtx();
  const out = await review_invoice({ invoice_id: " inv_brightline_0417 " }, ctx);
  assert.equal(out.found, true);
  assert.equal(out.recommendation, "approve");
  assert.equal(seen.policyPath, "amodal/knowledge/spend-policy.md");
  assert.equal((seen.input as { spend_policy: string }).spend_policy, "# policy");
  assert.equal(store.get(`reviews:${out.review_id}`)!.reviewer_session_id, "sess-1");
  assert.ok(seen.reasoning.some((l) => l.startsWith("Loaded Brightline")));
});

test("refuses a missing id and a context without composition", async () => {
  const { ctx } = fakeCtx();
  await assert.rejects(review_invoice({}, ctx), /requires an invoice_id/);
  await assert.rejects(review_invoice({ invoice_id: "inv_x" }, { ...ctx, callSubagent: undefined }), /composite context/);
  await assert.rejects(review_invoice({ invoice_id: "inv_brightline_0417" }, { ...ctx, fs: undefined }), /spend policy .* cannot be read/);
});
