import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY, invoiceMath } from "../amodal/_lib/policy.js";

const lines = (...prices: number[]) =>
  prices.map((p, i) => ({ description: `line ${i}`, quantity: 1, unit_price_usd: p }));

test("sums line items with quantities, to the cent", () => {
  const m = invoiceMath({
    line_items: [
      { description: "chairs", quantity: 6, unit_price_usd: 395 },
      { description: "desk", quantity: 1, unit_price_usd: 220.005 },
    ],
    total_usd: 2590,
  });
  assert.equal(m.line_sum_usd, 2590.01);
  assert.equal(m.total_matches_lines, false);
});

test("without a purchase order the PO fields are null", () => {
  const m = invoiceMath({ line_items: lines(650), total_usd: 650 });
  assert.equal(m.total_matches_lines, true);
  assert.equal(m.po_remaining_usd, null);
  assert.equal(m.within_tolerance, null);
  assert.equal(m.over_controller_limit, false);
});

test("tolerance is the larger of the minimum and the percentage", () => {
  const small = invoiceMath({ line_items: lines(2550), total_usd: 2550, po_amount_usd: 2500 });
  assert.equal(small.tolerance_usd, POLICY.tolerance_min_usd);
  assert.equal(small.variance_usd, 50);
  assert.equal(small.within_tolerance, true);

  const large = invoiceMath({ line_items: lines(10_200), total_usd: 10_200, po_amount_usd: 10_000 });
  assert.equal(large.tolerance_usd, 200);
  assert.equal(large.within_tolerance, true);
  assert.equal(invoiceMath({ line_items: lines(10_201), total_usd: 10_201, po_amount_usd: 10_000 }).within_tolerance, false);
});

test("billed-to-date reduces the remaining balance", () => {
  const m = invoiceMath({
    line_items: lines(2890),
    total_usd: 2890,
    po_amount_usd: 2500,
    po_billed_to_date_usd: 0,
  });
  assert.equal(m.po_remaining_usd, 2500);
  assert.equal(m.variance_usd, 390);
  assert.equal(m.variance_pct, 15.6);
  assert.equal(m.within_tolerance, false);

  const billed = invoiceMath({ line_items: lines(12_000), total_usd: 12_000, po_amount_usd: 12_000, po_billed_to_date_usd: 12_000 });
  assert.equal(billed.po_remaining_usd, 0);
  assert.equal(billed.variance_pct, null);
  assert.equal(billed.within_tolerance, false);
});

test("flags totals over the controller limit", () => {
  assert.equal(invoiceMath({ line_items: lines(25_001), total_usd: 25_001 }).over_controller_limit, true);
  assert.equal(invoiceMath({ line_items: lines(25_000), total_usd: 25_000 }).over_controller_limit, false);
});
