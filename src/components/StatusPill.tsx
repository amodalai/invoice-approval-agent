import { REC_LABEL, STATUS_LABEL, type InvoiceRow } from "../types.js";

/** The approver sees the recommendation; a requester sees the status label. */
export function StatusPill({ inv, requester }: { inv: InvoiceRow; requester?: boolean }) {
  if (requester) {
    const cls = inv.status === "returned" ? "rec-returned" : inv.status === "approved" || inv.status === "rejected" ? "decided" : "muted";
    return <span className={`pill ${cls}`}>{STATUS_LABEL[inv.status]}</span>;
  }
  if (inv.status === "approved") return <span className="pill decided">Approved</span>;
  if (inv.status === "rejected") return <span className="pill decided">Rejected</span>;
  if (inv.status === "returned") return <span className="pill rec-returned">Returned</span>;
  if (!inv.recommendation) return <span className="pill muted">Not reviewed</span>;
  return <span className={`pill rec-${inv.recommendation}`}>{REC_LABEL[inv.recommendation]}</span>;
}
