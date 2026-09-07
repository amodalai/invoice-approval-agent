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
          <h1>
            Invoice approval
            {invoices.length ? <span className="screen__count">{invoices.length}</span> : null}
          </h1>
          <p className="sub">
            The agent checks the invoice and explains its recommendation. You approve, return, or reject it.
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
      <ol className="demo-flow" aria-label="Try the demo">
        <li><strong>1. Review the examples</strong><p>Use Review all to compare a clean invoice, a duplicate, and a purchase-order mismatch.</p></li>
        <li><strong>2. Read the reason</strong><p>Open a vendor to see the invoice, the policy checks, and the agent’s explanation.</p></li>
        <li><strong>3. Make the decision</strong><p>Approve a match or return it with a note. Switch to Requester to correct it and resubmit.</p></li>
      </ol>
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
