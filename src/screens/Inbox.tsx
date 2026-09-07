import { useState } from "react";
import { useInvoiceActions } from "../actions.js";
import { Intake } from "../components/Intake.js";
import { InvoiceTable } from "../components/InvoiceTable.js";
import type { Data } from "../types.js";

export function Inbox({ data }: { data: Data }) {
  const actions = useInvoiceActions(data);
  const [pasting, setPasting] = useState(false);
  const invoices = data.invoices
    .filter((i) => i.status === "new" || i.status === "reviewed" || i.status === "returned")
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const queued = actions.reviewing.size - (actions.activeReview ? 1 : 0);
  const reviewLabel = actions.activeReview ? `Reviewing 1${queued ? ` · ${queued} queued` : ""}…` : queued ? `Queued ${queued}…` : undefined;
  const pending = invoices.filter((i) => i.status === "new" && !actions.reviewing.has(i.invoice_id));

  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            Inbox
            {invoices.length ? <span className="screen__count">{invoices.length}</span> : null}
          </h2>
          <p className="sub">
            Vendor invoices waiting for payment. The agent matches each one to its purchase order, checks the spend policy, and
            recommends. You decide.
          </p>
        </div>
        <div className="screen__actions">
          <button className="btn btn--ghost" disabled={pasting} onClick={() => setPasting(true)}>
            Paste an invoice
          </button>
          <button className="btn" disabled={pending.length === 0} onClick={() => pending.forEach((i) => actions.onReview(i.invoice_id))}>
            {reviewLabel ?? (pending.length > 1 ? `Review all ${pending.length}` : "Review")}
          </button>
        </div>
      </div>
      {pasting ? (
        <Intake
          review={false}
          onCancel={() => setPasting(false)}
          onDone={async (id) => {
            await data.refetch();
            setPasting(false);
            actions.onReview(id);
          }}
        />
      ) : null}
      {invoices.length === 0 ? (
        <div className="empty">
          <p>Nothing waiting. Paste an invoice, or reset the demo.</p>
        </div>
      ) : (
        <InvoiceTable invoices={invoices} data={data} actions={actions} />
      )}
      {actions.modal}
    </section>
  );
}
