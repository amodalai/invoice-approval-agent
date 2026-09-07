import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { REQUESTERS } from "../../amodal/_lib/examples.js";
import { SAMPLES } from "../samples.js";
import { errorMessage, runTool } from "../tools.js";

type Phase = "idle" | "reading" | "reviewing";
const LABEL: Record<Phase, string> = { idle: "Read and review", reading: "Reading the document…", reviewing: "Reviewing…" };

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("reading");
    try {
      const out = await runTool<{ document: string; requester?: string }, { invoice_id: string }>(intake, {
        document: text,
        ...(requester ? { requester } : {}),
      });
      if (!out) throw new Error("The document was not read.");
      if (review) {
        setPhase("reviewing");
        await runTool(reviewRun, { invoice_id: out.invoice_id });
      }
      await onDone(out.invoice_id);
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
          <button key={s.label} type="button" className="chip" onClick={() => setText(s.text)}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        className="intake__text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Subject: Invoice 9920 for PO-1063…"
        spellCheck={false}
      />
      <div className="intake__foot">
        <label className="intake__who">
          Requested by
          <select value={requester} onChange={(e) => setRequester(e.target.value)}>
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
            {LABEL[phase]}
          </button>
        </div>
      </div>
      {error ? <div className="banner error">{error}</div> : null}
    </form>
  );
}
