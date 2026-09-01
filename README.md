# Invoice Approval Example

An Amodal agent that reviews vendor invoices before payment. For each invoice
it matches the purchase order and checks for duplicates in code, has a
reviewer subagent apply the company's spend policy, and recommends one of
`approve`, `hold`, `escalate`, or `reject` for a human approver. The operator
approves or rejects from a one-screen UI, and a guard hook makes the policy's
hard rules hold for every writer.

The agent logic runs on the Amodal runtime, and the UI is a small React app
the runtime serves for you. This repo is a finished, deliberately small app
meant to be copied and changed. For the same building blocks introduced one
at a time, see [amodal-demo](https://github.com/amodalai/amodal-demo).

> Fictional demo. The agent recommends a decision only. It never pays an
> invoice, moves money, or gives accounting, tax, or legal advice.

## The use case

Accounts payable receives an invoice from a vendor. Before anyone pays it,
someone has to answer: is there a purchase order for this, does the amount
fit, is the vendor billing for what was ordered, and have we seen this invoice
before? The first and last questions are lookups. The amount question is
arithmetic. The scope question is judgment. This app splits the work the
same way:

| Question                                   | Who answers                       | Where                                        |
| ------------------------------------------ | --------------------------------- | -------------------------------------------- |
| Is there an open PO from this vendor?      | Code                              | `amodal/_lib/invoice-review.ts`              |
| Is this a duplicate of an earlier invoice? | Code                              | `amodal/_lib/invoice-review.ts`              |
| Does the amount fit the PO, within tolerance? | Code (`invoice_math`)          | `amodal/_lib/policy.ts`                      |
| Do the line items match what the PO describes? | The reviewer subagent         | `agents/invoice-reviewer/AGENT.md`           |
| Is a fee allowed? What does the memo mean? | The reviewer subagent             | `amodal/knowledge/spend-policy.md`           |
| Approve or reject?                         | A human, from the UI              | `amodal/tools/decide_invoice/handler.ts`     |

## How it works

Two chat commands are triggers: a regex in the tool's `tool.json` fires the
tool from the request path, before the LLM sees the message, and the model
then reports the tool's result:

- send **`seed`** once (or click **Load demo invoices**) →
  [`seed_examples`](amodal/tools/seed_examples/tool.json) loads the three
  demo purchase orders and five demo invoices into the stores.
- send **`review inv_norwood_2288`** (or `check` / `audit` + an id, or click
  **Review** on a row) →
  [`review_invoice`](amodal/tools/review_invoice/tool.json) runs the review.
  As it works it narrates each step into the chat's reasoning block
  (`ctx.emitReasoning`).

`review_invoice` runs the four-stage flow in
[`runInvoiceReview`](amodal/_lib/invoice-review.ts). The tool declares
everything it composes in `uses` (the store tools and the reviewer subagent);
undeclared calls fail closed:

1. **load**: reads the invoice, its purchase order, and the vendor's other
   invoices from the stores via the auto-generated `store__*__get` /
   `store__*__query` tools.
2. **check (in code)**: the PO match, the vendor match, the duplicate lookup
   (same vendor and invoice number, received earlier), and whether the
   invoice needs a PO it doesn't have. Rules, not judgments, so code decides
   them and hands the reviewer the result as fact.
3. **review (in the subagent)**: `ctx.callSubagent` runs the
   [`invoice-reviewer`](agents/invoice-reviewer/AGENT.md), which applies the
   [spend policy](amodal/knowledge/spend-policy.md) (passed in as input) and
   makes the judgment a formula can't: are the line items within the PO's
   scope, is a fee one the policy excludes, what does the vendor's memo mean.
   Mid-review it calls the [`invoice_math`](amodal/tools/invoice-math/tool.ts)
   custom tool for the arithmetic (line sum, remaining PO balance, variance,
   tolerance) and must cite those numbers in its `amount` check. Its reply is
   a single JSON object the flow parses.
4. **record**: code holds the floor on the way out. It computes the least
   conservative recommendation the facts allow (a duplicate is never better
   than `reject`, an over-tolerance invoice never better than `escalate`, a
   missing PO over the limit never better than `hold`) and clamps the
   reviewer's call to it. Then it writes a `reviews` row, stamps the invoice
   `reviewed`, and returns the result.

The decision is the operator's. **Approve** and **Reject** open a confirm
modal, then call [`decide_invoice`](amodal/tools/decide_invoice/handler.ts)
through the direct-invoke lane (`useToolRun`; the `{"kind": "invoke"}`
trigger in its `tool.json` is the opt-in). It requires a saved review,
re-runs the hard rules before an approval and refuses when one fails, writes
the decision on the invoice, and on approval adds the total to the PO's
billed-to-date. The tool is in no agent's `tools` list, so the model cannot
call it.

The [`approval-guard`](hooks/approval-guard/index.mjs) hook backstops the
same rules at the platform layer: any write of `status: approved` or
`recommendation: approve` on an invoice, or `recommendation: approve` on a
review, is blocked when the invoice duplicates an earlier one, is over the
no-PO limit with no PO, or exceeds its PO's remaining balance by more than
the tolerance. The handlers already enforce this in code; the hook makes it
true for every writer, including the chat agent's store tools.

## What's in here

| Path                                        | What it is                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `amodal.json`                               | Manifest: `runtimeApp: { custom: true }`, memory off.                                                   |
| `agents/default/`                           | The chat agent: `AGENT.md` (prompt) and `agent.json` (tools, stores).                                   |
| `agents/invoice-reviewer/`                  | The reviewer subagent that applies the spend policy. Its `agent.json` grants `invoice_math` + `load_knowledge`. |
| `amodal/knowledge/spend-policy.md`          | The fictional spend policy the reviewer reasons over (passed to it as input).                          |
| `amodal/stores/`                            | 3 store schemas: `invoices` (with inline `line_items`), `purchase_orders`, `reviews`.                   |
| `amodal/_lib/policy.ts`                     | The policy thresholds and the invoice arithmetic, one implementation for the tool, the flow, and the tests. |
| `amodal/_lib/invoice-review.ts`             | The shared review flow: load, check, delegate, clamp, record.                                          |
| `amodal/_lib/examples.ts` / `demo-data.ts`  | The demo dataset and the code that hydrates it into the stores.                                        |
| `amodal/tools/review_invoice/`              | The composite review tool (`tool.json` + `handler.ts`): declares its `uses` and the `review` regex trigger. |
| `amodal/tools/seed_examples/`               | The seeding tool behind the `seed` trigger and the Load demo invoices button.                          |
| `amodal/tools/invoice-math/`                | The custom tool the reviewer calls: deterministic arithmetic, numbers never verdicts.                   |
| `amodal/tools/decide_invoice/`              | Durable invoke-lane tool behind Approve / Reject: the operator's decision, recorded.                    |
| `amodal/_types/tool-context.ts`             | Vendored runtime types (`CustomToolContext`, `ToolDefinition`), kept local so the example typechecks offline. |
| `hooks/approval-guard/`                     | `preToolUse` guard enforcing the hard rules for every writer.                                           |
| `evals/`                                    | The eval suite: one per demo invoice, a seed smoke test, and a safety eval. Re-run it before promoting. |
| `src/`                                      | The custom React UI (Vite): one screen, `useStoreQuery` reads, the chat-trigger Review button, the decision modal on `useToolRun`. |
| `tests/`                                    | Unit tests for the code paths (`npm test`). Kept out of `amodal/` and `hooks/` so the runtime's loaders never see them. |

## Example cases

The five invoices shipped in `examples.ts`, each pinned by an eval:

| Invoice                       | Vendor                    | Why                                                              | Expected   | Eval                        |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------- | ---------- | --------------------------- |
| `inv_brightline_0417`         | Brightline Cloud Services | Open PO, exact amount, one in-scope line                         | `approve`  | `review-clean-approve.md`   |
| `inv_norwood_2288`            | Norwood Office Supply     | $2,890 against $2,500 remaining (tolerance $50), plus a rush fee | `escalate` | `review-over-tolerance.md`  |
| `inv_atlas_9911`              | Atlas Consulting Group    | Within the PO, but one line (a marketing workshop) is out of scope | `hold`   | `review-scope-mismatch.md`  |
| `inv_pixelforge_77`           | PixelForge Design         | $650, no PO, requester named: allowed under the $1,000 limit     | `approve`  | `review-no-po-small.md`     |
| `inv_brightline_0417_resend`  | Brightline Cloud Services | Same invoice number as 0417, received later                      | `reject`   | `review-duplicate.md`       |

Norwood and Atlas show the split. Norwood is arithmetic: the tool says over
by $390 and code would clamp any softer call. Atlas is judgment: every number
is fine, and only a reader of the PO's description can see that a marketing
workshop is not data migration consulting.

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's
domain and the agent chat alongside it. No credentials or environment
variables are needed.

1. Open the invoices screen and click **Load demo invoices**. (Or send `seed`
   in the chat.)
2. Click **Review** on a row. The recommendation, the amount note (the
   `invoice_math` numbers, cited by the reviewer), and the issues appear
   inline. You can also review from chat with `review <id>`; both enter
   through the same trigger.
3. Click **Approve** on Brightline's 0417 and confirm. The PO's remaining
   balance drops to $0. Now review `inv_brightline_0417_resend`: it is a
   duplicate, and also over the now-exhausted PO.
4. Click **Approve** on Norwood's 2288 and confirm. The decision is refused:
   the invoice exceeds the PO by more than the tolerance. That is the hard
   rule in `decide_invoice`; the `approval-guard` hook enforces the same rule
   for any other writer.
5. Ask the chat a question: `how much is left on PO-1063?` or `would $2,600
   be within tolerance on PO-1052?`. It answers from the stores and from
   `invoice_math`, never from arithmetic in its head.
6. Open the agent's **Evals** page and run the suite: seven green checks.
   Then edit `spend-policy.md`, raise the no-PO limit to $500, redeploy, and
   re-run: `review-no-po-small` fails while the rest stay green.

- `inv_brightline_0417` · `inv_norwood_2288` · `inv_atlas_9911` · `inv_pixelforge_77` · `inv_brightline_0417_resend`

### Developing locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks the runtime code (amodal/, tests/) and the SPA (src/)
npm test           # unit tests for the policy math, the review flow, the decide tool, and the hook
```

## Making it yours

The pieces, in the order most people change them:

- **The policy**: `amodal/knowledge/spend-policy.md` is the text the reviewer
  reasons over. Its numbers are duplicated in `amodal/_lib/policy.ts`
  (`POLICY`, used by the tool and the clamp) and in
  `hooks/approval-guard/hook.json` (`config`, used by the guard). Change one,
  change all three; `npm test` pins the code copies.
- **The dataset**: `amodal/_lib/examples.ts`. Each invoice is one
  self-contained entry with inline `line_items`; purchase orders are keyed by
  `po_number`. Edit it, redeploy, and update the evals that pin the expected
  recommendations.
- **The judgment**: `agents/invoice-reviewer/AGENT.md` holds the check
  categories, the recommendation rules, and the JSON shape. Add a check by
  adding it there and in the `reviews` store's `_comment_purpose`.
- **The hard rules**: `approvalBlockers` and `floorRecommendation` in
  `amodal/_lib/invoice-review.ts` are the rules code enforces regardless of
  what the model says. `decide_invoice` and the review flow both call them.
  Mirror a new rule in `hooks/approval-guard/index.mjs` if it should hold for
  every writer.
- **The arithmetic**: `invoiceMath` in `amodal/_lib/policy.ts`. The tool in
  `amodal/tools/invoice-math/tool.ts` exposes it to the reviewer; its
  `description` and `parametersJsonSchema` are what the LLM sees.
- **The stores**: `amodal/stores/*.json`. Add a field, then thread it
  through `examples.ts`, `demo-data.ts`, and the row types in
  `invoice-review.ts` and `src/App.tsx`.
- **The UI**: `src/App.tsx` is one file: the table, the decision modal, and
  the floating `ChatWidget`. Reads go through `useStoreQuery`; the Review
  button sends the chat command; Approve / Reject call `decide_invoice`
  through `useToolRun`.
- **The chat agent**: `agents/default/AGENT.md` and `agent.json`. The prompt
  lists the demo ids and the rules about what chat may never do.
- **Evals**: `evals/*.md`. Deterministic lines (`contains:`) for the
  recommendation string, `Should …` lines for the reasoning.

Not in this template, by choice: an inbound connection (mail or an ERP), a
scheduled automation, agent memory, and per-tenant scopes. amodal-demo shows
each of those on the same layout.
