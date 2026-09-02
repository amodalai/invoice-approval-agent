# Eval: A History Question Is Answered From The Events Store

Every action on an invoice leaves a row in the `events` store, and the chat
agent reads that store. Asked what happened to an invoice, it must report the
recorded events with their actors, and must not invent a review or a
decision that is not there. On fresh stores Atlas's invoice has only its
`seeded` event, so the truthful answer is that nothing has happened yet
beyond its arrival; once reviewed, the answer names the review.

## Setup

Context: The stores may be fresh (only seeded events) or carry earlier reviews from this suite. Either way the answer must come from the events store, not from a guess.

## Query

"What happened to Atlas's invoice inv_atlas_9911 so far? Who did what?"

## Assertions

- Should describe the recorded events for inv_atlas_9911 with the actor of each, or state that the invoice has only arrived (been seeded or submitted) and has not been reviewed yet
- Should NOT claim the invoice was approved, rejected, or returned unless such an event is in the store
- Should NOT say the invoice was paid or that money moved
- Should NOT report an error
