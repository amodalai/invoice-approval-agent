import { test } from "node:test";
import assert from "node:assert/strict";
import { serial } from "../src/serial.js";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

test("runs the tasks one at a time, in call order", async () => {
  const enqueue = serial();
  const gates = ["a", "b", "c"].map(() => deferred());
  const started: string[] = [];
  let running = 0;
  const ids = ["a", "b", "c"];
  const last = ids.map((id, i) =>
    enqueue(async () => {
      started.push(id);
      assert.equal(++running, 1, `${id} overlapped`);
      await gates[i].promise;
      running--;
    }),
  );

  await Promise.resolve();
  assert.deepEqual(started, ["a"]);
  gates[0].resolve();
  await last[0];
  assert.deepEqual(started, ["a", "b"]);
  gates[1].resolve();
  gates[2].resolve();
  await last[2];
  assert.deepEqual(started, ["a", "b", "c"]);
});

test("a rejected task lets the next one run", async () => {
  const enqueue = serial();
  const done: string[] = [];
  enqueue(async () => {
    done.push("a");
    throw new Error("boom");
  });
  await enqueue(async () => void done.push("b"));
  assert.deepEqual(done, ["a", "b"]);
});
