"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS, type ContentItem } from "@/lib/types";
import { formatDate, statusColor } from "@/lib/utils";
import { addDays } from "@/lib/analytics";
import { defaultNewDate, postsOn, weekDays, weekLabel, weekStart, weekSummary } from "@/lib/week";
import ContentForm, { blankContent } from "@/components/ContentForm";
import { Badge, Button, Empty, PageHeader, PlatformBadge, Select, StatusBadge } from "@/components/ui";

const pad = (n: number) => String(n).padStart(2, "0");
const VIEWS = ["week", "month", "list"] as const;
type View = (typeof VIEWS)[number];
const dayName = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short" });
};

export default function CalendarPage() {
  const { posts, today } = useStore();
  // Week view opens first: planning happens a week at a time.
  const [view, setView] = useState<View>("week");
  const [ym, setYm] = useState({ y: 2026, m: 10 }); // m is 0-based; replaced by the current month on mount
  // Today is only known in the browser, so the current month is set after mount (never during prerender).
  useEffect(() => {
    const d = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- today's date is only known in the browser
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }, []);
  const [weekOffset, setWeekOffset] = useState(0); // weeks from this week
  const [platform, setPlatform] = useState("All");
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const filtered = posts.filter((c) => platform === "All" || c.platform === platform);
  const addOn = (date: string) => setEditing(blankContent(date));
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
        action={<Button onClick={() => (today ? addOn(defaultNewDate(view, today, ym)) : setEditing(blankContent()))}>+ Add content</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-white p-1 text-sm shadow-soft">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`min-h-10 rounded-full px-4 py-1 capitalize ${view === v ? "bg-baby font-medium text-navy" : "text-muted"}`}>
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
        {view === "month" && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</Button>
            <span className="w-36 text-center font-serif text-lg">{monthLabel}</span>
            <Button variant="ghost" onClick={() => shift(1)} aria-label="Next month">›</Button>
          </div>
        )}
      </div>

      {view === "week" ? (
        today ? (
          <WeekView
            start={addDays(weekStart(today), weekOffset * 7)}
            today={today}
            posts={filtered}
            allPosts={posts}
            onShift={(d) => setWeekOffset((w) => w + d)}
            onThisWeek={() => setWeekOffset(0)}
            isThisWeek={weekOffset === 0}
            onAdd={addOn}
            onOpen={(c) => setEditing(c)}
          />
        ) : (
          <Empty text="Loading this week…" />
        )
      ) : view === "month" ? (
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
                // Clicking an empty part of a day adds content on that date; posts open as before.
                <div
                  key={i}
                  data-date={date}
                  onClick={(e) => { if (e.target === e.currentTarget) addOn(date); }}
                  className={`min-h-24 cursor-pointer rounded-2xl bg-white p-1.5 shadow-soft ring-1 ${date === today ? "ring-2 ring-navy/40" : "ring-navy/[0.07]"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted">{day}</span>
                    <button
                      onClick={() => addOn(date)}
                      aria-label={`Add content on ${formatDate(date)}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-muted hover:bg-baby"
                    >
                      +
                    </button>
                  </div>
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

// Seven day rows, Monday first. The summary counts every platform (not just the filter) so gaps show.
function WeekView({ start, today, posts, allPosts, onShift, onThisWeek, isThisWeek, onAdd, onOpen }: {
  start: string; today: string; posts: ReturnType<typeof postsOn>; allPosts: ReturnType<typeof postsOn>;
  onShift: (d: number) => void; onThisWeek: () => void; isThisWeek: boolean;
  onAdd: (date: string) => void; onOpen: (c: ContentItem) => void;
}) {
  const days = weekDays(start);
  const sum = weekSummary(allPosts, days);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => onShift(-1)} aria-label="Previous week">‹</Button>
        <h2 className="min-w-0 text-center font-serif text-lg sm:text-xl">{weekLabel(start)}</h2>
        <Button variant="ghost" onClick={() => onShift(1)} aria-label="Next week">›</Button>
        {!isThisWeek && <Button variant="ghost" size="sm" onClick={onThisWeek}>This week</Button>}
      </div>
      <p className="mb-3 text-sm text-muted" aria-label="Week summary">
        {sum.total} {sum.total === 1 ? "post" : "posts"} this week
        {PLATFORMS.map((pl) => ` · ${pl} ${sum.byPlatform[pl]}`).join("")}
      </p>
      <div className="space-y-2">
        {days.map((date) => {
          const items = postsOn(posts, date);
          const isToday = date === today;
          return (
            <section
              key={date}
              aria-label={`${dayName(date)} ${formatDate(date)}${isToday ? ", today" : ""}`}
              className={`rounded-[20px] bg-white p-3 shadow-soft ring-1 ${isToday ? "ring-2 ring-navy/40" : "ring-navy/[0.07]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm">
                  <b className="w-9">{dayName(date)}</b>
                  <span className="text-muted">{formatDate(date)}</span>
                  {isToday && <Badge color="bg-mint">Today</Badge>}
                </p>
                <Button variant="ghost" size="sm" onClick={() => onAdd(date)} aria-label={`Add content on ${dayName(date)} ${formatDate(date)}`}>+ Add</Button>
              </div>
              {items.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {items.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => onOpen(c.content)}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left text-sm ring-1 ring-navy/10 ${statusColor[c.status]}`}
                      >
                        <span className="min-w-0 truncate">{c.title}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <PlatformBadge>{c.platform}</PlatformBadge>
                          <StatusBadge status={c.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
