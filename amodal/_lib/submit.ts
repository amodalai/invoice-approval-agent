import { NEW_INVOICE_DEFAULTS } from "./demo-data.js";
import { appendEvent } from "./events.js";
import { rows, runInvoiceReview, storeGetResult, type InvoiceRow, type PORow, type ReviewDeps } from "./invoice-review.js";
import type { LineItem } from "./policy.js";

export interface SubmitParams {
  /** Present on a resubmission of a returned invoice. */
  invoice_id?: string;
  vendor_name: string;
  invoice_number: string;
  po_number: string | null;
  invoice_date: string;
  due_date: string;
  total_usd: number;
  line_items: LineItem[];
  notes: string | null;
  requester: string;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const isoDate = (s: string) => {
  const t = Date.parse(s);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/**
 * Check a submission and throw one error naming every problem. The total is
 * not forced to equal the line sum: the policy's "lines do not add up" rule
 * has to be demonstrable.
 */
export function validateSubmission(input: unknown): SubmitParams {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const required = (field: string) => {
    const v = text(p[field]);
    if (!v) problems.push(`${field} is required`);
    return v;
  };
  const date = (field: string) => {
    const v = required(field);
    if (v && !isoDate(v)) problems.push(`${field} must be a date as YYYY-MM-DD`);
    return v;
  };
  const vendor_name = required("vendor_name");
  const invoice_number = required("invoice_number");
  const requester = required("requester");
  const invoice_date = date("invoice_date");
  const due_date = date("due_date");
  const total_usd = num(p.total_usd);
  if (!(total_usd > 0)) problems.push("total_usd must be a number above 0");
  const items = Array.isArray(p.line_items) ? p.line_items : [];
  if (items.length === 0) problems.push("at least one line item is required");
  const line_items = items.map((raw, i) => {
    const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const line = { description: text(l.description), quantity: num(l.quantity), unit_price_usd: num(l.unit_price_usd) };
    if (!line.description) problems.push(`line ${i + 1} needs a description`);
    if (!(line.quantity > 0)) problems.push(`line ${i + 1} needs a quantity above 0`);
    if (!(line.unit_price_usd >= 0)) problems.push(`line ${i + 1} needs a unit price of 0 or more`);
    return line;
  });
  if (problems.length > 0) throw new Error(`${problems.join("; ")}.`);
  const invoice_id = text(p.invoice_id);
  return {
    ...(invoice_id ? { invoice_id } : {}),
    vendor_name,
    invoice_number,
    po_number: text(p.po_number) || null,
    invoice_date,
    due_date,
    total_usd,
    line_items,
    notes: text(p.notes) || null,
    requester,
  };
}

/**
 * Write the invoice (a new row, or the returned one at revision + 1), append
 * the event, then review the row held in memory: a run cannot read back its
 * own writes. A review failure leaves the invoice `new` for the approver's
 * Review button to retry.
 */
export async function submitInvoice(input: unknown, deps: ReviewDeps) {
  const { invoice_id: id, ...fields } = validateSubmission(input);
  const nowIso = deps.now().toISOString();
  const others = rows<InvoiceRow>(
    await deps.callTool("store__invoices__query", { where: { vendor_name: fields.vendor_name }, limit: 200 }),
  );

  let invoice: InvoiceRow;
  if (id) {
    const existing = storeGetResult<InvoiceRow>(await deps.callTool("store__invoices__get", { key: id }));
    if (!existing) throw new Error(`Invoice ${id} not found.`);
    if (existing.status !== "returned") {
      throw new Error(`Invoice ${id} is ${existing.status}; only a returned invoice can be resubmitted.`);
    }
    if (existing.requester !== fields.requester) throw new Error(`Invoice ${id} was submitted by ${existing.requester}.`);
    invoice = { ...existing, ...fields, ...NEW_INVOICE_DEFAULTS, revision: (existing.revision ?? 1) + 1, submitted_at: nowIso };
  } else {
    const base = `inv_${slug(fields.vendor_name)}_${slug(fields.invoice_number)}`;
    const taken = async (key: string) => !!storeGetResult<InvoiceRow>(await deps.callTool("store__invoices__get", { key }));
    let invoice_id = base;
    for (let n = 2; await taken(invoice_id); n += 1) invoice_id = `${base}_${n}`;
    invoice = { invoice_id, ...fields, revision: 1, ...NEW_INVOICE_DEFAULTS, received_at: nowIso, submitted_at: nowIso, created_at: nowIso };
  }
  const revision = invoice.revision!;
  await deps.callTool("store__invoices__set", { key: invoice.invoice_id, value: invoice });
  await appendEvent(deps, { invoice_id: invoice.invoice_id, kind: id ? "resubmitted" : "submitted", actor: fields.requester, revision });

  const po = fields.po_number
    ? storeGetResult<PORow>(await deps.callTool("store__purchase_orders__get", { key: fields.po_number }))
    : undefined;
  const out = await runInvoiceReview(invoice.invoice_id, deps, { invoice, po, others });
  return { invoice_id: invoice.invoice_id, revision, recommendation: out.recommendation, review_id: out.review_id };
}
