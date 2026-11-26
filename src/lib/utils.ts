import type { Metrics } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

// Topics are compared as plain lowercase words: trimmed, single-spaced, no duplicates.
export const cleanTags = (tags: string[]): string[] =>
  [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
export const parseTags = (s: string): string[] => cleanTags(s.split(","));

// Engagement = likes + comments + shares + saves. Where saves are not reported (null) they
// add nothing: the sum covers the interactions the platform reports, never an invented value.
export function engagement(m: Metrics | null): number {
  if (!m) return 0;
  return m.likes + m.comments + m.shares + (m.saves ?? 0);
}

// A rate only exists when reach was entered. Reach 0 means "no reach", not a 0% rate.
export const hasRate = (m: Metrics | null): m is Metrics => !!m && m.reach > 0;

// Engagement rate = engagement / reach x 100. Shows 0 for a single post without reach;
// averages and rankings use hasRate() so such posts never count as 0%.
export function engagementRate(m: Metrics | null): number {
  if (!m || m.reach <= 0) return 0;
  return (engagement(m) / m.reach) * 100;
}

export const pct = (n: number) => `${n.toFixed(1)}%`;
export const num = (n: number) => n.toLocaleString("en-US");

export function formatDate(d: string): string {
  if (!d) return "No date";
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// One pastel per stage. Posted is a navy tint so it never reads as a second green.
export const statusColor: Record<string, string> = {
  Idea: "bg-baby",
  Drafting: "bg-peach",
  Ready: "bg-mint",
  Scheduled: "bg-pink",
  Posted: "bg-posted",
};

// Solid versions for the pipeline bars.
export const statusBar: Record<string, string> = {
  Idea: "bg-baby",
  Drafting: "bg-peach",
  Ready: "bg-mint",
  Scheduled: "bg-pink",
  Posted: "bg-navy",
};

// Chart series colours, validated for colour-blind separation on cream.
// Text never uses these; they only mark lines and swatches.
export const platformColor: Record<string, string> = {
  Instagram: "#c0566e",
  TikTok: "#3a6ea5",
  Threads: "#2b9170",
};
