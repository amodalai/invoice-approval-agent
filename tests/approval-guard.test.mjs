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
const lines = (total) => [{ description: "Services", quantity: 1, unit_price_usd: total }];
const brightline = {
  invoice_id: "inv_brightline_0417",
  vendor_name: "Brightline Cloud Services",
  invoice_number: "0417",
  po_number: "PO-1041",
  total_usd: 12_000,
  line_items: lines(12_000),
  received_at: "2026-08-25T09:00:00.000Z",
};
const po = { po_number: "PO-1041", vendor_name: brightline.vendor_name, status: "open", amount_usd: 12_000, billed_to_date_usd: 0 };

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
  const over = await hook.run("preToolUse", write("store__invoices__set", { ...brightline, total_usd: 12_300, line_items: lines(12_300), recommendation: "approve" }), c);
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
  const small = { invoice_id: "inv_p", vendor_name: "PixelForge", invoice_number: "77", po_number: null, total_usd: 650, line_items: lines(650), received_at: "x" };
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...small, status: "approved" }), c)).action, "allow");
  const big = await hook.run("preToolUse", write("store__invoices__set", { ...small, total_usd: 1_001, line_items: lines(1_001), status: "approved" }), c);
  assert.equal(big.action, "block");
  assert.match(big.reason, /over \$1000 with no purchase order/);
});

test("duplicate lookup normalizes vendors without matching another vendor's invoice number", async () => {
  const resend = { ...brightline, invoice_id: "inv_resend", vendor_name: " brightline cloud services ", received_at: "2026-08-30T09:00:00.000Z", status: "approved" };
  const c = ctx({ purchase_orders: [po], invoices: [brightline, resend] });
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", resend), c)).action, "block");

  const otherVendor = { ...resend, invoice_id: "inv_other", vendor_name: "Other vendor", po_number: null, total_usd: 100, line_items: lines(100) };
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", otherVendor), c)).action, "allow");
});

test("blocks vendor mismatches and closed purchase orders on invoice and review approvals", async () => {
  for (const [purchaseOrder, reason] of [
    [{ ...po, vendor_name: "Other vendor" }, /different vendor/],
    [{ ...po, status: "closed" }, /closed/],
  ]) {
    const c = ctx({ purchase_orders: [purchaseOrder], invoices: [brightline] });
    for (const [tool, value] of [
      ["store__invoices__set", { ...brightline, status: "approved" }],
      ["store__reviews__set", { review_id: "rev_x", invoice_id: brightline.invoice_id, recommendation: "approve" }],
    ]) {
      const result = await hook.run("preToolUse", write(tool, value), c);
      assert.equal(result.action, "block");
      assert.match(result.reason, reason);
    }
  }
});

test("blocks line-total mismatches even without a purchase order or visible stored invoice", async () => {
  const invoice = { ...brightline, po_number: null, total_usd: 650, line_items: lines(600), status: "approved" };
  const result = await hook.run("preToolUse", write("store__invoices__set", invoice), ctx({}));
  assert.equal(result.action, "block");
  assert.match(result.reason, /line items sum to \$600/);
});

test("rounds the percentage tolerance to cents like invoice_math", async () => {
  const c = ctx({ purchase_orders: [{ ...po, amount_usd: 3333.33 }], invoices: [] });
  const invoice = { ...brightline, total_usd: 3400, line_items: lines(3400), status: "approved" };
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", invoice), c)).action, "allow");
});

test("passes what it cannot see yet (fresh stores) and blocks without a store reader", async () => {
  const fresh = ctx({});
  assert.equal((await hook.run("preToolUse", write("store__reviews__set", { review_id: "rev_x", invoice_id: "inv_x", recommendation: "approve" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), fresh)).action, "allow");
  assert.equal((await hook.run("preToolUse", write("store__invoices__set", { ...brightline, status: "approved" }), { log() {} })).action, "block");
});
