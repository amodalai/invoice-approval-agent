import { invoiceMath } from "../../amodal/_lib/policy.js";
import { useInvoiceActions } from "../actions.js";
import { InvoiceActionButtons } from "../components/InvoiceActions.js";
import { ReviewBody } from "../components/ReviewBody.js";
import { StatusPill } from "../components/StatusPill.js";
import { Timeline } from "../components/Timeline.js";
import { hashOf } from "../routes.js";
import { REC_LABEL, latestReview, remaining, usd, type Data, type InvoiceRow } from "../types.js";
import { Submit } from "./Submit.js";

/** Dates, purchase order, line items against the stated total, notes. */
export function InvoiceSection({ inv, data }: { inv: InvoiceRow; data: Data }) {
  const po = inv.po_number ? data.pos.get(inv.po_number) : undefined;
  const math = invoiceMath({
    line_items: inv.line_items,
    total_usd: inv.total_usd,
  });
  return (
    <section className="card">
      <h3>Invoice</h3>
      <dl className="fields">
        <dt>Invoice date</dt>
        <dd>{inv.invoice_date}</dd>
        <dt>Due</dt>
        <dd>{inv.due_date}</dd>
        <dt>Purchase order</dt>
        <dd>
          {po ? (
            <>
              {po.po_number}: {po.description}
              <div className="note">
                {usd(remaining(po))} remaining of {usd(po.amount_usd)}, {po.status}
              </div>
            </>
          ) : (
            (inv.po_number ?? "None")
          )}
        </dd>
      </dl>
      <table className="grid grid--compact">
        <thead>
          <tr>
            <th>Line</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.line_items.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{l.quantity}</td>
              <td className="num">{usd(l.unit_price_usd)}</td>
              <td className="num">{usd(l.quantity * l.unit_price_usd)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>Lines sum to</td>
            <td className="num">{usd(math.line_sum_usd)}</td>
          </tr>
          <tr>
            <td colSpan={3}>
              Stated total
              {math.total_matches_lines ? "" : <span className="row-error"> (does not match the lines)</span>}
            </td>
            <td className="num">
              <strong>{usd(inv.total_usd)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {inv.notes ? <p className="note">{inv.notes}</p> : null}
    </section>
  );
}

/**
 * The requester's view: the invoice and its status label; on a return, the
 * note, the issues, and the form to resubmit; once decided, the approver's
 * note. No checks, no recommendation, no timeline.
 */
function RequesterDetail({ inv, data }: { inv: InvoiceRow; data: Data }) {
  const review = latestReview(data, inv);
  return (
    <>
      <InvoiceSection inv={inv} data={data} />
      {inv.status === "returned" ? (
        <>
          <section className="card">
            <h3>Returned by the approver</h3>
            <p>{inv.returned_note}</p>
            {review?.issues.length ? (
              <ul className="issue-list">
                {review.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </section>
          <Submit data={data} initial={inv} />
        </>
      ) : null}
      {inv.status === "approved" || inv.status === "rejected" ? (
        <section className="card">
          <h3>{inv.status === "approved" ? "Approved" : "Rejected"} by the approver</h3>
          <p>{inv.decision_note ?? <span className="sub">No note.</span>}</p>
        </section>
      ) : null}
    </>
  );
}

export function InvoiceDetail({ id, data, requester }: { id: string; data: Data; requester: boolean }) {
  const actions = useInvoiceActions(data);
  const inv = data.invoices.find((i) => i.invoice_id === id);
  if (!inv) {
    return (
      <div className="empty">
        <p>No invoice {id}.</p>
        <a href={hashOf({ name: requester ? "mine" : "queue" })}>Back</a>
      </div>
    );
  }
  const review = latestReview(data, inv);
  const reviews = data.reviews.get(id) ?? [];
  const events = data.events.filter((e) => e.invoice_id === id);
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>
            {inv.vendor_name} #{inv.invoice_number}
          </h2>
          <p className="sub">
            {usd(inv.total_usd)} · {inv.requester} · revision {inv.revision} · {inv.invoice_id}
          </p>
        </div>
        <StatusPill inv={inv} requester={requester} />
      </div>
      {requester ? (
        <RequesterDetail inv={inv} data={data} />
      ) : (
        <>
          <InvoiceSection inv={inv} data={data} />
          <section className="card">
            <h3>Latest review</h3>
            {review ? (
              <>
                <p>
                  <span className={`pill rec-${review.recommendation}`}>{REC_LABEL[review.recommendation]}</span>{" "}
                  <span className="muted-text">revision {review.revision}</span>
                </p>
                <ReviewBody review={review} />
              </>
            ) : (
              <p className="sub">Not reviewed yet.</p>
            )}
          </section>
          <section className="card">
            <h3>Actions</h3>
            <div className="actions">
              <InvoiceActionButtons inv={inv} actions={actions} />
            </div>
          </section>
          <section className="card">
            <h3>Timeline</h3>
            <Timeline events={events} reviews={reviews} />
          </section>
          {actions.modal}
        </>
      )}
    </section>
  );
}
