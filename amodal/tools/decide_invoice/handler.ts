import type { CustomToolContext } from "../../_types/tool-context.js";
import {
  approvalBlockers,
  checkInvoice,
  loadInvoice,
  storeGetResult,
} from "../../_lib/invoice-review.js";

/**
 * decide_invoice: the operator's decision, recorded.
 *
 * The operator clicks Approve or Reject on a reviewed invoice and confirms in
 * a modal. This durable tool (invoked via POST /api/tools/decide_invoice/run;
 * the `invoke` trigger in tool.json is the opt-in) requires a saved review,
 * re-runs the hard rules in code before an approval, writes the decision on
 * the invoice, and on approval adds the total to the PO's billed-to-date.
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

export default async function decide_invoice(params: DecideInvoiceParams, ctx: CustomToolContext) {
  const invoice_id = typeof params.invoice_id === "string" ? params.invoice_id.trim() : "";
  const decision = params.decision;
  const note = typeof params.note === "string" && params.note.trim() ? params.note.trim() : null;
  if (!invoice_id) throw new Error("No invoice_id provided.");
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error(`decision must be "approved" or "rejected", got ${JSON.stringify(decision)}.`);
  }
  if (!ctx.callTool) {
    throw new Error(
      "decide_invoice needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  const callTool = (name: string, args: Record<string, unknown>) => ctx.callTool!(name, args);
  const now = () => new Date(ctx.now ? ctx.now() : Date.now());

  const loaded = await loadInvoice(invoice_id, { callTool, now });
  if (!loaded) throw new Error(`Invoice ${invoice_id} not found.`);
  const { invoice, po, others } = loaded;
  if (invoice.status === "approved" || invoice.status === "rejected") {
    throw new Error(`Invoice ${invoice_id} is already ${invoice.status}.`);
  }
  const review = invoice.review_id
    ? storeGetResult(await callTool("store__reviews__get", { key: invoice.review_id }))
    : undefined;
  if (!review) throw new Error(`No review for ${invoice_id}. Review it before deciding.`);

  if (decision === "approved") {
    const blockers = approvalBlockers(checkInvoice(invoice, po, others));
    if (blockers.length > 0) {
      throw new Error(`Cannot approve ${invoice_id}: ${blockers.join("; ")}.`);
    }
  }

  const nowIso = now().toISOString();
  // store__set replaces the whole value, so re-emit the full row.
  await callTool("store__invoices__set", {
    key: invoice_id,
    value: { ...invoice, status: decision, decided_at: nowIso, decision_note: note },
  });
  if (decision === "approved" && po) {
    await callTool("store__purchase_orders__set", {
      key: po.po_number,
      value: { ...po, billed_to_date_usd: po.billed_to_date_usd + invoice.total_usd },
    });
  }

  return { invoice_id, decision, total_usd: invoice.total_usd, po_number: po?.po_number ?? null };
}
