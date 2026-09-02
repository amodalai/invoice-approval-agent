import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalBlockers,
  checkInvoice,
  clampRecommendation,
  findDuplicate,
  floorRecommendation,
  parseReviewResult,
  runInvoiceReview,
  storeGetResult,
  type InvoiceRow,
  type PORow,
} from "../amodal/_lib/invoice-review.js";
import { INVOICES, PURCHASE_ORDERS, invoiceRow, poRow } from "../amodal/_lib/demo-data.js";
import { fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const inv = (id: string): InvoiceRow => invoiceRow(INVOICES.find((i) => i.invoice_id === id)!, NOW);
const po = (n: string): PORow => poRow(PURCHASE_ORDERS.find((p) => p.po_number === n)!, NOW) as PORow;
const all = INVOICES.map((i) => invoiceRow(i, NOW));

test("the later invoice with the same vendor and number is the duplicate, never the original", () => {
  assert.equal(findDuplicate(inv("inv_brightline_0417_resend"), all)?.invoice_id, "inv_brightline_0417");
  assert.equal(findDuplicate(inv("inv_brightline_0417"), all), undefined);
  const same = { ...inv("inv_brightline_0417"), invoice_id: "inv_a", received_at: NOW };
  const other = { ...same, invoice_id: "inv_b", vendor_name: " brightline cloud services " };
  assert.equal(findDuplicate(other, [same])?.invoice_id, "inv_a");
  assert.equal(findDuplicate(same, [other]), undefined);
});

test("the floor and the blockers follow the facts", () => {
  const clean = checkInvoice(inv("inv_brightline_0417"), po("PO-1041"), all);
  assert.deepEqual(approvalBlockers(clean), []);
  assert.equal(floorRecommendation(clean), "approve");

  const over = checkInvoice(inv("inv_norwood_2288"), po("PO-1052"), all);
  assert.equal(floorRecommendation(over), "escalate");
  assert.match(approvalBlockers(over)[0], /over the PO's remaining balance by \$390/);

  const dup = checkInvoice(inv("inv_brightline_0417_resend"), po("PO-1041"), all);
  assert.equal(dup.duplicate_of, "inv_brightline_0417");
  assert.equal(floorRecommendation(dup), "reject");

  const small = checkInvoice(inv("inv_pixelforge_77"), undefined, all);
  assert.equal(small.needs_po, false);
  assert.equal(floorRecommendation(small), "approve");

  const big = checkInvoice({ ...inv("inv_pixelforge_77"), total_usd: 1_001, line_items: [{ description: "x", quantity: 1, unit_price_usd: 1_001 }] }, undefined, all);
  assert.equal(big.needs_po, true);
  assert.equal(floorRecommendation(big), "hold");

  const wrongVendor = checkInvoice(inv("inv_atlas_9911"), po("PO-1041"), all);
  assert.equal(wrongVendor.vendor_matches, false);
  assert.equal(floorRecommendation(wrongVendor), "reject");

  const closed = checkInvoice(inv("inv_brightline_0417"), { ...po("PO-1041"), status: "closed" }, all);
  assert.equal(floorRecommendation(closed), "hold");
});

test("clamping keeps the reviewer's call unless the floor is more conservative", () => {
  const clean = checkInvoice(inv("inv_brightline_0417"), po("PO-1041"), all);
  assert.equal(clampRecommendation("approve", clean), "approve");
  assert.equal(clampRecommendation("hold", clean), "hold");
  assert.equal(clampRecommendation("nonsense", clean), "hold");
  const over = checkInvoice(inv("inv_norwood_2288"), po("PO-1052"), all);
  assert.equal(clampRecommendation("approve", over), "escalate");
  assert.equal(clampRecommendation("reject", over), "reject");
});

test("parses the reviewer's JSON even when wrapped in fences or prose", () => {
  const r = parseReviewResult('Here you go:\n```json\n{"recommendation":"hold","summary":"s","checks":[],"issues":["a"]}\n```');
  assert.equal(r.recommendation, "hold");
  assert.deepEqual(r.issues, ["a"]);
  assert.throws(() => parseReviewResult("no json here"), /no JSON object/);
  assert.throws(() => parseReviewResult('{"summary":"x"}'), /missing a string/);
});

test("storeGetResult treats the runtime's error envelope as missing", () => {
  assert.equal(storeGetResult({ error: "not found" }), undefined);
  assert.equal(storeGetResult(null), undefined);
  assert.deepEqual(storeGetResult({ invoice_id: "x" }), { invoice_id: "x" });
});

function fakeDeps(reviewerReply: string, seedAt?: string) {
  const { store, calls, callTool } = fakeStore(seedAt);
  const traces: string[] = [];
  return {
    store,
    calls,
    traces,
    deps: {
      callTool,
      async callSubagent() {
        return reviewerReply;
      },
      async loadPolicy() {
        return "# policy";
      },
      now: () => new Date(NOW),
      sessionId: "sess",
      trace: (l: string) => traces.push(l),
    },
  };
}

const REPLY = JSON.stringify({
  recommendation: "approve",
  summary: "Looks fine.",
  checks: [{ name: "amount", status: "pass", note: "ok" }],
  issues: [],
});

test("on fresh stores the review seeds the dataset and reviews the in-memory example", async () => {
  const { deps, store, calls } = fakeDeps(REPLY);
  const out = await runInvoiceReview("inv_brightline_0417", deps);
  assert.equal(out.found, true);
  assert.equal(out.recommendation, "approve");
  const review_id = `rev_inv_brightline_0417_1_${Date.parse(NOW)}`;
  assert.equal(out.review_id, review_id);
  assert.ok(calls.some(([n, a]) => n === "store__invoices__set" && a.key === "inv_pixelforge_77"), "seeded the dataset");
  const saved = store.get("invoices:inv_brightline_0417")!;
  assert.equal(saved.status, "reviewed");
  assert.equal(saved.recommendation, "approve");
  assert.equal(saved.review_id, review_id);
  assert.equal(saved.reviewed_at, NOW);
  const review = store.get(`reviews:${review_id}`)!;
  assert.equal(review.reviewer_session_id, "sess");
  assert.equal(review.revision, 1);
});

test("every run keeps its own review row, the invoice names the latest, and a reviewed event is appended", async () => {
  let t = Date.parse(NOW);
  const { deps, store } = fakeDeps(REPLY, NOW);
  deps.now = () => new Date(t);
  const first = await runInvoiceReview("inv_norwood_2288", deps);
  t += 60_000;
  const second = await runInvoiceReview("inv_norwood_2288", deps);
  assert.notEqual(first.review_id, second.review_id);
  assert.ok(store.has(`reviews:${first.review_id}`) && store.has(`reviews:${second.review_id}`));
  assert.equal(store.get("invoices:inv_norwood_2288")!.review_id, second.review_id);
  const events = [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => [e.kind, e.actor, e.recommendation, e.revision, e.invoice_id]),
    [["reviewed", "agent", "escalate", 1, "inv_norwood_2288"], ["reviewed", "agent", "escalate", 1, "inv_norwood_2288"]],
  );
});

test("a preloaded invoice is reviewed without reading the stores", async () => {
  const { deps, store, calls } = fakeDeps(REPLY);
  const invoice = { ...inv("inv_pixelforge_77"), revision: 2 };
  const out = await runInvoiceReview("inv_pixelforge_77", deps, { invoice, others: [] });
  assert.equal(out.recommendation, "approve");
  assert.ok(!calls.some(([n]) => n.endsWith("__get") || n.endsWith("__query")));
  assert.equal(store.get(`reviews:${out.review_id}`)!.revision, 2);
  assert.equal(store.get("invoices:inv_pixelforge_77")!.status, "reviewed");
});

test("code clamps an approve the facts forbid and folds the blockers into the issues", async () => {
  const { deps, traces } = fakeDeps(REPLY);
  const out = await runInvoiceReview("inv_norwood_2288", deps);
  assert.equal(out.recommendation, "escalate");
  assert.match(out.issues![0], /over the PO's remaining balance/);
  assert.ok(traces.some((t) => t.includes("clamped the recommendation from `approve` to `escalate`")));
});

test("a duplicate is rejected whatever the reviewer says, from the stored rows", async () => {
  const { deps } = fakeDeps(REPLY, NOW);
  const out = await runInvoiceReview("inv_brightline_0417_resend", deps);
  assert.equal(out.recommendation, "reject");
  assert.equal(out.issues![0], "duplicate of inv_brightline_0417");
});

test("an unknown invoice reports found: false without writing", async () => {
  const { deps, calls } = fakeDeps(REPLY);
  assert.deepEqual(await runInvoiceReview("inv_nope", deps), { found: false, invoice_id: "inv_nope" });
  assert.ok(!calls.some(([n]) => n.endsWith("__set")));
});
