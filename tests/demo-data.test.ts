import { test } from "node:test";
import assert from "node:assert/strict";
import { INVOICES, PURCHASE_ORDERS, ensureExamplesSeeded, invoiceRow } from "../amodal/_lib/demo-data.js";
import { invoiceMath } from "../amodal/_lib/policy.js";

test("every demo invoice's lines add up to its total", () => {
  for (const inv of INVOICES) {
    assert.equal(invoiceMath({ line_items: inv.line_items, total_usd: inv.total_usd }).total_matches_lines, true, inv.invoice_id);
  }
});

test("every cited purchase order exists and belongs to the same vendor", () => {
  for (const inv of INVOICES) {
    if (!inv.po_number) continue;
    const po = PURCHASE_ORDERS.find((p) => p.po_number === inv.po_number);
    assert.ok(po, `${inv.invoice_id} cites ${inv.po_number}`);
    assert.equal(po.vendor_name, inv.vendor_name, inv.invoice_id);
  }
});

test("received_at follows the arrival offsets, so the resend comes after the original", () => {
  const at = (id: string) => invoiceRow(INVOICES.find((i) => i.invoice_id === id)!, "2026-09-01T00:00:00.000Z").received_at;
  assert.ok(at("inv_brightline_0417") < at("inv_brightline_0417_resend"));
});

test("seeding writes only the rows that are missing", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const present = { purchase_orders: ["PO-1041"], invoices: ["inv_atlas_9911"] };
  const seeded = await ensureExamplesSeeded({
    async callTool(name, args) {
      calls.push([name, args]);
      const m = /^store__(\w+)__query$/.exec(name);
      if (!m) return {};
      const store = m[1] as keyof typeof present;
      const field = store === "invoices" ? "invoice_id" : "po_number";
      return { documents: present[store].map((k) => ({ payload: { [field]: k } })) };
    },
    now: () => new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(seeded, INVOICES.length - 1);
  const written = calls.filter(([n]) => n.endsWith("__set")).map(([, a]) => a.key);
  assert.deepEqual(
    written,
    [...PURCHASE_ORDERS.map((p) => p.po_number).filter((k) => k !== "PO-1041"), ...INVOICES.map((i) => i.invoice_id).filter((k) => k !== "inv_atlas_9911")],
  );
  const firstInvoice = calls.find(([n, a]) => n === "store__invoices__set" && a.key === "inv_brightline_0417")![1].value as Record<string, unknown>;
  assert.equal(firstInvoice.status, "new");
  assert.equal(firstInvoice.recommendation, null);
  assert.equal(firstInvoice.po_number, "PO-1041");
});
