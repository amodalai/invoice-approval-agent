# Eval: An Out-Of-Scope Line Is Held

Atlas's invoice 9911 is within its PO balance, but one line (a marketing
strategy workshop) is outside what PO-1063 describes (data migration
consulting). That is the judgment call the reviewer makes and code cannot:
the amount is fine, the scope is not. The review must come back `hold`, with
the workshop named as the issue.

## Setup

Context: Self-seeding: on fresh stores the review_invoice tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review inv_atlas_9911"

## Assertions

- contains: hold
- Should name the marketing strategy workshop line as outside the purchase order's scope
- Should NOT report an amount problem: the total is within the PO's remaining balance
- Should NOT recommend approve
