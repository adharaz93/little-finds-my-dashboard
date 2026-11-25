"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { STATUSES, type ContentItem } from "@/lib/types";
import { engagementRate, formatDate, num, pct, statusColor } from "@/lib/utils";
import ContentForm, { blankContent } from "@/components/ContentForm";
import WeeklyChart from "@/components/WeeklyChart";
import { Button, Card, DemoNote, Empty, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default function Dashboard() {
  const { content, resetDemo } = useStore();
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const posted = content.filter((c) => c.metrics);
  const avgER = posted.length ? posted.reduce((s, c) => s + engagementRate(c.metrics), 0) / posted.length : 0;
  const totalReach = posted.reduce((s, c) => s + (c.metrics?.reach ?? 0), 0);
  const upcoming = content
    .filter((c) => c.status !== "Posted")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Good to see you"
        subtitle="Your content at a glance."
        action={<Button onClick={() => setEditing(blankContent())}>+ New content</Button>}
      />
      <DemoNote />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total content" value={String(content.length)} tone="bg-baby" />
        <StatCard label="Posted" value={String(content.filter((c) => c.status === "Posted").length)} tone="bg-mint" />
        <StatCard label="Total reach" value={num(totalReach)} tone="bg-peach" />
        <StatCard label="Avg engagement" value={pct(avgER)} tone="bg-pink" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-serif text-2xl">Pipeline</h2>
          <div className="space-y-2">
            {STATUSES.map((s) => {
              const n = content.filter((c) => c.status === s).length;
              return (
                <div key={s} className="flex items-center gap-3 text-sm">
                  <span className="w-24">{s}</span>
                  <div className="h-3 flex-1 rounded-full bg-cream">
                    <div className={`h-3 rounded-full ${statusColor[s]}`} style={{ width: `${content.length ? (n / content.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-5 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Coming up</h2>
            <Link href="/calendar" className="text-sm underline">Calendar</Link>
          </div>
          {upcoming.length === 0 && <Empty text="Nothing planned yet." />}
          <ul className="divide-y divide-navy/10">
            {upcoming.map((c) => (
              <li key={c.id}>
                <button onClick={() => setEditing(c)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm">
                  <span><b>{formatDate(c.date)}</b> · {c.title}</span>
                  <StatusBadge status={c.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-1 font-serif text-2xl">Weekly performance</h2>
        <p className="mb-4 text-xs text-muted">Reach per week, from the numbers you enter in Analytics.</p>
        <WeeklyChart content={content} metric="reach" />
      </Card>

      <button onClick={() => confirm("Reset all data back to the demo samples?") && resetDemo()} className="mt-6 text-xs underline text-muted">
        Reset demo data
      </button>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
