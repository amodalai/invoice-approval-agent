import { test } from "node:test";
import assert from "node:assert/strict";
import { INVOICES, PURCHASE_ORDERS, STORE_KEYS, ensureExamplesSeeded, invoiceRow, seedRows } from "../amodal/_lib/demo-data.js";
import { BACKLOG, BACKLOG_PURCHASE_ORDERS, REQUESTERS } from "../amodal/_lib/examples.js";
import { POLICY, invoiceMath } from "../amodal/_lib/policy.js";
import { assertDeclared } from "./helpers.js";

const NOW = "2026-09-01T00:00:00.000Z";
const ALL_INVOICES = [...INVOICES, ...BACKLOG];
const ALL_POS = [...PURCHASE_ORDERS, ...BACKLOG_PURCHASE_ORDERS];
const rowsOf = (store: keyof typeof STORE_KEYS) => seedRows(NOW)[store];
const allRows = () => Object.entries(seedRows(NOW)).map(([store, rows]) => ({ store, field: STORE_KEYS[store as keyof typeof STORE_KEYS], rows }));

test("every demo invoice's lines add up to its total and names a known requester", () => {
  for (const inv of ALL_INVOICES) {
    assert.equal(invoiceMath({ line_items: inv.line_items, total_usd: inv.total_usd }).total_matches_lines, true, inv.invoice_id);
    assert.ok((REQUESTERS as readonly string[]).includes(inv.requester), inv.invoice_id);
  }
});

test("every cited purchase order exists and belongs to the same vendor", () => {
  for (const inv of ALL_INVOICES) {
    if (!inv.po_number) continue;
    const po = ALL_POS.find((p) => p.po_number === inv.po_number);
    assert.ok(po, `${inv.invoice_id} cites ${inv.po_number}`);
    assert.equal(po.vendor_name, inv.vendor_name, inv.invoice_id);
  }
});

test("received_at follows the arrival offsets, so a resend comes after its original", () => {
  const at = (id: string) => invoiceRow(ALL_INVOICES.find((i) => i.invoice_id === id)!, NOW).received_at;
  assert.ok(at("inv_brightline_0417") < at("inv_brightline_0417_resend"));
  assert.ok(at("inv_kestrel_4410") < at("inv_kestrel_4410_resend"));
  for (const inv of BACKLOG) assert.ok(at(inv.invoice_id) < at("inv_brightline_0417"), `${inv.invoice_id} predates the live set`);
});

test("the backlog leaves the live purchase orders and the live invoice numbers alone", () => {
  const livePos = new Set(PURCHASE_ORDERS.map((p) => p.po_number));
  const liveNumbers = new Set(INVOICES.map((i) => `${i.vendor_name}#${i.invoice_number}`));
  for (const inv of BACKLOG) {
    assert.ok(!inv.po_number || !livePos.has(inv.po_number), inv.invoice_id);
    assert.ok(!liveNumbers.has(`${inv.vendor_name}#${inv.invoice_number}`), inv.invoice_id);
  }
  const ids = allRows().flatMap((s) => s.rows.map((r) => `${s.store}:${r[s.field]}`));
  assert.equal(new Set(ids).size, ids.length, "seed keys are unique");
});

test("every purchase order's billed-to-date equals the sum of its approved invoices", () => {
  const invoices = rowsOf("invoices");
  for (const po of rowsOf("purchase_orders")) {
    const approved = invoices.filter((i) => i.po_number === po.po_number && i.status === "approved");
    assert.equal(po.billed_to_date_usd, approved.reduce((s, i) => s + (i.total_usd as number), 0), String(po.po_number));
  }
});

// The approval-guard hook fires on every seeded `approved` row and, on a
// reset, sees the previous dataset's balances. Each approval must pass the
// hook's tolerance rule against the final balances or the seed is blocked.
test("every seeded approval passes the guard hook's rules against the final balances", () => {
  const pos = new Map(rowsOf("purchase_orders").map((p) => [p.po_number, p]));
  for (const inv of rowsOf("invoices").filter((i) => i.status === "approved")) {
    const total = inv.total_usd as number;
    const po = inv.po_number ? pos.get(inv.po_number)! : undefined;
    if (!po) {
      assert.ok(total <= POLICY.no_po_limit_usd, String(inv.invoice_id));
      continue;
    }
    const remaining = (po.amount_usd as number) - (po.billed_to_date_usd as number);
    assert.ok(total <= remaining + Math.max(POLICY.tolerance_min_usd, remaining * POLICY.tolerance_pct), String(inv.invoice_id));
  }
});

test("each backlog invoice is decided, with a canned review per revision and its events in order", () => {
  const reviews = rowsOf("reviews");
  const events = rowsOf("events");
  for (const inv of BACKLOG) {
    const row = rowsOf("invoices").find((r) => r.invoice_id === inv.invoice_id)!;
    const mine = reviews.filter((r) => r.invoice_id === inv.invoice_id);
    assert.equal(mine.length, inv.reviews.length, inv.invoice_id);
    assert.ok(mine.every((r) => r.reviewer_session_id === "seed" && r.checks && (r.checks as unknown[]).length === 4));
    assert.equal(row.status, inv.decided);
    assert.equal(row.revision, inv.reviews.length);
    assert.equal(row.review_id, mine[mine.length - 1].review_id);
    assert.equal(row.recommendation, inv.reviews[inv.reviews.length - 1].recommendation);
    assert.ok(row.decided_at && row.reviewed_at && row.submitted_at);
    const kinds = events.filter((e) => e.invoice_id === inv.invoice_id).map((e) => e.kind);
    assert.ok(kinds.length >= 3, inv.invoice_id);
    assert.equal(kinds[0], "submitted");
    assert.equal(kinds[1], "reviewed");
    assert.equal(kinds[kinds.length - 1], inv.decided);
  }
  const resubmitted = events.filter((e) => e.invoice_id === "inv_sable_3305");
  assert.deepEqual(resubmitted.map((e) => e.kind), ["submitted", "reviewed", "returned", "resubmitted", "reviewed", "approved"]);
  assert.equal(resubmitted[2].note, BACKLOG.find((i) => i.invoice_id === "inv_sable_3305")!.returned_note);
  for (const inv of BACKLOG) {
    const mine = events.filter((e) => e.invoice_id === inv.invoice_id).map((e) => String(e.created_at));
    assert.deepEqual(mine, [...mine].sort(), inv.invoice_id);
  }
  for (const inv of INVOICES) {
    assert.deepEqual(events.filter((e) => e.invoice_id === inv.invoice_id).map((e) => [e.kind, e.actor]), [["seeded", "system"]]);
  }
});

function fakeSeedStore(present: Record<string, string[]>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      const m = /^store__(\w+)__query$/.exec(name);
      if (!m) return {};
      const field = STORE_KEYS[m[1] as keyof typeof STORE_KEYS];
      return { documents: (present[m[1]] ?? []).map((k) => ({ payload: { [field]: k } })) };
    },
    now: () => new Date(NOW),
  };
  const written = () => calls.filter(([n]) => n.endsWith("__set")).map(([n, a]) => `${/^store__(\w+)__/.exec(n)![1]}:${a.key}`);
  return { ctx, calls, written };
}

test("seeding writes only the rows that are missing, in every store", async () => {
  const present = { purchase_orders: ["PO-1041"], invoices: ["inv_atlas_9911", "inv_sable_3305"], reviews: [], events: [] };
  const { ctx, written, calls } = fakeSeedStore(present);
  const seeded = await ensureExamplesSeeded(ctx);
  const expected = allRows().flatMap((s) =>
    s.rows.filter((r) => !(present[s.store as keyof typeof present] as string[]).includes(String(r[s.field]))).map((r) => `${s.store}:${r[s.field]}`),
  );
  assert.deepEqual(written(), expected);
  assert.equal(seeded, rowsOf("invoices").length - 2);
  const first = calls.find(([n, a]) => n === "store__invoices__set" && a.key === "inv_brightline_0417")![1].value as Record<string, unknown>;
  assert.equal(first.status, "new");
  assert.equal(first.recommendation, null);
  assert.equal(first.review_id, null);
  assert.equal(first.revision, 1);
  assert.equal(first.requester, "Omar Haddad (Engineering)");
  assert.equal(first.submitted_at, first.received_at);
  assertDeclared("seed_examples", calls.map(([n]) => n));
});

test("seeding twice writes nothing the second time, and assumeEmpty skips the lookups", async () => {
  const stores = Object.fromEntries(allRows().map((s) => [s.store, s.rows.map((r) => String(r[s.field]))]));
  const { ctx, written } = fakeSeedStore(stores);
  assert.equal(await ensureExamplesSeeded(ctx), 0);
  assert.deepEqual(written(), []);
  const blind = fakeSeedStore(stores);
  assert.equal(await ensureExamplesSeeded(blind.ctx, { assumeEmpty: true }), rowsOf("invoices").length);
  assert.ok(!blind.calls.some(([n]) => n.endsWith("__query")));
  assert.equal(blind.written().length, allRows().reduce((n, s) => n + s.rows.length, 0));
});
