import type { CustomToolContext } from "../../_types/tool-context.js";
import { runInvoiceReview } from "../../_lib/invoice-review.js";

/** Single source of truth for the policy text the reviewer reads, repo-relative. */
const POLICY_PATH = "amodal/knowledge/spend-policy.md";

export interface ReviewInvoiceParams {
  invoice_id?: string;
}

/**
 * Composite tool behind both review entry points: the `review <id>` chat
 * command (a regex trigger on this tool, fired from the request path before
 * the LLM) and the UI's Review button (which sends the same command through
 * the chat surface). The deterministic work (store I/O, the matching rules,
 * the clamp on the way out) stays in code; the policy judgment runs in the
 * invoice-reviewer subagent via ctx.callSubagent. Everything this handler
 * calls is declared in tool.json `uses`; undeclared calls fail closed.
 */
export default async function review_invoice(params: ReviewInvoiceParams, ctx: CustomToolContext) {
  const invoice_id = params.invoice_id?.trim();
  if (!invoice_id) throw new Error("review_invoice requires an invoice_id.");
  if (!ctx.callTool || !ctx.callSubagent) {
    throw new Error(
      "review_invoice needs the composite context (ctx.callTool + ctx.callSubagent). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  return runInvoiceReview(invoice_id, {
    callTool: (name, args) => ctx.callTool!(name, args),
    callSubagent: (ref, task, input) => ctx.callSubagent!(ref, task, input),
    loadPolicy: () => {
      if (!ctx.fs) throw new Error(`ctx.fs is unavailable, so the spend policy (${POLICY_PATH}) cannot be read.`);
      return ctx.fs.readRepoFile(POLICY_PATH);
    },
    now: () => new Date(),
    sessionId: ctx.sessionId ?? "",
    trace: (line) => ctx.emitReasoning?.(line),
  });
}
