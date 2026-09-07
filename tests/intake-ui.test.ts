import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { REQUESTERS } from "../amodal/_lib/examples.js";
import { SAMPLES } from "../src/samples.js";
import * as tools from "../src/tools.js";

import { loadUI, hooks, jsxRuntime, walk } from "./ui.js";

function mount({ review = true, failReview = false, failDone = false, failIntake = false } = {}) {
  const calls = { intake: [] as unknown[], review: [] as string[], done: [] as string[] };
  const state = hooks();
  const modules: Record<string, unknown> = {
    react: state.react,
    "react/jsx-runtime": jsxRuntime,
    "@amodalai/react": {
      useToolRun(name: string) {
        return { async run(input: { invoice_id: string }) {
          if (name === "intake_invoice") {
            calls.intake.push(input);
            if (failIntake) {
              failIntake = false;
              return { outcome: { kind: "failed", reason: "Extraction failed" } };
            }
            return { outcome: { kind: "complete" }, result: { invoice_id: `inv_${calls.intake.length}` } };
          }
          calls.review.push(input.invoice_id);
          if (failReview) {
            failReview = false;
            return { outcome: { kind: "failed", reason: "Review failed" } };
          }
          return { outcome: { kind: "complete" } };
        } };
      },
    },
    "../../amodal/_lib/examples.js": { REQUESTERS },
    "../samples.js": { SAMPLES },
    "../tools.js": tools,
  };
  const { Intake } = loadUI(new URL("../src/components/Intake.tsx", import.meta.url), modules);
  const render = () => {
    state.reset();
    return Intake({ review, async onDone(id: string) {
      calls.done.push(id);
      if (failDone) {
        failDone = false;
        throw new Error("Refresh failed");
      }
    } });
  };
  const elements = () => walk(render());
  const find = (type: string) => elements().find((element) => element.type === type)!;
  const button = () => elements().find((element) => element.props.type === "submit")!;
  const edit = (value: string) => find("textarea").props.onChange({ target: { value } });
  const submit = async () => {
    render().props.onSubmit({ preventDefault() {} });
    await setImmediate();
  };
  return { calls, elements, find, button, edit, submit };
}

test("intake reads the document, reviews its saved ID, then clears the form", async () => {
  const ui = mount();
  ui.edit("Invoice text");
  await ui.submit();
  assert.deepEqual(ui.calls, { intake: [{ document: "Invoice text" }], review: ["inv_1"], done: ["inv_1"] });
  assert.equal(ui.find("textarea").props.value, "");
});

test("a failed extraction can be edited and submitted again", async () => {
  const ui = mount({ failIntake: true });
  ui.edit("Unclear invoice");
  await ui.submit();
  assert.equal(ui.find("textarea").props.value, "Unclear invoice");
  assert.ok(!ui.find("textarea").props.disabled);
  ui.edit("Corrected invoice");
  await ui.submit();
  assert.deepEqual(ui.calls.intake, [{ document: "Unclear invoice" }, { document: "Corrected invoice" }]);
  assert.deepEqual(ui.calls.done, ["inv_2"]);
});

test("retrying a failed review uses the saved invoice without extracting again", async () => {
  const ui = mount({ failReview: true });
  ui.edit("Invoice text");
  await ui.submit();
  assert.deepEqual(ui.calls.done, []);
  await ui.submit();
  assert.equal(ui.calls.intake.length, 1);
  assert.deepEqual(ui.calls.review, ["inv_1", "inv_1"]);
  assert.deepEqual(ui.calls.done, ["inv_1"]);
});

for (const review of [false, true]) {
  test(`retrying a failed refresh resumes the saved invoice (review=${review})`, async () => {
    const ui = mount({ review, failDone: true });
    ui.edit("Invoice text");
    await ui.submit();
    await ui.submit();
    assert.equal(ui.calls.intake.length, 1);
    assert.deepEqual(ui.calls.review, review ? ["inv_1"] : []);
    assert.deepEqual(ui.calls.done, ["inv_1", "inv_1"]);
    assert.equal(ui.find("textarea").props.value, "");
    assert.equal(ui.find("textarea").props.disabled, false);
  });
}

test("saved invoices keep the submitted document locked and identify the retry", async () => {
  const ui = mount({ failReview: true });
  ui.edit("Invoice text");
  const pending = ui.submit();
  assert.equal(ui.find("textarea").props.disabled, true);
  await pending;
  assert.equal(ui.find("textarea").props.value, "Invoice text");
  assert.equal(ui.find("textarea").props.disabled, true);
  assert.equal(ui.find("select").props.disabled, true);
  for (const chip of ui.elements().filter((element) => element.props.className === "chip")) {
    assert.equal(chip.props.disabled, true);
  }
  assert.equal(ui.button().props.children, "Retry");
  assert.equal(ui.button().props.disabled, false);
  assert.ok(ui.elements().some((element) => element.props.children === "The invoice is saved. Retry to finish processing it."));
});
