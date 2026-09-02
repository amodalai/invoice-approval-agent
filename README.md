# Invoice Approval Example

An Amodal agent that reviews vendor invoices before payment, in a two-persona
accounts-payable demo for a fictional company, Larkspur Co. A requester
submits an invoice; the agent matches the purchase order and checks for
duplicates in code, has a reviewer subagent apply the spend policy, and
recommends one of `approve`, `hold`, `escalate`, or `reject`; an approver
works the queue and decides, or returns the invoice for a fix. Every action
leaves an event, and a guard hook makes the policy's hard rules hold for
every writer.

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

| Question                                       | Who answers                | Where                                    |
| ---------------------------------------------- | -------------------------- | ---------------------------------------- |
| Submit an invoice                              | A requester, from the UI   | `amodal/tools/submit_invoice/handler.ts` |
| Is there an open PO from this vendor?          | Code                       | `amodal/_lib/invoice-review.ts`          |
| Is this a duplicate of an earlier invoice?     | Code                       | `amodal/_lib/invoice-review.ts`          |
| Does the amount fit the PO, within tolerance?  | Code (`invoice_math`)      | `amodal/_lib/policy.ts`                  |
| Do the line items match what the PO describes? | The reviewer subagent      | `agents/invoice-reviewer/AGENT.md`       |
| Is a fee allowed? What does the memo mean?     | The reviewer subagent      | `amodal/knowledge/spend-policy.md`       |
| Approve, return, or reject?                    | A human, from the UI       | `amodal/tools/decide_invoice/handler.ts` |

## How it works

Two personas share one screen, switched in the left rail with no login: the
**approver** and the **requester**. The choice is kept in `localStorage`. The
person who asked for the work (one of the three seeded people: Omar Haddad,
Lena Fischer, Maya Chen) is a field on the Submit form, prefilled from the
purchase order, and stamped on the invoice as `requester`.

The UI calls its tools through the direct-invoke lane (`useToolRun` posts to
`/api/tools/<name>/run`). A tool on that lane declares `execution: "durable"`
and an `{ "kind": "invoke" }` trigger in its `tool.json`:

- [`seed_examples`](amodal/tools/seed_examples/tool.json) loads the demo
  dataset. The app runs it the first time it opens on empty stores; the
  `seed` chat command runs the same tool, idempotent per row.
- [`submit_invoice`](amodal/tools/submit_invoice/tool.json) validates the
  requester's form, writes the invoice, appends a `submitted` event, and
  reviews the row it holds in memory, all in one run.
- [`review_invoice`](amodal/tools/review_invoice/tool.json) runs the review
  from the approver's Review button, and from the `review <id>` chat command
  (a regex trigger fires it from the request path before the LLM, which then
  reports the result). As it works it narrates each step into the chat's
  reasoning block (`ctx.emitReasoning`).
- [`decide_invoice`](amodal/tools/decide_invoice/tool.json) records the
  approver's decision: `approved`, `rejected`, or `returned` with a note.
- [`reset_demo`](amodal/tools/reset_demo/tool.json) empties the four stores
  and seeds them again, from the header's overflow menu.

`review_invoice` runs the four-stage flow in
[`runInvoiceReview`](amodal/_lib/invoice-review.ts). The tool declares
everything it composes in `uses` (the store tools and the reviewer subagent);
undeclared calls fail closed:

1. **load**: reads the invoice, its purchase order, and the vendor's other
   invoices from the stores via the auto-generated `store__*__get` /
   `store__*__query` tools, or takes the rows the caller already holds
   (`submit_invoice` cannot read back the row it just wrote).
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
   reviewer's call to it. Then it writes a `reviews` row for this run (keyed
   `rev_{invoice_id}_{revision}_{ms}`, so a re-review keeps the earlier
   one), stamps the invoice `reviewed` with the review's id, and appends a
   `reviewed` event.

The invoice's `status` is the human-owned lane:

```
new -> reviewed -> approved | rejected
              \-> returned -> new (resubmitted, revision + 1) -> reviewed -> ...
```

**Approve**, **Return**, and **Reject** open a confirm modal, then call
`decide_invoice`. It requires a reviewed invoice and its review, re-runs the
hard rules before an approval and refuses when one fails, requires a note to
return an invoice or to approve one the review escalated, adds an approved
total to the PO's billed-to-date, and appends the event. A returned invoice
goes back to its requester, who edits and resubmits it at the next revision.
`decide_invoice`, `submit_invoice`, and `reset_demo` are in no agent's
`tools` list, so the model cannot call them.

The `events` store holds one row per action (`seeded`, `submitted`,
`resubmitted`, `reviewed`, `returned`, `approved`, `rejected`, `reset`) with
its actor. The History tab and each invoice's timeline render it, and the
chat agent answers "what happened to Atlas's invoice?" from it.

The [`approval-guard`](hooks/approval-guard/index.mjs) hook backstops the
hard rules at the platform layer: any write of `status: approved` or
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
| `amodal/stores/`                            | 4 store schemas: `invoices` (with inline `line_items`), `purchase_orders`, `reviews`, `events`.         |
| `amodal/_lib/policy.ts`                     | The policy thresholds and the invoice arithmetic, one implementation for the tool, the flow, and the tests. |
| `amodal/_lib/invoice-review.ts`             | The shared review flow: load, check, delegate, clamp, record.                                          |
| `amodal/_lib/submit.ts`                     | The submission: validation, id generation, the resubmit rules, then the review.                        |
| `amodal/_lib/events.ts`                     | The `appendEvent` helper and the event kinds.                                                          |
| `amodal/_lib/reset.ts`                      | Empty the four stores, seed them again, record the reset.                                              |
| `amodal/_lib/examples.ts` / `demo-data.ts`  | The demo dataset (five live invoices plus a decided backlog with its reviews and events) and the code that hydrates it into the four stores. |
| `amodal/tools/review_invoice/`              | The durable review tool (`tool.json` + `handler.ts`): declares its `uses`, the `review` regex trigger, and the `invoke` trigger. |
| `amodal/tools/seed_examples/`               | The seeding tool behind the `seed` trigger and the app's first open.                                   |
| `amodal/tools/submit_invoice/`              | Invoke-lane tool behind the requester's Submit form.                                                   |
| `amodal/tools/decide_invoice/`              | Invoke-lane tool behind Approve / Return / Reject: the approver's decision, recorded.                   |
| `amodal/tools/reset_demo/`                  | Invoke-lane tool behind Reset demo data.                                                               |
| `amodal/tools/invoice-math/`                | The custom tool the reviewer calls: deterministic arithmetic, numbers never verdicts.                   |
| `amodal/_types/tool-context.ts`             | Vendored runtime types (`CustomToolContext`, `ToolDefinition`), kept local so the example typechecks offline. |
| `hooks/approval-guard/`                     | `preToolUse` guard enforcing the hard rules for every writer.                                           |
| `evals/`                                    | The eval suite: one per live invoice, a seed smoke test, a history question, and two safety evals. Re-run it before promoting. |
| `src/`                                      | The custom React UI (Vite): `App.tsx` (header, persona, hash routes, auto-seed), `routes.ts`, `persona.ts`, `types.ts`, `screens/` (Queue, InvoiceDetail, PurchaseOrders, History, Policy, Submit, MyInvoices), and `components/`. |
| `tests/`                                    | Unit tests for the code paths (`npm test`). Kept out of `amodal/` and `hooks/` so the runtime's loaders never see them. |

## Example cases

The five live invoices in `examples.ts`, each pinned by an eval:

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

Behind them sits a backlog of ten decided invoices from the six weeks before,
with two more purchase orders, canned reviews, and events: routine approvals
across the three requesters, a rejected duplicate (Kestrel Courier's 4410
sent twice), one returned for a line-sum error and approved on its second
revision (Sable Hardware's 3305), and one escalated and rejected with a note
(Cedarline's compressor replacement, over its maintenance order). They fill
the History tab, the purchase-order balances, and the requester's list at
first open.

## Running it

Deploy the app to Amodal. The runtime serves the custom UI on the agent's
domain and the agent chat alongside it. No credentials or environment
variables are needed.

1. Open the app. It loads the demo dataset on its own the first time
   ("Loading the demo…"), then shows the approver's **Queue** with the five
   live invoices.
2. Click **Review** on a row, or **Review all**. The recommendation, the
   amount note (the `invoice_math` numbers, cited by the reviewer), and the
   issues appear inline. Click a vendor to open the invoice: the checks, the
   review, and the timeline.
3. **Approve** Brightline's 0417 and confirm. The PO's remaining balance
   drops to $0 on the **Purchase orders** tab. Review
   `inv_brightline_0417_resend`: it is a duplicate, and also over the
   exhausted PO.
4. **Approve** Norwood's 2288 and confirm. The decision is refused: the
   invoice exceeds the PO by more than the tolerance. That is the hard rule
   in `decide_invoice`; the `approval-guard` hook enforces the same rule for
   any other writer. **Return** it instead, with a note.
5. Switch the persona to **Requester**. **My invoices** shows the returned
   2288 with your note; **Edit and resubmit** opens the form prefilled. Drop
   the rush fee, resubmit, and watch the review run. Switch back to the
   approver: the queue shows revision 2, ready to approve.
6. Still as the requester, submit a new invoice from **Submit**. Tick
   **Enter a different total** to demonstrate the "lines do not add up"
   rule. The review runs on submit and lands on the invoice's page.
7. Ask the chat: `what happened to Atlas's invoice?`, `how much is left on
   PO-1063?`, or `would $2,600 be within tolerance on PO-1052?`. It answers
   from the events store, the other stores, and `invoice_math`, never from
   arithmetic in its head. Ask it to approve or return something and it
   points you at the queue.
8. **Reset demo data** at the bottom of the rail puts everything back.
9. Open the agent's **Evals** page and run the suite: nine green checks.
   Then edit `spend-policy.md`, raise the no-PO limit to $500, redeploy, and
   re-run: `review-no-po-small` fails while the rest stay green.

### Developing locally

```sh
npm install
npm run dev        # Vite dev server; talks to a runtime at VITE_RUNTIME_URL (default http://localhost:3001)
npm run build      # production build → dist/ (what the cloud build uploads)
npm run typecheck  # typechecks the runtime code (amodal/, tests/) and the SPA (src/)
npm test           # unit tests for the policy math, the review flow, submit, decide, reset, the seed, the routes, and the hook
amodal eval        # the eval suite against a local runtime
```

## Making it yours

The pieces, in the order most people change them:

- **The policy**: `amodal/knowledge/spend-policy.md` is the text the reviewer
  reasons over. Its numbers are duplicated in `amodal/_lib/policy.ts`
  (`POLICY`, used by the tool, the clamp, and the Policy tab) and in
  `hooks/approval-guard/hook.json` (`config`, used by the guard). Change one,
  change all three; `npm test` pins the code copies.
- **The dataset**: `amodal/_lib/examples.ts`. Each invoice is one
  self-contained entry with inline `line_items` and a `requester`; purchase
  orders are keyed by `po_number`; backlog invoices carry their canned
  reviews and final decision. `tests/demo-data.test.ts` pins the invariants
  (balances add up, no live PO touched, every seeded approval passes the
  guard). Edit it, redeploy, and update the evals that pin the expected
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
- **The stores**: `amodal/stores/*.json`. The runtime validates every write
  against the schema, so a new field goes there first, then through
  `examples.ts`, `demo-data.ts`, the row types in `invoice-review.ts`, and
  `src/types.ts`. A store needs `"deletable": true` for `store__*__remove`.
- **The UI**: `src/App.tsx` is the shell (header, persona switch, hash
  routes from `routes.ts`, the self-seed on first open, the reset modal);
  each tab is a file under `src/screens/`. Reads go through `useStoreQuery`;
  every write goes through `useToolRun` and `runTool` in `src/tools.ts`,
  which turns a failed run outcome into an error the screen shows. The
  Policy tab imports `spend-policy.md` with Vite's `?raw`, so it can never
  drift from what the reviewer reads.
- **The chat agent**: `agents/default/AGENT.md` and `agent.json`. The prompt
  lists the demo ids, the requesters, and the rules about what chat may
  never do. Store grants are per agent: `rw` registers the store's `set`
  and `remove` tools for the session, and a composite tool the agent runs
  can only call what is registered.
- **Evals**: `evals/*.md`. Deterministic lines (`contains:`) for the
  recommendation string, `Should …` lines for the reasoning.

Not in this template, by choice: payment or any money movement, real
authentication, editing the policy at runtime, creating purchase orders from
the UI, vendor notification, attachments, a controller persona, an inbound
connection (mail or an ERP), a scheduled automation, agent memory, and
per-tenant scopes. amodal-demo shows the last four on the same layout.
