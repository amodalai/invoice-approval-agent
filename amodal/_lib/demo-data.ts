import {
  BACKLOG,
  BACKLOG_PURCHASE_ORDERS,
  INVOICES,
  PURCHASE_ORDERS,
  type ExampleInvoice,
  type ExamplePO,
} from "./examples.js";
import { eventRow, type EventInput, type EventRow } from "./events.js";
import { reviewKey } from "./invoice-review.js";

export { INVOICES, PURCHASE_ORDERS };

interface SeedCtx {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now?(): Date;
}

/** The demo's clock: invoices "arrived" over the days before this date. */
const DEMO_NOW = "2026-09-01T09:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const NEW_INVOICE_DEFAULTS = {
  status: "new" as const,
  recommendation: null,
  review_id: null,
  reviewed_at: null,
  decided_at: null,
  decision_note: null,
  returned_note: null,
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
    requester: inv.requester,
    revision: 1,
    ...NEW_INVOICE_DEFAULTS,
    received_at: received.toISOString(),
    submitted_at: received.toISOString(),
    created_at: nowIso,
  };
}

/**
 * The backlog in its final state: each invoice with one review per revision
 * and its events (submitted, reviewed, then returned and resubmitted for
 * every revision but the last, then the decision), timed from `received_at`.
 */
function backlogRows(nowIso: string) {
  const invoices: Array<Record<string, unknown>> = [];
  const reviews: Array<Record<string, unknown>> = [];
  const events: EventRow[] = [];
  for (const inv of BACKLOG) {
    const base = invoiceRow(inv, nowIso);
    const received = Date.parse(base.received_at);
    const event = (e: EventInput, at: Date) =>
      events.push(eventRow({ invoice_id: inv.invoice_id, ...e }, at, `${inv.invoice_id}_${events.length}`));
    const last = inv.reviews.length - 1;
    let latest = { review_id: "", reviewed_at: "", submitted_at: "", decided_at: "" };
    inv.reviews.forEach((r, i) => {
      const revision = i + 1;
      const submitted = new Date(received + i * 3 * DAY);
      const reviewed = new Date(submitted.getTime() + HOUR);
      const decided = new Date(submitted.getTime() + DAY);
      const review_id = reviewKey(inv.invoice_id, revision, reviewed);
      event({ kind: i === 0 ? "submitted" : "resubmitted", actor: inv.requester, revision }, submitted);
      reviews.push({ review_id, invoice_id: inv.invoice_id, revision, ...r, reviewer_session_id: "seed", created_at: reviewed.toISOString() });
      event({ kind: "reviewed", actor: "agent", recommendation: r.recommendation, revision }, reviewed);
      event(
        i === last
          ? { kind: inv.decided, actor: "approver", note: inv.decision_note, revision }
          : { kind: "returned", actor: "approver", note: inv.returned_note, revision },
        decided,
      );
      latest = {
        review_id,
        reviewed_at: reviewed.toISOString(),
        submitted_at: submitted.toISOString(),
        decided_at: decided.toISOString(),
      };
    });
    invoices.push({
      ...base,
      ...latest,
      revision: inv.reviews.length,
      status: inv.decided,
      recommendation: inv.reviews[last].recommendation,
      decision_note: inv.decision_note ?? null,
    });
  }
  return { invoices, reviews, events };
}

/** Every row the seed writes, per store, with the field that is the store key. */
export function seedRows(nowIso: string) {
  const backlog = backlogRows(nowIso);
  const live = INVOICES.map((i) => invoiceRow(i, nowIso));
  return [
    { store: "purchase_orders", field: "po_number", rows: [...PURCHASE_ORDERS, ...BACKLOG_PURCHASE_ORDERS].map((p) => poRow(p, nowIso)) },
    { store: "invoices", field: "invoice_id", rows: [...backlog.invoices, ...live] },
    { store: "reviews", field: "review_id", rows: backlog.reviews },
    {
      store: "events",
      field: "event_id",
      rows: [
        ...backlog.events,
        ...live.map((i) => eventRow({ invoice_id: i.invoice_id, kind: "seeded", actor: "system", revision: 1 }, new Date(i.received_at), `${i.invoice_id}_0`)),
      ],
    },
  ] as Array<{ store: string; field: string; rows: Array<Record<string, unknown>> }>;
}

/**
 * Write every demo purchase order, invoice, review, and event that is not
 * already in the stores. Idempotent per row, so `seed` is safe to resend.
 * `assumeEmpty` skips the lookups: reset_demo removes every row first and
 * cannot read back its own removes. Returns how many invoices were written.
 */
export async function ensureExamplesSeeded(ctx: SeedCtx, opts: { assumeEmpty?: boolean } = {}): Promise<number> {
  const nowIso = (ctx.now ? ctx.now() : new Date()).toISOString();
  let seeded = 0;
  for (const { store, field, rows } of seedRows(nowIso)) {
    const present = new Set<unknown>();
    if (!opts.assumeEmpty) {
      const q = (await ctx.callTool(`store__${store}__query`, { limit: 1000 })) as {
        documents?: Array<{ payload: Record<string, unknown> }>;
      };
      for (const d of q.documents ?? []) present.add(d.payload[field]);
    }
    for (const row of rows) {
      if (present.has(row[field])) continue;
      if (store === "invoices") seeded += 1;
      await ctx.callTool(`store__${store}__set`, { key: row[field], value: row });
    }
  }
  return seeded;
}
