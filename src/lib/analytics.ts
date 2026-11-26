import { PLATFORMS, type ContentItem, type Platform } from "./types";
import { isReal, type Post } from "./posts";
import { engagement, engagementRate, hasRate } from "./utils";
import { whatsWorking } from "./insights";

// Which numbers a view may use. "real" = manual entries and synced data. "demo" = samples only.
// The two are never mixed, so demo numbers can never be read as account performance.
export type DataView = "real" | "demo";
export type Range = { from: string; to: string }; // inclusive, YYYY-MM-DD

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export function lastDays(n: number, end = iso(new Date())): Range {
  return { from: addDays(end, -(n - 1)), to: end };
}

export function previousRange(r: Range): Range {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

// Posts with numbers that belong to the chosen view.
// Real: hand-entered or synced numbers on the user's own content. Demo: sample content only.
export function measured(posts: Post[], view: DataView): Post[] {
  return posts.filter((p) => {
    if (!p.metrics) return false;
    const demo = p.content.isDemo || p.metricsSource === "demo";
    return view === "demo" ? demo : !demo && isReal(p.metricsSource);
  });
}

const pubDate = (p: Post) => p.publication.publishedDate || p.publication.scheduledDate;
export const inRange = (posts: Post[], r: Range) => posts.filter((p) => pubDate(p) >= r.from && pubDate(p) <= r.to);

export type Totals = {
  posts: number;
  reach: number;
  impressions: number | null; // null when no post in the set reports impressions
  engagement: number;
  avgRate: number | null; // mean engagement rate of posts with reach; null when none have reach
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
};

export function totals(list: Post[]): Totals {
  const sum = (f: (p: Post) => number) => list.reduce((s, p) => s + f(p), 0);
  const withImp = list.filter((p) => p.metrics?.impressions != null);
  const withSaves = list.filter((p) => p.metrics?.saves != null);
  const withRate = list.filter((p) => hasRate(p.metrics));
  return {
    posts: list.length,
    reach: sum((p) => p.metrics!.reach),
    impressions: withImp.length ? withImp.reduce((s, p) => s + (p.metrics!.impressions ?? 0), 0) : null,
    engagement: sum((p) => engagement(p.metrics)),
    avgRate: withRate.length ? withRate.reduce((s, p) => s + engagementRate(p.metrics), 0) / withRate.length : null,
    likes: sum((p) => p.metrics!.likes),
    comments: sum((p) => p.metrics!.comments),
    shares: sum((p) => p.metrics!.shares),
    saves: withSaves.length ? withSaves.reduce((s, p) => s + (p.metrics!.saves ?? 0), 0) : null,
  };
}

// Percentage change, or null when the previous period has no data to compare with.
export function change(now: number, before: number, hasBefore: boolean): number | null {
  if (!hasBefore || before === 0) return null;
  return ((now - before) / before) * 100;
}

export function byPlatform(list: Post[]): Record<Platform, Totals> {
  return Object.fromEntries(PLATFORMS.map((pl) => [pl, totals(list.filter((p) => p.platform === pl))])) as Record<Platform, Totals>;
}

// Engagement summed per bucket: daily for ranges up to 31 days, weekly beyond.
export type TrendPoint = { label: string; from: string; values: Record<Platform, number | null> };
export function trend(list: Post[], r: Range): TrendPoint[] {
  const step = daysBetween(r.from, r.to) + 1 > 31 ? 7 : 1;
  const out: TrendPoint[] = [];
  for (let start = r.from; start <= r.to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    const inBucket = list.filter((p) => pubDate(p) >= start && pubDate(p) <= end);
    const values = Object.fromEntries(
      PLATFORMS.map((pl) => {
        // null = no post that period: drawn as a gap, never as zero engagement.
        const ps = inBucket.filter((p) => p.platform === pl);
        return [pl, ps.length ? ps.reduce((s, p) => s + engagement(p.metrics), 0) : null];
      }),
    ) as Record<Platform, number | null>;
    const d = parse(start);
    out.push({ label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), from: start, values });
  }
  return out;
}

// One row per parent content: each platform's engagement side by side.
export type ComparisonRow = {
  content: ContentItem;
  perPlatform: Record<Platform, { state: "none" | "nodata" | "data"; engagement: number }>;
  engagement: number;
  rate: number | null; // null when no publication has reach
};
export function comparison(content: ContentItem[], list: Post[]): ComparisonRow[] {
  return content
    .map((c) => {
      const ps = list.filter((p) => p.contentId === c.id);
      const perPlatform = Object.fromEntries(
        PLATFORMS.map((pl) => {
          const has = c.publications.some((p) => p.platform === pl);
          const withData = ps.filter((p) => p.platform === pl);
          return [pl, { state: !has ? "none" : withData.length ? "data" : "nodata", engagement: withData.reduce((s, p) => s + engagement(p.metrics), 0) }];
        }),
      ) as ComparisonRow["perPlatform"];
      const t = totals(ps);
      return { content: c, perPlatform, engagement: t.engagement, rate: t.reach ? (t.engagement / t.reach) * 100 : null, n: ps.length };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.engagement - a.engagement);
}

export type Highlight = { label: string; value: string; detail: string };
// `today` is the browser's local date; without it the pillar highlight is left out.
export function highlights(list: Post[], today: string | null = null): Highlight[] {
  if (!list.length) return [];
  const out: Highlight[] = [];
  const plat = PLATFORMS.map((pl) => ({ pl, t: totals(list.filter((p) => p.platform === pl)) })).filter((x) => x.t.posts > 0);
  const withData = plat.length;
  const note = withData === 1 ? "only platform with data" : `of ${withData} platforms with data`;
  const topReach = [...plat].sort((a, b) => b.t.reach - a.t.reach)[0];
  out.push({ label: "Highest reach platform", value: topReach.pl, detail: `${topReach.t.reach.toLocaleString("en-US")} reach, ${note}` });
  const topEng = [...plat].sort((a, b) => b.t.engagement - a.t.engagement)[0];
  out.push({ label: "Highest engagement platform", value: topEng.pl, detail: `${topEng.t.engagement.toLocaleString("en-US")} engagements, ${note}` });

  // Same rule as "What's working": lift against each platform's usual rate, posts at least a week
  // old, and at least 3 posts, so this card can never contradict that table.
  const topPillar = whatsWorking(list, today).pillars.groups[0];
  if (topPillar) out.push({ label: "Best-performing pillar", value: topPillar.name, detail: `${topPillar.medianLift.toFixed(1)}× your usual engagement rate, ${topPillar.posts} posts` });

  const best = list.filter((p) => hasRate(p.metrics)).sort((a, b) => engagementRate(b.metrics) - engagementRate(a.metrics))[0];
  if (best) out.push({ label: "Best-performing content", value: best.title, detail: `${engagementRate(best.metrics).toFixed(1)}% engagement rate on ${best.platform}` });
  return out;
}
