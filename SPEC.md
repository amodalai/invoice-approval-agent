# Invoice approval contract

The [README](README.md) describes the demo and setup. This document covers
behavior that changes to the template must preserve.

## Workflow

The approver sees the inbox, invoice details, purchase orders, history, and
policy. The requester can paste or type an invoice, see submitted invoices,
and correct a returned invoice. The selected role is kept in local storage.
All requesters share the same demo records; the switch is not authentication.

```text
new -> reviewed -> approved | rejected
              -> returned -> new (revision + 1) -> reviewed
```

Only `new` and `reviewed` invoices can be reviewed. Only a reviewed invoice
with a saved review can be decided. Approved and rejected invoices keep
their final decision. Returning requires a note, and only a returned invoice
can be resubmitted. Resubmission preserves the invoice ID and original
receipt time, increments its revision, and clears the prior decision.

Every review gets a separate row. The invoice's `review_id` identifies the
current review. Events retain submission, review, return, decision, and reset
history, with an actor and revision where applicable.

## Review and decision rules

1. Load the invoice, its purchase order, and candidate duplicates.
2. Check normalized vendor and invoice numbers, order status, line totals,
   remaining balance, and policy thresholds in code.
3. Pass the invoice, named requester, order, facts, and spend policy to the
   reviewer. The reviewer uses `invoice_math` for arithmetic and judges scope,
   fees, and ambiguous text.
4. Validate the structured reply. Clamp its recommendation to the minimum
   severity the facts allow, then save the review and event.

Recommendation severity is `reject > escalate > hold > approve`. The UI
leads with Approve for `approve`, Return for `hold` or `escalate`, and Reject
for `reject`. These are recommendations; alternative decisions remain
available after confirmation, subject to hard rules.

Approval rechecks duplicates, vendor match, missing required purchase
orders, closed orders, line totals, and remaining balance. Tolerance is the
larger of $50 and 2% of the remaining order balance, rounded to cents. An
invoice without an order must be $1,000 or less. Approval over $25,000 requires
a controller sign-off note regardless of the model recommendation. An
escalated invoice also requires an approval note.

Approval books the invoice total against its purchase order and appends an
event. The app does not transfer money or verify a controller's identity.

## Entry points and recovery

| Tool | Input and effect |
| --- | --- |
| `seed_examples` | Idempotently fills missing examples; invoked on an empty first load or by `seed` in chat |
| `intake_invoice` | Extracts pasted text, resolves requester and order, validates, and saves an unreviewed invoice |
| `submit_invoice` | Validates form fields, writes or resubmits the invoice, then reviews it |
| `review_invoice` | Reviews a saved invoice from the UI, chat tool call, or `review <id>` trigger |
| `decide_invoice` | Records the confirmed approval, return, or rejection |
| `reset_demo` | Deletes and reloads the four demo stores after confirmation |

A successful submission returns its invoice ID, revision, recommendation,
and review ID. If the invoice was saved but review failed, it returns the ID,
revision, and `review_error`. Retry review against that ID. A UI refresh
failure retains the saved record and offers a refresh-only retry.

Typed submissions preserve the vendor's stated total even when it differs
from the lines. The reviewer must be able to demonstrate that mismatch.
Pasted intake retains its saved ID when review fails, so retry does not
extract a second invoice.

All UI writes use durable invoke tools. `runTool` accepts only an
`outcome.kind` of `complete`; HTTP success alone is insufficient. Other
outcomes display an error. Initial reads must settle before the UI shows
decision data. Background refresh failures show a retry banner while
preserving the mounted screen and its saved state.

## Runtime constraints

A durable run cannot read back its own writes. Submission therefore passes
its in-memory row into review, and seeding supplies known example rows when
needed. Store `set` replaces the full value, so updates re-emit the row.
Composite tools declare their dependencies in `uses`. Chat store grants
must also permit the store tools composed by its handlers.

The default agent can intake and review invoices. Human decision, form
submission, and reset tools are absent from its tool list. The prompt forbids
direct decision writes. The approval hook checks policy at the write boundary,
but it can inspect only visible rows. Referenced rows written earlier in the
same durable run can be invisible; normal tool validation covers those cases.
The hook and role switch are demo policy controls, not authorization.

Review runs queue serially because one `useToolRun` launcher handles one
active run. Waiting rows say “Queued for review.” The active row reveals
checks computed from the browser's loaded data while the reviewer finishes.
Those checks are not streamed runtime events and can lag changed store data.
The saved review is the result to use for decisions.

## Data and presentation

The four stores are `invoices`, `purchase_orders`, `reviews`, and `events`.
Their JSON files in `amodal/stores/` define the fields. Five live examples
exercise the main recommendations. A decided backlog populates history and
balances. Reads and duplicate scans are capped at 1,000 rows for this demo.
Reset reloads the complete dataset, including the backlog.

The policy screen renders the same Markdown passed to the reviewer.
Numeric thresholds also live in `policy.ts` and the hook configuration;
change these together. The [API contract](docs/api.md) documents a read-only
subset of the runtime store routes and the remote OpenAPI discovery setup.

Dialogs have names, native modal focus behavior, busy dismissal guards,
and visible decision-note labels. Tables scroll within named keyboard
regions. Form and status controls use text labels, and motion is suppressed
when requested. Contrast tests cover the template's principal text colors;
they do not certify the embedded chat or the entire deployment as WCAG AAA.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build` before committing.
Cover behavioral changes at the exported workflow, handler, hook, or UI
boundary. Reproduce bugs before fixing them. Keep test files outside runtime
loader directories; runtime tests live in `tests/`, and UI tests can sit beside
components. Run `amodal eval` against a compatible runtime to check model
judgment. Unit tests simulate model replies and do not establish live model
quality or deployment authentication.
