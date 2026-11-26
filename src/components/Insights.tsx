"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { engagementRate, num, pct } from "@/lib/utils";

const label = "text-xs font-medium uppercase tracking-wider text-muted";

function useInsights() {
  const { content } = useStore();
  const withData = content.filter((c) => c.metrics);
  const top = [...withData].sort((a, b) => engagementRate(b.metrics) - engagementRate(a.metrics)).slice(0, 3);
  const avg = withData.length ? withData.reduce((s, c) => s + engagementRate(c.metrics), 0) / withData.length : 0;
  const reach = withData.reduce((s, c) => s + (c.metrics?.reach ?? 0), 0);
  const nextUp = content
    .filter((c) => c.status === "Ready" || c.status === "Scheduled")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const tasks = [
    { n: content.filter((c) => c.status === "Drafting" && !c.caption).length, t: "drafts need a caption", href: "/bank" },
    { n: content.filter((c) => c.status === "Ready").length, t: "ready to schedule", href: "/posting" },
    { n: content.filter((c) => c.status === "Posted" && !c.metrics).length, t: "posts need performance data", href: "/analytics" },
    { n: content.filter((c) => c.status !== "Idea" && !c.assetUrl).length, t: "items missing an asset link", href: "/bank" },
  ].filter((x) => x.n > 0);
  return { top, avg, reach, nextUp, tasks };
}

// Main workspace cards. Compact: one row per item, long titles truncate.
export const compactCard = "rounded-[20px] bg-white px-4 py-3 shadow-soft ring-1 ring-navy/[0.07]";

export function TodoCard({ className = "" }: { className?: string }) {
  const { tasks } = useInsights();
  return (
    <section className={`${compactCard} ${className}`}>
      <h2 className="mb-1 font-serif text-xl">To do</h2>
      {tasks.length === 0 && <p className="py-2 text-sm text-muted">All caught up.</p>}
      <ul className="divide-y divide-navy/10">
        {tasks.map((x) => (
          <li key={x.t}>
            <Link href={x.href} className="flex min-h-10 items-center gap-3 py-1 text-sm">
              <span className="w-6 shrink-0 font-serif text-xl tabular-nums">{x.n}</span>
              <span className="link truncate">{x.t}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TopContentCard({ className = "" }: { className?: string }) {
  const { top } = useInsights();
  return (
    <section className={`${compactCard} ${className}`}>
      <h2 className="mb-1 font-serif text-xl">Top performing content</h2>
      {top.length === 0 && <p className="py-2 text-sm text-muted">Add performance data in Analytics to see this.</p>}
      <ol className="divide-y divide-navy/10">
        {top.map((c, i) => (
          <li key={c.id} className="flex min-h-10 items-center gap-3 py-1 text-sm">
            <span className="w-6 shrink-0 font-serif text-xl">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" title={c.title}>{c.title}</span>
            <span className="shrink-0 text-xs text-muted">{c.platform}</span>
            <span className="w-14 shrink-0 text-right font-medium tabular-nums">{pct(engagementRate(c.metrics))}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// The four rail sections: Weekly Insights, Upcoming Content, Top Performing Posts, Pending Tasks.
function RailBody() {
  const { top, avg, reach, nextUp, tasks } = useInsights();
  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-[20px] bg-white p-4 shadow-soft ring-1 ring-navy/[0.07]">
        <p className={label}>Weekly insights</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-baby p-3">
            <p className="font-serif text-2xl tabular-nums">{pct(avg)}</p>
            <p className="text-xs text-muted">avg engagement</p>
          </div>
          <div className="rounded-xl bg-pink p-3">
            <p className="font-serif text-2xl tabular-nums">{num(reach)}</p>
            <p className="text-xs text-muted">total reach</p>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] bg-white p-4 shadow-soft ring-1 ring-navy/[0.07]">
        <p className={label}>Upcoming content</p>
        {nextUp.length === 0 && <p className="mt-2 text-muted">Nothing queued.</p>}
        <ul className="mt-2 space-y-2">
          {nextUp.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-peach ring-1 ring-navy/20" />
              <span>
                {c.title}
                <span className="block text-xs text-muted">{c.date.slice(5)} · {c.platform}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[20px] bg-white p-4 shadow-soft ring-1 ring-navy/[0.07]">
        <p className={label}>Top performing posts</p>
        {top.length === 0 && <p className="mt-2 text-muted">Add performance data to see this.</p>}
        <ol className="mt-2 space-y-2">
          {top.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="font-serif text-lg leading-5">{i + 1}</span>
              <span>
                {c.title}
                <span className="block text-xs text-muted">{pct(engagementRate(c.metrics))} engagement</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[20px] bg-mint/60 p-4">
        <p className={label}>Pending tasks</p>
        {tasks.length === 0 && <p className="mt-2 text-muted">All caught up.</p>}
        <ul className="mt-2 space-y-1.5">
          {tasks.map((x) => (
            <li key={x.t}><b>{x.n}</b> {x.t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Desktop (xl and up): the right-hand column, visually separated by a hairline and a tinted ground.
export default function InsightsRail() {
  return (
    <aside aria-label="Insights" className="sticky top-0 hidden h-screen overflow-y-auto border-l border-navy/10 bg-panel p-6 xl:block">
      <h2 className="mb-5 font-serif text-3xl">Insights</h2>
      <RailBody />
    </aside>
  );
}

// Below xl the rail has no column: the Dashboard shows the same sections as a collapsible block.
export function CollapsibleInsights() {
  return (
    <details className="group mt-4 rounded-[20px] bg-panel p-4 ring-1 ring-navy/[0.07] xl:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-serif text-2xl [&::-webkit-details-marker]:hidden">
        Insights
        <span aria-hidden className="text-base text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3">
        <RailBody />
      </div>
    </details>
  );
}
