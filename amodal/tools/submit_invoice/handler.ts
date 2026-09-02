import type { CustomToolContext } from "../../_types/tool-context.js";
import { reviewDeps } from "../../_lib/invoice-review.js";
import { submitInvoice } from "../../_lib/submit.js";

/**
 * submit_invoice: the requester's submission, written and reviewed in one
 * durable run (invoked via POST /api/tools/submit_invoice/run; the `invoke`
 * trigger in tool.json is the opt-in). The invoke lane does not validate a
 * tool.json tool's `parameters` schema, so the flow validates the input
 * itself. In no agent's tools: it runs only from the Submit form.
 */
export default async function submit_invoice(params: Record<string, unknown>, ctx: CustomToolContext) {
  return submitInvoice(params, reviewDeps("submit_invoice", ctx));
}
