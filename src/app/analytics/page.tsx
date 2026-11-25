"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { ContentItem, Metrics } from "@/lib/types";
import { engagementRate, formatDate, num, pct } from "@/lib/utils";
import WeeklyChart from "@/components/WeeklyChart";
import { Button, Card, DemoNote, Empty, Field, Input, Modal, PageHeader, StatCard } from "@/components/ui";

const FIELDS: (keyof Metrics)[] = ["reach", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const ZERO: Metrics = { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0 };

export default function AnalyticsPage() {
  const { content, saveContent } = useStore();
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [m, setM] = useState<Metrics>(ZERO);

  const eligible = content.filter((c) => c.status === "Posted" || c.metrics);
  const withData = eligible.filter((c) => c.metrics);
  const sum = (k: keyof Metrics) => withData.reduce((s, c) => s + (c.metrics?.[k] ?? 0), 0);
  const avg = withData.length ? withData.reduce((s, c) => s + engagementRate(c.metrics), 0) / withData.length : 0;
  const maxER = Math.max(1, ...withData.map((c) => engagementRate(c.metrics)));

  const open = (c: ContentItem) => { setEditing(c); setM(c.metrics ?? ZERO); };

  return (
    <>
      <PageHeader title="Analytics" subtitle="Enter numbers from each platform by hand. Engagement is calculated for you." />
      <DemoNote />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Reach" value={num(sum("reach"))} tone="bg-baby" />
        <StatCard label="Impressions" value={num(sum("impressions"))} tone="bg-mint" />
        <StatCard label="Interactions" value={num(sum("likes") + sum("comments") + sum("shares") + sum("saves"))} tone="bg-peach" />
        <StatCard label="Avg engagement" value={pct(avg)} tone="bg-pink" />
      </div>
      <p className="mt-2 text-xs text-muted">Engagement rate = (likes + comments + shares + saves) / reach x 100</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-serif text-2xl">Weekly reach</h2>
          <WeeklyChart content={content} metric="reach" />
        </Card>
        <Card>
          <h2 className="mb-4 font-serif text-2xl">Weekly engagement</h2>
          <WeeklyChart content={content} metric="engagement" />
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-serif text-2xl">Posts</h2>
        {eligible.length === 0 && <Empty text="Mark content as Posted to add performance data." />}
        <div className="space-y-3">
          {eligible.map((c) => {
            const er = engagementRate(c.metrics);
            return (
              <div key={c.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_180px_auto]">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted">{formatDate(c.date)} · {c.platform}{c.metrics ? ` · reach ${num(c.metrics.reach)}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 flex-1 rounded-full bg-cream">
                    <div className="h-2.5 rounded-full bg-pink" style={{ width: `${(er / maxER) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right">{c.metrics ? pct(er) : "-"}</span>
                </div>
                <Button variant="ghost" className="!py-1" onClick={() => open(c)}>{c.metrics ? "Edit data" : "Add data"}</Button>
              </div>
            );
          })}
        </div>
      </Card>

      {editing && (
        <Modal title="Performance data" onClose={() => setEditing(null)}>
          <p className="mb-3 text-sm text-muted">{editing.title}</p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveContent({ ...editing, metrics: m });
              setEditing(null);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <Input type="number" min={0} value={m[k]} onChange={(e) => setM({ ...m, [k]: Math.max(0, Number(e.target.value) || 0) })} />
                </Field>
              ))}
            </div>
            <p className="text-sm">Engagement rate: <b>{pct(engagementRate(m))}</b></p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
