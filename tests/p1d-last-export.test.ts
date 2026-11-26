import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_LAST_EXPORT, lastExportLabel, parseLastExport, readLastExport, writeLastExport } from "../src/lib/exportInfo";
import { KEY_V2, serialize } from "../src/lib/migrate";
import { DEMO_ASSETS, DEMO_CONTENT } from "../src/lib/demo-data";

const store = (init: Record<string, string> = {}, opts: { failWrites?: boolean; failReads?: boolean } = {}) => {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => { if (opts.failReads) throw new Error("blocked"); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.failWrites) throw new Error("quota"); data.set(k, v); },
  };
};
const AT = "2026-11-27T06:05:00.000Z";

test("a valid ISO timestamp is accepted; anything else means never", () => {
  assert.equal(parseLastExport(AT), AT);
  assert.equal(parseLastExport("2026-11-27T06:05:00Z"), "2026-11-27T06:05:00Z");
  for (const bad of [null, "", "yesterday", "2026-11-27", "27/11/2026 14:05", "2026-13-40T99:99:99.000Z", "{}", "1795700000000"]) {
    assert.equal(parseLastExport(bad), null, String(bad));
  }
});

test("read: missing, malformed or unreadable storage gives never, without throwing", () => {
  assert.equal(readLastExport(store()), null);
  assert.equal(readLastExport(store({ [KEY_LAST_EXPORT]: "garbage" })), null);
  assert.equal(readLastExport(store({}, { failReads: true })), null);
  assert.equal(readLastExport(store({ [KEY_LAST_EXPORT]: AT })), AT);
});

test("write: stores the timestamp; a refused write returns false and never throws", () => {
  const s = store();
  assert.equal(writeLastExport(s, AT), true);
  assert.equal(s.data.get(KEY_LAST_EXPORT), AT);
  const blocked = store({ [KEY_LAST_EXPORT]: "2026-01-01T00:00:00.000Z" }, { failWrites: true });
  assert.equal(writeLastExport(blocked, AT), false);
  assert.equal(blocked.data.get(KEY_LAST_EXPORT), "2026-01-01T00:00:00.000Z", "previous value kept");
});

test("label: never, or local date and time", () => {
  assert.equal(lastExportLabel(null), "Last exported: never");
  const saved = process.env.TZ;
  process.env.TZ = "Asia/Kuala_Lumpur"; // UTC+8
  try {
    assert.equal(lastExportLabel(AT), "Last exported: 27 Nov 2026, 14:05");
    // Late evening UTC is already the next day in Malaysia.
    assert.equal(lastExportLabel("2026-11-27T17:30:00.000Z"), "Last exported: 28 Nov 2026, 01:30");
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test("the export timestamp is separate from saved data and backups", () => {
  assert.notEqual(KEY_LAST_EXPORT, KEY_V2);
  assert.ok(!KEY_LAST_EXPORT.startsWith(`${KEY_V2}-`), "not one of the v2 data or safety-copy keys");
  const backup = serialize(structuredClone(DEMO_CONTENT), DEMO_ASSETS, []);
  assert.ok(!backup.includes(KEY_LAST_EXPORT));
  assert.ok(!backup.includes("lastExport"));
  assert.equal(JSON.parse(backup).version, 2);
});
