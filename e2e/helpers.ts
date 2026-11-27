import { expect, type Page, type TestInfo } from "@playwright/test";

export const KEY_V2 = "lfm-studio-v2";
export const KEY_LAST_DELETED = "lfm-studio-v2-last-deleted";
export const ROUTES = ["/", "/bank", "/calendar", "/posting", "/analytics", "/assets"] as const;

/* ---------- synthetic data ---------- */

type Json = Record<string, unknown>;
export const metrics = (reach: number, likes = 10) => ({ reach, impressions: null, likes, comments: 1, shares: 0, saves: null, clicks: null });
export const pub = (id: string, platform: string, publishedDate: string, over: Json = {}) => ({
  id, platform, caption: `Caption ${id}`, status: "Posted", scheduledDate: publishedDate || "2026-11-01", publishedDate,
  postUrl: "", postId: "", metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [], ...over,
});
export const item = (id: string, title: string, publications: Json[], over: Json = {}) => ({
  id, title, pillar: "Promo", idea: "", assetUrl: "https://example.com/a", notes: "", publications, ...over,
});
export const v2 = (content: Json[]) => JSON.stringify({ version: 2, content, assets: [] });

// Puts synthetic data into this test's own browser context before the app loads, once per tab.
// Each test has a fresh context and the test server is on its own origin, so nothing real is touched.
export async function seed(page: Page, data: Record<string, string>) {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem("__e2eSeeded")) return;
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    sessionStorage.setItem("__e2eSeeded", "1");
  }, data);
}

export const readStorage = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/* ---------- problems to fail on ---------- */

// Collects page errors, console errors, hydration warnings, failed requests and HTTP errors.
export function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error") problems.push(`console.error: ${text}`);
    else if (m.type() === "warning" && /hydrat|did not match|mismatch/i.test(text)) problems.push(`hydration warning: ${text}`);
  });
  page.on("requestfailed", (r) => {
    // Navigations away from a page abort in-flight prefetches; those aren't failures.
    if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith("http://localhost:3107")) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}

// Answers the app's own dialogs (components/dialogs.tsx) and records their text in order:
// confirmations are accepted unless `accept()` returns false, error boxes are closed with OK, and
// short notices are recorded. Native browser pop-ups are recorded too, so a test notices if any
// come back (the app no longer uses them). Call before or after page.goto.
export async function captureDialogs(page: Page, accept = () => true) {
  const messages: string[] = [];
  page.on("dialog", async (d) => {
    messages.push(`native ${d.type()}: ${d.message()}`);
    await d.dismiss();
  });
  await page.exposeFunction("__lfmDialog", (kind: string, text: string) => {
    messages.push(text);
    return kind === "confirm" ? accept() : true;
  });
  // Plain script text, not a function: the test compiler adds helpers to named inner functions
  // that don't exist in the page, which would break the watcher silently.
  await page.addInitScript({ content: DIALOG_WATCHER });
  if (page.url() !== "about:blank") await page.evaluate(DIALOG_WATCHER);
  return messages;
}

const DIALOG_WATCHER = `(() => {
  if (window.__lfmWatching) return;
  window.__lfmWatching = true;
  const seen = new WeakSet();
  const scan = () => document.querySelectorAll("[data-dialog-kind]").forEach(async (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const kind = el.getAttribute("data-dialog-kind") || "";
    const msg = el.querySelector("[data-dialog-message]");
    const yes = await window.__lfmDialog(kind, msg ? msg.textContent : "");
    const btn = kind === "confirm" ? el.querySelector(yes ? "[data-dialog-confirm]" : "[data-dialog-cancel]")
      : kind === "error" ? el.querySelector("[data-dialog-ok]") : null;
    if (btn) btn.click();
  });
  const start = () => {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
    scan();
  };
  if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
})();`;

export const isDesktop = (info: TestInfo) => info.project.name === "desktop-1440";

// Text of the Dashboard "To do" rows, whitespace-normalised.
export async function todoRows(page: Page) {
  const card = page.locator("main section").filter({ has: page.getByRole("heading", { name: "To do", exact: true }) });
  return (await card.locator("li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

// Opens the Posted column on narrow screens, where Posting shows one column at a time.
export async function showPostedColumn(page: Page) {
  const tab = page.getByRole("tab", { name: /^Posted/ });
  if (await tab.isVisible()) await tab.click();
}
