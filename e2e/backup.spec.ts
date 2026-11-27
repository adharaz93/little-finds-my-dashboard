import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { KEY_V2, captureDialogs, isDesktop, item, pub, readStorage, seed, v2, watchProblems } from "./helpers";

// "Last exported" indicator (P1d Task 6). Page clock fixed; the browser's own local time is used.
const KEY_LAST_EXPORT = "lfm-studio-last-export";
const NOW = new Date(2026, 10, 27, 14, 5); // 27 Nov 2026, 14:05 local
const data = v2([item("b1", "Backup post", [pub("b1-ig", "Instagram", "2026-11-17")])]);
const label = (page: import("@playwright/test").Page) => page.getByText(/^Last exported: /);

test.beforeEach(async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width; layout is covered by the smoke spec");
  await page.clock.setFixedTime(NOW);
});

test("shows never, updates after an export, and survives a reload", async ({ page }) => {
  const problems = watchProblems(page);
  await seed(page, { [KEY_V2]: data });
  await page.goto("/");
  await expect(label(page)).toHaveText("Last exported: never");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  expect(download.suggestedFilename()).toBe("little-finds-backup-2026-11-27.json");
  await expect(label(page)).toHaveText("Last exported: 27 Nov 2026, 14:05");
  const stored = await readStorage(page, KEY_LAST_EXPORT);
  expect(new Date(stored!).getTime()).toBe(NOW.getTime());

  // The exported file is exactly the saved data, and never contains the export timestamp.
  const text = readFileSync((await download.path())!, "utf8");
  expect(text).toBe(await readStorage(page, KEY_V2));
  expect(text).not.toContain(KEY_LAST_EXPORT);
  expect(JSON.parse(text).version).toBe(2);

  await page.reload();
  await expect(label(page)).toHaveText("Last exported: 27 Nov 2026, 14:05");
  expect(problems, problems.join("\n")).toEqual([]);
});

test("a failed export shows an error and leaves the indicator unchanged", async ({ page }) => {
  const earlier = "2026-11-20T02:00:00.000Z";
  await seed(page, { [KEY_V2]: data, [KEY_LAST_EXPORT]: earlier });
  await page.addInitScript(() => {
    URL.createObjectURL = () => {
      throw new Error("simulated export failure");
    };
  });
  const dialogs = await captureDialogs(page);
  await page.goto("/");
  const before = await label(page).innerText();
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect.poll(() => dialogs.at(-1)).toBe("The backup couldn't be created, so nothing was exported. Your data is unchanged.");
  await expect(label(page)).toHaveText(before);
  expect(await readStorage(page, KEY_LAST_EXPORT)).toBe(earlier);
  expect(await readStorage(page, KEY_V2)).toBe(data);
});

test("an unreadable stored timestamp reads as never and isn't changed by viewing", async ({ page }) => {
  await seed(page, { [KEY_V2]: data, [KEY_LAST_EXPORT]: "not a date" });
  await page.goto("/");
  await expect(label(page)).toHaveText("Last exported: never");
  expect(await readStorage(page, KEY_LAST_EXPORT)).toBe("not a date");
});
