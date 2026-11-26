"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS, type ContentItem } from "@/lib/types";
import { formatDate, statusColor } from "@/lib/utils";
import ContentForm, { blankContent } from "@/components/ContentForm";
import { Button, Empty, PageHeader, Select, StatusBadge } from "@/components/ui";

const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarPage() {
  const { posts } = useStore();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [ym, setYm] = useState({ y: 2026, m: 10 }); // m is 0-based; replaced by the current month on mount
  // Today is only known in the browser, so the current month is set after mount (never during prerender).
  useEffect(() => {
    const d = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- today's date is only known in the browser
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }, []);
  const [platform, setPlatform] = useState("All");
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const filtered = posts.filter((c) => platform === "All" || c.platform === platform);
  const first = new Date(ym.y, ym.m, 1);
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // week starts Monday
  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (d: number) => setYm((p) => { const t = new Date(p.y, p.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });

  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <>
      <PageHeader
        title="Content Calendar"
        subtitle="See what is going out and when."
        action={<Button onClick={() => setEditing(blankContent(`${ym.y}-${pad(ym.m + 1)}-01`))}>+ Add content</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-white p-1 text-sm shadow-soft">
          {(["calendar", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`min-h-10 rounded-full px-4 py-1 capitalize ${view === v ? "bg-baby font-medium text-navy" : "text-muted"}`}>
              {v}
            </button>
          ))}
        </div>
        <div className="w-40">
          <Select aria-label="Platform filter" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option>All</option>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        {view === "calendar" && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</Button>
            <span className="w-36 text-center font-serif text-lg">{monthLabel}</span>
            <Button variant="ghost" onClick={() => shift(1)} aria-label="Next month">›</Button>
          </div>
        )}
      </div>

      {view === "calendar" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-1 text-xs uppercase tracking-wider text-muted">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const date = `${ym.y}-${pad(ym.m + 1)}-${pad(day)}`;
              const items = filtered.filter((c) => c.date === date);
              return (
                <div key={i} className="min-h-24 rounded-2xl bg-white p-1.5 shadow-soft ring-1 ring-navy/[0.07]">
                  <p className="mb-1 text-xs text-muted">{day}</p>
                  {items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setEditing(c.content)}
                      className={`mb-1 block w-full truncate rounded-lg px-1.5 py-0.5 text-left text-xs ring-1 ring-navy/10 ${statusColor[c.status]}`}
                      title={`${c.title} (${c.platform}, ${c.status})`}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <Empty text="No content matches." />}
          {[...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((c) => (
            <button key={c.id} onClick={() => setEditing(c.content)} className="lift flex w-full items-center justify-between gap-3 rounded-[20px] bg-white p-4 text-left shadow-soft ring-1 ring-navy/[0.07]">
              <span>
                <b>{formatDate(c.date)}</b> · {c.title}
                <span className="block text-xs text-muted">{c.platform} · {c.pillar}</span>
              </span>
              <StatusBadge status={c.status} />
            </button>
          ))}
        </div>
      )}
      {editing && <ContentForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
