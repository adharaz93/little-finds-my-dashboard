import { expect, test, type Page } from "@playwright/test";
import { KEY_V2, isDesktop, item, pub, readStorage, seed, watchProblems } from "./helpers";

// Phase 3 P3-1b: the app's own confirmation boxes replace the browser's confirm() and alert(),
// which some browsers cancel or hide silently. These tests answer the boxes by hand.
const data = JSON.stringify({ version: 2, content: [item("d1", "Draft to delete", [pub("d1-ig", "Instagram", "", { status: "Idea" })])], assets: [] });
const box = (page: Page) => page.getByRole("alertdialog");
const nativeDialogs = (page: Page) => {
  const seen: string[] = [];
  page.on("dialog", async (d) => {
    seen.push(d.message());
    await d.dismiss();
  });
  return seen;
};

test.beforeEach(async ({}, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
});

test("a confirmation over a form: focus starts on Cancel, Tab stays inside, Escape closes only the box", async ({ page }) => {
  const problems = watchProblems(page);
  const native = nativeDialogs(page);
  await seed(page, { [KEY_V2]: data });
  await page.goto("/bank");
  await expect(page.getByRole("heading", { name: "Draft to delete" })).toBeVisible(); // saved data has loaded
  await page.locator("main").getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(box(page)).toBeVisible();
  await expect(box(page)).toContainText("Delete 'Draft to delete'? This will delete 1 platform post.");
  const cancel = box(page).getByRole("button", { name: "Cancel" });
  const confirmBtn = box(page).getByRole("button", { name: "Delete" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmBtn).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(box(page)).toHaveCount(0);
  await expect(form).toBeVisible(); // the form underneath stays open
  expect(await readStorage(page, KEY_V2)).toBe(data);

  await form.getByRole("button", { name: "Delete", exact: true }).click();
  await cancel.click();
  await expect(box(page)).toHaveCount(0);
  expect(await readStorage(page, KEY_V2)).toBe(data);

  await form.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmBtn.click();
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!).content).toEqual([]);
  expect(native).toEqual([]);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("an error stays until OK is pressed; a success notice disappears by itself", async ({ page }) => {
  const native = nativeDialogs(page);
  await page.addInitScript(() => {
    URL.createObjectURL = () => {
      throw new Error("simulated export failure");
    };
  });
  await seed(page, {}); // demo samples
  await page.goto("/");

  await page.getByRole("button", { name: "Export backup" }).click();
  await expect(box(page)).toContainText("The backup couldn't be created, so nothing was exported. Your data is unchanged.");
  await page.waitForTimeout(1000);
  await expect(box(page)).toBeVisible();
  await box(page).getByRole("button", { name: "OK" }).click();
  await expect(box(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Remove demo samples" }).click();
  await box(page).getByRole("button", { name: "Remove" }).click();
  const notice = page.getByText("Demo samples removed.");
  await expect(notice).toBeVisible();
  await expect(notice).toBeHidden({ timeout: 8000 });
  expect(native).toEqual([]);
});

test("if the safety copy can't be saved, removing the demo samples asks again; Cancel changes nothing", async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "lfm-studio-v2-before-reset") throw new DOMException("full", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await seed(page, {});
  await page.goto("/");
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2)) ?? "{}").content?.length).toBe(9);

  await page.getByRole("button", { name: "Remove demo samples" }).click();
  await box(page).getByRole("button", { name: "Remove" }).click();
  await expect(box(page)).toContainText("A backup of your current data couldn't be saved first. Remove the demo samples anyway?");
  await box(page).getByRole("button", { name: "Cancel" }).click();
  await expect(box(page)).toHaveCount(0);
  expect(JSON.parse((await readStorage(page, KEY_V2))!).content).toHaveLength(9);

  await page.getByRole("button", { name: "Remove demo samples" }).click();
  await box(page).getByRole("button", { name: "Remove" }).click();
  await box(page).getByRole("button", { name: "Remove anyway" }).click();
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!).content).toEqual([]);
  expect(await readStorage(page, "lfm-studio-v2-before-reset")).toBeNull();
});
