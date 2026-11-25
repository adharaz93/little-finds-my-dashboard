"use client";
import { useStore } from "@/lib/store";
import { engagementRate, num, pct } from "@/lib/utils";

const label = "text-xs font-medium uppercase tracking-wider text-muted";

export default function Insights() {
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
    { n: content.filter((c) => c.status === "Drafting" && !c.caption).length, t: "drafts need a caption" },
    { n: content.filter((c) => c.status === "Ready").length, t: "ready to schedule" },
    { n: content.filter((c) => c.status === "Posted" && !c.metrics).length, t: "posts need performance data" },
    { n: content.filter((c) => c.status !== "Idea" && !c.assetUrl).length, t: "items missing an asset link" },
  ].filter((x) => x.n > 0);

  return (
    <aside className="sticky top-0 hidden h-screen overflow-y-auto bg-panel p-6 xl:block">
      <h2 className="font-serif text-2xl">Insights</h2>
      <div className="mt-5 space-y-4 text-sm">
        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <p className={label}>Weekly insights</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-baby p-3">
              <p className="font-serif text-2xl">{pct(avg)}</p>
              <p className="text-xs text-muted">avg engagement</p>
            </div>
            <div className="rounded-xl bg-pink p-3">
              <p className="font-serif text-2xl">{num(reach)}</p>
              <p className="text-xs text-muted">total reach</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <p className={label}>Upcoming content</p>
          {nextUp.length === 0 && <p className="mt-2 text-muted">Nothing queued.</p>}
          <ul className="mt-2 space-y-2">
            {nextUp.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-peach" />
                <span>
                  {c.title}
                  <span className="block text-xs text-muted">{c.date.slice(5)} · {c.platform}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-soft">
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

        <section className="rounded-2xl bg-mint/60 p-4">
          <p className={label}>Pending tasks</p>
          {tasks.length === 0 && <p className="mt-2 text-muted">All caught up.</p>}
          <ul className="mt-2 space-y-1.5">
            {tasks.map((x) => (
              <li key={x.t}><b>{x.n}</b> {x.t}</li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-muted">Demo data. Saved in this browser only.</p>
      </div>
    </aside>
  );
}
