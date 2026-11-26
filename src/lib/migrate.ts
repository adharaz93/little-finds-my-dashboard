import type { Asset, ContentItem, Format, LegacyContentItem, MetricSnapshot, MetricSource, Metrics, Platform, Publication, Status } from "./types";
import { ASSET_TYPES, FORMATS, PLATFORMS, STATUSES } from "./types";
import { cleanTags } from "./utils";
import { isValidDate } from "./capture";
import { DEMO_ASSETS, DEMO_CONTENT } from "./demo-data";

// Storage keys. v1 is never written again and never deleted: it stays as a backup.
export const KEY_V1 = "lfm-studio-v1";
export const KEY_V2 = "lfm-studio-v2";
// An unreadable v2 value is copied here (with a timestamp) before anything replaces it.
export const KEY_V2_UNREADABLE = "lfm-studio-v2-unreadable-";
// The full saved state is copied here before "Reset to demo" replaces it.
export const KEY_BEFORE_RESET = "lfm-studio-v2-before-reset";
// The full saved state is copied here before an imported backup replaces it.
export const KEY_BEFORE_IMPORT = "lfm-studio-v2-before-import";

// A stored value that could not be read. It is kept in storage untouched (never dropped),
// so nothing is lost and it can be repaired by hand later.
export type Quarantined = {
  kind: "content" | "publication" | "metrics" | "snapshot" | "asset" | "assets" | "field";
  field?: string; // for kind "field": which optional field was unreadable
  reason: string;
  contentId?: string;
  publicationId?: string;
  value: unknown;
};

export type LoadResult = {
  content: ContentItem[];
  assets: Asset[];
  quarantine: Quarantined[];
  source: "v2" | "v1" | "demo";
  // False when writing could destroy data we could not back up. Saving then stays off.
  canWrite: boolean;
  notices: string[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/* ---------- small guards ---------- */

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" ? x : "");
const isId = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";
const isPlatform = (x: unknown): x is Platform => (PLATFORMS as readonly unknown[]).includes(x);
const isStatus = (x: unknown): x is Status => (STATUSES as readonly unknown[]).includes(x);
const isSource = (x: unknown): x is MetricSource => x === "demo" || x === "manual" || x === "synced";
const isFormat = (x: unknown): x is Format => (FORMATS as readonly unknown[]).includes(x);
const blank = (x: unknown) => x == null || x === "";

// A count: a finite, non-negative number (numeric strings are accepted, nothing else is).
function count(x: unknown): number | undefined {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const INVALID = Symbol("invalid");

// Reach, likes, comments and shares are required. Impressions and saves may be missing:
// missing means "not reported" (null), never zero.
export function readMetrics(x: unknown): Metrics | null | typeof INVALID {
  if (x == null) return null;
  if (!isObj(x)) return INVALID;
  const reach = count(x.reach), likes = count(x.likes), comments = count(x.comments), shares = count(x.shares);
  if (reach === undefined || likes === undefined || comments === undefined || shares === undefined) return INVALID;
  const optional = (v: unknown): number | null | typeof INVALID => {
    if (v == null || v === "") return null;
    const n = count(v);
    return n === undefined ? INVALID : n;
  };
  const impressions = optional(x.impressions), saves = optional(x.saves);
  if (impressions === INVALID || saves === INVALID) return INVALID;
  const m: Metrics = { reach, impressions, likes, comments, shares, saves };
  if (x.clicks === null) m.clicks = null; // "not reported", kept as stored
  else if (x.clicks !== undefined) {
    const clicks = count(x.clicks);
    if (clicks === undefined) return INVALID;
    m.clicks = clicks;
  }
  return m;
}

/* ---------- v2 records ---------- */

// A snapshot needs `at`, a known source and readable metrics; without them it is set aside whole.
// The optional P1b fields are checked one by one: an unreadable one is set aside on its own and the
// snapshot is kept (e.g. a bad capturedOn leaves the snapshot with its date unknown).
// Nothing is added here: ids are assigned on the next write (lib/snapshots.ts), never on load.
function readSnapshot(s: unknown, contentId: string, publicationId: string, q: Quarantined[]): MetricSnapshot | null {
  const sm = isObj(s) ? readMetrics(s.metrics) : INVALID;
  if (!isObj(s) || typeof s.at !== "string" || !isSource(s.source) || !sm || sm === INVALID) {
    q.push({ kind: "snapshot", reason: "unreadable snapshot", contentId, publicationId, value: s });
    return null;
  }
  const field = (name: string, reason: string, value: unknown) =>
    q.push({ kind: "field", field: `snapshot.${name}`, reason, contentId, publicationId, value: { snapshotAt: s.at, [name]: value } });

  // Fields are updated in place, so valid data keeps its exact key order and re-saves byte for byte.
  // Unknown extra fields are kept.
  const snap = { ...s, at: s.at, source: s.source, metrics: sm } as MetricSnapshot & Obj;

  if (!isId(s.id)) {
    delete snap.id;
    if (!blank(s.id)) field("id", "unreadable snapshot id", s.id);
  }

  if (!isValidDate(s.capturedOn)) {
    delete snap.capturedOn;
    if (!blank(s.capturedOn)) field("capturedOn", `invalid capture date ${JSON.stringify(s.capturedOn)}`, s.capturedOn);
  }

  if (typeof s.note !== "string" || s.note === "") {
    delete snap.note;
    if (s.note != null && typeof s.note !== "string") field("note", "unreadable note", s.note);
  }

  if (Array.isArray(s.edits)) {
    const edits: NonNullable<MetricSnapshot["edits"]> = [];
    for (const e of s.edits) {
      const em = isObj(e) ? readMetrics(e.metrics) : INVALID;
      if (isObj(e) && typeof e.at === "string" && em && em !== INVALID) edits.push({ ...e, at: e.at, metrics: em });
      else field("edits", "unreadable edit entry", e);
    }
    if (edits.length) snap.edits = edits;
    else delete snap.edits;
  } else {
    delete snap.edits;
    if (s.edits != null) field("edits", "edit history is not a list", s.edits);
  }

  if (s.deleted !== true) {
    delete snap.deleted;
    // Anything other than true/false/missing is unclear: keep the snapshot visible, set the value aside.
    if (s.deleted != null && s.deleted !== false) field("deleted", "unreadable deleted flag", s.deleted);
  }

  return snap;
}

function readPublication(x: unknown, contentId: string, q: Quarantined[]): Publication | null {
  const bad = (reason: string) => (q.push({ kind: "publication", reason, contentId, value: x }), null);
  if (!isObj(x)) return bad("not an object");
  if (!isId(x.id)) return bad("missing id");
  if (!isPlatform(x.platform)) return bad(`unknown platform ${JSON.stringify(x.platform)}`);
  if (!isStatus(x.status)) return bad(`unknown status ${JSON.stringify(x.status)}`);

  let metrics = readMetrics(x.metrics);
  let metricsSource: MetricSource | null = isSource(x.metricsSource) ? x.metricsSource : null;
  if (metrics === INVALID) {
    // Keep the publication usable; set the unreadable numbers aside instead of guessing.
    q.push({ kind: "metrics", reason: "unreadable metrics", contentId, publicationId: x.id, value: { metrics: x.metrics, metricsSource: x.metricsSource } });
    metrics = null;
    metricsSource = null;
  }

  const snapshots: MetricSnapshot[] = [];
  for (const s of Array.isArray(x.snapshots) ? x.snapshots : []) {
    const snap = readSnapshot(s, contentId, x.id, q);
    if (snap) snapshots.push(snap);
  }

  const pub: Publication = {
    ...x, // unknown extra fields are kept, not stripped
    id: x.id,
    platform: x.platform,
    status: x.status,
    caption: str(x.caption),
    scheduledDate: str(x.scheduledDate),
    publishedDate: str(x.publishedDate),
    postUrl: str(x.postUrl),
    postId: str(x.postId),
    metrics,
    metricsSource,
    lastSyncedAt: typeof x.lastSyncedAt === "string" ? x.lastSyncedAt : null,
    snapshots,
  };
  // Optional format: kept only if it is a known format; anything else is set aside, never guessed.
  delete pub.format;
  if (isFormat(x.format)) pub.format = x.format;
  else if (!blank(x.format)) q.push({ kind: "field", field: "format", reason: `unknown format ${JSON.stringify(x.format)}`, contentId, publicationId: x.id, value: x.format });
  return pub;
}

// Optional topics: a list of words (or one comma-separated string), cleaned. Unreadable parts are set aside.
function readTags(x: unknown, contentId: string, q: Quarantined[]): string[] | undefined {
  if (blank(x)) return undefined;
  const list = typeof x === "string" ? x.split(",") : Array.isArray(x) ? x : null;
  const words = (list ?? []).filter((t): t is string => typeof t === "string");
  if (!list || words.length !== list.length) q.push({ kind: "field", field: "tags", reason: "unreadable topics", contentId, value: x });
  const tags = cleanTags(words);
  return tags.length ? tags : undefined;
}

const withoutDemoFlag = (c: ContentItem) => {
  const rest = { ...c };
  delete rest.isDemo;
  return rest;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function readV2Item(x: Obj & { id: string; publications: unknown[] }, q: Quarantined[]): ContentItem {
  const item: ContentItem = {
    ...x,
    id: x.id,
    title: str(x.title),
    pillar: str(x.pillar),
    idea: str(x.idea),
    assetUrl: str(x.assetUrl),
    notes: str(x.notes),
    publications: x.publications.map((p) => readPublication(p, x.id, q)).filter((p): p is Publication => p !== null),
  };
  delete item.isDemo;
  delete item.tags;
  const tags = readTags(x.tags, x.id, q);
  if (tags) item.tags = tags;
  // Demo status is the stored flag, set only on the bundled samples. A record with no flag is
  // demo only if it is still exactly a bundled sample; a matching id or title alone never counts.
  if (x.isDemo === true) item.isDemo = true;
  else if (x.isDemo === undefined) {
    const sample = DEMO_CONTENT.find((d) => d.id === item.id);
    if (sample && same(withoutDemoFlag(sample), item)) item.isDemo = true;
  }
  return item;
}

/* ---------- v1 records ---------- */

// The demo records exactly as v1 shipped them. A v1 record equal to one of these is an
// untouched sample, so it becomes the new demo version; anything else is the user's own.
const m = (reach: number, impressions: number, likes: number, comments: number, shares: number, saves: number, clicks: number) => ({
  reach, impressions, likes, comments, shares, saves, clicks,
});
const LEGACY_DEMO: LegacyContentItem[] = [
  { id: "c1", title: "Wooden stacking toys: 3 ways to play", caption: "Demo caption: simple play ideas for toddlers.", platform: "Instagram", pillar: "Product Finds", status: "Posted", date: "2026-11-03", assetUrl: "", notes: "", postUrl: "", metrics: m(4200, 5600, 310, 42, 55, 120, 88) },
  { id: "c2", title: "Behind the scenes: packing orders", caption: "Demo caption: a peek at our packing table.", platform: "Threads", pillar: "Behind the Scenes", status: "Posted", date: "2026-11-10", assetUrl: "", notes: "", postUrl: "", metrics: m(9800, 12400, 760, 95, 140, 210, 150) },
  { id: "c3", title: "Gift guide: under RM50", caption: "Demo caption: budget-friendly gift ideas.", platform: "Instagram", pillar: "Promo", status: "Posted", date: "2026-11-17", assetUrl: "", notes: "", postUrl: "", metrics: m(5100, 6300, 280, 31, 70, 165, 210) },
  { id: "c4", title: "Weekend parenting tip: screen-free play", caption: "Demo caption: 5 screen-free activities.", platform: "Threads", pillar: "Parenting Tips", status: "Scheduled", date: "2026-11-27", assetUrl: "", notes: "Add link in comments", postUrl: "", metrics: null },
  { id: "c5", title: "Year-end sale teaser", caption: "Demo caption: something sweet is coming.", platform: "Instagram", pillar: "Promo", status: "Ready", date: "2026-11-29", assetUrl: "", notes: "", postUrl: "", metrics: null },
  { id: "c6", title: "Customer story: Mei's reading corner", caption: "", platform: "Instagram", pillar: "Community", status: "Drafting", date: "2026-12-02", assetUrl: "", notes: "Waiting for photo permission", postUrl: "", metrics: null },
  { id: "c7", title: "Unboxing new puzzle range", caption: "", platform: "Threads", pillar: "Product Finds", status: "Idea", date: "2026-12-05", assetUrl: "", notes: "", postUrl: "", metrics: null },
  { id: "c8", title: "Holiday shipping deadlines", caption: "", platform: "Threads", pillar: "Community", status: "Idea", date: "2026-12-09", assetUrl: "", notes: "", postUrl: "", metrics: null },
];

function readV1Item(old: Obj & { id: string }, q: Quarantined[]): ContentItem {
  const legacyDemo = LEGACY_DEMO.find((d) => d.id === old.id);
  if (legacyDemo && same(legacyDemo, old)) {
    const fresh = DEMO_CONTENT.find((d) => d.id === old.id);
    if (fresh) return structuredClone(fresh);
  }
  // Values the new model can't hold are not silently changed: the original is written into notes.
  const repairs: string[] = [];
  let platform: Platform = "Instagram";
  if (isPlatform(old.platform)) platform = old.platform;
  else repairs.push(`original platform was ${JSON.stringify(old.platform ?? "")}`);
  let status: Status = "Idea";
  if (isStatus(old.status)) status = old.status;
  else repairs.push(`original status was ${JSON.stringify(old.status ?? "")}`);

  const pubId = `${old.id}-${platform.toLowerCase()}`;
  let metrics = readMetrics(old.metrics);
  if (metrics === INVALID) {
    q.push({ kind: "metrics", reason: "unreadable v1 metrics", contentId: old.id, publicationId: pubId, value: { metrics: old.metrics } });
    metrics = null;
  }
  const date = str(old.date);
  const publication: Publication = {
    id: pubId,
    platform,
    caption: str(old.caption),
    status,
    scheduledDate: date,
    publishedDate: status === "Posted" ? date : "",
    postUrl: str(old.postUrl),
    postId: "",
    metrics,
    // Numbers the user typed in v1 are their own entries, never demo.
    metricsSource: metrics ? "manual" : null,
    lastSyncedAt: null,
    snapshots: [],
  };
  const notes = str(old.notes);
  return {
    id: old.id,
    title: str(old.title),
    pillar: str(old.pillar),
    idea: "",
    assetUrl: str(old.assetUrl),
    notes: repairs.length ? `${notes}${notes ? "\n" : ""}Imported from v1: ${repairs.join("; ")}.` : notes,
    publications: [publication],
  };
}

/* ---------- whole lists ---------- */

// Accepts stored items (v2, or v1 for older saves) and returns readable v2 items.
// Records that can't be read go to `quarantine` instead of being dropped or crashing the load.
export function migrateContent(list: unknown[], q: Quarantined[] = []): ContentItem[] {
  const out: ContentItem[] = [];
  for (const x of list) {
    if (!isObj(x) || !isId(x.id)) {
      q.push({ kind: "content", reason: "missing id", value: x });
      continue;
    }
    const id = x.id;
    try {
      out.push(Array.isArray(x.publications) ? readV2Item({ ...x, id, publications: x.publications }, q) : readV1Item({ ...x, id }, q));
    } catch {
      q.push({ kind: "content", reason: "could not be read", value: x });
    }
  }
  return out;
}

export function readAssets(list: unknown[], q: Quarantined[]): Asset[] {
  const out: Asset[] = [];
  for (const a of list) {
    if (isObj(a) && isId(a.id) && (ASSET_TYPES as readonly unknown[]).includes(a.type)) {
      out.push({ ...a, id: a.id, name: str(a.name), type: a.type as Asset["type"], url: str(a.url), tags: str(a.tags) });
    } else q.push({ kind: "asset", reason: "unreadable asset", value: a });
  }
  return out;
}

// The stored envelope: { content, assets?, quarantine? }. A bare array is read as content.
function parseEnvelope(raw: string): Obj | null {
  try {
    const d: unknown = JSON.parse(raw);
    if (Array.isArray(d)) return { content: d };
    return isObj(d) && Array.isArray(d.content) ? d : null;
  } catch {
    return null;
  }
}

function readEnvelope(d: Obj, q: Quarantined[]) {
  if (Array.isArray(d.quarantine)) q.push(...(d.quarantine as Quarantined[]));
  const content = migrateContent(d.content as unknown[], q);
  let assets = DEMO_ASSETS;
  if (Array.isArray(d.assets)) assets = readAssets(d.assets, q);
  else if (d.assets !== undefined) {
    q.push({ kind: "assets", reason: "assets list unreadable", value: d.assets });
    assets = [];
  }
  return { content, assets };
}

const quarantineNotice = (n: number) =>
  `${n} saved record${n === 1 ? "" : "s"} couldn't be read. ${n === 1 ? "It has" : "They have"} been set aside in browser storage, unchanged, instead of being deleted.`;

// Picks the best data in storage: v2, then v1, then the demo samples. Never replaces data it
// could not read without first copying it to a backup key; v1 is only ever read.
export function loadState(storage: StorageLike, now = Date.now()): LoadResult {
  const notices: string[] = [];
  const demo = (canWrite: boolean): LoadResult => ({
    content: structuredClone(DEMO_CONTENT), assets: DEMO_ASSETS, quarantine: [], source: "demo", canWrite, notices,
  });

  let rawV2: string | null, rawV1: string | null;
  try {
    rawV2 = storage.getItem(KEY_V2);
    rawV1 = storage.getItem(KEY_V1);
  } catch {
    notices.push("Browser storage can't be read, so the demo samples are shown and changes won't be saved.");
    return demo(false);
  }

  let canWrite = true;
  if (rawV2 != null) {
    const d = parseEnvelope(rawV2);
    if (d) {
      const q: Quarantined[] = [];
      const r = readEnvelope(d, q);
      const fresh = q.length - (Array.isArray(d.quarantine) ? d.quarantine.length : 0);
      if (fresh > 0) notices.push(quarantineNotice(fresh));
      return { ...r, quarantine: q, source: "v2", canWrite, notices };
    }
    // v2 is unreadable. Copy it aside before anything can replace it, then fall back to v1.
    try {
      storage.setItem(KEY_V2_UNREADABLE + now, rawV2);
      notices.push(`Your saved data couldn't be read. A copy was kept in browser storage under "${KEY_V2_UNREADABLE + now}".`);
    } catch {
      canWrite = false;
      notices.push("Your saved data couldn't be read or backed up, so it has been left untouched and changes won't be saved.");
    }
  }

  if (rawV1 != null) {
    const d = parseEnvelope(rawV1);
    if (d) {
      const q: Quarantined[] = [];
      const r = readEnvelope(d, q);
      if (rawV2 != null) notices.push("Your content was recovered from the older v1 save, which is kept as a backup.");
      if (q.length) notices.push(quarantineNotice(q.length));
      return { ...r, quarantine: q, source: "v1", canWrite, notices };
    }
    notices.push(`Older saved data ("${KEY_V1}") couldn't be read. It has been left untouched.`);
  }
  return demo(canWrite);
}

// A backup file, checked exactly like saved data. Returns null when the file is not a backup.
// `assets` is null when the file has no asset list, so importing keeps the current assets.
// `unreadable` counts records in this file that could not be read (they are kept in quarantine).
export type Backup = { content: ContentItem[]; assets: Asset[] | null; quarantine: Quarantined[]; unreadable: number };
export function readBackup(raw: string): Backup | null {
  const d = parseEnvelope(raw);
  if (!d) return null;
  const q: Quarantined[] = [];
  const hasAssets = d.assets !== undefined;
  const r = readEnvelope(d, q);
  const carried = Array.isArray(d.quarantine) ? d.quarantine.length : 0;
  return { content: r.content, assets: hasAssets ? r.assets : null, quarantine: q, unreadable: q.length - carried };
}

export const serialize = (content: ContentItem[], assets: Asset[], quarantine: Quarantined[]) =>
  JSON.stringify(quarantine.length ? { version: 2, content, assets, quarantine } : { version: 2, content, assets });
