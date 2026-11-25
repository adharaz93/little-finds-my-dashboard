"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { ContentItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import ContentForm from "@/components/ContentForm";
import { Badge, Button, Empty, PageHeader } from "@/components/ui";

const COLUMNS = [
  { status: "Ready", tone: "bg-mint/50", hint: "Approved and waiting for a date" },
  { status: "Scheduled", tone: "bg-pink/50", hint: "Date set, to be posted by you" },
  { status: "Posted", tone: "bg-baby/60", hint: "Published manually" },
] as const;

export default function PostingPage() {
  const { content, saveContent } = useStore();
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const move = (c: ContentItem, status: ContentItem["status"]) => saveContent({ ...c, status });

  return (
    <>
      <PageHeader
        title="Posting Manager"
        subtitle="Posting is manual: copy the caption, post it on the platform, then mark it posted here."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = content.filter((c) => c.status === col.status).sort((a, b) => a.date.localeCompare(b.date));
          return (
            <section key={col.status} className={`rounded-2xl p-4 ${col.tone}`}>
              <h2 className="font-serif text-2xl">{col.status} <span className="text-base text-muted">({items.length})</span></h2>
              <p className="mb-3 text-xs text-muted">{col.hint}</p>
              <div className="space-y-3">
                {items.length === 0 && <Empty text="Empty" />}
                {items.map((c) => (
                  <div key={c.id} className="rounded-2xl bg-white p-4 text-sm shadow-soft">
                    <p className="font-medium">{c.title}</p>
                    <p className="mb-2 text-xs text-muted">{formatDate(c.date)} · {c.platform}</p>
                    {c.postUrl && <a href={c.postUrl} target="_blank" rel="noreferrer" className="text-xs underline">View post</a>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.caption && (
                        <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => navigator.clipboard?.writeText(c.caption)}>
                          Copy caption
                        </Button>
                      )}
                      {c.status === "Ready" && <Button className="!px-3 !py-1 text-xs" onClick={() => move(c, "Scheduled")}>Mark scheduled</Button>}
                      {c.status === "Scheduled" && (
                        <>
                          <Button className="!px-3 !py-1 text-xs" onClick={() => move(c, "Posted")}>Mark posted</Button>
                          <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => move(c, "Ready")}>Unschedule</Button>
                        </>
                      )}
                      {c.status === "Posted" && <Badge color="bg-mint">Done</Badge>}
                      <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setEditing(c)}>Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
