import type { CustomToolContext } from "../../_types/tool-context.js";
import { ensureExamplesSeeded, INVOICES } from "../../_lib/demo-data.js";

/**
 * Composite tool behind the `seed` chat command (a regex trigger on this
 * tool, fired from the request path before the LLM) and the UI's Load demo
 * invoices button, which sends the same command through the chat surface.
 */
export default async function seed_examples(_params: Record<string, never>, ctx: CustomToolContext) {
  if (!ctx.callTool) {
    throw new Error(
      "seed_examples needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const seeded = await ensureExamplesSeeded({ callTool: (name, args) => ctx.callTool!(name, args) });
  ctx.emitReasoning?.(
    seeded > 0
      ? `Seeded ${seeded} demo invoice(s); the rest were already in the store.`
      : "All demo invoices were already in the store; nothing to seed.",
  );

  const next = `Review one with e.g. \`review ${INVOICES[0].invoice_id}\`.`;
  return {
    seeded,
    total: INVOICES.length,
    message:
      seeded > 0
        ? `Loaded ${seeded} demo invoice${seeded === 1 ? "" : "s"} into the stores. ${next}`
        : `All ${INVOICES.length} demo invoices are already loaded. ${next}`,
  };
}
