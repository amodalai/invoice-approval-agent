# Eval: Add An Invoice From Chat

Chat uses the same intake tool as the paste panel. The saved invoice awaits
review and carries a received event.

## Setup

Context: The user provides a complete invoice and asks to save it. No review or decision is requested.

## Query

"Please add this invoice yourself: PixelForge Design, invoice CHAT-1078, dated 2026-09-07, due 2026-10-07. Business card printing: 1 batch at $240, total $240. No purchase order. Requested by Maya Chen (Marketing)."

## Assertions

- Should call `intake_invoice` with the supplied invoice details as document
- Should save an invoice with status new and a received event with actor agent
- Should confirm the saved invoice id from the tool result and say it awaits review
- Should NOT direct the user to the Inbox or Submit screen to add the invoice
- Should NOT call `review_invoice` or record an approval, return, rejection, or payment
- not tool_called: store__invoices__set
- not tool_called: store__purchase_orders__set
- not tool_called: store__reviews__set
- not tool_called: store__events__set
