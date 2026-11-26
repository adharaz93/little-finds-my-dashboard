import type { Platform } from "./types";
import type { Post } from "./posts";
import { engagementRate, hasRate } from "./utils";
import { daysBetween } from "./analytics";
import { isValidDate } from "./capture";

// "What's working" (Phase 2 P2). Pure: compares pillars, formats and topics with the account's own
// usual performance. Nothing is stored.
//
// - Only posts at least MIN_AGE days old count, using their current numbers, so a post read on day 1
//   doesn't compete with one read on day 30.
// - Lift = a post's engagement rate ÷ the median rate on its own platform. TikTok reach is views and
//   Threads has no saves, so raw rates aren't comparable across platforms; lift is.
// - A platform needs MIN_PLATFORM eligible posts before it can be compared at all.
// - Groups under MIN_GROUP posts are hidden; MIN_GROUP–(CONSISTENT-1) is an early signal.

export const MIN_AGE = 7;
export const MIN_PLATFORM = 3;
export const MIN_GROUP = 3;
export const CONSISTENT = 6;

export type Confidence = "early" | "consistent";
export type GroupStat = { name: string; posts: number; medianLift: number; medianRate: number; share: number; confidence: Confidence };
export type Dimension = {
  groups: GroupStat[]; // shown, best first
  hidden: number; // groups with fewer than MIN_GROUP posts
  covered: number; // compared posts that have this attribute (format / topics / pillar)
};
export type WhatsWorking = {
  compared: number; // posts with a lift
  tooRecent: number; // with reach, but younger than MIN_AGE days
  noDate: number; // with reach, but no valid published date (age unknown)
  excludedPlatforms: { platform: Platform; posts: number }[]; // fewer than MIN_PLATFORM eligible posts
  pillars: Dimension;
  formats: Dimension;
  topics: Dimension;
};

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const confidenceFor = (n: number): Confidence | null => (n < MIN_GROUP ? null : n < CONSISTENT ? "early" : "consistent");

type Scored = { post: Post; lift: number; rate: number };

function dimension(scored: readonly Scored[], keys: (p: Post) => string[]): Dimension {
  const byKey = new Map<string, Scored[]>();
  let covered = 0;
  for (const s of scored) {
    const ks = [...new Set(keys(s.post).map((k) => k.trim()).filter(Boolean))];
    if (ks.length) covered++;
    for (const k of ks) byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const groups: GroupStat[] = [];
  let hidden = 0;
  for (const [name, items] of byKey) {
    const confidence = confidenceFor(items.length);
    if (!confidence) {
      hidden++;
      continue;
    }
    groups.push({
      name,
      posts: items.length,
      medianLift: median(items.map((i) => i.lift)),
      medianRate: median(items.map((i) => i.rate)),
      share: items.length / scored.length,
      confidence,
    });
  }
  // Best lift first; ties by more posts, then name, so the order never changes between renders.
  groups.sort((a, b) => b.medianLift - a.medianLift || b.posts - a.posts || a.name.localeCompare(b.name));
  return { groups, hidden, covered };
}

// `list` is already filtered to the chosen view (real or demo) and date range. `today` is the
// browser's local date; with no valid date nothing can be compared.
export function whatsWorking(list: readonly Post[], today: string | null): WhatsWorking {
  const empty: Dimension = { groups: [], hidden: 0, covered: 0 };
  const result: WhatsWorking = { compared: 0, tooRecent: 0, noDate: 0, excludedPlatforms: [], pillars: empty, formats: empty, topics: empty };
  if (!isValidDate(today)) return result;

  const eligible: Post[] = [];
  for (const p of list) {
    if (!hasRate(p.metrics)) continue; // no reach: no rate, never treated as 0%
    const published = p.publication.publishedDate;
    if (!isValidDate(published)) result.noDate++;
    else if (daysBetween(published, today) < MIN_AGE) result.tooRecent++;
    else eligible.push(p);
  }

  const scored: Scored[] = [];
  const platforms = [...new Set(eligible.map((p) => p.platform))].sort();
  for (const platform of platforms) {
    const posts = eligible.filter((p) => p.platform === platform);
    const rates = posts.map((p) => engagementRate(p.metrics));
    const usual = median(rates);
    if (posts.length < MIN_PLATFORM || !(usual > 0)) {
      result.excludedPlatforms.push({ platform, posts: posts.length });
      continue;
    }
    posts.forEach((post, i) => scored.push({ post, lift: rates[i] / usual, rate: rates[i] }));
  }

  result.compared = scored.length;
  result.pillars = dimension(scored, (p) => [p.pillar]);
  result.formats = dimension(scored, (p) => (p.publication.format ? [p.publication.format] : []));
  result.topics = dimension(scored, (p) => p.content.tags ?? []);
  return result;
}
