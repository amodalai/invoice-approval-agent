/**
 * approval-guard: the spend policy's hard rules, enforced at the platform
 * layer for every writer.
 *
 * `review_invoice` clamps the recommendation and `decide_invoice` refuses a
 * blocked approval, both in code. But the chat agent holds rw store tools,
 * and any future tool could regress the rule. A hook sees and may block
 * EVERY tool call regardless of who made it, so it's the right place to make
 * the invariant true platform-wide, not just inside one handler.
 *
 * Fires on `preToolUse` for `store__invoices__set` (rows carrying
 * `status: "approved"` or `recommendation: "approve"`) and
 * `store__reviews__set` (rows carrying `recommendation: "approve"`). It
 * resolves the invoice, then checks three rules: no duplicate of an earlier
 * invoice, no missing PO over the limit, and no total over the PO's
 * remaining balance by more than the tolerance. A rule it cannot evaluate
 * because the rows are not there yet (fresh stores, where the seeding run
 * cannot read back its own writes) passes: the handlers already enforced it
 * in code. Fail-closed: if a store read throws, the manifest's
 * `failPolicy: "closed"` turns the failure into a block.
 *
 * Shipped as `.mjs` so the runtime's hook loader can import it directly.
 * Exports `createHook(config) => {run}`.
 *
 * @typedef {{ toolName: string, args: Record<string, unknown> }} PreToolUsePayload
 * @typedef {{ get(store: string, key: string): Promise<Record<string, unknown> | null>,
 *             query(store: string, filter?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> }} HookStoreReader
 * @typedef {{ store?: HookStoreReader, log(message: string): void }} HookContext
 * @typedef {{ action: 'allow' } | { action: 'block', reason: string }} HookDecision
 */

/**
 * @param {Record<string, unknown>} config
 */
export function createHook(config) {
  const guardedTools = Array.isArray(config.guardedTools)
    ? config.guardedTools
    : ["store__invoices__set", "store__reviews__set"];
  const noPoLimit = num(config.noPoLimitUsd, 1000);
  const tolerancePct = num(config.tolerancePct, 0.02);
  const toleranceMin = num(config.toleranceMinUsd, 50);

  return {
    /**
     * @param {string} point
     * @param {PreToolUsePayload} payload
     * @param {HookContext} ctx
     * @returns {Promise<HookDecision>}
     */
    async run(point, payload, ctx) {
      if (point !== "preToolUse") return { action: "allow" };
      const toolName = (payload && payload.toolName) || "";
      if (!guardedTools.includes(toolName)) return { action: "allow" };

      const value = payload.args && typeof payload.args === "object" ? payload.args.value : undefined;
      const row = value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : undefined;
      if (!row) return { action: "allow" };
      if (row.status !== "approved" && row.recommendation !== "approve") return { action: "allow" };
      if (!ctx.store) return { action: "block", reason: "Cannot verify the spend policy for this approval." };

      // An invoices row carries the invoice; a reviews row points at one.
      const invoice =
        toolName === "store__invoices__set"
          ? row
          : typeof row.invoice_id === "string"
            ? await ctx.store.get("invoices", row.invoice_id)
            : null;
      if (!invoice) return { action: "allow" };

      const id = String(invoice.invoice_id ?? "");
      const total = num(invoice.total_usd, 0);
      const poNumber = typeof invoice.po_number === "string" ? invoice.po_number : null;

      const others = await ctx.store.query("invoices", { vendor_name: invoice.vendor_name });
      const original = (others ?? []).find(
        (o) =>
          o.invoice_id !== id &&
          norm(o.invoice_number) === norm(invoice.invoice_number) &&
          (String(o.received_at) < String(invoice.received_at) ||
            (String(o.received_at) === String(invoice.received_at) && String(o.invoice_id) < id)),
      );
      if (original) return block(ctx, toolName, id, `it duplicates ${original.invoice_id}`);

      if (!poNumber) {
        if (total > noPoLimit) return block(ctx, toolName, id, `it is over $${noPoLimit} with no purchase order`);
        return { action: "allow" };
      }

      const po = await ctx.store.get("purchase_orders", poNumber);
      if (!po) return { action: "allow" };
      const remaining = num(po.amount_usd, 0) - num(po.billed_to_date_usd, 0);
      const tolerance = Math.max(toleranceMin, remaining * tolerancePct);
      if (total > remaining + tolerance) {
        return block(
          ctx,
          toolName,
          id,
          `$${total} exceeds the $${remaining} remaining on ${poNumber} by more than the $${round(tolerance)} tolerance`,
        );
      }
      return { action: "allow" };
    },
  };
}

function block(ctx, toolName, id, why) {
  ctx.log(`approval-guard: blocked ${toolName} for ${id} (${why})`);
  return {
    action: "block",
    reason: `${id} cannot be approved: ${why}. Resolve it or choose another recommendation.`,
  };
}

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const norm = (s) => String(s ?? "").trim().toLowerCase();
const round = (n) => Math.round(n * 100) / 100;
