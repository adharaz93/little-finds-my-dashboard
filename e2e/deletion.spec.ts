import { expect, test } from "@playwright/test";
import { KEY_LAST_DELETED, KEY_V2, captureDialogs, isDesktop, item, metrics, pub, readStorage, seed, v2 } from "./helpers";

// Deletion safety (P1d Tasks 1–3). Desktop only.
const gift = item("g1", "Gift guide", [
  pub("g1-ig", "Instagram", "2026-11-17", {
    metrics: metrics(1000), metricsSource: "manual",
    snapshots: [
      { id: "s1", at: "2026-11-20T01:00:00.000Z", capturedOn: "2026-11-20", source: "manual", metrics: metrics(1000) },
      { id: "s2", at: "2026-11-21T01:00:00.000Z", capturedOn: "2026-11-21", source: "manual", metrics: metrics(900), deleted: true },
    ],
  }),
  pub("g1-tt", "TikTok", "2026-11-17", { snapshots: [{ id: "s3", at: "2026-11-20T01:00:00.000Z", capturedOn: "2026-11-20", source: "manual", metrics: metrics(5), deleted: true }] }),
]);
const empty = item("e1", "Empty draft", [pub("e1-ig", "Instagram", "", { status: "Idea" })]);
const data = v2([gift, empty]);
const content = async (page: import("@playwright/test").Page) => JSON.parse((await readStorage(page, KEY_V2))!).content;

test.beforeEach(async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await seed(page, { [KEY_V2]: data });
});

async function editContent(page: import("@playwright/test").Page, title: string) {
  await page.goto("/bank");
  // The Content Bank card is the one flex-col <div> holding this heading (the grid around the cards isn't).
  const card = page.locator("main div.flex-col").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Title", { exact: true })).toHaveValue(title);
  return page.getByRole("dialog");
}

test("deleting content names the counts, keeps a recovery copy, and restores exactly", async ({ page }) => {
  const dialogs = captureDialogs(page);
  const dialog = await editContent(page, "Gift guide");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  expect(dialogs[0]).toBe("Delete 'Gift guide'? This will delete 2 platform posts and 3 performance captures. A recovery copy will be available on the Dashboard until your next deletion.");
  await expect.poll(async () => (await content(page)).map((c: { id: string }) => c.id)).toEqual(["e1"]);
  expect(JSON.parse((await readStorage(page, KEY_LAST_DELETED))!).item).toEqual(gift);

  await page.goto("/");
  await page.getByRole("button", { name: /^Restore 'Gift guide' \(content\) — deleted / }).click();
  await expect.poll(async () => (await content(page)).find((c: { id: string }) => c.id === "g1")).toEqual(gift);
  expect(dialogs.at(-1)).toBe("Restored 'Gift guide'.");
  await expect.poll(() => readStorage(page, KEY_LAST_DELETED)).toBeNull();
});

test("removing a platform with only removed captures still asks, and can be restored", async ({ page }) => {
  const dialogs = captureDialogs(page);
  const dialog = await editContent(page, "Gift guide");
  await dialog.getByRole("button", { name: "✓ TikTok" }).click();
  expect(dialogs[0]).toBe("Remove TikTok? When you save, this TikTok post and its 1 performance capture will be deleted. A recovery copy is kept on the Dashboard until your next deletion.");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await content(page))[0].publications.map((p: { id: string }) => p.id)).toEqual(["g1-ig"]);
  await page.goto("/");
  await page.getByRole("button", { name: /^Restore TikTok post of 'Gift guide'/ }).click();
  await expect.poll(async () => (await content(page))[0].publications[1]).toEqual(gift.publications[1]);
});

test("deleting an empty draft never replaces an existing recovery copy", async ({ page }) => {
  const existing = JSON.stringify({ kind: "content", deletedAt: "2026-11-25T01:00:00.000Z", item: gift });
  await page.addInitScript((c) => { if (!sessionStorage.getItem("__e2eCopy")) { localStorage.setItem("lfm-studio-v2-last-deleted", c); sessionStorage.setItem("__e2eCopy", "1"); } }, existing);
  const dialogs = captureDialogs(page);
  const dialog = await editContent(page, "Empty draft");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  expect(dialogs[0]).toBe("Delete 'Empty draft'? This will delete 1 platform post. It has no performance data, so no recovery copy is needed.");
  await expect.poll(async () => (await content(page)).map((c: { id: string }) => c.id)).toEqual(["g1"]);
  expect(await readStorage(page, KEY_LAST_DELETED)).toBe(existing);
});

test("exported backups never include the recovery copy", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("__e2eCopy")) { localStorage.setItem("lfm-studio-v2-last-deleted", "{}"); sessionStorage.setItem("__e2eCopy", "1"); } });
  await page.goto("/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const path = await download.path();
  const text = (await import("node:fs")).readFileSync(path!, "utf8");
  expect(text).toBe(await readStorage(page, KEY_V2));
  expect(text).not.toContain("deletedAt");
  expect(JSON.parse(text).version).toBe(2);
});
