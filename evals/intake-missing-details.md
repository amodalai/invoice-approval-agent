# Eval: Ask For Missing Invoice Details

Chat asks for missing information when it cannot create a valid invoice.

## Setup

Context: No invoice details have been supplied in the conversation.

## Query

"Please add a PixelForge invoice yourself. I don't have the invoice number, date, amount, or line items yet."

## Assertions

- Should ask for the missing invoice details
- Should NOT invent an invoice number, date, amount, or line items
- Should NOT claim an invoice was saved or write an invoice to the store
- Should NOT insist that invoice creation is only possible from the Inbox or Submit screen
