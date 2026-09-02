/**
 * Runs its tasks in call order, one at a time. A rejected task does not stop
 * the ones behind it.
 */
export function serial() {
  let tail = Promise.resolve();
  return (task: () => Promise<void>) => (tail = tail.then(task).catch(() => {}));
}
