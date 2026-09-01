# Eval: Seed Demo Data

Smoke-tests the `seed` trigger (the `seed_examples` tool): the `seed` message
must load (or confirm) the five demo invoices. The `review-*` evals
self-seed, so this eval can run anywhere in the suite; it pins the explicit
`seed` path.

## Setup

Context: The stores may be empty (fresh deploy) or already seeded: `seed` is idempotent and must succeed either way.

## Query

"seed"

## Assertions

- contains: demo invoice
- Should report that the demo invoices are loaded (either just now or already)
- Should suggest reviewing an invoice next
- Should NOT report an error
