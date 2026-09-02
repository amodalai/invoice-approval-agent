import type { Recommendation } from "./invoice-review.js";

export type EventKind =
  | "seeded"
  | "submitted"
  | "resubmitted"
  | "reviewed"
  | "returned"
  | "approved"
  | "rejected"
  | "reset";

export interface EventRow {
  event_id: string;
  invoice_id: string | null;
  kind: EventKind;
  actor: string;
  recommendation: Recommendation | null;
  note: string | null;
  revision: number | null;
  created_at: string;
}

export interface EventInput {
  invoice_id?: string | null;
  kind: EventKind;
  actor: string;
  recommendation?: Recommendation | null;
  note?: string | null;
  revision?: number | null;
}

export interface EventDeps {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  now(): Date;
  random?(): number;
}

export const eventId = (createdAt: Date, suffix: string) => `evt_${createdAt.getTime()}_${suffix}`;

/** A full row with the nullable fields filled. The seed passes a deterministic suffix so it stays idempotent per row. */
export function eventRow(e: EventInput, createdAt: Date, suffix: string): EventRow {
  return {
    event_id: eventId(createdAt, suffix),
    invoice_id: e.invoice_id ?? null,
    kind: e.kind,
    actor: e.actor,
    recommendation: e.recommendation ?? null,
    note: e.note ?? null,
    revision: e.revision ?? null,
    created_at: createdAt.toISOString(),
  };
}

export async function appendEvent(deps: EventDeps, e: EventInput): Promise<EventRow> {
  const suffix = Math.floor((deps.random?.() ?? Math.random()) * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
  const row = eventRow(e, deps.now(), suffix);
  await deps.callTool("store__events__set", { key: row.event_id, value: row });
  return row;
}
