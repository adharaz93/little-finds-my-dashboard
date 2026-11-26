"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PILLARS, PLATFORMS, type MetricSource, type Platform } from "@/lib/types";
import type { Post } from "@/lib/posts";
import {
  byPlatform, change, comparison, highlights, inRange, lastDays, measured, previousRange, totals, trend,
  type DataView, type Range, type Totals,
} from "@/lib/analytics";
import type { ConnectionState, SyncResult } from "@/lib/integrations/types";
import {
  METRIC_ORDER, OPTIONAL_METRICS, localToday, metricLabel, parseMetricDraft, sameMetrics, toMetricDraft,
  type MetricDraft, type MetricKey,
} from "@/lib/capture";
import { addCapture } from "@/lib/snapshots";
import { engagement, engagementRate, formatDate, hasRate, num, pct, platformColor } from "@/lib/utils";
import TrendChart from "@/components/TrendChart";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, PlatformBadge, Select } from "@/components/ui";

const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "custom", label: "Custom", days: 0 },
] as const;

const cardTitle = "mb-3 font-serif text-xl";
const segBtn = (on: boolean) =>
  `min-h-10 rounded-full px-3 text-sm transition-colors ${on ? "bg-navy font-medium text-cream" : "text-muted hover:text-navy"}`;

export default function AnalyticsPage() {
  const { content, posts } = useStore();
  const [view, setView] = useState<DataView>("real");
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("30");
  const [range, setRange] = useState<Range | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);

  // Dates come from the visitor's clock, so they are set after mount (never during prerender).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- today's date is only known in the browser
    setRange(lastDays(30));
  }, []);
  const pickRange = (id: (typeof RANGES)[number]["id"]) => {
    setRangeId(id);
    const r = RANGES.find((x) => x.id === id)!;
    if (r.days) setRange(lastDays(r.days));
  };

  const all = useMemo(() => measured(posts, view), [posts, view]);
  const hasRealAnywhere = useMemo(() => measured(posts, "real").length > 0, [posts]);
  const current = range ? inRange(all, range) : [];
  const before = range ? inRange(all, previousRange(range)) : [];

  return (
    <>
      <PageHeader title="Analytics" subtitle="How Instagram, TikTok and Threads compare, from numbers you enter or sync." />

      {/* Controls: data source and period, in one row above everything they affect */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-white p-1 ring-1 ring-navy/[0.07]" role="group" aria-label="Data source">
          <button className={segBtn(view === "real")} aria-pressed={view === "real"} onClick={() => setView("real")}>Real data</button>
          <button className={segBtn(view === "demo")} aria-pressed={view === "demo"} onClick={() => setView("demo")}>Demo preview</button>
        </div>
        <div className="flex flex-wrap rounded-full bg-white p-1 ring-1 ring-navy/[0.07]" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.id} className={segBtn(rangeId === r.id)} aria-pressed={rangeId === r.id} onClick={() => pickRange(r.id)}>{r.label}</button>
          ))}
        </div>
        {rangeId === "custom" && range && (
          <div className="flex items-center gap-2 text-sm">
            <div className="w-40"><Input type="date" aria-label="From" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></div>
            <span className="text-muted">to</span>
            <div className="w-40"><Input type="date" aria-label="To" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></div>
          </div>
        )}
      </div>

      {view === "demo" && (
        <p className="mb-4 rounded-2xl bg-peach px-4 py-3 text-sm">
          <b>Demo preview.</b> These are sample numbers to show the layout. They are not your account&apos;s performance.
        </p>
      )}
      {view === "real" && hasRealAnywhere && (
        <p className="mb-4 text-xs text-muted">
          Real data from your own posts: {num(all.filter((p) => p.metricsSource === "manual").length)} entered by hand,{" "}
          {num(all.filter((p) => p.metricsSource === "synced").length)} synced from a platform API. Demo samples are never included.
        </p>
      )}
      {view === "real" && !hasRealAnywhere && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-navy/[0.07]">
          <p><b>Data not yet available.</b> Enter numbers for a posted item below, or connect an account once syncing is set up.</p>
          <Button variant="ghost" size="sm" onClick={() => setView("demo")}>Preview with demo data</Button>
        </div>
      )}

      {range && (
        <>
          <Overview now={totals(current)} prev={totals(before)} hasPrev={before.length > 0} demo={view === "demo"} />
          <PlatformCompare data={byPlatform(current)} />

          <Card className="mt-4">
            <h2 className={cardTitle}>Engagement trend by platform</h2>
            <TrendChart points={trend(current, range)} />
          </Card>

          {/* Full width each, so all three platform columns stay readable */}
          <Comparison className="mt-4" rows={comparison(content, current)} />
          <TopContent className="mt-4" list={current} />

          <PlatformInsights list={current} />
        </>
      )}

      <Connections />
      <DataEntry posts={posts} onEdit={setEditing} />
      {editing && <MetricsModal post={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ---------- A. Overview KPIs ---------- */

function Overview({ now, prev, hasPrev, demo }: { now: Totals; prev: Totals; hasPrev: boolean; demo: boolean }) {
  const empty = now.posts === 0;
  const items = [
    { label: "Total reach", value: num(now.reach), d: change(now.reach, prev.reach, hasPrev), tone: "bg-baby" },
    {
      label: "Total impressions",
      value: now.impressions == null ? "Not reported" : num(now.impressions),
      d: now.impressions != null && prev.impressions != null ? change(now.impressions, prev.impressions, hasPrev) : null,
      tone: "bg-mint",
    },
    { label: "Total engagement", value: num(now.engagement), d: change(now.engagement, prev.engagement, hasPrev), tone: "bg-peach" },
    {
      label: "Avg engagement rate",
      value: now.avgRate == null ? "Not reported" : pct(now.avgRate),
      d: now.avgRate != null && prev.avgRate != null ? change(now.avgRate, prev.avgRate, hasPrev) : null,
      tone: "bg-pink",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className={`rounded-[20px] px-4 py-3 ${k.tone}`}>
          <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted">
            {k.label}
            {demo && <span className="rounded-full bg-white/70 px-1.5 text-[11px] normal-case tracking-normal text-navy">Demo</span>}
          </p>
          <p className={`mt-1 font-serif tabular-nums ${empty || k.value === "Not reported" ? "text-xl text-muted" : "text-4xl"}`}>
            {empty ? "No data yet" : k.value}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {empty ? " " : k.d == null ? "No earlier period to compare" : `${k.d >= 0 ? "▲" : "▼"} ${Math.abs(k.d).toFixed(1)}% vs previous period`}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- B. Performance by platform ---------- */

function PlatformCompare({ data }: { data: Record<Platform, Totals> }) {
  const rows: { label: string; get: (t: Totals) => string }[] = [
    { label: "Posts", get: (t) => num(t.posts) },
    { label: "Reach / views", get: (t) => num(t.reach) },
    { label: "Impressions", get: (t) => (t.impressions == null ? "Not reported" : num(t.impressions)) },
    { label: "Likes", get: (t) => num(t.likes) },
    { label: "Comments", get: (t) => num(t.comments) },
    { label: "Shares / reposts", get: (t) => num(t.shares) },
    { label: "Saves", get: (t) => (t.saves == null ? "Not reported" : num(t.saves)) },
    { label: "Engagement rate", get: (t) => (t.reach ? pct((t.engagement / t.reach) * 100) : "-") },
  ];
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {PLATFORMS.map((p) => {
        const t = data[p];
        return (
          <section key={p} className="rounded-[20px] bg-white px-4 py-3 shadow-soft ring-1 ring-navy/[0.07]">
            <h2 className="mb-2 flex items-center gap-2 font-serif text-xl">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: platformColor[p] }} aria-hidden />
              {p}
            </h2>
            {t.posts === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Data not yet available</p>
            ) : (
              <dl className="divide-y divide-navy/10 text-sm">
                {rows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-3 py-1.5">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className={`tabular-nums ${r.get(t) === "Not reported" ? "text-xs text-muted" : "font-medium"}`}>{r.get(t)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- D. Post engagement comparison ---------- */

function Comparison({ rows, className }: { rows: ReturnType<typeof comparison>; className: string }) {
  const [platform, setPlatform] = useState("All");
  const [pillar, setPillar] = useState("All");
  const shown = rows.filter(
    (r) => (pillar === "All" || r.content.pillar === pillar) && (platform === "All" || r.perPlatform[platform as Platform].state === "data"),
  );
  const cell = (s: { state: string; engagement: number }) =>
    s.state === "data" ? num(s.engagement) : s.state === "nodata" ? <span className="text-xs text-muted">No data</span> : <span className="text-muted" aria-label="Not published">–</span>;
  return (
    <Card className={`min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl">Post engagement comparison</h2>
        <div className="flex gap-2">
          <div className="w-36"><Select aria-label="Platform filter" value={platform} onChange={(e) => setPlatform(e.target.value)}><option>All</option>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></div>
          <div className="w-40"><Select aria-label="Pillar filter" value={pillar} onChange={(e) => setPillar(e.target.value)}><option>All</option>{PILLARS.map((p) => <option key={p}>{p}</option>)}</Select></div>
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty text="Data not yet available for this selection." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1.5 pr-3 font-medium">Content</th>
                {PLATFORMS.map((p) => (
                  <th key={p} className="w-28 whitespace-nowrap py-1.5 pr-4 text-right font-medium">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: platformColor[p] }} aria-hidden />
                    {p}
                  </th>
                ))}
                <th className="w-24 whitespace-nowrap py-1.5 pr-4 text-right font-medium">Total</th>
                <th className="w-20 whitespace-nowrap py-1.5 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {shown.map((r) => (
                <tr key={r.content.id}>
                  <td className="min-w-44 py-2 pr-4 leading-snug">{r.content.title}</td>
                  {PLATFORMS.map((p) => <td key={p} className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{cell(r.perPlatform[p])}</td>)}
                  <td className="whitespace-nowrap py-2 pr-4 text-right font-medium tabular-nums">{num(r.engagement)}</td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">{r.rate == null ? "–" : pct(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">– not published on that platform · Engagement = likes + comments + shares + saves</p>
        </div>
      )}
    </Card>
  );
}

/* ---------- E. Top performing content ---------- */

function TopContent({ list, className }: { list: Post[]; className: string }) {
  const [by, setBy] = useState<"rate" | "total">("rate");
  const ranked = [...list]
    .sort((a, b) => (by === "rate" ? engagementRate(b.metrics) - engagementRate(a.metrics) : engagement(b.metrics) - engagement(a.metrics)))
    .slice(0, 6);
  return (
    <Card className={`min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl">Top performing content</h2>
        <div className="flex rounded-full bg-cream p-1" role="group" aria-label="Rank by">
          <button className={segBtn(by === "rate")} aria-pressed={by === "rate"} onClick={() => setBy("rate")}>Rate</button>
          <button className={segBtn(by === "total")} aria-pressed={by === "total"} onClick={() => setBy("total")}>Total</button>
        </div>
      </div>
      {ranked.length === 0 ? (
        <Empty text="Data not yet available for this period." />
      ) : (
        <>
        {/* Column-wise: ranks 1-3 fill the left column, 4-6 the right; one column on phones */}
        <ol className="grid grid-cols-1 gap-x-8 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-3">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex min-h-12 items-start gap-3 border-b border-navy/10 py-2 text-sm">
              <span className="w-5 shrink-0 font-serif text-xl leading-6">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 leading-snug" title={p.title}>{p.title}</span>
                <span className="text-xs text-muted">{p.platform} · {num(engagement(p.metrics))} engagements</span>
              </span>
              <span className="shrink-0 pt-0.5 font-medium tabular-nums">{hasRate(p.metrics) ? pct(engagementRate(p.metrics)) : "–"}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">Showing {ranked.length} of {list.length} post{list.length === 1 ? "" : "s"} with data in this period, ranked by {by === "rate" ? "engagement rate" : "total engagement"}.</p>
        </>
      )}
    </Card>
  );
}

/* ---------- F. Platform insights ---------- */

function PlatformInsights({ list }: { list: Post[] }) {
  const items = highlights(list);
  return (
    <section className="mt-4">
      <h2 className={cardTitle}>Platform insights</h2>
      {items.length === 0 ? (
        <Empty text="Insights appear once this period has performance data." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((h) => (
            <div key={h.label} className="rounded-[20px] bg-white px-4 py-3 ring-1 ring-navy/[0.07]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{h.label}</p>
              <p className="mt-1 line-clamp-2 break-words font-serif text-2xl leading-tight" title={h.value}>{h.value}</p>
              <p className="mt-0.5 text-xs text-muted">{h.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Connections and sync ---------- */

function Connections() {
  const [states, setStates] = useState<ConnectionState[] | null>(null);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStates(d.platforms))
      .catch(() => setError("Could not reach the server to check connections."));
  }, []);

  // Refresh only makes sense once at least one account is connected through its official API.
  const anyConnected = !!states?.some((s) => s.connected);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/integrations/sync", { method: "POST" });
      const d = await r.json();
      setResults(d.results);
    } catch {
      setError("Refresh failed: the server could not be reached.");
    } finally {
      setCheckedAt(new Date().toLocaleString("en-GB"));
      setBusy(false);
    }
  };

  // Two separate facts per platform: is the app set up on the server, and is an account authorised.
  const setup = (s: ConnectionState) => (s.configured ? { t: "Set up", c: "bg-mint" } : { t: "Not configured", c: "bg-peach" });
  const account = (s: ConnectionState) => (s.connected ? { t: "Connected", c: "bg-mint" } : { t: "Not connected", c: "bg-pink" });

  return (
    <Card className="mt-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-serif text-xl">Account connections</h2>
          <p className="mt-1 text-sm text-muted">
            Automatic syncing uses each platform&apos;s official API. An account has to be connected before anything can sync.
            None of the three is connected yet, so every number on this page is either entered by hand or a labelled demo sample.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={busy || !anyConnected} className="disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Refreshing…" : "Refresh now"}
          </Button>
          {!anyConnected && <span className="text-xs text-muted">Available once an account is connected</span>}
        </div>
      </div>
      {error && <p className="mb-2 text-sm text-[#8a3a45]" role="alert">{error}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const s = states?.find((x) => x.platform === platform);
          const res = results?.find((r) => r.platform === platform);
          return (
            <div key={platform} className="rounded-2xl bg-cream px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: platformColor[platform] }} aria-hidden />
                {platform}
              </p>
              {s ? (
                <>
                  <p className="mt-0.5 text-xs text-muted">{s.api}</p>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2"><dt>App credentials</dt><dd><Badge color={setup(s).c}>{setup(s).t}</Badge></dd></div>
                    <div className="flex items-center justify-between gap-2"><dt>Account</dt><dd><Badge color={account(s).c}>{account(s).t}</Badge></dd></div>
                    <div className="flex items-center justify-between gap-2"><dt>Last successful sync</dt><dd className="font-medium">{s.lastSuccessfulSync ?? "Never"}</dd></div>
                  </dl>
                  {!s.configured && <p className="mt-2 text-xs text-muted">Needs server settings: {s.missing.join(", ")}.</p>}
                  {res && res.status !== "synced" && <p className="mt-1 text-xs text-[#8a3a45]">Last refresh: {res.message}</p>}
                </>
              ) : (
                <p className="mt-2 text-xs text-muted">{error ? "Status unavailable" : "Checking…"}</p>
              )}
            </div>
          );
        })}
      </div>
      {checkedAt && <p className="mt-2 text-xs text-muted">Refresh attempted {checkedAt}.</p>}
    </Card>
  );
}

/* ---------- Manual data entry (every post, with where its numbers came from) ---------- */

const SOURCE: Record<MetricSource, { t: string; c: string }> = {
  demo: { t: "Demo", c: "bg-peach" },
  manual: { t: "Entered by hand", c: "bg-mint" },
  synced: { t: "Synced", c: "bg-baby" },
};

function DataEntry({ posts, onEdit }: { posts: Post[]; onEdit: (p: Post) => void }) {
  const eligible = posts.filter((p) => p.status === "Posted" || p.metrics).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card className="mt-4">
      <h2 className="mb-1 font-serif text-xl">Performance data</h2>
      <p className="mb-3 text-xs text-muted">Enter numbers from each platform by hand until syncing is connected. Engagement rate = engagement / reach x 100.</p>
      {eligible.length === 0 && <Empty text="Mark a platform post as Posted to add its numbers." />}
      <ul className="divide-y divide-navy/10">
        {eligible.map((p) => (
          <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[1fr_auto_auto_auto]">
            <span className="min-w-0">
              <span className="block truncate font-medium" title={p.title}>{p.title}</span>
              <span className="text-xs text-muted">{formatDate(p.date)}</span>
            </span>
            <span className="flex flex-wrap gap-1 sm:justify-end">
              <PlatformBadge>{p.platform}</PlatformBadge>
              {p.metricsSource ? <Badge color={SOURCE[p.metricsSource].c}>{SOURCE[p.metricsSource].t}</Badge> : <Badge color="bg-white">No data yet</Badge>}
            </span>
            <span className="w-14 text-right tabular-nums">{hasRate(p.metrics) ? pct(engagementRate(p.metrics)) : "-"}</span>
            <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>{p.metrics ? "Edit data" : "Add data"}</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MetricsModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const { savePublication } = useStore();
  const [d, setD] = useState<MetricDraft>(toMetricDraft(post.metrics));
  // Messages appear after the first Save attempt, then update as the user types.
  const [tried, setTried] = useState(false);
  const parsed = parseMetricDraft(d);
  const errors = parsed.ok ? {} : parsed.errors;
  const optional = (k: MetricKey) => OPTIONAL_METRICS.includes(k);
  return (
    <Modal title="Performance data" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">{post.title} · {post.platform}</p>
      {post.content.isDemo ? (
        <p className="mb-3 rounded-xl bg-peach px-3 py-2 text-xs">This is a demo sample. Its numbers only appear in the demo preview, never as your account&apos;s performance.</p>
      ) : (
        <p className="mb-3 rounded-xl bg-mint px-3 py-2 text-xs">Numbers saved here are marked as entered by hand, not synced from {post.platform}.</p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          // Nothing is saved until every field is valid: no blank or unreadable value becomes 0.
          if (!parsed.ok) {
            setTried(true);
            return;
          }
          const metrics = parsed.metrics;
          // Numbers on demo samples stay demo. Numbers on the user's own content are "manual":
          // typed by hand, never labelled as synced. Each save adds a capture dated today (local);
          // the publication's current numbers then follow its latest capture (lib/snapshots.ts).
          if (!sameMetrics(post.metrics, metrics)) {
            const source = post.content.isDemo ? "demo" : "manual";
            savePublication(post.contentId, addCapture(post.publication, { metrics, source, capturedOn: localToday() }));
          }
          onClose();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {METRIC_ORDER.map((k) => {
            const err = tried ? errors[k] : undefined;
            return (
              <div key={k}>
                <Field label={optional(k) ? `${metricLabel(k, post.platform)} (optional)` : metricLabel(k, post.platform)}>
                  {/* Text, not type=number: a number field silently empties "1,200", which used to save as 0. */}
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={optional(k) ? "Not reported" : undefined}
                    value={d[k]}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `metric-err-${k}` : undefined}
                    onChange={(e) => setD({ ...d, [k]: e.target.value })}
                  />
                </Field>
                {err && <p id={`metric-err-${k}`} className="mt-1 text-xs text-[#8a3a45]">{err}</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">Reach, likes, comments and shares are required (enter 0 if none). Leave optional numbers blank if the platform doesn&apos;t report them.</p>
        <p className="text-sm">Engagement rate: <b>{parsed.ok && hasRate(parsed.metrics) ? pct(engagementRate(parsed.metrics)) : "–"}</b></p>
        {tried && !parsed.ok && <p role="alert" className="text-sm text-[#8a3a45]">Fix the highlighted numbers to save.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
