import { test } from "node:test";
import assert from "node:assert/strict";
import { usd } from "../src/types.js";

test("usd shows the cents only when there are cents", () => {
  assert.equal(usd(12_000), "$12,000");
  assert.equal(usd(0), "$0");
  assert.equal(usd(4.6), "$4.60");
  assert.equal(usd(1_234.5), "$1,234.50");
  assert.equal(usd(500 * 4.6), "$2,300");
});
