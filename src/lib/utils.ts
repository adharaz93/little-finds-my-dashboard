import type { Metrics } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

// Engagement rate = (likes + comments + shares + saves) / reach x 100
export function engagementRate(m: Metrics | null): number {
  if (!m || m.reach <= 0) return 0;
  return ((m.likes + m.comments + m.shares + m.saves) / m.reach) * 100;
}

export const pct = (n: number) => `${n.toFixed(1)}%`;
export const num = (n: number) => n.toLocaleString("en-US");

export function formatDate(d: string): string {
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const statusColor: Record<string, string> = {
  Idea: "bg-baby",
  Drafting: "bg-peach",
  Ready: "bg-mint",
  Scheduled: "bg-pink",
  Posted: "bg-[#c4e4d2]",
};
