import type { InvoiceActions } from "../actions.js";
import { DECISION_LABEL, PRIMARY_DECISION, isDecided, type Decision, type InvoiceRow } from "../types.js";

const ORDER: Decision[] = ["approved", "returned", "rejected"];

/**
 * Review on a new invoice; on a reviewed one, the decision the recommendation
 * points at as the primary button and the other two beside it. `detail` adds
 * Re-review. Hidden once decided, and while a review runs.
 */
export function InvoiceActionButtons({ inv, actions, detail }: { inv: InvoiceRow; actions: InvoiceActions; detail?: boolean }) {
  const error = actions.errors.get(inv.invoice_id);
  if (isDecided(inv)) return inv.decision_note ? <div className="note">{inv.decision_note}</div> : null;
  if (actions.reviewing.has(inv.invoice_id)) return null;
  const primary = inv.status === "reviewed" && inv.recommendation ? PRIMARY_DECISION[inv.recommendation] : undefined;
  return (
    <>
      {error ? <div className="row-error">{error}</div> : null}
      <div className="act-row">
        {primary ? (
          <>
            <button className={`btn btn--${primary}`} onClick={() => actions.onDecide(inv, primary)}>
              {DECISION_LABEL[primary]}
            </button>
            <div className="decide">
              {ORDER.filter((d) => d !== primary).map((d) => (
                <button key={d} className="btn btn--ghost" onClick={() => actions.onDecide(inv, d)}>
                  {DECISION_LABEL[d]}
                </button>
              ))}
              {detail ? (
                <button className="btn btn--ghost" onClick={() => actions.onReview(inv.invoice_id)}>
                  Re-review
                </button>
              ) : null}
            </div>
          </>
        ) : inv.status === "returned" ? (
          <span className="muted-text">With {inv.requester}</span>
        ) : (
          <button className="btn" onClick={() => actions.onReview(inv.invoice_id)}>
            Review
          </button>
        )}
      </div>
    </>
  );
}
