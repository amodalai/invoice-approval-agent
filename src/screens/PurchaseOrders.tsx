import { StatusPill } from "../components/StatusPill.js";
import { hashOf } from "../routes.js";
import { usd, type Data } from "../types.js";

export function PurchaseOrders({ data }: { data: Data }) {
  const pos = [...data.pos.values()].sort(
    (a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || a.po_number.localeCompare(b.po_number),
  );
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>Purchase orders</h2>
          <p className="sub">What the company agreed to buy, what has been billed against it, and the invoices behind each balance.</p>
        </div>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>PO</th>
            <th>Vendor</th>
            <th>Requester</th>
            <th>Status</th>
            <th className="num">Amount</th>
            <th className="num">Billed</th>
            <th className="num">Remaining</th>
            <th>Invoices</th>
          </tr>
        </thead>
        <tbody>
          {pos.map((po) => (
            <tr key={po.po_number}>
              <td>
                <div className="name">{po.po_number}</div>
                <div className="note">{po.description}</div>
              </td>
              <td>{po.vendor_name}</td>
              <td>{po.requester}</td>
              <td>
                <span className={`pill ${po.status === "open" ? "rec-approve" : "muted"}`}>{po.status}</span>
              </td>
              <td className="num">{usd(po.amount_usd)}</td>
              <td className="num">{usd(po.billed_to_date_usd)}</td>
              <td className="num">{usd(po.amount_usd - po.billed_to_date_usd)}</td>
              <td>
                <ul className="plain-list">
                  {data.invoices
                    .filter((i) => i.po_number === po.po_number)
                    .map((i) => (
                      <li key={i.invoice_id}>
                        <a href={hashOf({ name: "invoice", id: i.invoice_id })}>#{i.invoice_number}</a> {usd(i.total_usd)}{" "}
                        <StatusPill inv={i} />
                      </li>
                    ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
