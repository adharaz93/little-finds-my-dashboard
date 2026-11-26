"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PILLARS, PLATFORMS, STATUSES, type ContentItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import ContentForm, { blankContent } from "@/components/ContentForm";
import { Button, Card, Empty, Input, PageHeader, PillarBadge, PlatformBadge, Select, StatusBadge } from "@/components/ui";

export default function BankPage() {
  const { content, saveContent } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [pillar, setPillar] = useState("All");
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const list = content.filter(
    (c) =>
      (status === "All" || c.status === status) &&
      (platform === "All" || c.platform === platform) &&
      (pillar === "All" || c.pillar === pillar) &&
      (c.title + c.caption + c.notes).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Content Bank"
        subtitle="Every idea, draft and finished post in one place."
        action={<Button onClick={() => setEditing(blankContent())}>+ Add content</Button>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input placeholder="Search..." aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select aria-label="Platform filter" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option>All</option>{PLATFORMS.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select aria-label="Pillar filter" value={pillar} onChange={(e) => setPillar(e.target.value)}>
          <option>All</option>{PILLARS.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>

      {list.length === 0 && <Empty text="No content found. Try changing the filters or add something new." />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <StatusBadge status={c.status} />
              <span className="text-xs text-muted">{formatDate(c.date)}</span>
            </div>
            <h3 className="font-serif text-xl leading-snug">{c.title}</h3>
            {c.caption && <p className="line-clamp-3 text-sm text-muted">{c.caption}</p>}
            <div className="flex flex-wrap gap-1.5"><PlatformBadge>{c.platform}</PlatformBadge><PillarBadge>{c.pillar}</PillarBadge></div>
            <div className="mt-auto flex items-center gap-2 pt-2">
              <Select
                aria-label="Change status"
                value={c.status}
                onChange={(e) => saveContent({ ...c, status: e.target.value as ContentItem["status"] })}
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
              <Button variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
