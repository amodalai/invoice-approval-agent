import { useInvoiceActions } from "../actions.js";
import { InvoiceTable } from "../components/InvoiceTable.js";
import type { Data } from "../types.js";

export function Queue({ data }: { data: Data }) {
  const actions = useInvoiceActions(data);
  const invoices = data.invoices
    .filter((i) => i.status === "new" || i.status === "reviewed" || i.status === "returned")
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const pending = invoices.filter((i) => i.status === "new" && !actions.reviewing.has(i.invoice_id));

  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            Queue
            {invoices.length ? <span className="screen__count">{invoices.length}</span> : null}
          </h2>
          <p className="sub">
            The agent checks each invoice against the spend policy and recommends <em>approve</em>, <em>hold</em>,{" "}
            <em>escalate</em>, or <em>reject</em>. You decide.
          </p>
        </div>
        <button className="btn" disabled={pending.length === 0} onClick={() => pending.forEach((i) => actions.onReview(i.invoice_id))}>
          {actions.reviewing.size > 0 ? `Reviewing ${actions.reviewing.size}…` : "Review all"}
        </button>
      </div>
      {invoices.length === 0 ? (
        <div className="empty">
          <p>Nothing to review. Submit an invoice as a requester, or reset the demo.</p>
        </div>
      ) : (
        <InvoiceTable invoices={invoices} data={data} actions={actions} />
      )}
      {actions.modal}
    </section>
  );
}
