# Eval: A Clean Invoice Is Approved

Brightline's invoice 0417 is the clean case: an open PO from the same vendor,
the total equals the remaining balance, one in-scope line, no duplicate. The
review must come back `approve`. If this eval fails after a reviewer or
policy edit, the change tightened the policy more than intended.

## Setup

Context: Self-seeding: on fresh stores the review_invoice tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review inv_brightline_0417"

## Assertions

- contains: approve
- Should recommend approve, with every check passing
- Should cite the invoice_math arithmetic in the amount check ($12,000 against $12,000 remaining on PO-1041)
- Should NOT say the invoice was paid or approved by the agent
