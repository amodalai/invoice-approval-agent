import { INVOICES, PURCHASE_ORDERS, type ExampleInvoice, type ExamplePO } from "./examples.js";

export { INVOICES, PURCHASE_ORDERS };

interface SeedCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
}

/** The demo's clock: invoices "arrived" over the days before this date. */
const DEMO_NOW = "2026-09-01T09:00:00.000Z";

export const NEW_INVOICE_DEFAULTS = {
  status: "new" as const,
  recommendation: null,
  reviewed_at: null,
  decided_at: null,
  decision_note: null,
};

export function poRow(po: ExamplePO, nowIso: string) {
  return {
    po_number: po.po_number,
    vendor_name: po.vendor_name,
    description: po.description,
    amount_usd: po.amount_usd,
    billed_to_date_usd: po.billed_to_date_usd ?? 0,
    requester: po.requester,
    status: po.status ?? "open",
    created_at: nowIso,
  };
}

export function invoiceRow(inv: ExampleInvoice, nowIso: string) {
  const received = new Date(DEMO_NOW);
  received.setUTCDate(received.getUTCDate() - 7 + inv.received_offset_days);
  return {
    invoice_id: inv.invoice_id,
    vendor_name: inv.vendor_name,
    invoice_number: inv.invoice_number,
    po_number: inv.po_number ?? null,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    total_usd: inv.total_usd,
    line_items: inv.line_items,
    notes: inv.notes ?? null,
    ...NEW_INVOICE_DEFAULTS,
    received_at: received.toISOString(),
    created_at: nowIso,
  };
}

/**
 * Write every demo purchase order and invoice that is not already in the
 * stores. Idempotent per row, so `seed` is safe to resend. Returns how many
 * invoices were written.
 */
export async function ensureExamplesSeeded(ctx: SeedCtx): Promise<number> {
  const nowIso = (ctx.now ? ctx.now() : new Date()).toISOString();
  const keys = async (store: string, field: string) => {
    const q = (await ctx.callTool(`store__${store}__query`, { limit: 1000 })) as {
      documents?: Array<{ payload: Record<string, unknown> }>;
    };
    return new Set((q.documents ?? []).map((d) => d.payload[field]));
  };

  const pos = await keys("purchase_orders", "po_number");
  for (const po of PURCHASE_ORDERS) {
    if (pos.has(po.po_number)) continue;
    await ctx.callTool("store__purchase_orders__set", {
      key: po.po_number,
      value: poRow(po, nowIso),
    });
  }

  const invoices = await keys("invoices", "invoice_id");
  let seeded = 0;
  for (const inv of INVOICES) {
    if (invoices.has(inv.invoice_id)) continue;
    seeded += 1;
    await ctx.callTool("store__invoices__set", {
      key: inv.invoice_id,
      value: invoiceRow(inv, nowIso),
    });
  }
  return seeded;
}
