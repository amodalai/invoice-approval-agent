import type { InvoiceActions } from "../actions.js";
import { isDecided, type InvoiceRow } from "../types.js";

/** Review, and on a reviewed invoice Approve / Return / Reject. Hidden once decided. */
export function InvoiceActionButtons({ inv, actions }: { inv: InvoiceRow; actions: InvoiceActions }) {
  const busy = actions.reviewing.has(inv.invoice_id);
  const error = actions.errors.get(inv.invoice_id);
  return (
    <>
      {error ? <div className="row-error">{error}</div> : null}
      {isDecided(inv) ? (
        inv.decision_note ? <div className="note">{inv.decision_note}</div> : null
      ) : (
        <>
          <button className="btn" disabled={busy} onClick={() => actions.onReview(inv.invoice_id)}>
            {busy ? "Reviewing…" : inv.review_id ? "Re-review" : "Review"}
          </button>
          {inv.status === "reviewed" ? (
            <div className="decide">
              <button className="btn btn--ghost" onClick={() => actions.onDecide(inv, "approved")}>
                Approve
              </button>
              <button className="btn btn--ghost" onClick={() => actions.onDecide(inv, "returned")}>
                Return
              </button>
              <button className="btn btn--ghost" onClick={() => actions.onDecide(inv, "rejected")}>
                Reject
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
