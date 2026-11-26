import type { ContentItem, Format, Platform, Publication } from "./types";
import { PILLARS, PLATFORMS, PLATFORM_FORMATS } from "./types";
import type { Post } from "./posts";
import { addDays, daysBetween } from "./analytics";
import { isValidDate } from "./capture";
import { whatsWorking, type Scored } from "./insights";
import { formatDate } from "./utils";

// Suggestions (Phase 2 P3). Deterministic rules over the user's own content and numbers; nothing is
// stored here and no external service is used. Each suggestion says why, and offers one action.

export const LIFT_GROUP = 1.2; // a pillar / format / topic this much above usual is worth more of
export const LIFT_POST = 1.3; // a single post this far above usual is worth a follow-up
export const LIFT_CROSSPOST = 1.2;
export const FOLLOWUP_AGE = 30; // follow-ups only for posts at least this many days old
export const PIPELINE_DAYS = 7;
export const PIPELINE_MIN = 2;
export const MOMENT_WINDOW = 21;

// Fixed-date moments only: moving festivals need dates checked every year, so they aren't guessed.
export const MOMENTS = [
  { key: "new-year", name: "New Year", month: 1, day: 1, pillar: "Community" },
  { key: "valentines", name: "Valentine's Day", month: 2, day: 14, pillar: "Promo" },
  { key: "merdeka", name: "Merdeka Day", month: 8, day: 31, pillar: "Community" },
  { key: "malaysia-day", name: "Malaysia Day", month: 9, day: 16, pillar: "Community" },
  { key: "11-11", name: "11.11 sale", month: 11, day: 11, pillar: "Promo" },
  { key: "12-12", name: "12.12 sale", month: 12, day: 12, pillar: "Promo" },
  { key: "christmas", name: "Christmas", month: 12, day: 25, pillar: "Promo" },
] as const;

export type SuggestionKind = "pipeline" | "moment" | "pillar" | "format" | "topic" | "followup" | "crosspost";
const PRIORITY: SuggestionKind[] = ["pipeline", "moment", "pillar", "format", "topic", "followup", "crosspost"];

export type IdeaSpec = { title: string; pillar: string; idea: string; platform: Platform; format?: Format; tags?: string[]; scheduledDate: string };
export type SuggestionAction =
  | { type: "new"; spec: IdeaSpec }
  | { type: "crosspost"; contentId: string; platform: Platform; scheduledDate: string }
  | { type: "link"; href: string; label: string };
export type Suggestion = { id: string; kind: SuggestionKind; title: string; why: string; action: SuggestionAction };

const lift = (n: number) => `${n.toFixed(1)}×`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const mostCommon = <T,>(xs: readonly T[], order: readonly T[] = []): T | undefined => {
  const counts = new Map<T, number>();
  xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]?.[0];
};
const validFormat = (platform: Platform, format: Format | undefined) => (format && PLATFORM_FORMATS[platform].includes(format) ? format : undefined);
const titleTaken = (content: readonly ContentItem[], title: string) => content.some((c) => c.title.trim().toLowerCase() === title.trim().toLowerCase());

// `content` and `posts` must already be limited to one view: the user's own items (real) or the
// demo samples (demo), and posts to the measured ones for that view.
export function buildSuggestions(content: readonly ContentItem[], posts: readonly Post[], today: string | null): Suggestion[] {
  if (!isValidDate(today)) return [];
  const out: Suggestion[] = [];
  const pubs = content.flatMap((c) => c.publications);
  const used = PLATFORMS.filter((p) => pubs.some((x) => x.platform === p));
  const defaultPlatform: Platform = mostCommon(pubs.map((p) => p.platform), PLATFORMS) ?? "Instagram";
  const active = pubs.some((p) => p.status === "Posted");

  // 1. Thin pipeline: fewer than PIPELINE_MIN posts lined up for the next PIPELINE_DAYS days.
  if (active) {
    const end = addDays(today, PIPELINE_DAYS);
    const lined = pubs.filter((p) => (p.status === "Ready" || p.status === "Scheduled") && isValidDate(p.scheduledDate) && p.scheduledDate >= today && p.scheduledDate <= end).length;
    if (lined < PIPELINE_MIN) {
      const why = lined === 0 ? `Nothing is ready or scheduled for the next ${PIPELINE_DAYS} days.` : `Only ${plural(lined, "post")} ready or scheduled for the next ${PIPELINE_DAYS} days.`;
      out.push({ id: "pipeline", kind: "pipeline", title: "Line up your next posts", why, action: { type: "link", href: "/bank", label: "Open Content Bank" } });
    }
  }

  // 2. A fixed-date moment within MOMENT_WINDOW days that nothing mentions yet.
  const year = Number(today.slice(0, 4));
  for (const m of MOMENTS) {
    const pad = (n: number) => String(n).padStart(2, "0");
    let date = `${year}-${pad(m.month)}-${pad(m.day)}`;
    if (date < today) date = `${year + 1}-${pad(m.month)}-${pad(m.day)}`;
    const days = daysBetween(today, date);
    if (days < 1 || days > MOMENT_WINDOW) continue;
    const needle = m.name.toLowerCase().replace(" sale", "");
    const covered = content.some((c) => [c.title, c.idea, ...(c.tags ?? [])].some((t) => t.toLowerCase().includes(needle)));
    if (covered) continue;
    out.push({
      id: `moment:${m.key}-${date.slice(0, 4)}`, kind: "moment",
      title: `${m.name} is in ${plural(days, "day")}`,
      why: `${formatDate(date)}. Nothing is planned for it yet.`,
      action: { type: "new", spec: { title: `${m.name} post`, pillar: m.pillar, idea: `A post for ${m.name} (${formatDate(date)}).`, platform: defaultPlatform, tags: [needle], scheduledDate: date } },
    });
  }

  // 3–5. The best pillar, format and topic, if clearly above usual (same rules as "What's working").
  const w = whatsWorking(posts, today);
  const inGroup = (pick: (s: Scored) => string[], name: string) => w.scored.filter((s) => pick(s).includes(name));
  const group = (kind: "pillar" | "format" | "topic", g: (typeof w.pillars.groups)[number] | undefined, pick: (s: Scored) => string[]) => {
    if (!g || g.medianLift < LIFT_GROUP) return;
    const members = inGroup(pick, g.name);
    const platform = mostCommon(members.map((s) => s.post.platform), PLATFORMS) ?? defaultPlatform;
    const evidence = `${lift(g.medianLift)} your usual engagement over ${plural(g.posts, "post")} (${g.confidence === "consistent" ? "consistent" : "early signal"}).`;
    if (kind === "pillar") {
      out.push({ id: `pillar:${g.name}`, kind, title: `Do more ${g.name}`, why: `${g.name} posts get ${evidence}`, action: { type: "new", spec: { title: `New ${g.name} post`, pillar: g.name, idea: `${g.name} posts get ${evidence}`, platform, scheduledDate: today } } });
    } else if (kind === "format") {
      const pillar = mostCommon(members.map((s) => s.post.pillar), PILLARS as readonly string[]) ?? PILLARS[0];
      out.push({ id: `format:${g.name}`, kind, title: `Try more ${g.name} posts`, why: `${g.name} posts get ${evidence}`, action: { type: "new", spec: { title: `New ${g.name} post`, pillar, idea: `${g.name} posts get ${evidence}`, platform, format: validFormat(platform, g.name as Format), scheduledDate: today } } });
    } else {
      const pillar = mostCommon(members.map((s) => s.post.pillar), PILLARS as readonly string[]) ?? PILLARS[0];
      out.push({ id: `topic:${g.name}`, kind, title: `Make another “${g.name}” post`, why: `Posts about ${g.name} get ${evidence}`, action: { type: "new", spec: { title: `New post: ${g.name}`, pillar, idea: `Posts about ${g.name} get ${evidence}`, platform, tags: [g.name], scheduledDate: today } } });
    }
  };
  group("pillar", w.pillars.groups[0], (s) => [s.post.pillar]);
  group("format", w.formats.groups[0], (s) => (s.post.publication.format ? [s.post.publication.format] : []));
  group("topic", w.topics.groups[0], (s) => s.post.content.tags ?? []);

  const byLift = [...w.scored].sort((a, b) => b.lift - a.lift || a.post.title.localeCompare(b.post.title) || a.post.id.localeCompare(b.post.id));

  // 6. Follow-up to the best standout post that's at least FOLLOWUP_AGE days old.
  const standout = byLift.find((s) => s.lift >= LIFT_POST && daysBetween(s.post.publication.publishedDate, today) >= FOLLOWUP_AGE && !titleTaken(content, `Follow-up: ${s.post.title}`));
  if (standout) {
    const p = standout.post;
    out.push({
      id: `followup:${p.contentId}`, kind: "followup", title: `Follow up “${p.title}”`,
      why: `It got ${lift(standout.lift)} your usual engagement on ${p.platform}.`,
      action: { type: "new", spec: { title: `Follow-up: ${p.title}`, pillar: p.pillar, idea: `Follow-up to “${p.title}”, which got ${lift(standout.lift)} your usual engagement on ${p.platform}.`, platform: p.platform, format: p.publication.format, ...(p.content.tags?.length ? { tags: [...p.content.tags] } : {}), scheduledDate: today } },
    });
  }

  // 7. Cross-post the best strong post to a platform you use but it isn't on yet.
  for (const s of byLift) {
    if (s.lift < LIFT_CROSSPOST) break;
    const missing = used.find((pl) => !s.post.content.publications.some((x) => x.platform === pl));
    if (!missing) continue;
    out.push({
      id: `crosspost:${s.post.contentId}:${missing}`, kind: "crosspost", title: `Post “${s.post.title}” on ${missing}`,
      why: `It got ${lift(s.lift)} your usual engagement on ${s.post.platform}.`,
      action: { type: "crosspost", contentId: s.post.contentId, platform: missing, scheduledDate: today },
    });
    break;
  }

  return out.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.id.localeCompare(b.id));
}

/* ---------- turning a suggestion into content ---------- */

const ideaPublication = (id: string, platform: Platform, scheduledDate: string, format?: Format): Publication => ({
  id, platform, caption: "", status: "Idea", scheduledDate, publishedDate: "", postUrl: "", postId: "",
  metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [],
  ...(format ? { format } : {}), // last, where the app writes it
});

// A new Idea item (field order as the app writes it: tags after publications).
export function ideaContent(spec: IdeaSpec, makeId: () => string): ContentItem {
  return {
    id: makeId(), title: spec.title, pillar: spec.pillar, idea: spec.idea, assetUrl: "", notes: "Added from a suggestion.",
    publications: [ideaPublication(makeId(), spec.platform, spec.scheduledDate, validFormat(spec.platform, spec.format))],
    ...(spec.tags?.length ? { tags: [...spec.tags] } : {}),
  };
}

// The same item with an Idea on one more platform. Null if it's already on that platform.
export function withCrossPost(item: ContentItem, platform: Platform, scheduledDate: string, makeId: () => string): ContentItem | null {
  if (item.publications.some((p) => p.platform === platform)) return null;
  return { ...item, publications: [...item.publications, ideaPublication(makeId(), platform, scheduledDate)] };
}
