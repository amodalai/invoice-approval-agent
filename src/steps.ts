import { checkInvoice } from "../amodal/_lib/invoice-review.js";
import { remaining, usd, type InvoiceRow, type PORow } from "./types.js";

export interface Step {
  label: string;
  status: "pass" | "flag" | "fail" | "pending";
}

/**
 * What the review does, in order, from the same checks the tool runs in
 * code, so the inbox can show them while the run is in flight. The last
 * step is the reviewer's judgment, which only the run settles.
 */
export function reviewSteps(inv: InvoiceRow, po: PORow | undefined, others: InvoiceRow[]): Step[] {
  const f = checkInvoice({ ...inv }, po && { ...po }, others.map((o) => ({ ...o })));
  const m = f.math;
  const limit = usd(m.policy.no_po_limit_usd);
  const order: Step = !po
    ? f.needs_po
      ? { label: `No purchase order, and ${usd(inv.total_usd)} is over the ${limit} limit for that`, status: "flag" }
      : { label: `No purchase order; ${usd(inv.total_usd)} is under the ${limit} limit for that`, status: "pass" }
    : f.vendor_matches === false
      ? { label: `${po.po_number} belongs to ${po.vendor_name}, not to this vendor`, status: "fail" }
      : { label: `${po.po_number} found, ${po.status}, ${usd(remaining(po))} remaining`, status: po.status === "open" ? "pass" : "flag" };
  const duplicate: Step = f.duplicate_of
    ? { label: `${inv.vendor_name} already sent invoice #${inv.invoice_number}`, status: "fail" }
    : { label: `No earlier invoice #${inv.invoice_number} from ${inv.vendor_name}`, status: "pass" };
  const amount: Step = !m.total_matches_lines
    ? { label: `The lines add up to ${usd(m.line_sum_usd)}, not the stated ${usd(inv.total_usd)}`, status: "flag" }
    : po && m.within_tolerance === false
      ? { label: `${usd(inv.total_usd)} is ${usd(m.variance_usd!)} over the balance, past the ${usd(m.tolerance_usd!)} tolerance`, status: "fail" }
      : po
        ? { label: `${usd(inv.total_usd)} fits the ${usd(m.po_remaining_usd!)} remaining`, status: "pass" }
        : { label: `The lines add up to ${usd(inv.total_usd)}`, status: "pass" };
  const n = inv.line_items.length;
  const judgment: Step = {
    label: `Reviewer reading ${n} line item${n === 1 ? "" : "s"} against ${po ? `what ${po.po_number} describes` : "the spend policy"}`,
    status: "pending",
  };
  return [order, duplicate, amount, judgment];
}
