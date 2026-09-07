import type { InvoiceActions } from "../actions.js";
import { hashOf } from "../routes.js";
import { reviewSteps } from "../steps.js";
import { latestReview, reasonOf, remaining, usd, type Data, type InvoiceRow } from "../types.js";
import { InvoiceActionButtons } from "./InvoiceActions.js";
import { ReviewSteps } from "./ReviewSteps.js";
import { StatusPill } from "./StatusPill.js";

function Verdict({ inv, data, actions }: { inv: InvoiceRow; data: Data; actions: InvoiceActions }) {
  if (actions.reviewing.has(inv.invoice_id)) {
    if (actions.activeReview !== inv.invoice_id) return <span className="muted-text">Queued for review…</span>;
    const po = inv.po_number ? data.pos.get(inv.po_number) : undefined;
    return <ReviewSteps steps={reviewSteps(inv, po, data.invoices.filter((o) => o.vendor_name === inv.vendor_name))} />;
  }
  const review = inv.status === "reviewed" ? latestReview(data, inv) : undefined;
  return (
    <>
      <StatusPill inv={inv} />
      {review ? <div className="reason">{reasonOf(review)}</div> : null}
      {inv.status === "returned" && inv.returned_note ? <div className="reason">{inv.returned_note}</div> : null}
    </>
  );
}

function Row({ inv, data, actions }: { inv: InvoiceRow; data: Data; actions: InvoiceActions }) {
  const po = inv.po_number ? data.pos.get(inv.po_number) : undefined;
  return (
    <tr>
      <td>
        <a className="name" href={hashOf({ name: "invoice", id: inv.invoice_id })}>
          {inv.vendor_name}
        </a>
        <div className="id">
          #{inv.invoice_number}
          {inv.revision > 1 ? ` · rev ${inv.revision}` : ""}
        </div>
        <div className="note">{inv.requester}</div>
      </td>
      <td className="po">
        {po ? (
          <>
            <div>{po.po_number}</div>
            <div className="note po__scope" title={po.description}>
              {po.description}
            </div>
            <div className="note">{usd(remaining(po))} remaining</div>
          </>
        ) : (
          <span className="muted-text">{inv.po_number ?? "None"}</span>
        )}
      </td>
      <td className="num">{usd(inv.total_usd)}</td>
      <td className="verdict">
        <Verdict inv={inv} data={data} actions={actions} />
      </td>
      <td className="act">
        <InvoiceActionButtons inv={inv} actions={actions} />
      </td>
    </tr>
  );
}

export function InvoiceTable({ invoices, data, actions }: { invoices: InvoiceRow[]; data: Data; actions: InvoiceActions }) {
  return (
    <div className="table-scroll" role="region" aria-label="Invoice queue" tabIndex={0}>
    <table className="grid">
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Purchase order</th>
          <th className="num">Total</th>
          <th>Recommendation</th>
          <th className="act"></th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <Row key={inv.invoice_id} inv={inv} data={data} actions={actions} />
        ))}
      </tbody>
    </table>
    </div>
  );
}
