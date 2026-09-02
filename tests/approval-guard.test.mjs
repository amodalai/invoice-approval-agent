import { test } from "node:test";
import assert from "node:assert/strict";
import { createHook } from "../hooks/approval-guard/index.mjs";

const hook = createHook({ noPoLimitUsd: 1000, tolerancePct: 0.02, toleranceMinUsd: 50 });

function ctx(rows) {
  return {
    log() {},
    store: {
      async get(store, key) {
        return rows[store]?.find((r) => r[`${store === "invoices" ? "invoice_id" : "po_number"}`] === key) ?? null;
      },
      async query(store, filter = {}) {
        return (rows[store] ?? []).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
      },
    },
  };
}

const write = (toolName, value) => ({ toolName, args: { key: value.invoice_id ?? value.review_id, value } });
const brightline = {
  invoice_id: "inv_brightline_0417",
  vendor_name: "Brightline Cloud Services",
  invoice_number: "0417",
  po_number: "PO-1041",
  total_usd: 12_000,
  received_at: "2026-08-25T09:00:00.000Z",
};
const po = { po_number: "PO-1041", amount_usd: 12_000, billed_to_date_usd: 0 };

test("ignores other tools, other points, and non-approval writes", async () => {
  const c = ctx({ purchase_orders: [po], invoices: [brightline] });
  assert.equal((await hook.run("postToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), c)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__purchase_orders__set", { ...po }), c)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "reviewed", recommendation: "hold" }), c)).action, "allow");
  const event = { event_id: "evt_1", invoice_id: "inv_brightline_0417_resend", kind: "reviewed", actor: "agent", recommendation: "approve" };
  assert.equal((await hook.run("preToolUse", { toolName: "store__events__set", args: { key: event.event_id, value: event } }, c)).action, "allow");
});

test("allows a clean approval and blocks one over tolerance", async () => {
  const c = ctx({ purchase_orders: [po], invoices: [brightline] });
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), c)).action, "allow");
  const over = await hook.run("preToolUse", write("store__invoices__set", { ...brightline, total_usd: 12_300, recommendation: "approve" }), c);
  assert.equal(over.action, "block");
  assert.match(over.reason, /exceeds the \$12000 remaining on PO-1041 by more than the \$240 tolerance/);
  const billed = ctx({ purchase_orders: [{ ...po, billed_to_date_usd: 12_000 }], invoices: [brightline] });
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), billed)).action, "block");
});

test("blocks a duplicate of an earlier invoice, on both the invoice and the review write", async () => {
  const resend = { ...brightline, invoice_id: "inv_brightline_0417_resend", received_at: "2026-08-30T09:00:00.000Z" };
  const c = ctx({ purchase_orders: [po], invoices: [brightline, resend] });
  const d = await hook.run("preToolUse", write("store__invoices__set", { ...resend, status: "approved" }), c);
  assert.equal(d.action, "block");
  assert.match(d.reason, /duplicates inv_brightline_0417/);
  const r = await hook.run("preToolUse", write("store__reviews__set", { review_id: "rev_x", invoice_id: resend.invoice_id, recommendation: "approve" }), c);
  assert.equal(r.action, "block");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), c)).action, "allow");
});

test("blocks a missing PO over the limit and allows one under it", async () => {
  const c = ctx({ invoices: [] });
  const small = { invoice_id: "inv_p", vendor_name: "PixelForge", invoice_number: "77", po_number: null, total_usd: 650, received_at: "x" };
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...small, status: "approved" }), c)).action, "allow");
  const big = await hook.run("preToolUse", write("store__invoices__set", { ...small, total_usd: 1_001, status: "approved" }), c);
  assert.equal(big.action, "block");
  assert.match(big.reason, /over \$1000 with no purchase order/);
});

test("passes what it cannot see yet (fresh stores) and blocks without a store reader", async () => {
  const fresh = ctx({});
  assert.equal((await hook.run("preToolUse", write("store__reviews__set", { review_id: "rev_x", invoice_id: "inv_x", recommendation: "approve" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), { log() {} })).action, "block");
});
