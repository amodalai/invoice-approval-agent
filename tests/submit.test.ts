import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, submitInvoice, validateSubmission } from "../amodal/_lib/submit.js";
import { INVOICES, invoiceRow } from "../amodal/_lib/demo-data.js";
import { assertDeclared, assertUsesReachable, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const OMAR = "Omar Haddad (Engineering)";
const REPLY = JSON.stringify({ recommendation: "approve", summary: "Fine.", checks: [], issues: [] });

const form = {
  vendor_name: " Kestrel Courier ",
  invoice_number: "4410-B",
  po_number: null,
  invoice_date: "2026-09-01",
  due_date: "2026-09-15",
  total_usd: 320,
  line_items: [{ description: "Courier runs", quantity: 8, unit_price_usd: 40 }],
  notes: "",
  requester: OMAR,
};

function fakeDeps(reviewerReply = REPLY) {
  const { store, calls, callTool } = fakeStore(NOW);
  let subagentCalls = 0;
  let r = 0;
  const deps = {
    callTool,
    async callSubagent() {
      subagentCalls += 1;
      if (reviewerReply === "THROW") throw new Error("reviewer down");
      return reviewerReply;
    },
    async loadPolicy() {
      return "# policy";
    },
    now: () => new Date(NOW),
    random: () => (r += 0.1) % 1,
    sessionId: "sess",
  };
  const events = () => [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  return { deps, store, calls, events, subagentCalls: () => subagentCalls };
}

test("slug lowercases and joins on underscores", () => {
  assert.equal(slug(" Kestrel Courier "), "kestrel_courier");
  assert.equal(slug("C-1042/A"), "c_1042_a");
});

test("validation names every problem at once and normalizes the fields", () => {
  assert.throws(
    () => validateSubmission({ vendor_name: " ", invoice_date: "1 Sep", total_usd: 0, line_items: [{ quantity: 0, unit_price_usd: -1 }] }),
    (e: Error) => {
      for (const part of [
        "vendor_name is required",
        "invoice_number is required",
        "requester is required",
        "invoice_date must be a date as YYYY-MM-DD",
        "due_date is required",
        "total_usd must be a number above 0",
        "line 1 needs a description",
        "line 1 needs a quantity above 0",
        "line 1 needs a unit price of 0 or more",
      ]) {
        assert.ok(e.message.includes(part), part);
      }
      return true;
    },
  );
  assert.throws(() => validateSubmission({ ...form, line_items: [] }), /at least one line item/);
  assert.throws(() => validateSubmission({ ...form, invoice_date: "2026-02-30" }), /invoice_date must be a date/);
  assert.throws(() => validateSubmission({ ...form, due_date: "2026-13-45" }), /due_date must be a date/);
  assert.throws(() => validateSubmission(null), /vendor_name is required/);
  const p = validateSubmission({ ...form, po_number: " ", invoice_id: " inv_x " });
  assert.equal(p.vendor_name, "Kestrel Courier");
  assert.equal(p.po_number, null);
  assert.equal(p.notes, null);
  assert.equal(p.invoice_id, "inv_x");
  assert.equal("invoice_id" in validateSubmission(form), false);
});

test("a new submission writes the row, appends submitted, and reviews the in-memory row", async () => {
  const { deps, store, calls, events, subagentCalls } = fakeDeps();
  const out = await submitInvoice(form, deps);
  assert.equal(out.invoice_id, "inv_kestrel_courier_4410_b");
  assert.equal(out.revision, 1);
  assert.equal(out.recommendation, "approve");
  const row = store.get("invoices:inv_kestrel_courier_4410_b")!;
  assert.equal(row.status, "reviewed");
  assert.equal(row.review_id, out.review_id);
  assert.equal(row.requester, OMAR);
  assert.equal(row.vendor_name, "Kestrel Courier");
  assert.equal(row.received_at, NOW);
  assert.equal(row.submitted_at, NOW);
  assert.equal(row.revision, 1);
  const written = calls.findIndex(([n, a]) => n === "store__invoices__set" && a.key === out.invoice_id);
  assert.ok(!calls.slice(written).some(([n, a]) => n === "store__invoices__get" && a.key === out.invoice_id), "never reads its own row back");
  assert.equal(subagentCalls(), 1);
  assert.deepEqual(events().map((e) => [e.kind, e.actor, e.revision]), [["submitted", OMAR, 1], ["reviewed", "agent", 1]]);
  assertDeclared("submit_invoice", calls.map(([n]) => n));
});

test("a resent invoice number gets its own row with a numeric suffix and is reviewed as a duplicate", async () => {
  const { deps, store, calls } = fakeDeps();
  const resend = { ...form, vendor_name: "Brightline Cloud Services", invoice_number: "0417", po_number: "PO-1041", total_usd: 12_000, line_items: [{ description: "Hosting", quantity: 1, unit_price_usd: 12_000 }] };
  const out = await submitInvoice(resend, deps);
  assert.equal(out.invoice_id, "inv_brightline_cloud_services_0417");
  const again = await submitInvoice(resend, deps);
  assert.equal(again.invoice_id, "inv_brightline_cloud_services_0417_2");
  assert.equal(again.recommendation, "reject");
  assert.ok(store.has("invoices:inv_brightline_cloud_services_0417") && store.has("invoices:inv_brightline_cloud_services_0417_2"));
  assertDeclared("submit_invoice", calls.map(([n]) => n));
});

test("an id another vendor spelling already took gets the numeric suffix", async () => {
  const { deps, store } = fakeDeps();
  const existing = { ...invoiceRow(INVOICES[0], NOW), invoice_id: "inv_acme_inc_100", vendor_name: "Acme, Inc.", invoice_number: "100" };
  store.set("invoices:inv_acme_inc_100", existing);
  const out = await submitInvoice({ ...form, vendor_name: "Acme Inc", invoice_number: "100" }, deps);
  assert.equal(out.invoice_id, "inv_acme_inc_100_2");
  assert.deepEqual(store.get("invoices:inv_acme_inc_100"), existing);
});

test("a resubmission replaces a returned invoice at revision + 1 and clears the return", async () => {
  const { deps, store, events, calls } = fakeDeps();
  const returned = invoiceRow({ ...INVOICES[3], invoice_id: "inv_x", requester: OMAR }, "2026-08-01T00:00:00.000Z");
  store.set("invoices:inv_x", {
    ...returned,
    status: "returned",
    returned_note: "fix the lines",
    recommendation: "hold",
    review_id: "rev_old",
    reviewed_at: "2026-08-02T00:00:00.000Z",
  });
  const out = await submitInvoice({ ...form, invoice_id: "inv_x", vendor_name: "PixelForge Design", invoice_number: "77", total_usd: 700, line_items: [{ description: "Logo", quantity: 1, unit_price_usd: 700 }] }, deps);
  assert.equal(out.invoice_id, "inv_x");
  assert.equal(out.revision, 2);
  const row = store.get("invoices:inv_x")!;
  assert.equal(row.revision, 2);
  assert.equal(row.status, "reviewed");
  assert.equal(row.returned_note, null);
  assert.equal(row.total_usd, 700);
  assert.equal(row.submitted_at, NOW);
  assert.equal(row.received_at, returned.received_at);
  assert.equal(row.created_at, "2026-08-01T00:00:00.000Z");
  assert.notEqual(row.review_id, "rev_old");
  assert.deepEqual(events().map((e) => [e.kind, e.revision]), [["resubmitted", 2], ["reviewed", 2]]);
  assertDeclared("submit_invoice", calls.map(([n]) => n));
});

test("a resubmission is refused unless the invoice is returned and the requester matches", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(submitInvoice({ ...form, invoice_id: "inv_nope" }, deps), /not found/);
  await assert.rejects(submitInvoice({ ...form, invoice_id: "inv_pixelforge_77" }, deps), /is new; only a returned invoice/);
  deps.callTool("store__invoices__set", { key: "inv_pixelforge_77", value: { ...invoiceRow(INVOICES[3], NOW), status: "returned" } });
  await assert.rejects(submitInvoice({ ...form, invoice_id: "inv_pixelforge_77", requester: "Lena Fischer (Facilities)" }, deps), /submitted by Maya Chen/);
});

test("a failing review leaves the invoice new, with its submitted event, and rethrows", async () => {
  const { deps, store, events } = fakeDeps("THROW");
  await assert.rejects(submitInvoice(form, deps), /reviewer down/);
  const row = store.get("invoices:inv_kestrel_courier_4410_b")!;
  assert.equal(row.status, "new");
  assert.equal(row.review_id, null);
  assert.deepEqual(events().map((e) => e.kind), ["submitted"]);
});

test("submit_invoice declares no store tool its runs cannot reach", () => {
  assertUsesReachable("submit_invoice");
});
