import assert from "node:assert/strict";
import { test } from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ConfirmModal } from "./ConfirmModal.js";

test("confirmation preserves content and actions", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const root = createRoot(document.getElementById("root")!);
  let confirmed = 0;
  let cancelled = 0;
  await act(async () => root.render(
    <ConfirmModal title="Approve invoice" confirmLabel="Approve" busy={false} onConfirm={() => confirmed++} onCancel={() => cancelled++}>
      <p>Invoice total: $100</p>
    </ConfirmModal>,
  ));
  assert.match(document.body.textContent!, /Approve invoice.*Invoice total: \$100/);
  const dialog = document.querySelector("dialog")!;
  assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Approve invoice");
  assert.equal(dialog.open, true);
  const buttons = document.querySelectorAll("button");
  await act(async () => { buttons[1].click(); buttons[0].click(); });
  assert.equal(confirmed, 1);
  assert.equal(cancelled, 1);
  const escape = new dom.window.Event("cancel", { cancelable: true });
  await act(async () => { dialog.dispatchEvent(escape); });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(cancelled, 2);
  await act(async () => root.unmount());
  dom.window.close();
});

test("saving cannot be dismissed through the backdrop", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const root = createRoot(document.getElementById("root")!);
  let cancelled = 0;
  await act(async () => root.render(
    <ConfirmModal title="Approve invoice" confirmLabel="Approve" busy onConfirm={() => {}} onCancel={() => cancelled++}>
      <p>Invoice total: $100</p>
    </ConfirmModal>,
  ));
  await act(async () => (document.querySelector("dialog, [role=dialog]") as HTMLElement).click());
  const escape = new dom.window.Event("cancel", { cancelable: true });
  await act(async () => { document.querySelector("dialog")!.dispatchEvent(escape); });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(cancelled, 0);
  await act(async () => root.unmount());
  dom.window.close();
});
