import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, hashOf, ownsRoute, parseHash, resolveRoute } from "../src/routes.js";

test("parses the tab and invoice hashes and nothing else", () => {
  assert.deepEqual(parseHash("#/inbox"), { name: "inbox" });
  assert.deepEqual(parseHash("#/purchase-orders"), { name: "purchase-orders" });
  assert.deepEqual(parseHash("#/invoice/inv_atlas_9911"), { name: "invoice", id: "inv_atlas_9911" });
  assert.deepEqual(parseHash("#/invoice/inv%20x"), { name: "invoice", id: "inv x" });
  for (const bad of ["", "#", "#/", "#/nope", "#/invoice", "#/invoice/", "#/inbox/extra", "#/invoice/a/b"]) {
    assert.equal(parseHash(bad), undefined, bad);
  }
});

test("hashOf round-trips every route", () => {
  for (const t of [...TABS.approver, ...TABS.requester]) assert.deepEqual(parseHash(hashOf({ name: t.name })), { name: t.name });
  assert.deepEqual(parseHash(hashOf({ name: "invoice", id: "inv x" })), { name: "invoice", id: "inv x" });
});

test("malformed invoice escapes redirect home instead of crashing the app", () => {
  for (const id of ["%", "%GG", "%C3%28", "%E0%A4%A"]) {
    const hash = `#/invoice/${id}`;
    assert.equal(parseHash(hash), undefined);
    assert.deepEqual(resolveRoute("approver", hash), { route: { name: "inbox" }, redirect: "#/inbox" });
    assert.deepEqual(resolveRoute("requester", hash), { route: { name: "submit" }, redirect: "#/submit" });
  }
});

test("each persona owns its tabs and the invoice detail, and is redirected home otherwise", () => {
  assert.equal(ownsRoute("approver", { name: "inbox" }), true);
  assert.equal(ownsRoute("approver", { name: "submit" }), false);
  assert.equal(ownsRoute("requester", { name: "mine" }), true);
  assert.equal(ownsRoute("requester", { name: "history" }), false);
  assert.equal(ownsRoute("requester", { name: "invoice", id: "x" }), true);
  assert.deepEqual(resolveRoute("approver", "#/history"), { route: { name: "history" } });
  assert.deepEqual(resolveRoute("requester", "#/invoice/inv_x"), { route: { name: "invoice", id: "inv_x" } });
  assert.deepEqual(resolveRoute("requester", "#/inbox"), { route: { name: "submit" }, redirect: "#/submit" });
  assert.deepEqual(resolveRoute("approver", "#/mine"), { route: { name: "inbox" }, redirect: "#/inbox" });
  assert.deepEqual(resolveRoute("approver", ""), { route: { name: "inbox" }, redirect: "#/inbox" });
  assert.deepEqual(resolveRoute("requester", "#/garbage"), { route: { name: "submit" }, redirect: "#/submit" });
});
