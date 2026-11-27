import { test } from "node:test";
import assert from "node:assert/strict";
import { runCopyFirst, type CopyFirst, type Force } from "../src/lib/copyFirst";

// A fake store action: records how it was called and answers from a script.
function action(answers: CopyFirst[]) {
  const calls: (Force | undefined)[] = [];
  const run = (o?: Force): CopyFirst => {
    calls.push(o);
    return o?.force ? "done" : answers[calls.length - 1] ?? "done";
  };
  return { run, calls };
}
const anyway = { message: "A backup couldn't be saved first. Continue anyway?", confirmLabel: "Continue anyway" };

test("when the copy is saved, the action runs once and nobody is asked", async () => {
  const a = action(["done"]);
  let asked = 0;
  assert.equal(await runCopyFirst(async () => (asked++, true), a.run, anyway), true);
  assert.deepEqual(a.calls, [undefined]);
  assert.equal(asked, 0);
});

test("when the copy fails and the user cancels, nothing else runs", async () => {
  const a = action(["backup-failed"]);
  assert.equal(await runCopyFirst(async () => false, a.run, anyway), false);
  assert.deepEqual(a.calls, [undefined]);
});

test("when the copy fails and the user agrees, the action runs again with force", async () => {
  const a = action(["backup-failed"]);
  const seen: unknown[] = [];
  assert.equal(await runCopyFirst(async (o) => (seen.push(o), true), a.run, anyway), true);
  assert.deepEqual(a.calls, [undefined, { force: true }]);
  assert.deepEqual(seen, [{ ...anyway, danger: true }], "asked once, as a destructive choice");
});
