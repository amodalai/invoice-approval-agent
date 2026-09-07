import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { INVOICES, invoiceRow } from "../amodal/_lib/demo-data.js";
import { serial } from "../src/serial.js";
import * as tools from "../src/tools.js";
import * as types from "../src/types.js";
import * as routes from "../src/routes.js";
import * as steps from "../src/steps.js";
import { hooks, jsxRuntime, loadUI, walk, type Element } from "./ui.js";

function mount() {
  const state = hooks();
  const started: string[] = [];
  const finish: Array<(value: unknown) => void> = [];
  const data: types.Data = {
    invoices: INVOICES.slice(0, 2).map((inv) => invoiceRow(inv, "2026-01-01") as unknown as types.InvoiceRow),
    pos: new Map(), reviews: new Map(), events: [], async refetch() {},
  };
  const base = { react: state.react, "react/jsx-runtime": jsxRuntime };
  const { useInvoiceActions } = loadUI(new URL("../src/actions.tsx", import.meta.url), {
    ...base,
    "@amodalai/react": { useToolRun: () => ({ run({ invoice_id }: { invoice_id: string }) {
      started.push(invoice_id);
      return new Promise((resolve) => finish.push(resolve));
    } }) },
    "./components/DecideModal.js": { DecideModal: () => null },
    "./serial.js": { serial }, "./tools.js": tools, "./types.js": types,
  });
  const buttons = loadUI(new URL("../src/components/InvoiceActions.tsx", import.meta.url), {
    ...base, "../types.js": types,
  });
  const { InvoiceTable } = loadUI(new URL("../src/components/InvoiceTable.tsx", import.meta.url), {
    ...base, "../routes.js": routes, "../steps.js": steps, "../types.js": types,
    "./InvoiceActions.js": buttons,
    "./ReviewSteps.js": { ReviewSteps: ({ steps }: { steps: steps.Step[] }) => jsxRuntime.jsx("ol", {
      children: steps.map((step) => jsxRuntime.jsx("li", { children: step.label })),
    }) },
    "./StatusPill.js": { StatusPill: () => null },
  });
  const { Inbox } = loadUI(new URL("../src/screens/Inbox.tsx", import.meta.url), {
    ...base, "../actions.js": { useInvoiceActions },
    "../components/Intake.js": { Intake: () => null },
    "../components/InvoiceTable.js": { InvoiceTable },
  });
  function render() {
    state.reset();
    return walk(Inbox({ data }), true);
  }
  const text = (node: unknown): string => {
    if (Array.isArray(node)) return node.map(text).join(" ");
    if (node && typeof node === "object" && "props" in node) {
      const el = node as Element;
      return text(typeof el.type === "function" ? el.type(el.props) : el.props.children);
    }
    return node == null ? "" : String(node);
  };
  const rows = () => render().filter((el) => el.type === "tr").slice(1);
  const header = () => render().filter((el) => el.type === "button")[1];
  return { data, started, finish, rows, header, text };
}

for (const failFirst of [false, true]) {
  test(`review queue shows only the running row as active and advances after ${failFirst ? "failure" : "success"}`, async () => {
    const ui = mount();
    const [first, second] = [...ui.data.invoices].sort((a, b) => b.received_at.localeCompare(a.received_at));
    ui.header().props.onClick();
    assert.equal(ui.text(ui.header()), "Queued 2…");
    await setImmediate();
    assert.deepEqual(ui.started, [first.invoice_id]);
    assert.match(ui.text(ui.rows()[0]), /Reviewer reading/);
    assert.match(ui.text(ui.rows()[1]), /Queued for review/);
    assert.doesNotMatch(ui.text(ui.rows()[1]), /Reviewer reading/);
    assert.equal(ui.text(ui.header()), "Reviewing 1 · 1 queued…");
    assert.equal(ui.header().props.disabled, true);
    for (const row of ui.rows()) assert.equal(walk(row, true).filter((el) => el.type === "button").length, 0);
    ui.finish[0]({ outcome: failFirst ? { kind: "failed", reason: "Review failed" } : { kind: "completed" } });
    await setImmediate();
    assert.deepEqual(ui.started, [first.invoice_id, second.invoice_id]);
    assert.doesNotMatch(ui.text(ui.rows()[0]), /Reviewer reading|Queued for review/);
    assert.match(ui.text(ui.rows()[1]), /Reviewer reading/);
    assert.equal(ui.text(ui.header()), "Reviewing 1…");
    if (failFirst) assert.match(ui.text(ui.rows()[0]), /Review failed/);
    ui.finish[1]({ outcome: { kind: "completed" } });
    await setImmediate();
    assert.equal(ui.text(ui.header()), "Review all 2");
    assert.ok(ui.rows().every((row) => !/Reviewer reading|Queued for review/.test(ui.text(row))));
  });
}

test("pending reviews hide decision actions even when refreshed data has a verdict", async () => {
  const ui = mount();
  ui.header().props.onClick();
  for (const invoice of ui.data.invoices) {
    invoice.status = "reviewed";
    invoice.recommendation = "approve";
  }
  await setImmediate();
  for (const row of ui.rows()) assert.equal(walk(row, true).filter((el) => el.type === "button").length, 0);
  ui.finish[0]({ outcome: { kind: "completed" } });
  await setImmediate();
  assert.ok(walk(ui.rows()[0], true).some((el) => el.type === "button" && el.props.children === "Approve"));
  assert.equal(walk(ui.rows()[1], true).filter((el) => el.type === "button").length, 0);
  ui.finish[1]({ outcome: { kind: "completed" } });
  await setImmediate();
});
