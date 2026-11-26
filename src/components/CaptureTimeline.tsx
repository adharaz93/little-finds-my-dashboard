"use client";
import { useEffect, useRef, useState } from "react";
import type { Platform, Publication } from "@/lib/types";
import { timelinePoints, type TimelinePoint } from "@/lib/history";
import { metricLabel } from "@/lib/capture";
import { formatDate, num, pct, platformColor } from "@/lib/utils";

// How one post's numbers changed across its captures (P4). Two small single-series charts on a
// shared Day N axis: reach and engagement rate have different scales, so they never share an axis.
// The History list below is the table view of the same numbers.
export default function CaptureTimeline({ pub }: { pub: Publication }) {
  const points = timelinePoints(pub);
  if (points.length < 2) {
    return (
      <p className="mb-3 rounded-2xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-navy/10">
        {pub.publishedDate ? "Not enough history yet: the timeline appears once there are 2 dated captures." : "Add a published date to see this post's timeline."}
      </p>
    );
  }
  const minDay = points[0].day;
  const maxDay = points[points.length - 1].day;
  return (
    <section aria-label="Timeline" className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
      <p className="mb-1 text-xs text-muted">Timeline · Day {minDay} to Day {maxDay} after publishing</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Mini title={metricLabel("reach", pub.platform)} points={points} pick={(p) => p.reach} fmt={(v) => num(v)} platform={pub.platform} minDay={minDay} maxDay={maxDay} />
        <Mini title="Engagement rate" points={points} pick={(p) => p.rate} fmt={(v) => pct(v)} platform={pub.platform} minDay={minDay} maxDay={maxDay} />
      </div>
    </section>
  );
}

function Mini({ title, points, pick, fmt, platform, minDay, maxDay }: {
  title: string; points: TimelinePoint[]; pick: (p: TimelinePoint) => number | null; fmt: (v: number) => string;
  platform: Platform; minDay: number; maxDay: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(260);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const H = 84;
  const m = { l: 6, r: 6, t: 6, b: 18 };
  const iw = w - m.l - m.r;
  const ih = H - m.t - m.b;
  const values = points.map(pick);
  const known = values.filter((v): v is number => v != null);
  const max = Math.max(...known, 0) || 1;
  const top = max * 1.1; // headroom so the highest point isn't clipped
  const x = (day: number) => m.l + (maxDay === minDay ? iw / 2 : ((day - minDay) / (maxDay - minDay)) * iw);
  const y = (v: number) => m.t + ih - (v / top) * ih;
  // Unknown values (no reach → no rate) break the line instead of dropping to 0.
  const segments: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    const v = values[i];
    if (v == null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(p.day).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const color = platformColor[platform];
  const shown = active == null ? null : { p: points[active], v: values[active] };

  return (
    <div ref={box} className="min-w-0">
      {/* Title row carries the readout: the hovered or focused point, otherwise the maximum. */}
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span role="status" className={`tabular-nums ${shown ? "rounded-md bg-navy px-1.5 text-cream" : "text-muted"}`}>
          {shown ? `Day ${shown.p.day} · ${formatDate(shown.p.date)} · ${shown.v == null ? "not known" : fmt(shown.v)}` : `max ${fmt(max)}`}
        </span>
      </p>
      <svg width={w} height={H} role="img" aria-label={`${title} by day: ${points.map((p, i) => `Day ${p.day} ${values[i] == null ? "unknown" : fmt(values[i]!)}`).join(", ")}`}>
        {/* recessive zero baseline */}
        <line x1={m.l} x2={w - m.r} y1={m.t + ih} y2={m.t + ih} stroke="currentColor" strokeOpacity={0.15} />
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {points.map((p, i) =>
          values[i] == null ? null : (
            <circle key={`m${i}`} cx={x(p.day)} cy={y(values[i]!)} r={4} fill={color} stroke="#ffffff" strokeWidth={2} />
          ),
        )}
        <text x={m.l} y={H - 4} fontSize="10" fill="currentColor" fillOpacity={0.6}>Day {minDay}</text>
        <text x={w - m.r} y={H - 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.6}>Day {maxDay}</text>
        {/* hit targets larger than the marks; keyboard focus shows the same tooltip */}
        {points.map((p, i) => (
          <circle
            key={`h${i}`} cx={x(p.day)} cy={values[i] == null ? m.t + ih : y(values[i]!)} r={12} fill="transparent"
            tabIndex={0} role="img" aria-label={`Day ${p.day}, ${formatDate(p.date)}: ${values[i] == null ? "not known" : fmt(values[i]!)}`}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            className="outline-none focus-visible:stroke-navy" stroke="transparent" strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}
