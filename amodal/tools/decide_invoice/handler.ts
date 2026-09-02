import type { CustomToolContext } from "../../_types/tool-context.js";
import { appendEvent } from "../../_lib/events.js";
import {
  approvalBlockers,
  checkInvoice,
  loadInvoice,
  storeGetResult,
} from "../../_lib/invoice-review.js";

/**
 * decide_invoice: the approver's decision, recorded.
 *
 * The approver clicks Approve, Return, or Reject on a reviewed invoice and
 * confirms in a modal. This durable tool (invoked via POST
 * /api/tools/decide_invoice/run; the `invoke` trigger in tool.json is the
 * opt-in) requires a reviewed invoice and its saved review, re-runs the hard
 * rules in code before an approval, writes the decision on the invoice, adds
 * an approved total to the PO's billed-to-date, and appends the event.
 *
 * It is in no agent's tools, so it runs only from the UI action: the agent
 * recommends, a human decides. The `approval-guard` hook backstops the same
 * rules for every other writer.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema,
 * so this handler is defensive about its input.
 */

export interface DecideInvoiceParams {
  invoice_id?: string;
  decision?: string;
  note?: string;
}

const DECISIONS = ["approved", "rejected", "returned"] as const;
type Decision = (typeof DECISIONS)[number];

export default async function decide_invoice(params: DecideInvoiceParams, ctx: CustomToolContext) {
  const invoice_id = typeof params.invoice_id === "string" ? params.invoice_id.trim() : "";
  const decision = params.decision as Decision;
  const note = typeof params.note === "string" && params.note.trim() ? params.note.trim() : null;
  if (!invoice_id) throw new Error("No invoice_id provided.");
  if (!DECISIONS.includes(decision)) {
    throw new Error(`decision must be "approved", "rejected", or "returned", got ${JSON.stringify(decision)}.`);
  }
  if (!ctx.callTool) {
    throw new Error(
      "decide_invoice needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  const callTool = (name: string, args: Record<string, unknown>) => ctx.callTool!(name, args);
  const now = () => new Date(ctx.now ? ctx.now() : Date.now());

  const loaded = await loadInvoice(invoice_id, { callTool });
  if (!loaded) throw new Error(`Invoice ${invoice_id} not found.`);
  const { invoice, po, others } = loaded;
  if (invoice.status !== "reviewed") {
    throw new Error(`Invoice ${invoice_id} is ${invoice.status}; only a reviewed invoice can be decided.`);
  }
  const review = invoice.review_id
    ? storeGetResult<{ recommendation?: string }>(await callTool("store__reviews__get", { key: invoice.review_id }))
    : undefined;
  if (!review) throw new Error(`No review for ${invoice_id}. Review it before deciding.`);

  if (decision === "returned" && !note) throw new Error(`Returning ${invoice_id} needs a note for the requester.`);
  if (decision === "approved") {
    const blockers = approvalBlockers(checkInvoice(invoice, po, others));
    if (blockers.length > 0) {
      throw new Error(`Cannot approve ${invoice_id}: ${blockers.join("; ")}.`);
    }
    if (review.recommendation === "escalate" && !note) {
      throw new Error(`Approving ${invoice_id} against an escalate recommendation needs a note.`);
    }
  }

  const nowIso = now().toISOString();
  // store__set replaces the whole value, so re-emit the full row.
  await callTool("store__invoices__set", {
    key: invoice_id,
    value:
      decision === "returned"
        ? { ...invoice, status: decision, returned_note: note, decided_at: null }
        : { ...invoice, status: decision, decided_at: nowIso, decision_note: note },
  });
  if (decision === "approved" && po) {
    await callTool("store__purchase_orders__set", {
      key: po.po_number,
      value: { ...po, billed_to_date_usd: po.billed_to_date_usd + invoice.total_usd },
    });
  }
  await appendEvent(
    { callTool, now, random: () => (ctx.random ?? Math.random)() },
    { invoice_id, kind: decision, actor: "approver", note, revision: invoice.revision ?? 1 },
  );

  return { invoice_id, decision, total_usd: invoice.total_usd, po_number: po?.po_number ?? null };
}
