# Spend Policy (fictional)

> Demo content for a fictional company ("Larkspur Co."). Not real accounting,
> tax, or legal advice. The app recommends a decision for a human approver; it
> never pays an invoice or moves money.

This policy says which vendor invoices accounts payable may approve as they
stand, which need a question answered first, which need a manager, and which
must be rejected.

## Thresholds

| Rule                      | Value                                              |
| ------------------------- | -------------------------------------------------- |
| Purchase order required   | Every invoice over **$1,000**                      |
| Amount tolerance          | **2%** of the remaining PO balance, or **$50**, whichever is larger |
| Controller sign-off       | Every invoice over **$25,000**                     |

## Approve

- The invoice cites an **open** purchase order from the **same vendor**.
- The total is within the PO's remaining balance, or over it by no more than
  the tolerance.
- Every line item falls within what the PO describes.
- The line items add up to the stated total.
- It is not a duplicate of an invoice already received.
- An invoice of **$1,000 or less** with no purchase order may be approved
  when it names the person who requested the work.

## Hold (ask the vendor or the requester first)

- A line item is outside the PO's scope (work or goods the PO does not
  describe).
- A fee the PO does not include: rush, expedite, late-payment, or handling
  fees.
- The line items do not add up to the stated total.
- The invoice cites a **closed** purchase order.
- The invoice is over $1,000 and cites no purchase order.

## Escalate (needs a manager)

- The total exceeds the PO's remaining balance by **more than the
  tolerance**: the PO must be amended before payment.
- The total is over **$25,000**, even when everything else is in order.
- Anything that looks wrong but fits no rule above: an unfamiliar vendor on
  a familiar PO, a vendor name that almost matches, an unusual memo.

## Reject

- A **duplicate**: the same vendor already sent an invoice with this invoice
  number.
- The purchase order belongs to a **different vendor**.

When several rules apply, take the most conservative one: reject over
escalate, escalate over hold, hold over approve.
