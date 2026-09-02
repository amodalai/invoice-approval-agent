import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, eventId, eventRow } from "../amodal/_lib/events.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");

test("eventId and eventRow are deterministic for a given time and suffix", () => {
  assert.equal(eventId(NOW, "inv_x_0"), `evt_${NOW.getTime()}_inv_x_0`);
  assert.deepEqual(eventRow({ kind: "seeded", actor: "system" }, NOW, "a"), {
    event_id: `evt_${NOW.getTime()}_a`,
    invoice_id: null,
    kind: "seeded",
    actor: "system",
    recommendation: null,
    note: null,
    revision: null,
    created_at: NOW.toISOString(),
  });
});

test("appendEvent writes one events row with the nulls filled and a random suffix", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const deps = { async callTool(n: string, a: Record<string, unknown>) { calls.push([n, a]); return {}; }, now: () => NOW, random: () => 0.5 };
  const row = await appendEvent(deps, { invoice_id: "inv_x", kind: "reviewed", actor: "agent", recommendation: "hold", revision: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "store__events__set");
  assert.equal(calls[0][1].key, row.event_id);
  assert.deepEqual(calls[0][1].value, row);
  assert.match(row.event_id, new RegExp(`^evt_${NOW.getTime()}_[0-9a-z]{6}$`));
  assert.equal(row.note, null);
  assert.equal(row.recommendation, "hold");
  const again = await appendEvent(deps, { kind: "reset", actor: "system" });
  assert.equal(again.event_id, row.event_id, "the suffix comes from deps.random");
  assert.equal(again.invoice_id, null);
  const noRandom = await appendEvent({ ...deps, random: undefined }, { kind: "reset", actor: "system" });
  assert.match(noRandom.event_id, /^evt_\d+_[0-9a-z]{6}$/);
});
