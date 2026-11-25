"use client";
import type { ContentItem } from "@/lib/types";
import { engagementRate, num, pct } from "@/lib/utils";

const TONES = ["bg-baby", "bg-pink", "bg-mint", "bg-peach"];

function weekStart(d: string): string {
  const [y, m, da] = d.split("-").map(Number);
  const t = new Date(y, m - 1, da);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // Monday
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// Pastel bar chart: one bar per week, from the manually entered performance data.
export default function WeeklyChart({ content, metric }: { content: ContentItem[]; metric: "reach" | "engagement" }) {
  const weeks = new Map<string, ContentItem[]>();
  content.filter((c) => c.metrics).forEach((c) => {
    const k = weekStart(c.date);
    weeks.set(k, [...(weeks.get(k) ?? []), c]);
  });
  const rows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, items]) => ({
    k,
    value:
      metric === "reach"
        ? items.reduce((s, c) => s + (c.metrics?.reach ?? 0), 0)
        : items.reduce((s, c) => s + engagementRate(c.metrics), 0) / items.length,
  }));
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted">Add performance data to see the weekly chart.</p>;
  return (
    <div className="flex h-44 items-end gap-3" role="img" aria-label={`Weekly ${metric}`}>
      {rows.map((r, i) => (
        <div key={r.k} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs text-muted">{metric === "reach" ? num(r.value) : pct(r.value)}</span>
          <div className={`w-full max-w-14 rounded-xl ${TONES[i % 4]}`} style={{ height: `${Math.max(6, (r.value / max) * 100)}%` }} />
          <span className="text-xs text-muted">{r.k.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
