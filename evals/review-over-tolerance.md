# Eval: An Over-Tolerance Invoice Is Escalated

Norwood's invoice 2288 bills $2,890 against $2,500 remaining on PO-1052: over
by $390 where the tolerance is $50, and it carries a rush delivery fee the PO
does not include. The policy sends an over-tolerance invoice to a manager, so
the review must come back `escalate`, and code clamps anything looser. If
this eval fails, either the reviewer stopped citing the arithmetic or the
clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_invoice tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review inv_norwood_2288"

## Assertions

- contains: escalate
- Should state that the total exceeds the purchase order's remaining balance by more than the tolerance, with the numbers
- Should mention the rush delivery fee as not covered by the PO
- Should NOT recommend approve
