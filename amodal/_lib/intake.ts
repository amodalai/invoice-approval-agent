import { REQUESTERS } from "./examples.js";
import { rows, storeGetResult, type PORow, type ReviewDeps } from "./invoice-review.js";
import { validateSubmission, writeSubmission, type SubmitParams } from "./submit.js";

export const EXTRACTOR_SUBAGENT = "invoice-extractor";

/** What the extractor returns: the submission fields, each null when the document does not carry it. */
export type Extraction = Partial<Record<keyof Omit<SubmitParams, "invoice_id" | "line_items">, string | number | null>> & {
  line_items?: unknown;
};

export interface IntakeInput {
  document?: string;
  /** Who asked for the work, when the document and the purchase order do not say. */
  requester?: string | null;
}

/** Parse the extractor's final text: a single JSON object, fences and stray prose stripped. */
export function parseExtraction(text: string): Extraction {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${EXTRACTOR_SUBAGENT} returned no JSON object: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Extraction;
  } catch (err) {
    throw new Error(`${EXTRACTOR_SUBAGENT} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Turn a pasted document (a vendor's email, the text of a PDF) into an
 * invoice row: the extractor subagent reads it against the open purchase
 * orders, code validates the fields and resolves the requester, and the row
 * is written with a `received` event. The review is a separate run, so the
 * approver's inbox can show it happening.
 */
export async function intakeInvoice(input: IntakeInput, deps: ReviewDeps) {
  const document = text(input.document);
  if (!document) throw new Error("Paste the invoice text first.");
  const openPos = rows<PORow>(await deps.callTool("store__purchase_orders__query", { where: { status: "open" }, limit: 200 }));

  deps.trace?.(`Reading ${document.length} characters against ${openPos.length} open purchase order(s).`);
  const reply = await deps.callSubagent(
    EXTRACTOR_SUBAGENT,
    "Extract the invoice fields from `document` and reply with only the JSON object your instructions describe.",
    {
      document,
      today: deps.now().toISOString().slice(0, 10),
      purchase_orders: openPos.map(({ po_number, vendor_name, description, requester }) => ({ po_number, vendor_name, description, requester })),
      requesters: REQUESTERS,
    },
  );
  const found = parseExtraction(reply);

  const po_number = text(found.po_number) || null;
  const po = po_number
    ? (openPos.find((p) => p.po_number === po_number) ??
      storeGetResult<PORow>(await deps.callTool("store__purchase_orders__get", { key: po_number })))
    : undefined;
  if (po_number && !po) throw new Error(`The document cites ${po_number}, which is not a purchase order we have.`);
  const requester = text(found.requester) || po?.requester || text(input.requester);
  if (!requester) throw new Error("Could not tell who requested this work. Pick a requester and try again.");

  const params = validateSubmission({ ...found, invoice_id: undefined, po_number, requester });
  const loaded = await writeSubmission(params, deps, { kind: "received", actor: "agent", note: "Extracted from a pasted document." });
  deps.trace?.(`Wrote ${loaded.invoice.invoice_id}: ${params.vendor_name} #${params.invoice_number}, ${params.line_items.length} line(s).`);
  return { invoice_id: loaded.invoice.invoice_id, revision: 1, invoice: params };
}
