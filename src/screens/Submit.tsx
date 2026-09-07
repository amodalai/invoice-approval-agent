import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { Intake } from "../components/Intake.js";
import { LineItemsEditor, emptyLine, lineAmount, type LineDraft } from "../components/LineItemsEditor.js";
import { hashOf } from "../routes.js";
import { REQUESTERS } from "../../amodal/_lib/examples.js";
import { errorMessage, runTool } from "../tools.js";
import { remaining, usd, type Data, type InvoiceRow } from "../types.js";
import type { SubmissionOutcome } from "../../amodal/_lib/submit.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (days: number) => isoDay(new Date(Date.now() + days * 86_400_000));

/** Paste the invoice, or fill in the fields. With `initial` it is the form, resubmitting that returned invoice. */
export function Submit({ data, initial }: { data: Data; initial?: InvoiceRow }) {
  const [typing, setTyping] = useState(!!initial);
  if (!typing) {
    return (
      <>
        <Intake
          review
          onDone={async (id) => {
            await data.refetch();
            location.hash = hashOf({ name: "invoice", id });
          }}
        />
        <p className="sub switch">
          No document to paste?{" "}
          <button type="button" className="link" onClick={() => setTyping(true)}>
            Fill in the fields instead
          </button>
        </p>
      </>
    );
  }
  return <InvoiceForm data={data} initial={initial} />;
}

function InvoiceForm({ data, initial }: { data: Data; initial?: InvoiceRow }) {
  const submit = useToolRun<Record<string, unknown>>("submit_invoice");
  const [vendor, setVendor] = useState(initial?.vendor_name ?? "");
  const [number, setNumber] = useState(initial?.invoice_number ?? "");
  const [po, setPo] = useState(initial?.po_number ?? "");
  const [requester, setRequester] = useState(initial?.requester ?? REQUESTERS[0]);
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date ?? plusDays(0));
  const [dueDate, setDueDate] = useState(initial?.due_date ?? plusDays(30));
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.line_items.map((l) => ({ description: l.description, quantity: String(l.quantity), unit_price_usd: String(l.unit_price_usd) })) ?? [emptyLine()],
  );
  const lineSum = Math.round(lines.reduce((s, l) => s + lineAmount(l), 0) * 100) / 100;
  const [customTotal, setCustomTotal] = useState(!!initial && initial.total_usd !== lineSum);
  const [total, setTotal] = useState(initial ? String(initial.total_usd) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SubmissionOutcome | null>(null);

  const openPos = [...data.pos.values()].filter((p) => p.status === "open");

  // The person who asked for the work is usually the one on the purchase order.
  function choosePo(po_number: string) {
    setPo(po_number);
    const chosen = data.pos.get(po_number);
    if (chosen && (REQUESTERS as readonly string[]).includes(chosen.requester)) setRequester(chosen.requester);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await runTool<Record<string, unknown>, SubmissionOutcome>(submit, {
        ...(initial ? { invoice_id: initial.invoice_id } : {}),
        vendor_name: vendor,
        invoice_number: number,
        po_number: po || null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        total_usd: customTotal ? Number(total) : lineSum,
        line_items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price_usd: Number(l.unit_price_usd) })),
        notes: notes || null,
        requester,
      });
      if (!result?.invoice_id) throw new Error("Check My invoices before submitting again; the saved invoice id was not returned.");
      setSaved(result);
      await data.refetch();
      if (!result.review_error) location.hash = hashOf({ name: "invoice", id: result.invoice_id });
    } catch (err) {
      setError(errorMessage(err, "The submission failed."));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSaved() {
    setBusy(true);
    setError(null);
    try {
      await data.refetch();
    } catch (err) {
      setError(errorMessage(err, "The status could not be refreshed."));
    } finally {
      setBusy(false);
    }
  }

  if (saved) return (
    <section className="card">
      <h3>Invoice submitted</h3>
      <p role="status">
        {saved.review_error
          ? "Your invoice is saved, but its review could not finish. The approver can retry it from the inbox."
          : "Your invoice is saved and reviewed."}
      </p>
      {saved.review_error ? <p className="sub">{saved.review_error}</p> : null}
      {error ? (
        <div className="banner error" role="alert">
          The invoice is saved, but its status could not be refreshed. {error}{" "}
          <button className="btn btn--ghost" disabled={busy} onClick={() => void refreshSaved()}>Retry refresh</button>
        </div>
      ) : null}
      <a className="btn" href={hashOf({ name: "invoice", id: saved.invoice_id })}>View invoice</a>
    </section>
  );

  return (
    <form className="card form" aria-busy={busy} onSubmit={(e) => void onSubmit(e)}>
      <fieldset className="form__fields" disabled={busy} aria-label="Invoice details">
      <h3>{initial ? `Edit and resubmit #${initial.invoice_number}` : "Submit an invoice"}</h3>
      <div className="form__row">
        <label>
          Vendor
          <input disabled={busy} required value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" />
        </label>
        <label>
          Invoice number
          <input disabled={busy} required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="As printed on the invoice" />
        </label>
      </div>
      <div className="form__row">
        <label>
          Purchase order
          <select disabled={busy} value={po} onChange={(e) => choosePo(e.target.value)}>
            <option value="">None</option>
            {openPos.map((p) => (
              <option key={p.po_number} value={p.po_number}>
                {p.po_number}: {p.vendor_name}, {usd(remaining(p))} remaining
              </option>
            ))}
          </select>
        </label>
        <label>
          Requested by
          <select disabled={busy} value={requester} onChange={(e) => setRequester(e.target.value)}>
            {REQUESTERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form__row">
        <label>
          Invoice date
          <input disabled={busy} required type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </label>
        <label>
          Due date
          <input disabled={busy} required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <LineItemsEditor lines={lines} onChange={setLines} />
      <div className="form__row form__row--total">
        <label className="check">
          <input disabled={busy} type="checkbox" checked={customTotal} onChange={(e) => setCustomTotal(e.target.checked)} />
          Enter a different total
        </label>
        <label>
          Total
          {customTotal ? (
            <input disabled={busy} required type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          ) : (
            <strong>{usd(lineSum)}</strong>
          )}
        </label>
      </div>
      <label>
        Notes
        <textarea disabled={busy} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the approver should know" />
      </label>
      {error ? <div className="banner error" role="alert">{error}</div> : null}
      <div className="modal__actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Submitting and reviewing…" : initial ? "Resubmit" : "Submit for review"}
        </button>
      </div>
      </fieldset>
    </form>
  );
}
