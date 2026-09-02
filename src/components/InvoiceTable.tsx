import type { InvoiceActions } from "../actions.js";
import { hashOf } from "../routes.js";
import { latestReview, remaining, usd, type Data, type InvoiceRow } from "../types.js";
import { InvoiceActionButtons } from "./InvoiceActions.js";
import { StatusPill } from "./StatusPill.js";

function Row({ inv, data, actions }: { inv: InvoiceRow; data: Data; actions: InvoiceActions }) {
  const po = inv.po_number ? data.pos.get(inv.po_number) : undefined;
  const review = latestReview(data, inv);
  const amountNote = review?.checks?.find((c) => c.name === "amount")?.note?.trim();
  return (
    <tr>
      <td>
        <a className="name" href={hashOf({ name: "invoice", id: inv.invoice_id })}>
          {inv.vendor_name}
        </a>
        <div className="id">
          #{inv.invoice_number} · {inv.invoice_id}
          {inv.revision > 1 ? ` · rev ${inv.revision}` : ""}
        </div>
        {inv.notes ? <div className="note">{inv.notes}</div> : null}
      </td>
      <td>{inv.requester}</td>
      <td>
        {po ? (
          <>
            <div>{po.po_number}</div>
            <div className="note">{po.description}</div>
            <div className="note">{usd(remaining(po))} remaining</div>
          </>
        ) : (
          <span className="muted-text">{inv.po_number ?? "None"}</span>
        )}
      </td>
      <td className="num">{usd(inv.total_usd)}</td>
      <td>{inv.due_date}</td>
      <td>
        <StatusPill inv={inv} />
        {amountNote ? <div className="note">{amountNote}</div> : null}
      </td>
      <td className="issues">
        {review?.issues?.length ? (
          <ul className="issue-list">
            {review.issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td className="act">
        <InvoiceActionButtons inv={inv} actions={actions} />
      </td>
    </tr>
  );
}

export function InvoiceTable({ invoices, data, actions }: { invoices: InvoiceRow[]; data: Data; actions: InvoiceActions }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Requester</th>
          <th>Purchase order</th>
          <th className="num">Total</th>
          <th>Due</th>
          <th>Recommendation</th>
          <th>Issues</th>
          <th className="act"></th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <Row key={inv.invoice_id} inv={inv} data={data} actions={actions} />
        ))}
      </tbody>
    </table>
  );
}
