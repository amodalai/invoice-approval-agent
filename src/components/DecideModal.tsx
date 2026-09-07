import { useState } from "react";
import { POLICY } from "../../amodal/_lib/policy.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { REC_LABEL, usd, type Decision, type InvoiceRow, type Recommendation } from "../types.js";

const VERB: Record<Decision, string> = { approved: "Approve", rejected: "Reject", returned: "Return" };

export function DecideModal({
  inv,
  decision,
  recommendation,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  inv: InvoiceRow;
  decision: Decision;
  recommendation?: Recommendation;
  busy: boolean;
  error?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const controllerNote = inv.total_usd > POLICY.controller_limit_usd;
  const noteRequired = decision === "returned" || (decision === "approved" && (controllerNote || recommendation === "escalate"));
  const copy = {
    approved:
      "This records your approval and books the total against the purchase order. The hard rules of the spend policy are re-checked first.",
    rejected: "This records your rejection. The vendor is not notified by this demo.",
    returned: `This sends the invoice back to ${inv.requester} with your note. They can edit it and resubmit.`,
  }[decision];
  const help =
    decision === "returned"
      ? "A note is required: it tells the requester what to change."
      : noteRequired
        ? controllerNote
          ? `A controller approval note is required above ${usd(POLICY.controller_limit_usd)}.`
          : "A note is required: the review recommended escalating this invoice."
        : "Optional note";
  return (
    <ConfirmModal
      title={`${VERB[decision]} ${inv.vendor_name} #${inv.invoice_number}`}
      confirmLabel={`Confirm ${VERB[decision].toLowerCase()}`}
      busy={busy}
      disabled={noteRequired && !note.trim()}
      error={error}
      onConfirm={() => onConfirm(note.trim())}
      onCancel={onCancel}
    >
      <p className="sub">{copy}</p>
      <dl className="modal__fields">
        <dt>Total</dt>
        <dd>{usd(inv.total_usd)}</dd>
        <dt>Purchase order</dt>
        <dd>{inv.po_number ?? "None"}</dd>
        <dt>Requester</dt>
        <dd>{inv.requester}</dd>
        <dt>Recommendation</dt>
        <dd>{recommendation ? REC_LABEL[recommendation] : "—"}</dd>
      </dl>
      <label className="note-label">
        Decision note {noteRequired ? "(required)" : "(optional)"}
        <textarea className="modal__note" required={noteRequired} disabled={busy} placeholder={help} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {noteRequired ? <p className="sub">{help}</p> : null}
    </ConfirmModal>
  );
}
