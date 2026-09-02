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
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "approved" }, ctx), /is new; only a reviewed invoice/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_nope", decision: "approved" }, ctx), /not found/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "paid" }, ctx), /must be "approved", "rejected", or "returned"/);
  await assert.rejects(decide_invoice({ decision: "approved" }, ctx), /No invoice_id/);
  await decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved" }, ctx);
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "rejected" }, ctx), /is approved; only a reviewed invoice/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "returned", note: "x" }, ctx), /is approved; only a reviewed invoice/);
});

test("refuses a reviewed invoice whose review row is missing", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_brightline_0417"] });
  store.delete("reviews:rev_inv_brightline_0417");
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "rejected" }, ctx), /No review for inv_brightline_0417/);
});

test("returning needs a note, sends the invoice back with it, and can be resubmitted but not decided", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_atlas_9911"] });
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "returned" }, ctx), /needs a note/);
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "returned", note: "  " }, ctx), /needs a note/);
  const out = await decide_invoice({ invoice_id: "inv_atlas_9911", decision: "returned", note: "Drop the workshop line." }, ctx);
  assert.equal(out.decision, "returned");
  const inv = store.get("invoices:inv_atlas_9911")!;
  assert.equal(inv.status, "returned");
  assert.equal(inv.returned_note, "Drop the workshop line.");
  assert.equal(inv.decided_at, null);
  assert.equal(inv.decision_note, null);
  assert.equal(store.get("purchase_orders:PO-1063")!.billed_to_date_usd, 0);
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "approved" }, ctx), /is returned; only a reviewed invoice/);
});

test("approving against an escalate recommendation needs a note", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_brightline_0417"] });
  store.set("reviews:rev_inv_brightline_0417", { ...store.get("reviews:rev_inv_brightline_0417")!, recommendation: "escalate" });
  await assert.rejects(decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved" }, ctx), /escalate recommendation needs a note/);
  await decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved", note: "Manager signed off." }, ctx);
  assert.equal(store.get("invoices:inv_brightline_0417")!.status, "approved");
});

test("each decision appends exactly one event with actor approver, the note, and the revision", async () => {
  const { ctx, store } = seededCtx({ reviewed: ["inv_brightline_0417", "inv_norwood_2288", "inv_atlas_9911"] });
  store.set("invoices:inv_atlas_9911", { ...store.get("invoices:inv_atlas_9911")!, revision: 2 });
  await decide_invoice({ invoice_id: "inv_brightline_0417", decision: "approved" }, ctx);
  await decide_invoice({ invoice_id: "inv_norwood_2288", decision: "rejected", note: "Over the PO." }, ctx);
  await decide_invoice({ invoice_id: "inv_atlas_9911", decision: "returned", note: "Drop the workshop line." }, ctx);
  await assert.rejects(decide_invoice({ invoice_id: "inv_atlas_9911", decision: "rejected" }, ctx));
  const events = [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  assert.deepEqual(
    events.map((e) => [e.invoice_id, e.kind, e.actor, e.note, e.revision, e.created_at]),
    [
      ["inv_brightline_0417", "approved", "approver", null, 1, NOW],
      ["inv_norwood_2288", "rejected", "approver", "Over the PO.", 1, NOW],
      ["inv_atlas_9911", "returned", "approver", "Drop the workshop line.", 2, NOW],
    ],
  );
});
