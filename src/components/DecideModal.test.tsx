import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks, jsxRuntime, loadUI } from "../../tests/ui.js";
import * as types from "../types.js";
import * as policy from "../../amodal/_lib/policy.js";

for (const recommendation of ["approve", "hold", "escalate", "reject"]) {
  test(`approval above the controller limit requires a note even after ${recommendation}`, () => {
    const { DecideModal } = loadUI(new URL("./DecideModal.tsx", import.meta.url), {
      react: hooks().react,
      "react/jsx-runtime": jsxRuntime,
      "./ConfirmModal.js": { ConfirmModal: () => null },
      "../types.js": types,
      "../../amodal/_lib/policy.js": policy,
    });
    const modal = DecideModal({
      inv: { vendor_name: "Demo vendor", invoice_number: "1", total_usd: 25_001, requester: "Maya" },
      decision: "approved", recommendation, busy: false, onConfirm() {}, onCancel() {},
    });
    assert.equal(modal.props.disabled, true);
  });
}
