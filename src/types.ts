import type { EventRow } from "../amodal/_lib/events.js";
import type { Check, Recommendation } from "../amodal/_lib/invoice-review.js";
import type { LineItem } from "../amodal/_lib/policy.js";

export type { Check, EventRow, LineItem, Recommendation };

export interface InvoiceRow {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  po_number?: string | null;
  invoice_date: string;
  due_date: string;
  total_usd: number;
  line_items: LineItem[];
  notes?: string | null;
  requester: string;
  revision: number;
  status: "new" | "reviewed" | "approved" | "rejected" | "returned";
  recommendation?: Recommendation | null;
  review_id?: string | null;
  reviewed_at?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  returned_note?: string | null;
  received_at: string;
  submitted_at: string;
}

export interface PORow {
  po_number: string;
  vendor_name: string;
  description: string;
  amount_usd: number;
  billed_to_date_usd: number;
  requester: string;
  status: "open" | "closed";
}

export interface ReviewRow {
  review_id: string;
  invoice_id: string;
  revision: number;
  recommendation: Recommendation;
  summary: string;
  checks?: Check[];
  issues: string[];
  created_at: string;
}

export type Decision = "approved" | "rejected" | "returned";

/** Every store, loaded once at the top and passed to the screens. */
export interface Data {
  invoices: InvoiceRow[];
  pos: Map<string, PORow>;
  /** Per invoice, newest first. */
  reviews: Map<string, ReviewRow[]>;
  /** Newest first. */
  events: EventRow[];
  refetch(): Promise<void>;
}

export const REC_LABEL: Record<Recommendation, string> = {
  approve: "Approve",
  hold: "Hold",
  escalate: "Escalate",
  reject: "Reject",
};

/** What a requester sees in place of the recommendation. */
export const STATUS_LABEL: Record<InvoiceRow["status"], string> = {
  new: "Under review",
  reviewed: "Under review",
  returned: "Returned, action needed",
  approved: "Approved",
  rejected: "Rejected",
};

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const isDecided = (inv: InvoiceRow) => inv.status === "approved" || inv.status === "rejected";

/** The review the invoice names, else the newest one. */
export const latestReview = (data: Data, inv: InvoiceRow) => {
  const mine = data.reviews.get(inv.invoice_id) ?? [];
  return mine.find((r) => r.review_id === inv.review_id) ?? mine[0];
};
