import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResolvedToolRun } from "@amodalai/react";
import { runTool } from "./tools.js";

const launcher = (kind: string, reason?: string) => ({
  async run() {
    return { outcome: { kind, reason }, result: { invoice_id: "inv_1" } } as unknown as ResolvedToolRun;
  },
});

test("a completed tool returns its result", async () => {
  assert.deepEqual(await runTool(launcher("complete"), {}), { invoice_id: "inv_1" });
});

for (const kind of ["failed", "cancelled", "suspended"]) {
  test(`${kind} runs cannot appear successful`, async () => {
    await assert.rejects(runTool(launcher(kind, 'Tool "review_invoice" failed: Review interrupted'), {}), /Review interrupted/);
  });
}
