"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { STATUSES, type ContentItem } from "@/lib/types";
import { formatDate, statusBar } from "@/lib/utils";
import ContentForm, { blankContent } from "@/components/ContentForm";
import BackupLinks from "@/components/BackupLinks";
import { CollapsibleInsights, TodoCard, TopContentCard, compactCard } from "@/components/Insights";
import { Button, Empty, PageHeader, StatCard, StatusBadge } from "@/components/ui";

// Compact overview grid: KPIs, then Pipeline | Coming up, then To do | Top performing (40 / 60).
export default function Dashboard() {
  const { content, posts, resetDemo } = useStore();
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const count = (...s: string[]) => posts.filter((c) => s.includes(c.status)).length;
  const upcoming = posts
    .filter((c) => c.status !== "Posted")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        enter
        title="Good to see you"
        subtitle="Your content at a glance."
        action={<Button onClick={() => setEditing(blankContent())}>+ New content</Button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard compact label="Total content" value={String(content.length)} tone="bg-baby" />
        <StatCard compact label="In the works" value={String(count("Idea", "Drafting"))} tone="bg-peach" />
        <StatCard compact label="Lined up" value={String(count("Ready", "Scheduled"))} tone="bg-mint" />
        <StatCard compact label="Posted" value={String(count("Posted"))} tone="bg-posted" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
        <section className={`${compactCard} md:col-span-2`}>
          <h2 className="mb-2 font-serif text-xl">Pipeline</h2>
          <div className="space-y-2.5">
            {STATUSES.map((s) => {
              const n = count(s);
              return (
                <div key={s} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0">{s}</span>
                  <div className="h-2.5 min-w-0 flex-1 rounded-full bg-cream">
                    <div className={`h-2.5 rounded-full ${statusBar[s]}`} style={{ width: `${posts.length ? (n / posts.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-5 shrink-0 text-right tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${compactCard} md:col-span-3`}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-xl">Coming up</h2>
            <Link href="/calendar" className="link inline-flex min-h-10 items-center text-sm">Calendar</Link>
          </div>
          {upcoming.length === 0 && <Empty text="Nothing planned yet." />}
          <ul className="divide-y divide-navy/10">
            {upcoming.map((c) => (
              <li key={c.id}>
                <button onClick={() => setEditing(c.content)} title={`${c.title} (${c.platform})`} className="flex min-h-10 w-full items-center gap-3 py-1 text-left text-sm">
                  <b className="w-14 shrink-0 font-semibold tabular-nums">{formatDate(c.date)}</b>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">{c.platform}</span>
                  <span className="shrink-0"><StatusBadge status={c.status} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <TodoCard className="md:col-span-2" />
        <TopContentCard className="md:col-span-3" />
      </div>

      <CollapsibleInsights />

      <div className="mt-4 flex flex-wrap gap-x-5">
        <button onClick={() => confirm("Reset all data back to the demo samples?") && resetDemo()} className="link inline-flex min-h-11 items-center text-xs text-muted">
          Reset demo data
        </button>
        <BackupLinks />
      </div>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
