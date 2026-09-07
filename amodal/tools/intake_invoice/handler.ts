import type { CustomToolContext } from "../../_types/tool-context.js";
import { intakeInvoice, type IntakeInput } from "../../_lib/intake.js";
import { reviewDeps } from "../../_lib/invoice-review.js";

/**
 * intake_invoice: a pasted document becomes an invoice row, in one durable
 * run (invoked via POST /api/tools/intake_invoice/run; the `invoke` trigger
 * in tool.json is the opt-in). The invoke lane does not validate a tool.json
 * tool's `parameters` schema, so the flow validates what the extractor
 * returns. Chat calls the same tool with invoice details from the conversation.
 */
export default async function intake_invoice(params: IntakeInput, ctx: CustomToolContext) {
  return intakeInvoice(params, reviewDeps("intake_invoice", ctx));
}
