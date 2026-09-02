import { useMemo, useState } from "react";
import {
  useStoreQuery,
  useToolRun,
  useAmodalContext,
  ChatWidget,
  FormattedMarkdown,
  RuntimeClient,
} from "@amodalai/react";
import spendPolicy from "../amodal/knowledge/spend-policy.md?raw";

interface LineItem {
  description: string;
  quantity: number;
  unit_price_usd: number;
}

interface InvoiceRow {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  po_number?: string | null;
  due_date: string;
  total_usd: number;
  line_items: LineItem[];
  notes?: string | null;
  status?: string;
  recommendation?: string | null;
  reviewed_at?: string | null;
  decision_note?: string | null;
}

interface PORow {
  po_number: string;
  description: string;
  amount_usd: number;
  billed_to_date_usd: number;
}

interface ReviewRow {
  review_id: string;
  invoice_id: string;
  recommendation: string;
  summary: string;
  checks?: Array<{ name: string; status: string; note: string }>;
  issues: string[];
}

type Decision = "approved" | "rejected";

const REC_LABEL: Record<string, string> = {
  approve: "Approve",
  hold: "Hold",
  escalate: "Escalate",
  reject: "Reject",
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Send one chat command and wait for the tool it triggers to finish. The
 * command matches a regex trigger (`seed` on seed_examples, `review <id>` on
 * review_invoice), so the work runs deterministically from the request path
 * and is already saved to the stores by the time its `tool_call_result`
 * event arrives. This stops listening right there, so the caller can refetch
 * the stores. The model then narrates the result into a chat session the UI
 * discards.
 */
async function runChatCommand(client: RuntimeClient, command: string, toolName: string): Promise<void> {
  const callIds = new Set<string>();
  for await (const ev of client.chatStream(command, { agent: "default" })) {
    if (ev.type === "tool_call_start" && ev.tool_name === toolName) callIds.add(ev.tool_id);
    if (ev.type === "tool_call_result" && callIds.has(ev.tool_id)) {
      if (ev.status === "error") {
        throw new Error(typeof ev.error === "string" ? ev.error : `${toolName} failed.`);
      }
      if (typeof ev.result === "string") {
        let outcome: { found?: boolean } | undefined;
        try {
          outcome = JSON.parse(ev.result) as { found?: boolean };
        } catch {
          // Unparseable result: leave it to the store refetch to show state.
        }
        if (outcome?.found === false) {
          throw new Error(`Not found, and it is not one of the demo invoices.`);
        }
      }
      return;
    }
    if (ev.type === "error") throw new Error(ev.message || `${toolName} failed.`);
  }
}

function RecPill({ inv }: { inv: InvoiceRow }) {
  if (inv.status === "approved") return <span className="pill decided">Approved</span>;
  if (inv.status === "rejected") return <span className="pill decided">Rejected</span>;
  if (!inv.recommendation) return <span className="pill muted">Not reviewed</span>;
  return <span className={`pill rec-${inv.recommendation}`}>{REC_LABEL[inv.recommendation] ?? inv.recommendation}</span>;
}

const isDecided = (inv: InvoiceRow) => inv.status === "approved" || inv.status === "rejected";

function Row({
  inv,
  po,
  review,
  busy,
  error,
  onReview,
  onDecide,
}: {
  inv: InvoiceRow;
  po?: PORow;
  review?: ReviewRow;
  busy: boolean;
  error?: string;
  onReview: (invoice_id: string) => void;
  onDecide: (inv: InvoiceRow, decision: Decision) => void;
}) {
  const decided = isDecided(inv);
  const amountNote = review?.checks?.find((c) => c.name === "amount")?.note?.trim();

  return (
    <tr>
      <td>
        <div className="name">{inv.vendor_name}</div>
        <div className="id">#{inv.invoice_number} · {inv.invoice_id}</div>
        {inv.notes ? <div className="note">{inv.notes}</div> : null}
      </td>
      <td>
        {po ? (
          <>
            <div>{po.po_number}</div>
            <div className="note">{po.description}</div>
            <div className="note">{usd(po.amount_usd - po.billed_to_date_usd)} remaining</div>
          </>
        ) : (
          <span className="muted-text">{inv.po_number ?? "None"}</span>
        )}
      </td>
      <td className="num">{usd(inv.total_usd)}</td>
      <td>{inv.due_date}</td>
      <td>
        <RecPill inv={inv} />
        {amountNote ? <div className="note">{amountNote}</div> : null}
      </td>
      <td className="issues">
        {review?.issues?.length ? (
          <ul className="issue-list">
            {review.issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td className="act">
        {error ? <div className="row-error">{error}</div> : null}
        {decided ? (
          inv.decision_note ? <div className="note">{inv.decision_note}</div> : null
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={() => onReview(inv.invoice_id)}>
              {busy ? "Reviewing…" : inv.reviewed_at ? "Re-review" : "Review"}
            </button>
            {review ? (
              <div className="decide">
                <button className="btn btn--ghost" onClick={() => onDecide(inv, "approved")}>
                  Approve
                </button>
                <button className="btn btn--ghost" onClick={() => onDecide(inv, "rejected")}>
                  Reject
                </button>
              </div>
            ) : null}
          </>
        )}
      </td>
    </tr>
  );
}

function DecisionModal({
  inv,
  decision,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  inv: InvoiceRow;
  decision: Decision;
  busy: boolean;
  error?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const verb = decision === "approved" ? "Approve" : "Reject";
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">
          {verb} {inv.vendor_name} #{inv.invoice_number}
        </h2>
        <p className="sub">
          {decision === "approved"
            ? "This records your approval and books the total against the purchase order. The hard rules of the spend policy are re-checked first."
            : "This records your rejection. The vendor is not notified by this demo."}
        </p>
        <dl className="modal__fields">
          <dt>Total</dt>
          <dd>{usd(inv.total_usd)}</dd>
          <dt>Purchase order</dt>
          <dd>{inv.po_number ?? "None"}</dd>
          <dt>Recommendation</dt>
          <dd>{inv.recommendation ? REC_LABEL[inv.recommendation] ?? inv.recommendation : "—"}</dd>
        </dl>
        <textarea
          className="modal__note"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <div className="banner error">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy} onClick={() => onConfirm(note)}>
            {busy ? "Saving…" : `Confirm ${verb.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const chatClient = useMemo(() => new RuntimeClient({ runtimeUrl, getToken: async () => "" }), [runtimeUrl]);
  const invoicesQ = useStoreQuery<InvoiceRow>("invoices", { limit: 200 });
  const posQ = useStoreQuery<PORow>("purchase_orders", { limit: 200 });
  const reviewsQ = useStoreQuery<ReviewRow>("reviews", { limit: 200 });
  const decide = useToolRun<{ invoice_id: string; decision: Decision; note?: string }>("decide_invoice");
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  const [reviewErrors, setReviewErrors] = useState<Map<string, string>>(new Map());
  const [target, setTarget] = useState<{ inv: InvoiceRow; decision: Decision } | null>(null);

  const invoices = (invoicesQ.data ?? [])
    .map((r) => r.value)
    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name) || a.invoice_id.localeCompare(b.invoice_id));
  const poByNumber = new Map<string, PORow>();
  for (const r of posQ.data ?? []) poByNumber.set(r.value.po_number, r.value);
  const reviewByInvoice = new Map<string, ReviewRow>();
  for (const r of reviewsQ.data ?? []) reviewByInvoice.set(r.value.invoice_id, r.value);

  const refetch = () => Promise.all([invoicesQ.refetch(), posQ.refetch(), reviewsQ.refetch()]);

  async function onSeed() {
    setSeeding(true);
    setSeedError(null);
    try {
      await runChatCommand(chatClient, "seed", "seed_examples");
      await refetch();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Loading the demo invoices failed.");
    } finally {
      setSeeding(false);
    }
  }

  // Each review is its own chat run, so several can be in flight at once;
  // the table refetches as each one lands.
  async function onReview(invoice_id: string) {
    setReviewing((s) => new Set(s).add(invoice_id));
    setReviewErrors((m) => {
      const next = new Map(m);
      next.delete(invoice_id);
      return next;
    });
    try {
      await runChatCommand(chatClient, `review ${invoice_id}`, "review_invoice");
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Review failed.";
      setReviewErrors((m) => new Map(m).set(invoice_id, message));
    } finally {
      setReviewing((s) => {
        const next = new Set(s);
        next.delete(invoice_id);
        return next;
      });
    }
  }

  const pending = invoices.filter((i) => !isDecided(i) && !reviewing.has(i.invoice_id));
  function onReviewAll() {
    for (const inv of pending) void onReview(inv.invoice_id);
  }

  async function onConfirmDecision(note: string) {
    if (!target) return;
    try {
      await decide.run({ invoice_id: target.inv.invoice_id, decision: target.decision, note: note || undefined });
      await refetch();
      setTarget(null);
    } catch {
      // decide.error carries the reason; the modal shows it.
    }
  }

  return (
    <div className="page">
      <header className="head">
        <div className="head__bar">
          <h1>Invoice Approval</h1>
          <div className="head__actions">
            <button className="btn btn--ghost" disabled={seeding} onClick={onSeed}>
              {seeding ? "Loading…" : "Load demo invoices"}
            </button>
            <button className="btn" disabled={pending.length === 0} onClick={onReviewAll}>
              {reviewing.size > 0 ? `Reviewing ${reviewing.size}…` : "Review all"}
            </button>
          </div>
        </div>
        <p className="sub">
          Vendors send Larkspur Co. invoices for things the company ordered. Before an invoice is paid, someone in
          accounts payable checks it: is there a purchase order for it, does the amount fit, is the vendor billing for
          what was ordered, and has this invoice been paid already? This agent does that check against the{" "}
          <a href="#policy">spend policy</a> and recommends <em>approve</em>, <em>hold</em> (ask the vendor first),{" "}
          <em>escalate</em> (needs a manager), or <em>reject</em>. You make the decision with <em>Approve</em> or{" "}
          <em>Reject</em>. The agent never pays anything.
        </p>
        {seedError ? <div className="banner error">{seedError}</div> : null}
      </header>

      {invoices.length === 0 ? (
        <div className="empty">
          <p>No invoices in the store yet.</p>
          <p className="sub">
            Click <strong>Load demo invoices</strong> to load the five demo invoices and their purchase orders. (You
            can also send <code>seed</code> in the chat.)
          </p>
        </div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Purchase order</th>
              <th className="num">Total</th>
              <th>Due</th>
              <th>Recommendation</th>
              <th>Issues</th>
              <th className="act"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <Row
                key={inv.invoice_id}
                inv={inv}
                po={inv.po_number ? poByNumber.get(inv.po_number) : undefined}
                review={reviewByInvoice.get(inv.invoice_id)}
                busy={reviewing.has(inv.invoice_id)}
                error={reviewErrors.get(inv.invoice_id)}
                onReview={(id) => void onReview(id)}
                onDecide={(i, d) => {
                  decide.reset();
                  setTarget({ inv: i, decision: d });
                }}
              />
            ))}
          </tbody>
        </table>
      )}

      <details className="policy" id="policy">
        <summary>The spend policy the reviewer applies</summary>
        <FormattedMarkdown className="policy__body">{spendPolicy}</FormattedMarkdown>
        <p className="sub">
          Edit <code>amodal/knowledge/spend-policy.md</code> and redeploy to change the rules.
        </p>
      </details>

      <footer className="foot">
        Fictional demo. Vendors, invoices, purchase orders, and the spend policy are made up. The agent assists; a
        human decides.
      </footer>

      {target ? (
        <DecisionModal
          inv={target.inv}
          decision={target.decision}
          busy={decide.status === "running"}
          error={decide.error?.message}
          onConfirm={onConfirmDecision}
          onCancel={() => setTarget(null)}
        />
      ) : null}

      <ChatWidget
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: "operator" }}
        getToken={async () => ""}
        agent="default"
        theme={{ primaryColor: "#000000", mode: "light" }}
        onStreamEnd={() => {
          void refetch();
        }}
      />
    </div>
  );
}
