/**
 * invoice_math: deterministic arithmetic over one invoice. The line sum, the
 * PO's remaining balance, the variance, and the policy tolerance come from
 * code, never from the model. Returns numbers, never verdicts: whether a
 * line item is in scope stays with the invoice-reviewer subagent. A pure
 * function of its input, hence `exposure: open`. The review_invoice tool
 * calls the same `invoiceMath` from code to enforce the hard rules.
 */
import type { ToolDefinition } from "../../_types/tool-context.js";
import { invoiceMath, type InvoiceMath, type InvoiceMathInput } from "../../_lib/policy.js";

const tool: ToolDefinition<InvoiceMathInput, InvoiceMath> = {
  id: "invoice_math",
  exposure: { kind: "open" },
  llm_callable: true,
  base: {
    name: "invoice_math",
    description:
      "Deterministic arithmetic over one invoice: the line-item sum and whether it " +
      "matches the stated total, the purchase order's remaining balance, the " +
      "variance (total minus remaining, in dollars and percent), the policy " +
      "tolerance for that PO, and whether the invoice is within it. Call it once " +
      "with the invoice's line items and total (plus the PO's amount and " +
      "billed-to-date when there is a PO) before assessing the amount, and treat " +
      "the numbers as fact. Do not add up or compare amounts yourself. It returns " +
      "numbers only: judging whether a line item is in the PO's scope stays with you.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        line_items: {
          type: "array",
          description: "The invoice's line items, exactly as given in your context.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price_usd: { type: "number" },
            },
            required: ["description", "quantity", "unit_price_usd"],
          },
        },
        total_usd: { type: "number", description: "The total the vendor states on the invoice." },
        po_amount_usd: {
          type: "number",
          description: "The purchase order's amount. Omit when there is no purchase order.",
        },
        po_billed_to_date_usd: {
          type: "number",
          description: "What has already been billed against the purchase order. Omit when there is no PO.",
        },
      },
      required: ["line_items", "total_usd"],
    },
  },

  async handle(ctx) {
    return invoiceMath(ctx.input);
  },
};

export default tool;
