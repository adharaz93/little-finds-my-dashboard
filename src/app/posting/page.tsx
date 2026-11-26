"use client";
import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { ContentItem, Status } from "@/lib/types";
import type { Post } from "@/lib/posts";
import { resolvePublishedDate } from "@/lib/capture";
import { formatDate, statusColor } from "@/lib/utils";
import ContentForm from "@/components/ContentForm";
import PerformancePanel from "@/components/PerformancePanel";
import { Button, Empty, PageHeader, PlatformBadge, StatusBadge } from "@/components/ui";

const COLUMNS = [
  { status: "Ready", tone: "bg-mint/50", hint: "Approved and waiting for a date" },
  { status: "Scheduled", tone: "bg-pink/50", hint: "Date set, to be posted by you" },
  { status: "Posted", tone: "bg-posted/50", hint: "Published manually" },
] as const;

export default function PostingPage() {
  const { posts, savePublication } = useStore();
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [perf, setPerf] = useState<Post | null>(null);
  // On phones and tablets one column shows at a time; from lg up all three show.
  const [tab, setTab] = useState<(typeof COLUMNS)[number]["status"]>("Ready");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Moves only this platform's post; the same content on other platforms keeps its own status.
  const move = (c: Post, status: Status) =>
    savePublication(c.contentId, {
      ...c.publication,
      status,
      publishedDate: status === "Posted" ? resolvePublishedDate(c.publication) : status === "Ready" ? "" : c.publication.publishedDate,
    });
  const count = (s: string) => posts.filter((c) => c.status === s).length;

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + COLUMNS.length) % COLUMNS.length;
    setTab(COLUMNS[n].status);
    tabs.current[n]?.focus();
  };

  return (
    <>
      <PageHeader
        title="Posting Manager"
        subtitle="Posting is manual: copy the caption, post it on the platform, then mark it posted here."
      />

      <div role="tablist" aria-label="Posting stage" className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-white p-1 ring-1 ring-navy/[0.07] lg:hidden">
        {COLUMNS.map((col, i) => (
          <button
            key={col.status}
            ref={(el) => { tabs.current[i] = el; }}
            role="tab"
            id={`tab-${col.status}`}
            aria-selected={tab === col.status}
            aria-controls={`panel-${col.status}`}
            tabIndex={tab === col.status ? 0 : -1}
            onClick={() => setTab(col.status)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`flex min-h-12 flex-col items-center justify-center rounded-full px-1 text-sm transition-colors sm:flex-row sm:gap-2 ${
              tab === col.status ? `${statusColor[col.status]} font-medium text-navy ring-1 ring-navy/15` : "text-muted"
            }`}
          >
            <span>{col.status}</span>
            <span className="text-xs tabular-nums">({count(col.status)})</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = posts.filter((c) => c.status === col.status).sort((a, b) => a.date.localeCompare(b.date));
          return (
            <section
              key={col.status}
              id={`panel-${col.status}`}
              role="tabpanel"
              aria-labelledby={`tab-${col.status}`}
              className={`rounded-[20px] p-4 ${col.tone} ${tab === col.status ? "block" : "hidden"} lg:block`}
            >
              <h2 className="hidden font-serif text-2xl lg:block">{col.status} <span className="text-base text-muted">({items.length})</span></h2>
              <p className="mb-3 text-xs text-muted lg:mt-0">{col.hint}</p>
              <div className="space-y-3">
                {items.length === 0 && <Empty text="Empty" />}
                {items.map((c) => (
                  <div key={c.id} className="rounded-2xl bg-white p-4 text-sm shadow-soft ring-1 ring-navy/[0.07]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{c.title}</p>
                      {c.status === "Posted" && <StatusBadge status="Posted" />}
                    </div>
                    <p className="mb-2 mt-1 flex items-center gap-2 text-xs text-muted">{formatDate(c.date)} <PlatformBadge>{c.platform}</PlatformBadge></p>
                    {c.postUrl && <a href={c.postUrl} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 items-center text-xs sm:min-h-0">View post</a>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.caption && (
                        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(c.caption)}>
                          Copy caption
                        </Button>
                      )}
                      {c.status === "Ready" && <Button size="sm" onClick={() => move(c, "Scheduled")}>Mark scheduled</Button>}
                      {c.status === "Scheduled" && (
                        <>
                          <Button size="sm" onClick={() => move(c, "Posted")}>Mark posted</Button>
                          <Button variant="ghost" size="sm" onClick={() => move(c, "Ready")}>Unschedule</Button>
                        </>
                      )}
                      {(c.status === "Posted" || c.metrics) && (
                        <Button variant="ghost" size="sm" onClick={() => setPerf(c)} aria-label={`Performance for ${c.title}, ${c.platform}`}>Performance</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c.content)}>Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
      {perf && <PerformancePanel contentId={perf.contentId} publicationId={perf.id} onClose={() => setPerf(null)} />}
    </>
  );
}
