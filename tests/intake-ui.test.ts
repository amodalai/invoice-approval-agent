import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { REQUESTERS } from "../amodal/_lib/examples.js";
import { SAMPLES } from "../src/samples.js";
import * as tools from "../src/tools.js";

type Element = { type: string; props: Record<string, any> };

function mount({ review = true, failReview = false, failDone = false, failIntake = false } = {}) {
  const calls = { intake: [] as unknown[], review: [] as string[], done: [] as string[] };
  const state: unknown[] = [];
  let cursor = 0;
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => { state[index] = value; }];
      },
    },
    "react/jsx-runtime": { jsx: (type: string, props: Element["props"]) => ({ type, props }), jsxs: (type: string, props: Element["props"]) => ({ type, props }) },
    "@amodalai/react": {
      useToolRun(name: string) {
        return { async run(input: { invoice_id: string }) {
          if (name === "intake_invoice") {
            calls.intake.push(input);
            if (failIntake) {
              failIntake = false;
              return { outcome: { kind: "failed", reason: "Extraction failed" } };
            }
            return { outcome: { kind: "completed" }, result: { invoice_id: `inv_${calls.intake.length}` } };
          }
          calls.review.push(input.invoice_id);
          if (failReview) {
            failReview = false;
            return { outcome: { kind: "failed", reason: "Review failed" } };
          }
          return { outcome: { kind: "completed" } };
        } };
      },
    },
    "../../amodal/_lib/examples.js": { REQUESTERS },
    "../samples.js": { SAMPLES },
    "../tools.js": tools,
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/components/Intake.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { Intake?: (props: unknown) => Element } = {};
  new Function("require", "exports", compiled)((name: string) => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  const render = () => {
    cursor = 0;
    return exports.Intake!({ review, async onDone(id: string) {
      calls.done.push(id);
      if (failDone) {
        failDone = false;
        throw new Error("Refresh failed");
      }
    } });
  };
  function walk(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(walk);
    if (!node || typeof node !== "object" || !("props" in node)) return [];
    const element = node as Element;
    return [element, ...walk(element.props.children)];
  }
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
