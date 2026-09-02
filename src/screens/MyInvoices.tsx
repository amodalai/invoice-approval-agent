import { StatusPill } from "../components/StatusPill.js";
import { hashOf } from "../routes.js";
import { usd, when, type Data } from "../types.js";

export function MyInvoices({ data }: { data: Data }) {
  const mine = [...data.invoices].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>My invoices</h2>
          <p className="sub">Everything submitted for review, newest first. A returned invoice can be edited and resubmitted.</p>
        </div>
      </div>
      {mine.length === 0 ? (
        <div className="empty">
          <p>Nothing submitted yet.</p>
          <a href={hashOf({ name: "submit" })}>Submit an invoice</a>
        </div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="num">Total</th>
              <th>Purchase order</th>
              <th>Submitted</th>
              <th>Status</th>
              <th className="act"></th>
            </tr>
          </thead>
          <tbody>
            {mine.map((inv) => (
              <tr key={inv.invoice_id}>
                <td>
                  <a className="name" href={hashOf({ name: "invoice", id: inv.invoice_id })}>
                    {inv.vendor_name}
                  </a>
                  <div className="id">
                    #{inv.invoice_number}
                    {inv.revision > 1 ? ` · rev ${inv.revision}` : ""}
                  </div>
                </td>
                <td className="num">{usd(inv.total_usd)}</td>
                <td>{inv.po_number ?? <span className="muted-text">None</span>}</td>
                <td className="nowrap">{when(inv.submitted_at)}</td>
                <td>
                  <StatusPill inv={inv} requester />
                  {inv.status === "returned" && inv.returned_note ? <div className="note">{inv.returned_note}</div> : null}
                </td>
                <td className="act">
                  {inv.status === "returned" ? (
                    <a className="btn" href={hashOf({ name: "invoice", id: inv.invoice_id })}>
                      Edit and resubmit
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
