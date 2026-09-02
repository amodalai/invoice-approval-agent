import type { CustomToolContext } from "../_types/tool-context.js";
import { INVOICES, PURCHASE_ORDERS, ensureExamplesSeeded, invoiceRow, poRow } from "./demo-data.js";
import { appendEvent } from "./events.js";
import { invoiceMath, type InvoiceMath, type LineItem } from "./policy.js";

export interface InvoiceRow {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  po_number?: string | null;
  invoice_date: string;
  due_date: string;
  total_usd: number;
  line_items: LineItem[];
  notes?: string | null;
  requester?: string;
  revision?: number;
  status?: string;
  recommendation?: Recommendation | null;
  review_id?: string | null;
  returned_note?: string | null;
  received_at: string;
  submitted_at?: string;
  [k: string]: unknown;
}

export interface PORow {
  po_number: string;
  vendor_name: string;
  description: string;
  amount_usd: number;
  billed_to_date_usd: number;
  requester: string;
  status: "open" | "closed";
  [k: string]: unknown;
}

export type Recommendation = "approve" | "hold" | "escalate" | "reject";
const RANK: Record<Recommendation, number> = { approve: 0, hold: 1, escalate: 2, reject: 3 };
export const RECOMMENDATIONS = Object.keys(RANK) as Recommendation[];

export interface Check {
  name: string;
  status: "pass" | "flag" | "fail";
  note: string;
}

export interface ReviewResult {
  recommendation: string;
  summary: string;
  checks: Check[];
  issues: string[];
}

/** What code decides before the reviewer sees the invoice. */
export interface Facts {
  po_found: boolean;
  po_status: "open" | "closed" | null;
  vendor_matches: boolean | null;
  /** The earlier invoice this one duplicates, or null. */
  duplicate_of: string | null;
  /** Over the no-PO limit with no purchase order. */
  needs_po: boolean;
  math: InvoiceMath;
}

export const REVIEWER_SUBAGENT = "invoice-reviewer";

/** One row per run: a re-review or a resubmission keeps the earlier reviews. */
export function reviewKey(invoice_id: string, revision: number, createdAt: Date): string {
  return `rev_${invoice_id}_${revision}_${createdAt.getTime()}`;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * The earliest other invoice from the same vendor with the same invoice
 * number. Arrival order decides which is the original: the later one is the
 * duplicate, so an original is never flagged because of its own resend.
 */
export function findDuplicate(invoice: InvoiceRow, others: InvoiceRow[]): InvoiceRow | undefined {
  return others
    .filter(
      (o) =>
        o.invoice_id !== invoice.invoice_id &&
        norm(o.vendor_name) === norm(invoice.vendor_name) &&
        norm(o.invoice_number) === norm(invoice.invoice_number) &&
        (o.received_at < invoice.received_at ||
          (o.received_at === invoice.received_at && o.invoice_id < invoice.invoice_id)),
    )
    .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
}

export function checkInvoice(invoice: InvoiceRow, po: PORow | undefined, others: InvoiceRow[]): Facts {
  const math = invoiceMath({
    line_items: invoice.line_items,
    total_usd: invoice.total_usd,
    po_amount_usd: po?.amount_usd ?? null,
    po_billed_to_date_usd: po?.billed_to_date_usd ?? null,
  });
  return {
    po_found: !!po,
    po_status: po?.status ?? null,
    vendor_matches: po ? norm(po.vendor_name) === norm(invoice.vendor_name) : null,
    duplicate_of: findDuplicate(invoice, others)?.invoice_id ?? null,
    needs_po: !po && invoice.total_usd > math.policy.no_po_limit_usd,
    math,
  };
}

/**
 * The hard rules that stop an approval outright, whatever the reviewer or
 * the operator says. Each string is the reason shown to a human.
 */
export function approvalBlockers(f: Facts): string[] {
  const out: string[] = [];
  if (f.duplicate_of) out.push(`duplicate of ${f.duplicate_of}`);
  if (f.vendor_matches === false) out.push("the purchase order belongs to a different vendor");
  if (f.needs_po) out.push(`over $${f.math.policy.no_po_limit_usd.toLocaleString("en-US")} with no purchase order`);
  if (f.po_status === "closed") out.push("the purchase order is closed");
  if (f.math.within_tolerance === false)
    out.push(
      `over the PO's remaining balance by $${f.math.variance_usd!.toLocaleString("en-US")} (tolerance $${f.math.tolerance_usd!.toLocaleString("en-US")})`,
    );
  if (!f.math.total_matches_lines)
    out.push(`line items sum to $${f.math.line_sum_usd.toLocaleString("en-US")}, not the stated total`);
  return out;
}

/** The least conservative recommendation the facts allow. */
export function floorRecommendation(f: Facts): Recommendation {
  if (f.duplicate_of || f.vendor_matches === false) return "reject";
  if (f.math.within_tolerance === false || f.math.over_controller_limit) return "escalate";
  if (f.needs_po || f.po_status === "closed" || !f.math.total_matches_lines) return "hold";
  return "approve";
}

/** The reviewer's call, or the floor, whichever is more conservative. */
export function clampRecommendation(proposed: string, f: Facts): Recommendation {
  const floor = floorRecommendation(f);
  const rec = (RECOMMENDATIONS as string[]).includes(proposed) ? (proposed as Recommendation) : "hold";
  return RANK[rec] >= RANK[floor] ? rec : floor;
}

export function rows<T>(q: unknown): T[] {
  const docs = (q as { documents?: Array<{ payload: T }> }).documents;
  return (docs ?? []).map((d) => d.payload);
}

/**
 * Unwrap a `store__*__get` result. The runtime returns `{error: "... not
 * found ..."}` for a missing key, not undefined, so every get goes through
 * here.
 */
export function storeGetResult<T>(doc: unknown): T | undefined {
  if (!doc || typeof doc !== "object" || "error" in doc) return undefined;
  return doc as T;
}

/**
 * Parse the reviewer subagent's final text into a ReviewResult. The
 * AGENT.md contract is "reply with only the JSON object", but stay
 * defensive: strip code fences and any stray prose around the object.
 */
export function parseReviewResult(text: string): ReviewResult {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`${REVIEWER_SUBAGENT} returned no JSON object: ${text.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (err) {
    throw new Error(
      `${REVIEWER_SUBAGENT} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const r = parsed as Partial<ReviewResult>;
  if (typeof r.recommendation !== "string") {
    throw new Error(`${REVIEWER_SUBAGENT} JSON is missing a string \`recommendation\``);
  }
  return {
    recommendation: r.recommendation,
    summary: typeof r.summary === "string" ? r.summary : "",
    checks: Array.isArray(r.checks) ? r.checks : [],
    issues: Array.isArray(r.issues) ? r.issues : [],
  };
}

export interface ReviewDeps {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  /** Run a declared subagent to completion and return its final text. */
  callSubagent(ref: string, task: string, input?: unknown): Promise<string>;
  /** Full text of the spend policy. Subagents see only their own AGENT.md,
   *  so the caller loads the policy and passes it in as input. */
  loadPolicy(): Promise<string>;
  now(): Date;
  random?(): number;
  sessionId: string;
  /** Optional reasoning-trace sink (ctx.emitReasoning). */
  trace?(line: string): void;
}

/** Single source of truth for the policy text the reviewer reads, repo-relative. */
export const POLICY_PATH = "amodal/knowledge/spend-policy.md";

/**
 * The review flow's dependencies from a composite tool's context. Everything
 * the flow calls must be declared in the tool's `uses`; undeclared calls fail
 * closed. `now` and `random` are journaled in a durable run.
 */
export function reviewDeps(tool: string, ctx: CustomToolContext): ReviewDeps {
  if (!ctx.callTool || !ctx.callSubagent) {
    throw new Error(
      `${tool} needs the composite context (ctx.callTool + ctx.callSubagent). ` +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }
  return {
    callTool: (name, args) => ctx.callTool!(name, args),
    callSubagent: (ref, task, input) => ctx.callSubagent!(ref, task, input),
    loadPolicy: () => {
      if (!ctx.fs) throw new Error(`ctx.fs is unavailable, so the spend policy (${POLICY_PATH}) cannot be read.`);
      return ctx.fs.readRepoFile(POLICY_PATH);
    },
    now: () => new Date(ctx.now ? ctx.now() : Date.now()),
    random: () => (ctx.random ?? Math.random)(),
    sessionId: ctx.sessionId ?? "",
    trace: (line) => ctx.emitReasoning?.(line),
  };
}

export interface ReviewOutcome {
  found: boolean;
  invoice_id: string;
  vendor_name?: string;
  total_usd?: number;
  recommendation?: Recommendation;
  summary?: string;
  checks?: Check[];
  issues?: string[];
  review_id?: string;
}

export interface LoadedInvoice {
  invoice: InvoiceRow;
  po?: PORow;
  others: InvoiceRow[];
}

/** Load an invoice with its purchase order and the vendor's other invoices. */
export async function loadInvoice(
  invoice_id: string,
  deps: Pick<ReviewDeps, "callTool">,
): Promise<LoadedInvoice | undefined> {
  const invoice = storeGetResult<InvoiceRow>(
    await deps.callTool("store__invoices__get", { key: invoice_id }),
  );
  if (!invoice) return undefined;
  const po = invoice.po_number
    ? storeGetResult<PORow>(await deps.callTool("store__purchase_orders__get", { key: invoice.po_number }))
    : undefined;
  const others = rows<InvoiceRow>(
    await deps.callTool("store__invoices__query", {
      where: { vendor_name: invoice.vendor_name },
      limit: 200,
    }),
  );
  return { invoice, po, others };
}

/**
 * The review's load. On fresh stores the demo invoice is taken from the
 * dataset and the stores are seeded for later runs: a run cannot read back
 * its own uncommitted writes, so the rows just written are not visible in
 * this run. review_invoice's `uses` therefore declares the seed's tools.
 */
async function loadOrSeedExample(
  invoice_id: string,
  deps: Pick<ReviewDeps, "callTool" | "now" | "trace">,
): Promise<LoadedInvoice | undefined> {
  const loaded = await loadInvoice(invoice_id, deps);
  if (loaded) return loaded;

  const example = INVOICES.find((i) => i.invoice_id === invoice_id);
  if (!example) return undefined;
  deps.trace?.(`\`${invoice_id}\` not in the store; seeding the demo dataset and reviewing the in-memory example.`);
  await ensureExamplesSeeded(deps);
  const nowIso = deps.now().toISOString();
  const examplePo = PURCHASE_ORDERS.find((p) => p.po_number === example.po_number);
  return {
    invoice: invoiceRow(example, nowIso),
    po: examplePo ? (poRow(examplePo, nowIso) as PORow) : undefined,
    others: INVOICES.filter((i) => i.vendor_name === example.vendor_name).map((i) => invoiceRow(i, nowIso)),
  };
}

/**
 * Review one invoice revision. `preloaded` is for a caller that already
 * holds the rows (submit_invoice reviews the row it just wrote, which a run
 * cannot read back); otherwise the rows come from the stores.
 */
export async function runInvoiceReview(
  invoice_id: string,
  deps: ReviewDeps,
  preloaded?: LoadedInvoice,
): Promise<ReviewOutcome> {
  const loaded = preloaded ?? (await loadOrSeedExample(invoice_id, deps));
  if (!loaded) return { found: false, invoice_id };
  const { invoice, po, others } = loaded;

  deps.trace?.(
    `Loaded ${invoice.vendor_name} #${invoice.invoice_number} for $${invoice.total_usd.toLocaleString("en-US")}: ` +
      (po ? `PO ${po.po_number} (${po.status}), ` : "no purchase order, ") +
      `${others.filter((o) => o.invoice_id !== invoice_id).length} other invoice(s) from this vendor.`,
  );

  const facts = checkInvoice(invoice, po, others);
  const blockers = approvalBlockers(facts);
  deps.trace?.(
    blockers.length > 0
      ? `Deterministic checks: ${blockers.join("; ")}.`
      : "Deterministic checks: purchase order, amount, line sum, and duplicate lookup all pass.",
  );

  deps.trace?.(`Delegating the policy judgment to the ${REVIEWER_SUBAGENT} subagent.`);
  const reviewText = await deps.callSubagent(
    REVIEWER_SUBAGENT,
    [
      "Review this invoice against the spend policy (included in the context as `spend_policy`).",
      "Emit one check per category, an issues list, and a single recommendation.",
      "The duplicate lookup and the purchase-order match have already been done in code and are given to you as `facts`. Treat them as fact and do not re-derive them.",
      "Call `invoice_math` for the arithmetic before assessing the amount.",
      "Do not approve, pay, or reject anything yourself: you recommend.",
    ].join(" "),
    {
      spend_policy: await deps.loadPolicy(),
      invoice: {
        vendor_name: invoice.vendor_name,
        invoice_number: invoice.invoice_number,
        po_number: invoice.po_number ?? null,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        total_usd: invoice.total_usd,
        line_items: invoice.line_items,
        notes: invoice.notes ?? null,
      },
      purchase_order: po
        ? {
            po_number: po.po_number,
            vendor_name: po.vendor_name,
            description: po.description,
            amount_usd: po.amount_usd,
            billed_to_date_usd: po.billed_to_date_usd,
            requester: po.requester,
            status: po.status,
          }
        : null,
      facts: {
        po_found: facts.po_found,
        po_status: facts.po_status,
        vendor_matches: facts.vendor_matches,
        duplicate_of: facts.duplicate_of,
        needs_po: facts.needs_po,
      },
    },
  );

  const review = parseReviewResult(reviewText);
  const recommendation = clampRecommendation(review.recommendation, facts);
  if (recommendation !== review.recommendation) {
    deps.trace?.(`Code clamped the recommendation from \`${review.recommendation}\` to \`${recommendation}\`.`);
  }
  const issues = Array.from(new Set([...blockers, ...review.issues]));

  const now = deps.now();
  const nowIso = now.toISOString();
  const revision = invoice.revision ?? 1;
  const review_id = reviewKey(invoice_id, revision, now);
  await deps.callTool("store__reviews__set", {
    key: review_id,
    value: {
      review_id,
      invoice_id,
      revision,
      recommendation,
      summary: review.summary,
      checks: review.checks,
      issues,
      reviewer_session_id: deps.sessionId,
      created_at: nowIso,
    },
  });
  await deps.callTool("store__invoices__set", {
    key: invoice_id,
    value: { ...invoice, status: "reviewed", recommendation, review_id, reviewed_at: nowIso },
  });
  await appendEvent(deps, { invoice_id, kind: "reviewed", actor: "agent", recommendation, revision });
  deps.trace?.(`Saved \`${review_id}\` (${recommendation}) and stamped the invoice.`);

  return {
    found: true,
    invoice_id,
    vendor_name: invoice.vendor_name,
    total_usd: invoice.total_usd,
    recommendation,
    summary: review.summary,
    checks: review.checks,
    issues,
    review_id,
  };
}
