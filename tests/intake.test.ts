import { test } from "node:test";
import assert from "node:assert/strict";
import agent from "../agents/default/agent.json";
import { intakeInvoice, parseExtraction } from "../amodal/_lib/intake.js";
import intake_invoice from "../amodal/tools/intake_invoice/handler.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";
import { assertDeclared, assertUsesReachable, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const OMAR = "Omar Haddad (Engineering)";
const MAYA = "Maya Chen (Marketing)";

const extracted = {
  vendor_name: "Atlas Consulting Group",
  invoice_number: "9920",
  po_number: "PO-1063",
  invoice_date: "2026-09-01",
  due_date: "2026-10-01",
  total_usd: 6_450,
  line_items: [
    { description: "Data migration, phase 2 (30 hours)", quantity: 30, unit_price_usd: 200 },
    { description: "On-site travel, 2 trips", quantity: 2, unit_price_usd: 225 },
  ],
  notes: "Phase 2 wrapped up on 29 August.",
  requester: null,
};

function fakeDeps(reply: unknown = extracted) {
  const { store, calls, callTool } = fakeStore(NOW);
  const seen = { input: undefined as unknown, traces: [] as string[] };
  const deps = {
    callTool,
    async callSubagent(_ref: string, _task: string, input?: unknown) {
      seen.input = input;
      return typeof reply === "string" ? reply : JSON.stringify(reply);
    },
    async loadPolicy() {
      return "# policy";
    },
    now: () => new Date(NOW),
    sessionId: "sess",
    trace: (l: string) => seen.traces.push(l),
  };
  const events = () => [...store.entries()].filter(([k]) => k.startsWith("events:")).map(([, v]) => v);
  return { deps, store, calls, seen, events };
}

test("parseExtraction strips fences and prose and rejects the rest", () => {
  assert.deepEqual(parseExtraction('Sure:\n```json\n{"vendor_name":"X"}\n```'), { vendor_name: "X" });
  assert.throws(() => parseExtraction("nothing"), /no JSON object/);
  assert.throws(() => parseExtraction("{oops}"), /unparseable JSON/);
});

test("a pasted document becomes a new invoice with a received event, unreviewed", async () => {
  const { deps, store, calls, seen, events } = fakeDeps();
  const out = await intakeInvoice({ document: "From: billing@atlas...\nInvoice 9920 ..." }, deps);
  assert.equal(out.invoice_id, "inv_atlas_consulting_group_9920");
  assert.equal(out.revision, 1);
  assert.equal(out.invoice.requester, OMAR);
  const input = seen.input as { document: string; today: string; purchase_orders: Array<{ po_number: string }>; requesters: readonly string[] };
  assert.equal(input.today, "2026-09-01");
  assert.deepEqual(input.purchase_orders.map((p) => p.po_number), ["PO-1041", "PO-1052", "PO-1063"]);
  assert.ok(input.requesters.includes(MAYA));
  const row = store.get("invoices:inv_atlas_consulting_group_9920")!;
  assert.equal(row.status, "new");
  assert.equal(row.review_id, null);
  assert.equal(row.requester, OMAR);
  assert.equal(row.total_usd, 6_450);
  assert.equal(row.received_at, NOW);
  assert.deepEqual(events().map((e) => [e.kind, e.actor, e.note]), [["received", "agent", "Extracted from a pasted document."]]);
  assert.ok(!calls.some(([n]) => n === "store__reviews__set"), "does not review");
  assertDeclared("intake_invoice", calls.map(([n]) => n));
});

test("extractor lifecycle fields cannot resubmit an existing invoice", async () => {
  const invoice_id = "inv_atlas_9911";
  const { deps, store, events } = fakeDeps({
    ...extracted,
    invoice_id,
    revision: 9,
    status: "approved",
    review_id: "injected-review",
    received_at: "2020-01-01T00:00:00.000Z",
  });
  const original = { ...store.get(`invoices:${invoice_id}`)!, status: "returned", returned_note: "Correct the amount." };
  store.set(`invoices:${invoice_id}`, structuredClone(original));

  const out = await intakeInvoice({ document: "Invoice 9920" }, deps);

  assert.deepEqual(store.get(`invoices:${invoice_id}`), original);
  assert.equal(out.invoice_id, "inv_atlas_consulting_group_9920");
  assert.equal(out.revision, 1);
  assert.equal(out.invoice.invoice_id, undefined);
  const row = store.get(`invoices:${out.invoice_id}`)!;
  assert.equal(row.revision, 1);
  assert.equal(row.status, "new");
  assert.equal(row.review_id, null);
  assert.equal(row.received_at, NOW);
  assert.deepEqual(events().map((e) => [e.invoice_id, e.kind, e.revision]), [[out.invoice_id, "received", 1]]);
});

test("the requester comes from the document, else the purchase order, else the caller, else an error", async () => {
  const named = fakeDeps({ ...extracted, requester: MAYA });
  assert.equal((await intakeInvoice({ document: "x", requester: OMAR }, named.deps)).invoice.requester, MAYA);
  const noPo = fakeDeps({ ...extracted, invoice_number: "9921", po_number: null });
  assert.equal((await intakeInvoice({ document: "x", requester: MAYA }, noPo.deps)).invoice.requester, MAYA);
  const nobody = fakeDeps({ ...extracted, invoice_number: "9922", po_number: null });
  await assert.rejects(intakeInvoice({ document: "x" }, nobody.deps), /Could not tell who requested/);
});

test("a closed purchase order is accepted, for the review to hold", async () => {
  const { deps, store } = fakeDeps({ ...extracted, vendor_name: "Halden Print & Signage", invoice_number: "5140", po_number: "PO-0994", requester: MAYA });
  store.set("purchase_orders:PO-0994", { po_number: "PO-0994", vendor_name: "Halden Print & Signage", description: "Booth graphics", amount_usd: 8_000, billed_to_date_usd: 6_450, requester: MAYA, status: "closed" });
  const out = await intakeInvoice({ document: "x" }, deps);
  assert.equal(store.get(`invoices:${out.invoice_id}`)!.po_number, "PO-0994");
});

test("an empty document, an unknown purchase order, and bad fields are refused before any write", async () => {
  const { deps, calls } = fakeDeps({ ...extracted, po_number: "PO-9999" });
  await assert.rejects(intakeInvoice({ document: "  " }, deps), /Paste the invoice text/);
  await assert.rejects(intakeInvoice({ document: "x" }, deps), /PO-9999, which is not a purchase order we have/);
  const bad = fakeDeps({ ...extracted, invoice_date: "1 Sep", line_items: [] });
  await assert.rejects(intakeInvoice({ document: "x" }, bad.deps), /invoice_date must be a date.*at least one line item/);
  for (const c of [calls, bad.calls]) assert.ok(!c.some(([n]) => n === "store__invoices__set"));
});

test("the handler wires the composite context and its uses reach every grant", async () => {
  const { store, calls, callTool } = fakeStore(NOW);
  const ctx: CustomToolContext = {
    log() {},
    signal: new AbortController().signal,
    sessionId: "sess-1",
    now: () => Date.parse(NOW),
    fs: { async readRepoFile() { return "# policy"; } },
    callTool,
    async callSubagent() {
      return JSON.stringify(extracted);
    },
  };
  const out = await intake_invoice({ document: "Invoice 9920" }, ctx);
  assert.ok(store.has(`invoices:${out.invoice_id}`));
  await assert.rejects(intake_invoice({ document: "x" }, { ...ctx, callSubagent: undefined }), /composite context/);
  assertDeclared("intake_invoice", calls.map(([n]) => n));
  assertUsesReachable("intake_invoice");
});

test("chat can intake an invoice through its granted tool without deciding it", async () => {
  assert.ok(agent.tools.includes("intake_invoice"), "chat must be able to call intake_invoice");
  for (const name of ["decide_invoice", "submit_invoice", "reset_demo"]) {
    assert.ok(!agent.tools.includes(name), `${name} stays UI-only`);
  }
  const { store, callTool } = fakeStore(NOW);
  const out = await intake_invoice({ document: "Atlas invoice 9920" }, {
    log() {},
    signal: new AbortController().signal,
    sessionId: "chat-session",
    now: () => Date.parse(NOW),
    async callTool(name, args) {
      const storeName = /^store__(\w+)__/.exec(name)![1] as keyof typeof agent.stores;
      assert.equal(agent.stores[storeName], "rw");
      return callTool(name, args);
    },
    async callSubagent() { return JSON.stringify(extracted); },
  });
  const invoice = store.get(`invoices:${out.invoice_id}`)!;
  assert.equal(invoice.status, "new");
  assert.equal(invoice.review_id, null);
  const events = [...store.entries()].filter(([key]) => key.startsWith("events:")).map(([, row]) => row);
  assert.deepEqual(events.map(({ invoice_id, kind, actor }) => [invoice_id, kind, actor]), [
    [out.invoice_id, "received", "agent"],
  ]);
});
