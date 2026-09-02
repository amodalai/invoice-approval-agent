import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { LineItemsEditor, emptyLine, lineAmount, type LineDraft } from "../components/LineItemsEditor.js";
import { hashOf } from "../routes.js";
import { REQUESTERS } from "../../amodal/_lib/examples.js";
import { errorMessage, runTool } from "../tools.js";
import { remaining, usd, type Data, type InvoiceRow } from "../types.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (days: number) => isoDay(new Date(Date.now() + days * 86_400_000));

/** The invoice form. With `initial` it resubmits that returned invoice. */
export function Submit({ data, initial }: { data: Data; initial?: InvoiceRow }) {
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
  const [customTotal, setCustomTotal] = useState(false);
  const [total, setTotal] = useState(initial ? String(initial.total_usd) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineSum = Math.round(lines.reduce((s, l) => s + lineAmount(l), 0) * 100) / 100;
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
      const result = await runTool<Record<string, unknown>, { invoice_id: string }>(submit, {
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
      await data.refetch();
      const id = result?.invoice_id ?? initial?.invoice_id;
      location.hash = id ? hashOf({ name: "invoice", id }) : hashOf({ name: "mine" });
    } catch (err) {
      setError(errorMessage(err, "The submission failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={(e) => void onSubmit(e)}>
      <h3>{initial ? `Edit and resubmit #${initial.invoice_number}` : "Submit an invoice"}</h3>
      <div className="form__row">
        <label>
          Vendor
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" />
        </label>
        <label>
          Invoice number
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="As printed on the invoice" />
        </label>
      </div>
      <div className="form__row">
        <label>
          Purchase order
          <select value={po} onChange={(e) => choosePo(e.target.value)}>
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
          <select value={requester} onChange={(e) => setRequester(e.target.value)}>
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
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <LineItemsEditor lines={lines} onChange={setLines} />
      <div className="form__row form__row--total">
        <label className="check">
          <input type="checkbox" checked={customTotal} onChange={(e) => setCustomTotal(e.target.checked)} />
          Enter a different total
        </label>
        <label>
          Total
          {customTotal ? (
            <input type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          ) : (
            <strong>{usd(lineSum)}</strong>
          )}
        </label>
      </div>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the approver should know" />
      </label>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="modal__actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Submitting and reviewing…" : initial ? "Resubmit" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}
