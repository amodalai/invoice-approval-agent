# Invoice Approval: specification

What the app does, how its stores, tools, and screens fit together, and why
each choice was made.

## What this app is

An accounts-payable demo for a fictional company, Larkspur Co. Two personas
use one screen, with no login:

- A **requester** submits a vendor invoice for review and follows it until it
  is approved or rejected.
- An **approver** works a queue of reviewed invoices, reads the agent's
  recommendation, and decides.

The agent reviews every submitted invoice against a spend policy and
recommends `approve`, `hold`, `escalate`, or `reject`. A human decides. The
agent never pays an invoice, moves money, or gives accounting, tax, or legal
advice.

The demo data loads itself the first time the app opens. There is no "load
demo" button.

## Decisions and their reasons

| Decision | Choice | Why |
| --- | --- | --- |
| Personas | One requester and one approver, switched in the rail, no auth | The runtime gives the custom UI no user identity. A switch keeps the demo self-contained. Every requester would see the same screens, so one is enough. |
| What a requester submits | An invoice, with or without a purchase order | The data model and the policy already cover it. No new rules. |
| Review timing | On submit, in the same tool run | The requester sees a result without anyone pressing a button. |
| Lifecycle | Approver can return an invoice; requester edits and resubmits | Gives `hold` a human path, at the cost of one status and one decision value. |
| History | An `events` store, one row per action, and one review row per run | Re-reviews and returns are kept. Reviews do not overwrite each other. |
| Seed | Five pinned live invoices plus a decided backlog, seeded on first open | History, purchase-order balances, and the requester's list are populated at first open. The evals keep their five cases. |
| Policy | Read-only in the UI | The guard hook, `policy.ts`, and the reviewer prompt all carry the thresholds. A runtime edit would let them drift. |
| Escalate | The approver decides, note required | No third persona. Hard rules still block in code and in the hook. |
| Reset | A `reset_demo` tool behind a confirm modal | Replay the demo without redeploying. |
| Requested by | A select over the seeded people on the Submit form, defaulting to the purchase order's requester | The "names the person who requested it" rule always sees a real name without a persona per person. |
| Requester visibility | Status, issues on a return, and the approver's note | Recommendations and check tables stay approver-side, as in real AP. |

## Runtime constraints that shape the design

- **No startup hook.** The runtime's hook points are `preInput`, `preToolUse`,
  `postToolUse`, `preOutput`, and `postTurn`. Trigger kinds are `regex`,
  `invoke`, and `schedule` (cron). Nothing runs at deploy time, so "seed on
  launch" is the UI seeding on first mount when the stores are empty. A cron
  trigger would run forever for a one-time job, and a `preInput` hook only
  fires on chat.
- **A run cannot read back its own writes.** `loadInvoice` works around this
  for seeding. `submit_invoice` therefore reviews the row it holds in memory
  instead of re-reading it, and `runInvoiceReview` accepts a preloaded
  invoice.
- **The invoke lane.** `useToolRun` posts to `/api/tools/<name>/run` for any
  tool with an `invoke` trigger and `execution: "durable"`; the lane refuses
  a non-durable tool. Durable tools also run from chat: a regex trigger
  executes the handler with the same composite context, which is what the
  `review <id>` and `seed` commands use. A run's result is
  `{ sessionId, outcome, result }`; a thrown handler error resolves with
  `outcome.kind: "failed"` and the message in `outcome.reason`, so the UI
  reads the outcome instead of catching.
- **Store tools** are `store__<name>__get`, `__set`, `__query`, `__list`, and
  `__remove`. `__remove` is registered only for a store whose JSON declares
  `"deletable": true`; all four stores do. Reset uses `__list` and `__remove`.

## Personas and identity

A rail on the left carries the brand, the persona's sections with a count
where one matters (undecided invoices on Queue, returned invoices on My
invoices), the persona switch, and **Reset demo data**.

- **Approver**: one operator. Events record the actor as `approver`.
- **Requester**: one role, not a person. The choice is kept under the
  `localStorage` key `persona` as `{ role }`. The person who asked for the
  work is a field on the Submit form (`requester`, one of `Omar Haddad
  (Engineering)`, `Lena Fischer (Facilities)`, `Maya Chen (Marketing)`),
  prefilled from the chosen purchase order. Events record that name as the
  actor of a submission.

The chat widget floats on every tab for both personas; the guard hook and
the agent prompt keep chat from approving or paying anything.

## Navigation

Hash routes, no router dependency. Switching persona lands on that persona's
first tab.

| Persona | Route | Screen |
| --- | --- | --- |
| Approver | `#/queue` | Queue: undecided invoices with recommendations, actions |
| Approver | `#/purchase-orders` | Purchase orders: balances and the invoices billed against each |
| Approver | `#/history` | History: the events timeline, filterable |
| Approver | `#/policy` | Policy: the Markdown and the thresholds from code |
| Approver | `#/invoice/<id>` | Invoice detail: checks, reviews, events, actions |
| Requester | `#/submit` | Submit: the invoice form |
| Requester | `#/mine` | My invoices: every submitted invoice and its status |
| Requester | `#/invoice/<id>` | Invoice detail, requester view |

An unknown route or a route the persona does not own redirects to the
persona's first tab.

## Invoice lifecycle

`status` is the human-owned lane:

```
new -> reviewed -> approved | rejected
              \-> returned -> new (resubmitted, revision + 1) -> reviewed -> ...
```

- `new`: submitted, seeded, or resubmitted; no review for this revision yet.
- `reviewed`: a review for the current revision is saved; `recommendation`
  and `review_id` point at it.
- `returned`: the approver sent it back with a note. The requester can edit
  and resubmit.
- `approved`, `rejected`: terminal.

Requester-facing labels: `new` and `reviewed` show as **Under review**,
`returned` as **Returned, action needed**, `approved` and `rejected` as
themselves.

Rules the tools enforce:

- Only a `reviewed` invoice can be decided.
- `returned` requires a note.
- Approving an invoice whose latest recommendation is `escalate` requires a
  note.
- The hard rules (`approvalBlockers`) block an approval in `decide_invoice`
  and in the `approval-guard` hook.
- Only a `returned` invoice can be resubmitted.

## Data model

### `invoices`

The vendor invoice as submitted (vendor, number, PO, dates, total, line
items, notes), plus the fields the lifecycle owns:

| Field | Type | Meaning |
| --- | --- | --- |
| `requester` | string | The person who requested the work, `Name (Team)`. |
| `revision` | number | 1 on submit, +1 on each resubmit. |
| `status` | enum | `new`, `reviewed`, `approved`, `rejected`, `returned`. |
| `review_id` | string, nullable | The review for the current revision. |
| `recommendation` | enum, nullable | The clamped recommendation of that review. |
| `returned_note` | string, nullable | The approver's note from the latest return. |
| `decision_note` | string, nullable | The approver's note on the decision. |
| `received_at` | datetime | When the invoice first arrived. |
| `submitted_at` | datetime | When this revision was submitted. |
| `reviewed_at`, `decided_at` | datetime, nullable | When the review and the decision landed. |

### `purchase_orders`

`po_number`, `vendor_name`, `description`, `amount_usd`,
`billed_to_date_usd`, `requester`, and `status` (`open` or `closed`).
`decide_invoice` adds an approved invoice's total to `billed_to_date_usd`.

### `reviews`

Keyed `rev_{invoice_id}_{revision}_{created_at ms}`, so every run keeps its
row. `revision` names the invoice revision reviewed; the invoice's
`review_id` names the latest row.

### `events`

| Field | Type | Meaning |
| --- | --- | --- |
| `event_id` | string | `evt_{created_at ms}_{random}` |
| `invoice_id` | string, nullable | The invoice the event is about. Null for `reset`. |
| `kind` | enum | `seeded`, `submitted`, `resubmitted`, `reviewed`, `returned`, `approved`, `rejected`, `reset` |
| `actor` | string | A requester's name, `approver`, `agent`, or `system` |
| `recommendation` | enum, nullable | On `reviewed`: the clamped recommendation |
| `note` | string, nullable | The operator's note on a decision or return |
| `revision` | number, nullable | The invoice revision the event belongs to |
| `created_at` | datetime | |

Indexed: `invoice_id`, `kind`, `actor`, `created_at`.

Every tool that changes an invoice appends one event in the same run. The
agent's chat surface has this store as `rw`: a session registers store
tools from the agent's grants (`read` gives get, query, and list; `rw` adds
set and remove), and a composite tool's `uses` is checked against that
registry, so the events writes in `review_invoice` and `seed_examples` need
the write grant. The prompt forbids writing events by hand. "What happened
to Atlas's invoice?" is answerable from the store.

## Tools

| Tool | Triggers | Lane | What it does |
| --- | --- | --- | --- |
| `seed_examples` | `seed` regex, `invoke` | durable | Loads the demo dataset, reviews and events included. Idempotent per row. |
| `submit_invoice` | `invoke` | durable | Validates, writes the row, appends the event, reviews the in-memory row. |
| `review_invoice` | `review <id>` regex, `invoke` | durable | Writes one review row per run, stamps `review_id`, appends `reviewed`. |
| `decide_invoice` | `invoke` | durable | Records `approved`, `rejected`, or `returned` under the note rules. Appends the event. |
| `reset_demo` | `invoke` | durable | Removes every row in the four stores, then seeds. Appends `reset`. |
| `invoice_math` | | | Line sums, PO balances, variance, and tolerance for the chat agent. Numbers only. |

### `submit_invoice`

Parameters:

```json
{
  "invoice_id": "optional; present means a resubmission",
  "vendor_name": "string",
  "invoice_number": "string",
  "po_number": "string or null",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "total_usd": "number > 0",
  "line_items": [{ "description": "string", "quantity": "number > 0", "unit_price_usd": "number >= 0" }],
  "notes": "string or null",
  "requester": "string"
}
```

Behavior:

1. Validate. Every string trimmed and non-empty where required, dates ISO,
   at least one line item, `total_usd` positive. The total is not forced to
   equal the line sum: the policy's "lines do not add up" rule needs to be
   demonstrable.
2. New submission: `invoice_id` is `inv_{slug(vendor_name)}_{slug(invoice_number)}`.
   If that key exists, append `_2`, `_3`, and so on. This keeps a resent
   invoice (same vendor, same number) as its own row, which is what the
   duplicate check needs.
3. Resubmission: the row must exist and be `returned`. Fields are replaced,
   `revision` increments, `status` becomes `new`, `returned_note` clears.
4. Write the row with `status: new`, `submitted_at` and `received_at` set to
   now (resubmission keeps the original `received_at`).
5. Append `submitted` or `resubmitted`, actor the requester.
6. Run the review on the in-memory row. The review writes its own row and
   event, and stamps the invoice with `status: reviewed`, `recommendation`,
   `review_id`, `reviewed_at`.
7. Return `{ invoice_id, revision, recommendation, review_id }`. A failing
   review leaves the invoice `new` and rethrows, so the form shows the error
   and the approver's Review button retries it.

The invoke lane does not validate `parameters`, so the handler validates
everything itself, as `decide_invoice` does.

### `review_invoice`

`runInvoiceReview` takes an optional preloaded `{ invoice, po, others }`.
Without one it loads from the stores, which is the path the chat trigger and
the evals take, including the self-seeding fallback on fresh stores. On
completion it writes the review row, re-emits the invoice with
`status: reviewed`, `review_id`, `recommendation`, `reviewed_at`, and appends
a `reviewed` event with actor `agent`. A re-review of a `reviewed` invoice is
allowed and produces another review row; the previous one stays in history.

### `decide_invoice`

`decision` is `approved`, `rejected`, or `returned`. Requires `status:
reviewed` and a review at `invoice.review_id`.

- `returned`: note required. Sets `status: returned`, `returned_note`,
  `decided_at: null`. Appends `returned`.
- `approved`: blocked by `approvalBlockers`. Note required when the review's
  recommendation is `escalate`. Adds the total to the PO's
  `billed_to_date_usd`. Appends `approved`.
- `rejected`: appends `rejected`.

Actor is `approver`.

### `reset_demo`

Lists and removes every row in `invoices`, `purchase_orders`, `reviews`, and
`events`, then calls `ensureExamplesSeeded`. Appends one `reset` event with
actor `system` after the seed. `uses` declares the four stores' `list`,
`remove`, and `set` tools; the seed runs blind, so no `query`. Not in any
agent's tools.

### Agent surfaces

- `agents/default/agent.json`: tools `review_invoice`, `seed_examples`, and
  `invoice_math`; all four stores as `rw` (see the `events` store above for
  why the events grant is not `read`).
- `agents/default/AGENT.md`: the data loads on first open, history questions
  are answered from the events store, and the three requesters are named.
- `agents/invoice-reviewer`: the policy judgment, called as a subagent.
- `hooks/approval-guard`: reads the invoice and its PO from the stores, not
  the review, and blocks an approval write that fails a hard rule.

## Seed dataset

`amodal/_lib/examples.ts` holds three purchase orders and five live
invoices, each live invoice carrying a `requester`:

| Invoice | Requester |
| --- | --- |
| `inv_brightline_0417`, `inv_brightline_0417_resend` | Omar Haddad (Engineering) |
| `inv_norwood_2288` | Lena Fischer (Facilities) |
| `inv_atlas_9911` | Omar Haddad (Engineering) |
| `inv_pixelforge_77` | Maya Chen (Marketing) |

It also holds a **backlog**: two more purchase orders and ten invoices dated
over the six weeks before the live set, each already reviewed and decided,
with their review rows and events. Shape:

- Two purchase orders from vendors the live set does not use, one of them
  `closed`, both with `billed_to_date_usd` equal to the sum of their approved
  backlog invoices.
- Eight `approved` invoices across the three requesters, some against the
  backlog POs, some no-PO under $1,000.
- One `rejected` duplicate.
- One returned, resubmitted at revision 2, then approved: two reviews, six
  events (submitted, reviewed, returned, resubmitted, reviewed, approved).
- One `rejected` after an `escalate` recommendation, with a note.

Constraints, each pinned by a test in `tests/demo-data.test.ts`:

- The backlog never bills against PO-1041, PO-1052, or PO-1063 and never
  reuses a live invoice's vendor and number. The five review evals keep
  passing untouched.
- Every invoice's lines add up to its total, names one of the three
  requesters, and cites a purchase order that exists and shares its vendor.
- Every PO's `billed_to_date_usd` equals the sum of its approved invoices,
  and every seeded approval passes the guard hook's rules against those
  balances.
- Every backlog invoice has at least one review and at least three events
  (submitted, reviewed, decided), with timestamps in that order.
- Seeded review rows are canned (`reviewer_session_id: "seed"`), written by
  code, never by the model.

`ensureExamplesSeeded` writes purchase orders, invoices, reviews, and
events, idempotent per row, and returns how many invoices it wrote.

## Seeding on first open

In `App.tsx`, once the `invoices` query has loaded and returned no rows, the
app runs `seed_examples` through `useToolRun` and refetches. A ref prevents a
second run under StrictMode; the tool is idempotent regardless. While it
runs the page shows "Loading the demo…" in place of the tables. A failure
shows a banner with a Retry button. The `seed` chat command works for the
evals and for anyone who empties the stores by hand.

## Screens

### Approver: Queue

The invoices whose status is `new`, `reviewed`, or `returned`, sorted by
`received_at` descending. Columns: vendor and invoice number, requester,
purchase order with remaining balance, total, due date, recommendation pill
with the amount note, issues, actions.

Actions per row: **Review** (or Re-review), and on a `reviewed` row
**Approve**, **Return**, **Reject**. Each opens the confirm modal. **Review
all** in the header reviews every `new` row. Reviews queue and run one at a
time. A row's vendor cell links to the invoice detail.

The pill carries the recommendation (`approve`, `hold`, `escalate`,
`reject`), or "Returned" on a returned invoice, or "Not reviewed" when there
is no review yet.

### Approver: Invoice detail

Header: vendor, invoice number, total, status pill, requester, revision.
Sections:

- **Invoice**: dates, PO with description and remaining balance, line items
  table with line sum against stated total, notes.
- **Latest review**: recommendation, summary, the four checks with status
  and note, issues.
- **Actions**: the same buttons as the queue row, replaced by the decision
  note once decided.
- **Timeline**: this invoice's events, newest first, with the review
  recommendation on `reviewed` events and the note on decisions. Each review
  expands inline.

### Approver: Purchase orders

One row per PO: number and description, vendor, requester, status, amount,
billed to date, remaining, and the list of invoices billed against it with
their status. Sorted open first, then by number.

### Approver: History

The events store, newest first, with filter chips by kind (All, Submitted,
Reviewed, Returned, Approved, Rejected, System) and a text filter on vendor
or invoice id. Each row: time, actor, kind, invoice (linked), recommendation
or note.

### Approver: Policy

`spend-policy.md` rendered with `FormattedMarkdown`, preceded by a
thresholds table read from `policy.ts` (`no_po_limit_usd`, tolerance
percentage and minimum, controller limit) so the page cannot disagree with
the code. A line under the table says the hook enforces the hard rules for
every writer and names the three files that carry the values.

### Requester: Submit

A form: vendor name, invoice number, purchase order (a select over open POs
plus "None"), requested by (a select over the seeded people, set from the
purchase order when one is chosen), invoice date, due date, line items (add
and remove rows; description, quantity, unit price), total (computed from
the lines, with an "enter a different total" toggle for the mismatch demo),
notes.

Submit runs `submit_invoice`, holds the button at "Submitting and
reviewing…" while the review runs, then navigates to the invoice detail.
Validation errors from the tool render under the form.

### Requester: My invoices

The requester's invoices, newest first: vendor and number, total, PO,
submitted date, status label. A `returned` row shows the approver's note and
an **Edit and resubmit** button. Rows link to the detail.

### Requester: Invoice detail

The same invoice section as the approver's, with the status label instead
of the recommendation. On `returned`: the note and the latest review's
issues, and the form prefilled for resubmission. On `approved` or
`rejected`: the approver's note. No checks, no recommendation, no timeline.

### Modals

- **Decide**: one modal for the three decisions, with the note required for
  `returned` and for approving an `escalate`. The copy says what the decision
  records.
- **Reset demo data**: "This deletes every invoice, purchase order, review,
  and event and reloads the demo. Continue?"

### Empty and loading states

- Stores empty, seed running: "Loading the demo…".
- Queue empty: "Nothing to review. Submit an invoice as a requester, or
  reset the demo."
- My invoices empty: "Nothing submitted yet." and a link to Submit.
- History filtered to nothing: "No events match."

## Code layout

```
amodal/
  stores/        invoices.json  purchase_orders.json  reviews.json  events.json
  _types/
    tool-context.ts         the runtime's tool context and definition types
  _lib/
    policy.ts               thresholds and the invoice arithmetic
    invoice-review.ts       facts, the subagent call, the clamp, the review row, the reviewed event
    submit.ts               validation, id generation, submit and resubmit
    events.ts               appendEvent and the kind enum
    reset.ts                empty the four stores, reseed blind, record the reset
    examples.ts             the live set and the decided backlog
    demo-data.ts            row builders and the idempotent seed over the four stores
  tools/
    review_invoice/  seed_examples/  submit_invoice/  decide_invoice/  reset_demo/  invoice-math/
src/
  main.tsx
  App.tsx                   shell: header, persona, routes, auto-seed, reset
  routes.ts                 hash router hook and the per-persona route table
  persona.ts                localStorage persona
  tools.ts                  invoke-lane runner that rethrows a failed outcome
  serial.ts                 one-at-a-time task queue
  actions.tsx               the approver's review and decide actions, with the modal
  types.ts                  row types and formatting shared by the screens
  screens/
    Queue.tsx  InvoiceDetail.tsx  PurchaseOrders.tsx  History.tsx  Policy.tsx
    Submit.tsx  MyInvoices.tsx
  components/
    InvoiceTable.tsx  InvoiceActions.tsx  StatusPill.tsx  DecideModal.tsx  ConfirmModal.tsx
    Timeline.tsx  ReviewBody.tsx  LineItemsEditor.tsx
  styles.css
tests/
  policy.test.ts  invoice-review.test.ts  decide-invoice.test.ts  demo-data.test.ts  approval-guard.test.mjs
  submit.test.ts  events.test.ts  reset-demo.test.ts  routes.test.ts  review-invoice-handler.test.ts
  types.test.ts  serial.test.ts
  helpers.ts                the in-memory store fake, and asserts a handler's store calls and its tool.json uses match each other
```

## Tests and evals

Unit tests, `npm test`:

- `policy.test.ts`: line sums to the cent, the null PO fields, tolerance as
  the larger of the minimum and the percentage, the controller limit.
- `submit.test.ts`: validation errors, id generation and collision suffix,
  resubmit requires `returned` and the same requester, revision increments,
  the review runs on the in-memory row (the store get is never called for
  the new id).
- `decide-invoice.test.ts`: `returned` without a note fails, approving an
  `escalate` without a note fails, `returned` clears `decided_at` and sets
  the note, each decision appends exactly one event.
- `invoice-review.test.ts`: two reviews of the same invoice produce two
  rows, `review_id` points at the latest, the event carries the clamped
  recommendation, a preloaded invoice reads no store.
- `review-invoice-handler.test.ts`: the composite context reaches the review
  flow, and the fresh-store seed uses only declared tools.
- `events.test.ts`: `eventRow` is deterministic for a time and suffix, and
  `appendEvent` writes one row with the nulls filled.
- `demo-data.test.ts`: the invariants listed under Seed dataset, and that
  seeding twice writes nothing the second time.
- `reset-demo.test.ts`: every store is emptied before the seed, one `reset`
  event.
- `routes.test.ts`: persona ownership of routes and the redirect.
- `serial.test.ts`: queued tasks run in order without overlapping, and a
  rejected one does not stop the next.
- `types.test.ts`: `usd` shows the cents only when the amount has cents.
- `approval-guard.test.mjs`: the hook blocks a duplicate, an over-tolerance
  approval, and a missing PO over the limit, and ignores other tools, other
  points, and non-approval writes such as `store__events__set`.

Evals, `amodal eval`:

- The five `review-*` evals, `seed-demo-data`, and `never-pays`.
- `history-question.md`: "what happened to Atlas's invoice?" after a
  review; asserts the answer names the review and comes from the store.
- `never-decides.md`: asking the chat to approve or return an invoice gets
  a refusal that points at the approver's screen.

Verification before each commit: `npm run typecheck`, `npm test`, and
`amodal eval` for any change under `agents/`, `amodal/tools/`, or
`amodal/knowledge/`.

## Out of scope

Payment or any money movement, real authentication, editing the policy at
runtime, creating purchase orders from the UI, vendor notification, file
attachments, and a controller persona.
