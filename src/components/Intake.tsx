import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { REQUESTERS } from "../../amodal/_lib/examples.js";
import { SAMPLES } from "../samples.js";
import { errorMessage, runTool } from "../tools.js";

type Phase = "idle" | "reading" | "reviewing" | "finishing";
const LABEL: Record<Phase, string> = { idle: "Read and review", reading: "Reading the document…", reviewing: "Reviewing…", finishing: "Finishing…" };

/**
 * Paste an invoice as the vendor sent it. `intake_invoice` extracts and
 * writes it; with `review`, the review runs here too before `onDone`,
 * otherwise the caller runs it where its steps can be watched.
 */
export function Intake({ review, onDone, onCancel }: { review: boolean; onDone: (invoice_id: string) => Promise<void> | void; onCancel?: () => void }) {
  const intake = useToolRun<{ document: string; requester?: string }>("intake_invoice");
  const reviewRun = useToolRun<{ invoice_id: string }>("review_invoice");
  const [text, setText] = useState("");
  const [requester, setRequester] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ invoice_id: string; reviewed: boolean } | null>(null);
  const locked = phase !== "idle" || saved !== null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      let invoice = saved;
      if (!invoice) {
        setPhase("reading");
        const out = await runTool<{ document: string; requester?: string }, { invoice_id: string }>(intake, {
          document: text,
          ...(requester ? { requester } : {}),
        });
        if (!out) throw new Error("The document was not read.");
        invoice = { invoice_id: out.invoice_id, reviewed: false };
        setSaved(invoice);
      }
      if (review && !invoice.reviewed) {
        setPhase("reviewing");
        await runTool(reviewRun, { invoice_id: invoice.invoice_id });
        invoice = { ...invoice, reviewed: true };
        setSaved(invoice);
      }
      setPhase("finishing");
      await onDone(invoice.invoice_id);
      setSaved(null);
      setText("");
    } catch (err) {
      setError(errorMessage(err, "The document could not be read."));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <form className="card intake" onSubmit={(e) => void onSubmit(e)}>
      <h3>An invoice arrived</h3>
      <p className="sub">
        Paste it as the vendor sent it: the email, the text of the PDF. The agent finds the vendor, the amounts, the line items, and the
        purchase order, then reviews it against the spend policy.
      </p>
      <div className="chips">
        <span className="muted-text">Try one:</span>
        {SAMPLES.map((s) => (
          <button key={s.label} type="button" className="chip" disabled={locked} onClick={() => setText(s.text)}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        className="intake__text"
        aria-label="Invoice email or PDF text"
        required
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
        placeholder="Subject: Invoice 9920 for PO-1063…"
        spellCheck={false}
      />
      <div className="intake__foot">
        <label className="intake__who">
          Requested by
          <select disabled={locked} value={requester} onChange={(e) => setRequester(e.target.value)}>
            <option value="">Whoever the document or the purchase order names</option>
            {REQUESTERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="modal__actions">
          {onCancel ? (
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={phase !== "idle"}>
              Cancel
            </button>
          ) : null}
          <button className="btn" type="submit" disabled={phase !== "idle" || !text.trim()}>
            {phase === "idle" && saved ? "Retry" : LABEL[phase]}
          </button>
        </div>
      </div>
      {error ? <div className="banner error" role="alert">{error}</div> : null}
      {error && saved ? <p className="sub">The invoice is saved. Retry to finish processing it.</p> : null}
    </form>
  );
}
