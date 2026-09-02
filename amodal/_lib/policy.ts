/**
 * The spend policy's numbers and arithmetic, in one place. The thresholds
 * mirror amodal/knowledge/spend-policy.md (the text the reviewer subagent
 * reads) and hooks/approval-guard/hook.json (the platform-level backstop):
 * change one, change all three.
 */
export const POLICY = {
  /** Invoices above this total need an open purchase order. */
  no_po_limit_usd: 1_000,
  /** An invoice may exceed the PO's remaining balance by this fraction... */
  tolerance_pct: 0.02,
  /** ...or by this amount, whichever is larger. */
  tolerance_min_usd: 50,
  /** Invoices above this total go to the controller even when clean. */
  controller_limit_usd: 25_000,
} as const;

export interface LineItem {
  description: string;
  quantity: number;
  unit_price_usd: number;
}

export interface InvoiceMathInput {
  line_items: LineItem[];
  total_usd: number;
  po_amount_usd?: number | null;
  po_billed_to_date_usd?: number | null;
}

export interface InvoiceMath {
  line_sum_usd: number;
  /** Line items add up to the stated total (to the cent). */
  total_matches_lines: boolean;
  /** Null when there is no purchase order. */
  po_remaining_usd: number | null;
  /** total - remaining balance; positive means the invoice is over. */
  variance_usd: number | null;
  variance_pct: number | null;
  tolerance_usd: number | null;
  /** Null when there is no purchase order. */
  within_tolerance: boolean | null;
  over_controller_limit: boolean;
  policy: typeof POLICY;
}

export const cents = (n: number) => Math.round(n * 100) / 100;

export function invoiceMath(input: InvoiceMathInput): InvoiceMath {
  const line_sum_usd = cents(
    (input.line_items ?? []).reduce(
      (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price_usd) || 0),
      0,
    ),
  );
  const total = Number(input.total_usd) || 0;
  const base: Omit<InvoiceMath, "po_remaining_usd" | "variance_usd" | "variance_pct" | "tolerance_usd" | "within_tolerance"> = {
    line_sum_usd,
    total_matches_lines: Math.abs(line_sum_usd - total) < 0.005,
    over_controller_limit: total > POLICY.controller_limit_usd,
    policy: POLICY,
  };
  if (input.po_amount_usd == null) {
    return {
      ...base,
      po_remaining_usd: null,
      variance_usd: null,
      variance_pct: null,
      tolerance_usd: null,
      within_tolerance: null,
    };
  }
  const po_remaining_usd = cents(
    Number(input.po_amount_usd) - (Number(input.po_billed_to_date_usd) || 0),
  );
  const variance_usd = cents(total - po_remaining_usd);
  const tolerance_usd = cents(
    Math.max(POLICY.tolerance_min_usd, po_remaining_usd * POLICY.tolerance_pct),
  );
  return {
    ...base,
    po_remaining_usd,
    variance_usd,
    variance_pct:
      po_remaining_usd > 0 ? Math.round((variance_usd / po_remaining_usd) * 1000) / 10 : null,
    tolerance_usd,
    within_tolerance: variance_usd <= tolerance_usd,
  };
}
