# Eval: A Duplicate Invoice Is Rejected

Brightline resent invoice 0417 with a "please confirm receipt" memo. Code
finds the earlier invoice with the same vendor and number and marks this one
a duplicate, and the policy rejects duplicates outright. The review must come
back `reject` and name the original. If this eval fails, the duplicate lookup
or the reject clamp regressed.

## Setup

Context: Self-seeding: on fresh stores the review_invoice tool loads the demo data itself (including the original inv_brightline_0417), so this eval passes alone and in any order.

## Query

"review inv_brightline_0417_resend"

## Assertions

- contains: reject
- Should identify the invoice as a duplicate of inv_brightline_0417
- Should NOT recommend approve, hold, or escalate
