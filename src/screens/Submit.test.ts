import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { hooks, jsxRuntime, loadUI, walk } from "../../tests/ui.js";
import { invoiceRow, INVOICES } from "../../amodal/_lib/demo-data.js";
import { REQUESTERS } from "../../amodal/_lib/examples.js";
import * as routes from "../routes.js";
import * as tools from "../tools.js";
import * as types from "../types.js";

function mount({ reviewError, failRefresh = false, total = 12_000 }: { reviewError?: string; failRefresh?: boolean; total?: number } = {}) {
  Object.assign(globalThis, { location: { hash: "#/submit" } });
  const state = hooks();
  const calls: unknown[] = [];
  let refreshes = 0;
  const { Submit } = loadUI(new URL("./Submit.tsx", import.meta.url), {
    react: state.react, "react/jsx-runtime": jsxRuntime,
    "@amodalai/react": { useToolRun: () => ({ async run(input: unknown) {
      calls.push(input);
      return { outcome: { kind: "complete" }, result: { invoice_id: "saved_invoice", review_error: reviewError } };
    } }) },
    "../components/Intake.js": { Intake: () => null },
    "../components/LineItemsEditor.js": { LineItemsEditor: () => null, emptyLine: () => ({}), lineAmount: () => 12_000 },
    "../../amodal/_lib/examples.js": { REQUESTERS },
    "../routes.js": routes, "../tools.js": tools, "../types.js": types,
  });
  const elements = () => {
    state.reset();
    return walk(Submit({
      initial: { ...invoiceRow(INVOICES[0], "2026-09-01"), status: "returned", total_usd: total },
      data: { pos: new Map(), async refetch() {
        refreshes++;
        if (failRefresh) { failRefresh = false; throw new Error("Connection lost"); }
      } },
    }), true);
  };
  const submit = async () => {
    elements().find((el) => el.type === "form")!.props.onSubmit({ preventDefault() {} });
    await setImmediate();
  };
  return { elements, submit, calls, refreshes: () => refreshes };
}

test("successful submission opens the saved invoice after refresh", async () => {
  const ui = mount();
  await ui.submit();
  assert.equal(location.hash, "#/invoice/saved_invoice");
  assert.equal(ui.calls.length, 1);
});

test("resubmission preserves a vendor total that differs from the line sum", async () => {
  const ui = mount({ total: 13_000 });
  await ui.submit();
  assert.equal((ui.calls[0] as { total_usd: number }).total_usd, 13_000);
});

test("a saved invoice with a failed review offers its record instead of another submission", async () => {
  const ui = mount({ reviewError: "Reviewer unavailable" });
  await ui.submit();
  assert.equal(ui.elements().some((el) => el.type === "form"), false);
  assert.ok(ui.elements().some((el) => el.type === "a" && el.props.href === "#/invoice/saved_invoice"));
  assert.ok(ui.elements().some((el) => el.props.role === "status"));
  assert.equal(ui.calls.length, 1);
});

test("retrying after a refresh failure never resubmits the saved invoice", async () => {
  const ui = mount({ failRefresh: true });
  await ui.submit();
  const retry = ui.elements().find((el) => el.type === "button" && el.props.children === "Retry refresh");
  if (retry) { retry.props.onClick(); await setImmediate(); }
  else await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.refreshes(), 2);
});
