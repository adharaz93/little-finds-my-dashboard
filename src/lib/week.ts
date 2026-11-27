import { PLATFORMS, type Platform } from "./types";
import type { Post } from "./posts";
import { addDays } from "./analytics";

// Phase 3 P3-2: the Calendar's week view. Pure local-date helpers (YYYY-MM-DD), weeks start Monday.

export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const back = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return addDays(date, -back);
}

export const weekDays = (start: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

// A post sits on its own date (published once posted, otherwise scheduled), as everywhere else.
export const postsOn = (posts: readonly Post[], date: string): Post[] => posts.filter((p) => p.date === date);

export type WeekSummary = { total: number; byPlatform: Record<Platform, number> };

export function weekSummary(posts: readonly Post[], days: readonly string[]): WeekSummary {
  const inWeek = posts.filter((p) => days.includes(p.date));
  const byPlatform = Object.fromEntries(PLATFORMS.map((pl) => [pl, inWeek.filter((p) => p.platform === pl).length])) as Record<Platform, number>;
  return { total: inWeek.length, byPlatform };
}

// "24 – 30 Nov 2026", or "29 Dec 2026 – 4 Jan 2027" when the week crosses a month or year.
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const d = (s: string) => {
    const [y, m, day] = s.split("-").map(Number);
    return new Date(y, m - 1, day);
  };
  const a = d(start);
  const b = d(end);
  const full = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (a.getFullYear() !== b.getFullYear()) return `${full(a)} – ${full(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${full(b)}`;
  return `${a.getDate()} – ${full(b)}`;
}

// The date a new post gets from "+ Add content": today, unless the month view shows another month.
export function defaultNewDate(view: "week" | "month" | "list", today: string, shownMonth: { y: number; m: number }): string {
  if (view !== "month") return today;
  const [y, m] = today.split("-").map(Number);
  if (y === shownMonth.y && m - 1 === shownMonth.m) return today;
  return `${shownMonth.y}-${String(shownMonth.m + 1).padStart(2, "0")}-01`;
}
