import { test } from "node:test";
import assert from "node:assert/strict";
import { INVOICES, PURCHASE_ORDERS, invoiceRow, poRow } from "../amodal/_lib/demo-data.js";
import { reviewSteps } from "../src/steps.js";
import type { InvoiceRow, PORow } from "../src/types.js";

const NOW = "2026-09-01T12:00:00.000Z";
const all = INVOICES.map((i) => invoiceRow(i, NOW) as InvoiceRow);
const inv = (id: string) => all.find((i) => i.invoice_id === id)!;
const po = (n: string) => poRow(PURCHASE_ORDERS.find((p) => p.po_number === n)!, NOW) as PORow;
const shape = (steps: ReturnType<typeof reviewSteps>) => steps.map((s) => s.status);

test("a clean invoice passes the three code checks and leaves the reviewer's step pending", () => {
  const steps = reviewSteps(inv("inv_brightline_0417"), po("PO-1041"), all);
  assert.deepEqual(shape(steps), ["pass", "pass", "pass", "pending"]);
  assert.equal(steps[0].label, "PO-1041 found, open, $12,000 remaining");
  assert.equal(steps[2].label, "$12,000 fits the $12,000 remaining");
  assert.equal(steps[3].label, "Reviewer reading 1 line item against what PO-1041 describes");
});

test("the amount step distinguishes remaining balance from permitted tolerance", () => {
  for (const [total, label, status] of [
    [11_950, "$11,950 fits the $12,000 remaining", "pass"],
    [12_000, "$12,000 fits the $12,000 remaining", "pass"],
    [12_050, "$12,050 is $50 over the balance, within the $240 tolerance", "pass"],
    [12_240, "$12,240 is $240 over the balance, within the $240 tolerance", "pass"],
    [12_241, "$12,241 is $241 over the balance, past the $240 tolerance", "fail"],
  ] as const) {
    const invoice = {
      ...inv("inv_brightline_0417"),
      total_usd: total,
      line_items: [{ description: "Hosting", quantity: 1, unit_price_usd: total }],
    };
    assert.deepEqual(reviewSteps(invoice, po("PO-1041"), all)[2], { label, status });
  }
});

test("the duplicate, the over-tolerance amount, and the missing order each fail or flag their step", () => {
  const dup = reviewSteps(inv("inv_brightline_0417_resend"), po("PO-1041"), all);
  assert.equal(dup[1].status, "fail");
  assert.equal(dup[1].label, "Brightline Cloud Services already sent invoice #0417");

  const over = reviewSteps(inv("inv_norwood_2288"), po("PO-1052"), all);
  assert.equal(over[2].status, "fail");
  assert.equal(over[2].label, "$2,890 is $390 over the balance, past the $50 tolerance");

  const small = reviewSteps(inv("inv_pixelforge_77"), undefined, all);
  assert.deepEqual(shape(small), ["pass", "pass", "pass", "pending"]);
  assert.equal(small[0].label, "No purchase order; $650 is under the $1,000 limit for that");
  assert.equal(small[3].label, "Reviewer reading 1 line item against the spend policy");

  const big = reviewSteps({ ...inv("inv_pixelforge_77"), total_usd: 1_500, line_items: [{ description: "x", quantity: 1, unit_price_usd: 1_500 }] }, undefined, all);
  assert.equal(big[0].status, "flag");

  const mismatch = reviewSteps({ ...inv("inv_pixelforge_77"), total_usd: 700 }, undefined, all);
  assert.equal(mismatch[2].status, "flag");
  assert.equal(mismatch[2].label, "The lines add up to $650, not the stated $700");

  const wrongVendor = reviewSteps(inv("inv_atlas_9911"), po("PO-1041"), all);
  assert.equal(wrongVendor[0].status, "fail");
  const closed = reviewSteps(inv("inv_brightline_0417"), { ...po("PO-1041"), status: "closed" }, all);
  assert.equal(closed[0].status, "flag");
});
