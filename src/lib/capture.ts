import type { Metrics, Platform, Publication } from "./types";

/* ---------- metric input ---------- */

// The text typed in the performance form, one string per number.
export type MetricKey = "reach" | "impressions" | "likes" | "comments" | "shares" | "saves" | "clicks";
export type MetricDraft = Record<MetricKey, string>;

// Required: must be typed (0 is fine). Optional: blank means "not reported" (null), never 0.
export const REQUIRED_METRICS: readonly MetricKey[] = ["reach", "likes", "comments", "shares"];
export const OPTIONAL_METRICS: readonly MetricKey[] = ["impressions", "saves", "clicks"];
export const METRIC_ORDER: readonly MetricKey[] = ["reach", "impressions", "likes", "comments", "shares", "saves", "clicks"];

export function metricLabel(k: MetricKey, platform: Platform): string {
  if (k === "reach") return platform === "TikTok" ? "Views" : "Reach";
  if (k === "shares") return platform === "Threads" ? "Reposts" : "Shares";
  return k[0].toUpperCase() + k.slice(1);
}

export type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

// One count from a text field. Accepts plain digits ("1200") or comma thousands ("1,200").
// Never guesses: abbreviations, decimals, negatives and anything else are rejected with a reason.
export function parseCount(raw: string, required: boolean): Parsed {
  const s = raw.trim();
  if (s === "") return required ? { ok: false, error: "Enter a number (0 if there were none)." } : { ok: true, value: null };
  if (/^-\s*[\d.,]/.test(s)) return { ok: false, error: "Can't be negative." };
  if (/^[\d.,]+\s*[kmb]$/i.test(s)) return { ok: false, error: "Enter the exact number, not an abbreviation like 1.2K. Open the post's insights to see it in full." };
  if (/^[\d,]*\.\d*$/.test(s)) return { ok: false, error: "Whole numbers only. Use commas for thousands, e.g. 1,200." };
  if (/^\d+$/.test(s) || /^\d{1,3}(,\d{3})+$/.test(s)) {
    const value = Number(s.replace(/,/g, ""));
    if (!Number.isSafeInteger(value)) return { ok: false, error: "That number is too large." };
    return { ok: true, value };
  }
  if (/^[\d,]+$/.test(s)) return { ok: false, error: "Check the commas: use them only for thousands, e.g. 1,200." };
  return { ok: false, error: "Numbers only, e.g. 1200 or 1,200." };
}

export type DraftResult = { ok: true; metrics: Metrics } | { ok: false; errors: Partial<Record<MetricKey, string>> };

// The whole form. Metrics are produced only when every field is valid.
export function parseMetricDraft(d: MetricDraft): DraftResult {
  const errors: Partial<Record<MetricKey, string>> = {};
  const v = {} as Record<MetricKey, number | null>;
  for (const k of METRIC_ORDER) {
    const r = parseCount(d[k] ?? "", REQUIRED_METRICS.includes(k));
    if (r.ok) v[k] = r.value;
    else errors[k] = r.error;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    metrics: { reach: v.reach!, impressions: v.impressions, likes: v.likes!, comments: v.comments!, shares: v.shares!, saves: v.saves, clicks: v.clicks },
  };
}

// Stored numbers back into form text. Not reported (null or missing) shows as blank.
export function toMetricDraft(m: Metrics | null): MetricDraft {
  const t = (n: number | null | undefined) => (n == null ? "" : String(n));
  return { reach: t(m?.reach), impressions: t(m?.impressions), likes: t(m?.likes), comments: t(m?.comments), shares: t(m?.shares), saves: t(m?.saves), clicks: t(m?.clicks) };
}

// Same numbers, treating "not reported" spellings (null, missing) as equal.
export function sameMetrics(a: Metrics | null, b: Metrics | null): boolean {
  if (!a || !b) return a === b;
  return METRIC_ORDER.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/* ---------- dates ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

// Today as the visitor's local calendar date. Never derived from toISOString(), which is UTC.
export const localToday = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A real calendar date written as YYYY-MM-DD (rejects "2026-02-30", "", "2026-1-5").
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// The one published-date rule, used whenever a post is marked Posted (Content Bank, Posting
// Manager, edit form). It only runs on that action, so loading never rewrites stored records.
//  1. Keep an existing valid published date.
//  2. Otherwise use the scheduled date if it is today or earlier.
//  3. Otherwise today.
// The result stays editable in the form. YYYY-MM-DD strings compare correctly as text.
export function resolvePublishedDate(p: Pick<Publication, "publishedDate" | "scheduledDate">, today = localToday()): string {
  if (isValidDate(p.publishedDate)) return p.publishedDate;
  if (isValidDate(p.scheduledDate) && p.scheduledDate <= today) return p.scheduledDate;
  return today;
}
