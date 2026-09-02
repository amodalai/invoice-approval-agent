import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, hashOf, ownsRoute, parseHash, resolveRoute } from "../src/routes.js";

test("parses the tab and invoice hashes and nothing else", () => {
  assert.deepEqual(parseHash("#/queue"), { name: "queue" });
  assert.deepEqual(parseHash("#/purchase-orders"), { name: "purchase-orders" });
  assert.deepEqual(parseHash("#/invoice/inv_atlas_9911"), { name: "invoice", id: "inv_atlas_9911" });
  assert.deepEqual(parseHash("#/invoice/inv%20x"), { name: "invoice", id: "inv x" });
  for (const bad of ["", "#", "#/", "#/nope", "#/invoice", "#/invoice/", "#/queue/extra", "#/invoice/a/b"]) {
    assert.equal(parseHash(bad), undefined, bad);
  }
});

test("hashOf round-trips every route", () => {
  for (const t of [...TABS.approver, ...TABS.requester]) assert.deepEqual(parseHash(hashOf({ name: t.name })), { name: t.name });
  assert.deepEqual(parseHash(hashOf({ name: "invoice", id: "inv x" })), { name: "invoice", id: "inv x" });
});

test("each persona owns its tabs and the invoice detail, and is redirected home otherwise", () => {
  assert.equal(ownsRoute("approver", { name: "queue" }), true);
  assert.equal(ownsRoute("approver", { name: "submit" }), false);
  assert.equal(ownsRoute("requester", { name: "mine" }), true);
  assert.equal(ownsRoute("requester", { name: "history" }), false);
  assert.equal(ownsRoute("requester", { name: "invoice", id: "x" }), true);
  assert.deepEqual(resolveRoute("approver", "#/history"), { route: { name: "history" } });
  assert.deepEqual(resolveRoute("requester", "#/invoice/inv_x"), { route: { name: "invoice", id: "inv_x" } });
  assert.deepEqual(resolveRoute("requester", "#/queue"), { route: { name: "submit" }, redirect: "#/submit" });
  assert.deepEqual(resolveRoute("approver", "#/mine"), { route: { name: "queue" }, redirect: "#/queue" });
  assert.deepEqual(resolveRoute("approver", ""), { route: { name: "queue" }, redirect: "#/queue" });
  assert.deepEqual(resolveRoute("requester", "#/garbage"), { route: { name: "submit" }, redirect: "#/submit" });
});
