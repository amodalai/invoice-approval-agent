import { test } from "node:test";
import assert from "node:assert/strict";
import { remaining, usd, type PORow } from "../src/types.js";

const po = (amount_usd: number, billed_to_date_usd: number): PORow => ({
  po_number: "PO-1041",
  vendor_name: "Brightline Systems",
  description: "Quarterly retainer",
  amount_usd,
  billed_to_date_usd,
  requester: "dana",
  status: "open",
});

test("usd shows the cents only when there are cents", () => {
  assert.equal(usd(12_000), "$12,000");
  assert.equal(usd(0), "$0");
  assert.equal(usd(4.6), "$4.60");
  assert.equal(usd(1_234.5), "$1,234.50");
  assert.equal(usd(500 * 4.6), "$2,300");
});

test("remaining subtracts what the purchase order already billed, without clamping", () => {
  assert.equal(remaining(po(12_000, 4_000)), 8_000);
  assert.equal(remaining(po(12_000, 12_000)), 0);
  assert.equal(remaining(po(12_000, 13_500)), -1_500);
});
