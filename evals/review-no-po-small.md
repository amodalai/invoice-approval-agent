# Eval: A Small Invoice Without A PO Is Approved

PixelForge's $650 invoice cites no purchase order, but the policy allows
invoices of $1,000 or less without one when the requester is named, and the
memo names Maya Chen. The review must come back `approve`. If this eval fails,
the reviewer is treating every missing PO as a hold, or the no-PO limit moved.

## Setup

Context: Self-seeding: on fresh stores the review_invoice tool loads the demo data itself, so this eval passes alone and in any order.

## Query

"review inv_pixelforge_77"

## Assertions

- contains: approve
- Should note that no purchase order is required under the $1,000 limit
- Should mention the named requester
- Should NOT recommend hold
