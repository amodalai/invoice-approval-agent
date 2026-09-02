# Invoice Approval: specification

Status: proposed (2026-09-02). This document describes the target app. The
repository as it stands is the starting point; the "Today" notes say what
changes.

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
| Personas | Requester and approver, switched in the header, no auth | The runtime gives the custom UI no user identity. A switch keeps the demo self-contained. |
| What a requester submits | An invoice, with or without a purchase order | The data model and the policy already cover it. No new rules. |
| Review timing | On submit, in the same tool run | The requester sees a result without anyone pressing a button. |
| Lifecycle | Approver can return an invoice; requester edits and resubmits | Gives `hold` a human path. One new status, one new decision value. |
| History | An `events` store, one row per action, and one review row per run | Re-reviews and returns are kept. Reviews stop overwriting each other. |
| Seed | Five pinned live invoices plus a decided backlog, seeded on first open | History, purchase-order balances, and the requester's list are populated at first open. The evals keep their five cases. |
| Policy | Read-only in the UI | The guard hook, `policy.ts`, and the reviewer prompt all carry the thresholds. A runtime edit would let them drift. |
| Escalate | The approver decides, note required | No third persona. Hard rules still block in code and in the hook. |
| Reset | A `reset_demo` tool behind a confirm modal | Replay the demo without redeploying. |
| Requester identity | Picked from the seeded people, kept in `localStorage` | The "names the person who requested it" rule always sees a real name. |
| Requester visibility | Status, issues on a return, and the approver's note | Recommendations and check tables stay approver-side, as in real AP. |

## Runtime constraints that shape the design

- **No startup hook.** The runtime's hook points are `preInput`, `preToolUse`,
  `postToolUse`, `preOutput`, and `postTurn`. Trigger kinds are `regex`,
  `invoke`, and `schedule` (cron). Nothing runs at deploy time, so "seed on
  launch" is the UI seeding on first mount when the stores are empty. A cron
  trigger would run forever for a one-time job, and a `preInput` hook only
  fires on chat.
- **A run cannot read back its own writes.** `loadInvoice` already works
  around this for seeding. `submit_invoice` therefore reviews the row it
  holds in memory instead of re-reading it, and `runInvoiceReview` accepts a
  preloaded invoice.
- **The invoke lane exists.** `useToolRun` posts to `/api/tools/<name>/run`
  for any tool with an `invoke` trigger. Reviews and seeding move to it; the
  chat detour through `runChatCommand` goes away. The `review <id>` and
  `seed` regex triggers stay for chat and for the evals.
- **Store tools** are `store__<name>__get`, `__set`, `__query`, `__list`, and
  `__remove`. Reset uses `__list` and `__remove`.

## Personas and identity

The header carries the app name, a persona switch, and an overflow menu.

- **Approver**: one operator. Events record the actor as `approver`.
- **Requester**: one of the seeded people. The switch lists them:
  `Omar Haddad (Engineering)`, `Lena Fischer (Facilities)`,
  `Maya Chen (Marketing)`. The choice is kept under the `localStorage` key
  `persona` as `{ role, requester }`, stamped on every submitted invoice as
  `requester`, and filters My invoices.

The overflow menu holds **Reset demo data**. The chat widget floats on every
tab for both personas; the guard hook and the agent prompt already keep chat
from approving or paying anything.

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
| Requester | `#/mine` | My invoices: the requester's invoices and their status |
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
  and in the `approval-guard` hook, unchanged.
- Only a `returned` invoice can be resubmitted, and only by its requester.

## Data model

### `invoices` (changed)

Added fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `requester` | string | The person who requested the work, `Name (Team)`. |
| `revision` | number | 1 on submit, +1 on each resubmit. |
| `review_id` | string, nullable | The review for the current revision. |
| `returned_note` | string, nullable | The approver's note from the latest return. |
| `submitted_at` | datetime | When this revision was submitted. |

`status` gains `returned`. `reviewed_at`, `decided_at`, `decision_note`,
`recommendation`, and `received_at` stay.

Today: no `requester`, one review per invoice, no `returned`.

### `purchase_orders` (unchanged)

### `reviews` (changed)

Key becomes `rev_{invoice_id}_{revision}_{created_at ms}` so every run keeps
its row. Added field `revision` (number). The invoice's `review_id` names the
latest one.

Today: keyed `rev_{invoice_id}`, so a re-review overwrites.

### `events` (new)

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
agent's chat surface has this store `r`, so "what happened to Atlas's
invoice?" is answerable from it.

## Tools

| Tool | Triggers | Lane | Change |
| --- | --- | --- | --- |
| `seed_examples` | `seed` regex, `invoke` | composite | Loads the extended dataset, including reviews and events. Idempotent per row. |
| `submit_invoice` | `invoke` | durable | New. Validates, writes the row, appends the event, reviews the in-memory row. |
| `review_invoice` | `review <id>` regex, `invoke` | composite | Writes a new review row per run, stamps `review_id`, appends `reviewed`. |
| `decide_invoice` | `invoke` | durable | `decision` gains `returned`. Note rules. Appends the event. |
| `reset_demo` | `invoke` | durable | New. Removes every row in the four stores, then seeds. Appends `reset`. |
| `invoice_math` | | | Unchanged. |

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
3. Resubmission: the row must exist, be `returned`, and carry the same
   `requester`. Fields are replaced, `revision` increments, `status` becomes
   `new`, `returned_note` clears.
4. Write the row with `status: new`, `submitted_at` and `received_at` set to
   now (resubmission keeps the original `received_at`).
5. Append `submitted` or `resubmitted`, actor the requester.
6. Run the review on the in-memory row. The review writes its own row and
   event, and the tool re-emits the invoice with `status: reviewed`,
   `recommendation`, `review_id`, `reviewed_at`.
7. Return `{ invoice_id, revision, recommendation, review_id }`. If the
   review fails, the invoice stays `new` and the error is returned; the
   approver's Review button retries it.

The invoke lane does not validate `parameters`, so the handler validates
everything itself, as `decide_invoice` does today.

### `review_invoice`

`runInvoiceReview` gains an optional preloaded `{ invoice, po, others }`.
The store-loading path stays for the chat trigger and the evals, including
the self-seeding fallback on fresh stores. On completion it writes the
review under the new key, re-emits the invoice with `status: reviewed`,
`review_id`, `recommendation`, `reviewed_at`, and appends a `reviewed`
event with actor `agent`. A re-review of a `reviewed` invoice is allowed and
produces a new review row; the previous one stays in history.

### `decide_invoice`

`decision` is `approved`, `rejected`, or `returned`. Requires `status:
reviewed` and a review at `invoice.review_id`.

- `returned`: note required. Sets `status: returned`, `returned_note`,
  `decided_at: null`. Appends `returned`.
- `approved`: blocked by `approvalBlockers` as today. Note required when the
  review's recommendation is `escalate`. Adds the total to the PO's
  `billed_to_date_usd`. Appends `approved`.
- `rejected`: appends `rejected`.

Actor is `approver`.

### `reset_demo`

Lists and removes every row in `invoices`, `purchase_orders`, `reviews`, and
`events`, then calls `ensureExamplesSeeded`. Appends one `reset` event with
actor `system` after the seed. `uses` declares the four stores' `list`,
`remove`, `query`, and `set` tools. Not in any agent's tools.

### Agent surfaces

- `agents/default/agent.json`: tools unchanged (`review_invoice`,
  `seed_examples`, `invoice_math`); stores gain `events: r`.
- `agents/default/AGENT.md`: drop the "Load demo invoices" instruction; say
  the data is loaded on first open; add that history questions are answered
  from the events store; list the requesters.
- `agents/invoice-reviewer`: unchanged.
- `hooks/approval-guard`: unchanged in logic. It reads the invoice and its
  PO from the stores, not the review, so the review key change does not
  affect it.

## Seed dataset

`amodal/_lib/examples.ts` keeps the three purchase orders and five live
invoices exactly as they are (ids, amounts, offsets), with `requester` added
to each live invoice:

| Invoice | Requester |
| --- | --- |
| `inv_brightline_0417`, `inv_brightline_0417_resend` | Omar Haddad (Engineering) |
| `inv_norwood_2288` | Lena Fischer (Facilities) |
| `inv_atlas_9911` | Omar Haddad (Engineering) |
| `inv_pixelforge_77` | Maya Chen (Marketing) |

It adds a **backlog**: two more purchase orders and about ten invoices dated
over the six weeks before `DEMO_NOW`, each already reviewed and decided, with
their review rows and events. Shape:

- Two purchase orders from vendors the live set does not use, one of them
  `closed`, both with `billed_to_date_usd` equal to the sum of their approved
  backlog invoices.
- About seven `approved` invoices across the three requesters, some against
  the backlog POs, some no-PO under $1,000.
- One `rejected` duplicate.
- One returned, resubmitted at revision 2, then approved: two reviews, five
  events.
- One `rejected` after an `escalate` recommendation, with a note.

Constraints, each pinned by a test in `tests/demo-data.test.ts`:

- The backlog never bills against PO-1041, PO-1052, or PO-1063 and never
  reuses a live invoice's vendor and number. The five review evals keep
  passing untouched.
- Every PO's `billed_to_date_usd` equals the sum of its approved invoices.
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
shows a banner with a Retry button. The `seed` chat command keeps working
for the evals and for anyone who empties the stores by hand.

## Screens

### Approver: Queue

Today's table, limited to invoices whose status is `new`, `reviewed`, or
`returned`, sorted by `received_at` descending. Columns: vendor and invoice
number, requester, purchase order with remaining balance, total, due date,
recommendation pill with the amount note, issues, actions.

Actions per row: **Review** (or Re-review), and on a `reviewed` row
**Approve**, **Return**, **Reject**. Each opens the confirm modal. **Review
all** in the header reviews every `new` row. A row's vendor cell links to
the invoice detail.

Recommendation pills: `approve` green, `hold` amber, `escalate` orange,
`reject` red, `returned` grey with "Returned" text, `new` grey with "Not
reviewed".

### Approver: Invoice detail

Header: vendor, invoice number, total, status pill, requester, revision.
Sections:

- **Invoice**: dates, PO with description and remaining balance, line items
  table with line sum against stated total, notes.
- **Latest review**: recommendation, summary, the four checks with status
  and note, issues.
- **Actions**: the same buttons as the queue row, hidden once decided.
- **Timeline**: this invoice's events, newest first, with the review
  recommendation on `reviewed` events and the note on decisions. Earlier
  reviews expand inline.

### Approver: Purchase orders

One card or row per PO: number, vendor, description, requester, status,
amount, billed to date, remaining, and the list of invoices billed against
it with their status. Sorted open first, then by number.

### Approver: History

The events store, newest first, with filter chips by kind (All, Submitted,
Reviewed, Returned, Approved, Rejected, System) and a text filter on vendor
or invoice id. Each row: time, actor, kind, invoice (linked), recommendation
or note. Same idea as spectrum-strike's audit trail, without the CSV export.

### Approver: Policy

`spend-policy.md` rendered with `FormattedMarkdown`, preceded by a
thresholds table read from `policy.ts` (`no_po_limit_usd`, tolerance
percentage and minimum, controller limit) so the page cannot disagree with
the code. A line under the table says the hook enforces the hard rules for
every writer and points at the file to edit.

### Requester: Submit

A form: vendor name, invoice number, purchase order (a select over open POs
for this requester plus "None"), invoice date, due date, line items (add and
remove rows; description, quantity, unit price), total (computed from the
lines, with an "enter a different total" toggle for the mismatch demo),
notes. Requester is shown, not edited.

Submit runs `submit_invoice`, shows the tool's progress steps while the
review runs, then navigates to the invoice detail. Validation errors from
the tool render under the form.

### Requester: My invoices

The requester's invoices, newest first: vendor and number, total, PO,
submitted date, status label. A `returned` row shows the approver's note and
an **Edit and resubmit** button. Rows link to the detail.

### Requester: Invoice detail

The same invoice section as the approver's, with the status label instead
of the recommendation. On `returned`: the note and the latest review's
issues, and the form prefilled for resubmission. On `approved` or
`rejected`: the approver's note. No checks, no recommendation, no earlier
reviews.

### Modals

- **Decide**: today's modal with the note required for `returned` and for
  approving an `escalate`. The copy says what the decision records.
- **Reset demo data**: "This deletes every invoice, purchase order, review,
  and event and reloads the demo. Continue?"

### Empty and loading states

- Stores empty, seed running: "Loading the demo…".
- Queue empty: "Nothing to review. Submit an invoice as a requester, or
  reset the demo."
- My invoices empty: a link to Submit.
- History filtered to nothing: "No events match."

## Code layout after the change

```
amodal/
  stores/        invoices.json (changed), purchase_orders.json, reviews.json (changed), events.json (new)
  _lib/
    policy.ts               unchanged
    invoice-review.ts       preloaded input, new review key, reviewed event
    submit.ts               validation, id generation, submit and resubmit flow
    events.ts               appendEvent helper and the kind enum
    examples.ts             live set with requesters, backlog set
    demo-data.ts            seeds four stores
  tools/
    review_invoice/         invoke trigger added
    seed_examples/          invoke trigger added
    submit_invoice/         new
    decide_invoice/         returned, note rules, events
    reset_demo/             new
    invoice-math/           unchanged
src/
  main.tsx
  App.tsx                   shell: header, persona, routes, auto-seed
  routes.ts                 hash router hook and the per-persona route table
  persona.ts                localStorage persona
  types.ts                  row types shared by the screens
  screens/
    Queue.tsx  InvoiceDetail.tsx  PurchaseOrders.tsx  History.tsx  Policy.tsx
    Submit.tsx  MyInvoices.tsx
  components/
    InvoiceTable.tsx  StatusPill.tsx  DecideModal.tsx  ConfirmModal.tsx  Timeline.tsx  LineItemsEditor.tsx
  styles.css
tests/
  policy.test.ts  invoice-review.test.ts  decide-invoice.test.ts  demo-data.test.ts  approval-guard.test.mjs
  submit.test.ts  events.test.ts  reset-demo.test.ts  routes.test.ts
```

## Tests and evals

Unit tests, `npm test`:

- `submit.test.ts`: validation errors, id generation and collision suffix,
  resubmit requires `returned` and the same requester, revision increments,
  the review runs on the in-memory row (the store get is never called for
  the new id).
- `decide-invoice.test.ts`: `returned` without a note fails, approving an
  `escalate` without a note fails, `returned` clears `decided_at` and sets
  the note, each decision appends exactly one event.
- `invoice-review.test.ts`: two reviews of the same invoice produce two
  rows, `review_id` points at the latest, the event carries the clamped
  recommendation.
- `demo-data.test.ts`: the invariants listed under Seed dataset, and that
  seeding twice writes nothing the second time.
- `reset-demo.test.ts`: every store is emptied before the seed, one `reset`
  event.
- `routes.test.ts`: persona ownership of routes and the redirect.
- `approval-guard.test.mjs`: unchanged, plus one case proving the hook
  ignores `store__events__set`.

Evals, `amodal eval`:

- The five `review-*` evals, `seed-demo-data`, and `never-pays` stay as
  they are.
- `history-question.md`: "what happened to Atlas's invoice?" after a
  review; asserts the answer names the review and comes from the store.
- `never-decides.md`: asking the chat to approve or return an invoice gets
  a refusal that points at the approver's screen.

Verification before each commit: `npm run typecheck`, `npm test`, and
`amodal eval` for any change under `agents/`, `amodal/tools/`, or
`amodal/knowledge/`.

## Build order

Each phase leaves the app working and is one or more commits.

1. **Stores and library.** `events` store, invoice and review schema
   changes, `events.ts`, `submit.ts`, `invoice-review.ts` changes, the
   backlog dataset, `demo-data.ts`. Tests for all of it.
2. **Tools.** `submit_invoice`, `reset_demo`, `decide_invoice` changes,
   invoke triggers on `review_invoice` and `seed_examples`. Agent prompt
   and surface. Evals.
3. **Shell.** Persona, hash routes, auto-seed, header, reset modal. The
   existing table becomes Queue. Reviews move to the invoke lane;
   `runChatCommand` is deleted.
4. **Approver screens.** Invoice detail, Purchase orders, History, Policy.
5. **Requester screens.** Submit, My invoices, requester detail with
   resubmit.
6. **README.** Rewritten for the two-persona flow and the self-seeding
   start.

## Out of scope

Payment or any money movement, real authentication, editing the policy at
runtime, creating purchase orders from the UI, vendor notification, file
attachments, and a controller persona.
