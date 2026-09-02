import type { CustomToolContext } from "../../_types/tool-context.js";
import { reviewDeps, runInvoiceReview } from "../../_lib/invoice-review.js";

export interface ReviewInvoiceParams {
  invoice_id?: string;
}

/**
 * Durable tool behind both review entry points: the `review <id>` chat
 * command (a regex trigger on this tool, fired from the request path before
 * the LLM) and the UI's Review button (POST /api/tools/review_invoice/run;
 * the `invoke` trigger in tool.json is the opt-in). The deterministic work
 * (store I/O, the matching rules, the clamp on the way out) stays in code;
 * the policy judgment runs in the invoice-reviewer subagent via
 * ctx.callSubagent. Everything this handler calls is declared in tool.json
 * `uses`; undeclared calls fail closed.
 */
export default async function review_invoice(params: ReviewInvoiceParams, ctx: CustomToolContext) {
  const invoice_id = params.invoice_id?.trim();
  if (!invoice_id) throw new Error("review_invoice requires an invoice_id.");
  return runInvoiceReview(invoice_id, reviewDeps("review_invoice", ctx));
}
