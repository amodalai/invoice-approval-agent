import { STORE_KEYS, ensureExamplesSeeded } from "./demo-data.js";
import { appendEvent, type EventDeps } from "./events.js";
import { rows } from "./invoice-review.js";

/**
 * Empty the four stores, reseed them, and record the reset. The seed runs
 * blind (`assumeEmpty`) because the removes are not visible in this run.
 */
export async function resetDemo(deps: EventDeps) {
  const removed = {} as Record<keyof typeof STORE_KEYS, number>;
  for (const [store, field] of Object.entries(STORE_KEYS)) {
    const docs = rows<Record<string, unknown>>(await deps.callTool(`store__${store}__list`, { limit: 1000 }));
    for (const d of docs) await deps.callTool(`store__${store}__remove`, { key: d[field] });
    removed[store as keyof typeof STORE_KEYS] = docs.length;
  }
  const seeded = await ensureExamplesSeeded(deps, { assumeEmpty: true });
  await appendEvent(deps, { kind: "reset", actor: "system" });
  return { removed, seeded };
}
