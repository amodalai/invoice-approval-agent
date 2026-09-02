import { test } from "node:test";
import assert from "node:assert/strict";
import decide_invoice from "../amodal/tools/decide_invoice/handler.js";
import { INVOICES, PURCHASE_ORDERS, invoiceRow, poRow } from "../amodal/_lib/demo-data.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";

const NOW = "2026-09-01T12:00:00.000Z";

function seededCtx(opts: { reviewed?: string[] } = {}) {
  const store = new Map<string, Record<string, unknown>>();
  for (const p of PURCHASE_ORDERS) store.set(`purchase_orders:${p.po_number}`, poRow(p, NOW));
  for (const i of INVOICES) store.set(`invoices:${i.invoice_id}`, invoiceRow(i, NOW));
  for (const id of opts.reviewed ?? []) {
    store.set(`reviews:rev_${id}`, { review_id: `rev_${id}`, invoice_id: id, revision: 1, recommendation: "approve" });
    store.set(`invoices:${id}`, { ...store.get(`invoices:${id}`)!, status: "reviewed", review_id: `rev_${id}` });
  }
  const ctx: CustomToolContext = {
    log() {},
    signal: new AbortController().signal,
    now: () => Date.parse(NOW),
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
  };
  return { ctx, store };
}

test("approving a clean reviewed invoice stamps it and books the PO", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_brightline_0417"] });
  const out = await decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved", note: " ok " }, ctx);
  assert.deepEqual(out, { invoice_id: "inv_brightline_0417", decision: "approved", total_usd: 12_000, po_number: "PO-1041" });
  const inv = store.get("invoices:inv_brightline_0417")!;
  assert.equal(inv.status, "approved");
  assert.equal(inv.decided_at, NOW);
  assert.equal(inv.decision_note, "ok");
  assert.equal(store.get("purchase_orders:PO-1041")!.billed_to_date_usd, 12_000);
});

test("rejecting needs a review but re-checks nothing, and leaves the PO alone", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_norwood_2288"] });
  await decide_invoice({ invoice_id: "inv_norwood_2288", decision: "rejected" }, ctx);
  assert.equal(store.get("invoices:inv_norwood_2288")!.status, "rejected");
  assert.equal(store.get("invoices:inv_norwood_2288")!.decision_note, null);
  assert.equal(store.get("purchase_orders:PO-1052")!.billed_to_date_usd, 0);
});

test("refuses to approve when a hard rule fails", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_norwood_2288", "inv_brightline_0417_resend"] });
  await assert.rejects(
    decide_invoice({ invoice_id: "inv_norwood_2288", decision: "approved" }, ctx),
    /Cannot approve inv_norwood_2288: over the PO's remaining balance by \$390/,
  );
  await assert.rejects(
    decide_invoice({ invoice_id: "inv_brightline_0417_resend", decision: "approved" }, ctx),
    /duplicate of inv_brightline_0417/,
  );
  assert.equal(store.get("invoices:inv_norwood_2288")!.status, "reviewed");
});

test("refuses unreviewed, unknown, already-decided, and malformed input", async () => {
  const { ctx } = seededCtx({ reviewed: ["inv_brightline_0417"] });
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "approved" }, ctx), /Review it before deciding/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_nope", decision: "approved" }, ctx), /not found/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "paid" }, ctx), /must be "approved" or "rejected"/);
  await assert.rejects(decide_invoice({ decision: "approved" }, ctx), /No invoice_id/);
  await decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved" }, ctx);
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "rejected" }, ctx), /already approved/);
});
