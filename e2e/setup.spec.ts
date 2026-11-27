import { expect, test } from "@playwright/test";
import { KEY_V2, captureDialogs, expectNoOverflow, item, pub, readStorage, seed, watchProblems } from "./helpers";

// Phase 3 P3-1: real-use setup. Remove the demo samples, and the account's own pillars.
const KEY_BEFORE_RESET = "lfm-studio-v2-before-reset";
const PILLARS = ["Motherhood & Real Life", "Baby & Toddler Essentials", "Learning & Development", "Home & Family Finds", "Little Finds & Product Discovery"];
const removeLink = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Remove demo samples" });

test("a new browser can remove the demo samples, keeping a copy, and stays empty after reload", async ({ page }) => {
  const problems = watchProblems(page);
  const dialogs = await captureDialogs(page);
  await seed(page, {}); // empty storage: the demo samples load
  await page.goto("/");
  await expect(removeLink(page)).toBeVisible();
  await removeLink(page).click();

  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[0]).toBe("Remove 9 demo content items and 4 demo asset links?\n\nYour own content and assets stay. A copy of everything is kept in browser storage first.");
  expect(dialogs[1]).toBe("Demo samples removed.");
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!)).toEqual({ version: 2, content: [], assets: [] });
  const copy = JSON.parse((await readStorage(page, KEY_BEFORE_RESET))!);
  expect([copy.content.length, copy.assets.length]).toEqual([9, 4]);
  await expect(removeLink(page)).toHaveCount(0);

  await page.reload();
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText("Nothing planned yet.")).toBeVisible();
  await expect(removeLink(page)).toHaveCount(0);
  await expectNoOverflow(page);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("removing demo samples keeps the user's own content; cancelling changes nothing", async ({ page }) => {
  let accept = false;
  await captureDialogs(page, () => accept);
  const mine = item("u1", "My real post", [pub("u1-ig", "Instagram", "2026-11-20")]);
  const demo = { ...item("c1", "Demo post", [pub("c1-ig", "Instagram", "2026-11-03")], { pillar: "Product Finds" }), isDemo: true };
  const before = JSON.stringify({ version: 2, content: [mine, demo], assets: [] });
  await seed(page, { [KEY_V2]: before });
  await page.goto("/");

  await removeLink(page).click();
  await expect.poll(() => readStorage(page, KEY_V2)).toBe(before); // cancelled: untouched
  expect(await readStorage(page, KEY_BEFORE_RESET)).toBeNull();

  accept = true;
  await removeLink(page).click();
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!).content.map((c: { id: string }) => c.id)).toEqual(["u1"]);
  await expect(removeLink(page)).toHaveCount(0);
});

test("new content offers the account's pillars; an older pillar stays selectable and is kept on save", async ({ page }) => {
  await captureDialogs(page);
  const old = item("o1", "Older post", [pub("o1-ig", "Instagram", "2026-11-20")], { pillar: "Promo" });
  await seed(page, { [KEY_V2]: JSON.stringify({ version: 2, content: [old], assets: [] }) });
  await page.goto("/bank");

  await page.getByRole("button", { name: "+ Add content" }).click();
  const dialog = page.getByRole("dialog");
  const pillar = dialog.locator("label", { hasText: "Pillar" }).locator("select");
  await expect(pillar).toHaveValue(PILLARS[0]);
  expect(await pillar.locator("option").allTextContents()).toEqual([...PILLARS, "Promo"]);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  const filter = page.getByLabel("Pillar filter");
  expect(await filter.locator("option").allTextContents()).toEqual(["All", ...PILLARS, "Promo"]);

  await page.locator("main").getByRole("button", { name: "Edit" }).click();
  await expect(dialog.locator("label", { hasText: "Pillar" }).locator("select")).toHaveValue("Promo");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!).content[0].pillar).toBe("Promo");
});
