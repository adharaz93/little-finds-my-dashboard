"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PILLARS, PLATFORMS, STATUSES, type ContentItem, type Publication } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { today } from "@/lib/posts";
import ContentForm, { blankContent } from "@/components/ContentForm";
import { Button, Card, Empty, Input, PageHeader, PillarBadge, PlatformBadge, Select } from "@/components/ui";

export default function BankPage() {
  const { content, savePublication } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [platform, setPlatform] = useState("All");
  const [pillar, setPillar] = useState("All");
  const [editing, setEditing] = useState<ContentItem | null>(null);

  // A content item matches when any of its platform posts matches the status and platform filters.
  const list = content.filter(
    (c) =>
      c.publications.some((p) => (status === "All" || p.status === status) && (platform === "All" || p.platform === platform)) &&
      (pillar === "All" || c.pillar === pillar) &&
      [c.title, c.idea, c.notes, ...c.publications.map((p) => p.caption)].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  const setStatusFor = (c: ContentItem, p: Publication, s: Publication["status"]) =>
    savePublication(c.id, { ...p, status: s, publishedDate: s === "Posted" && !p.publishedDate ? today() : p.publishedDate });

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
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {list.map((c) => {
          const caption = c.publications.find((p) => p.caption)?.caption;
          return (
            <Card key={c.id} className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap gap-1.5"><PillarBadge>{c.pillar}</PillarBadge></div>
              <h3 className="break-words font-serif text-xl leading-snug">{c.title}</h3>
              {(c.idea || caption) && <p className="line-clamp-3 break-words text-sm text-muted" title={c.idea || caption}>{c.idea || caption}</p>}
              <ul className="divide-y divide-navy/10 border-t border-navy/10">
                {c.publications.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <PlatformBadge>{p.platform}</PlatformBadge>
                      <p className="mt-1 whitespace-nowrap text-xs text-muted">
                        {p.status === "Posted" && p.publishedDate ? `Published ${formatDate(p.publishedDate)}` : `Scheduled ${formatDate(p.scheduledDate)}`}
                      </p>
                    </div>
                    <div className="w-36 shrink-0">
                      <Select aria-label={`${p.platform} status`} value={p.status} onChange={(e) => setStatusFor(c, p, e.target.value as Publication["status"])}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <Button variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
