import { test } from "node:test";
import assert from "node:assert/strict";
import review_invoice from "../amodal/tools/review_invoice/handler.js";
import type { CustomToolContext } from "../amodal/_types/tool-context.js";
import { assertDeclared, fakeStore } from "./helpers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const REPLY = JSON.stringify({ recommendation: "approve", summary: "Fine.", checks: [], issues: [] });

function fakeCtx(opts: { fresh?: boolean } = {}) {
  const { store, calls, callTool } = fakeStore(opts.fresh ? undefined : NOW);
  const seen = { policyPath: "", input: undefined as unknown, reasoning: [] as string[] };
  const ctx: CustomToolContext = {
    log() {},
    signal: new AbortController().signal,
    sessionId: "sess-1",
    now: () => Date.parse(NOW),
    emitReasoning: (t) => seen.reasoning.push(t),
    fs: {
      async readRepoFile(p) {
        seen.policyPath = p;
        return "# policy";
      },
    },
    callTool,
    async callSubagent(_ref, _task, input) {
      seen.input = input;
      return REPLY;
    },
  };
  return { ctx, store, seen, calls };
}

test("wires the composite context into the review flow", async () => {
  const { ctx, store, seen, calls } = fakeCtx();
  const out = await review_invoice({ invoice_id: " inv_brightline_0417 " }, ctx);
  assert.equal(out.found, true);
  assert.equal(out.recommendation, "approve");
  assert.equal(seen.policyPath, "amodal/knowledge/spend-policy.md");
  assert.equal((seen.input as { spend_policy: string }).spend_policy, "# policy");
  assert.equal(store.get(`reviews:${out.review_id}`)!.reviewer_session_id, "sess-1");
  assert.equal(store.get(`reviews:${out.review_id}`)!.created_at, NOW);
  assert.ok(seen.reasoning.some((l) => l.startsWith("Loaded Brightline")));
  assertDeclared("review_invoice", calls.map(([n]) => n));
});

test("on fresh stores it seeds the dataset with tools its uses declares", async () => {
  const { ctx, store, calls } = fakeCtx({ fresh: true });
  const out = await review_invoice({ invoice_id: "inv_atlas_9911" }, ctx);
  assert.equal(out.found, true);
  assert.ok(store.has("invoices:inv_sable_3305") && store.has("purchase_orders:PO-0987"));
  assertDeclared("review_invoice", calls.map(([n]) => n));
});

test("refuses a missing id and a context without composition", async () => {
  const { ctx } = fakeCtx();
  await assert.rejects(review_invoice({}, ctx), /requires an invoice_id/);
  await assert.rejects(review_invoice({ invoice_id: "inv_x" }, { ...ctx, callSubagent: undefined }), /composite context/);
  await assert.rejects(review_invoice({ invoice_id: "inv_brightline_0417" }, { ...ctx, fs: undefined }), /spend policy .* cannot be read/);
});
