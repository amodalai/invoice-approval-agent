import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { DecideModal } from "./components/DecideModal.js";
import { errorMessage, runTool } from "./tools.js";
import { latestReview, type Data, type Decision, type InvoiceRow } from "./types.js";

/**
 * The approver's actions on an invoice, shared by the queue and the detail
 * screen. Each review is its own run and several may be in flight; the
 * stores refetch as each one lands.
 */
export function useInvoiceActions(data: Data) {
  const review = useToolRun<{ invoice_id: string }>("review_invoice");
  const decide = useToolRun<{ invoice_id: string; decision: Decision; note?: string }>("decide_invoice");
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [target, setTarget] = useState<{ inv: InvoiceRow; decision: Decision } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | undefined>();

  async function onReview(invoice_id: string) {
    setReviewing((s) => new Set(s).add(invoice_id));
    setErrors((m) => {
      const next = new Map(m);
      next.delete(invoice_id);
      return next;
    });
    try {
      await runTool(review, { invoice_id });
      await data.refetch();
    } catch (err) {
      setErrors((m) => new Map(m).set(invoice_id, errorMessage(err, "Review failed.")));
    } finally {
      setReviewing((s) => {
        const next = new Set(s);
        next.delete(invoice_id);
        return next;
      });
    }
  }

  function onDecide(inv: InvoiceRow, decision: Decision) {
    setDecideError(undefined);
    setTarget({ inv, decision });
  }

  async function onConfirm(note: string) {
    if (!target) return;
    setDeciding(true);
    try {
      await runTool(decide, { invoice_id: target.inv.invoice_id, decision: target.decision, note: note || undefined });
      await data.refetch();
      setTarget(null);
    } catch (err) {
      setDecideError(errorMessage(err, "The decision was not recorded."));
    } finally {
      setDeciding(false);
    }
  }

  const modal = target ? (
    <DecideModal
      inv={target.inv}
      decision={target.decision}
      recommendation={latestReview(data, target.inv)?.recommendation}
      busy={deciding}
      error={decideError}
      onConfirm={(note) => void onConfirm(note)}
      onCancel={() => setTarget(null)}
    />
  ) : null;

  return { reviewing, errors, onReview: (id: string) => void onReview(id), onDecide, modal };
}

export type InvoiceActions = ReturnType<typeof useInvoiceActions>;
