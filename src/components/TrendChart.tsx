"use client";
import { useEffect, useRef, useState } from "react";
import { PLATFORMS, type Platform } from "@/lib/types";
import { daysBetween, type TrendPoint } from "@/lib/analytics";
import { num, platformColor } from "@/lib/utils";

// Multi-series line chart of engagement per period. Every platform is always in the legend;
// a platform only gets a line where it has posts, and periods without a post are gaps, never
// zeros. Hover shows a crosshair and each value; a table view carries the same numbers.
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const series = PLATFORMS.filter((s) => points.some((p) => p.values[s] != null));
  const drawn = series.length > 0 && !table; // the chart box only exists then

  useEffect(() => {
    if (!drawn || !box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [drawn]);

  const missing = PLATFORMS.filter((s) => !series.includes(s));
  const weekly = points.length > 1 && daysBetween(points[0].from, points[1].from) === 7;

  const H = 220;
  const m = { l: 44, r: 76, t: 12, b: 26 };
  const iw = w - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p.values[s] ?? 0)));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = Math.ceil(max / step) * step;
  const x = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / nice) * ih;
  const ticks = [0, nice / 2, nice];
  const xLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);

  // Each series' data points (index + value), skipping periods without a post.
  const dots = Object.fromEntries(
    series.map((s) => [s, points.flatMap((p, i) => (p.values[s] == null ? [] : [{ i, v: p.values[s] as number }]))]),
  ) as Record<Platform, { i: number; v: number }[]>;

  // Labels at each line's last point, nudged at least 13px apart.
  const ends = series
    .map((s) => {
      const last = dots[s][dots[s].length - 1];
      return { s, x: x(last.i), y: y(last.v) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
  const spill = ends.length ? ends[ends.length - 1].y - (m.t + ih) : 0;
  if (spill > 0) ends.forEach((l) => (l.y -= spill));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = points.length < 2 ? 0 : Math.round(((e.clientX - r.left - m.l) / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <div>
      {/* Legend: all three platforms, always; identity never rests on colour alone */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {PLATFORMS.map((s) => {
          const has = series.includes(s);
          return (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={has ? { background: platformColor[s] } : { borderTop: `2px dashed ${platformColor[s]}`, opacity: 0.5 }}
                aria-hidden
              />
              <span className={has ? "text-navy" : ""}>{s}</span>
              {!has && <span>(no data)</span>}
            </span>
          );
        })}
        {series.length > 0 && (
          <button onClick={() => setTable((t) => !t)} className="link ml-auto inline-flex min-h-9 items-center text-xs" aria-pressed={table}>
            {table ? "Show chart" : "Show table"}
          </button>
        )}
      </div>

      {series.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-navy/20 p-6 text-center text-sm text-muted">
          No platform has performance data in this period yet. Lines appear once numbers are entered or synced.
        </p>
      ) : table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 pr-3 font-medium">{weekly ? "Week of" : "Day"}</th>
                {PLATFORMS.map((s) => <th key={s} className="py-1 pr-3 text-right font-medium">{s}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {points.filter((p) => series.some((s) => p.values[s] != null)).map((p) => (
                <tr key={p.from}>
                  <td className="py-1 pr-3">{p.label}</td>
                  {PLATFORMS.map((s) => (
                    <td key={s} className="py-1 pr-3 text-right tabular-nums">{p.values[s] == null ? <span className="text-muted">–</span> : num(p.values[s] as number)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Only periods with at least one post are listed. – no post on that platform.</p>
        </div>
      ) : (
        <div ref={box} className="relative">
          <svg
            width={w}
            height={H}
            role="img"
            aria-label={`Engagement over time for ${series.join(", ")}${missing.length ? `; no data for ${missing.join(", ")}` : ""}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            className="block max-w-full touch-none"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="#26364a" strokeOpacity={t === 0 ? 0.25 : 0.08} />
                <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#5a6573">{num(t)}</text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="#5a6573">
                {points[i]?.label}
              </text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} stroke="#26364a" strokeOpacity={0.3} />}
            {series.map((s) => (
              <g key={s}>
                {dots[s].length > 1 && (
                  <path
                    d={dots[s].map((d, k) => `${k ? "L" : "M"}${x(d.i)},${y(d.v)}`).join(" ")}
                    fill="none" stroke={platformColor[s]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  />
                )}
                {dots[s].map((d) => (
                  <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={hover === d.i ? 5 : 4} fill={platformColor[s]} stroke="#fff" strokeWidth={2} />
                ))}
              </g>
            ))}
            {ends.map((l) => (
              <text key={l.s} x={l.x + 8} y={l.y} dy="0.32em" fontSize="11" fill="#26364a">{l.s}</text>
            ))}
          </svg>
          {hover !== null && points[hover] && (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl bg-white px-3 py-2 text-xs shadow-soft ring-1 ring-navy/10"
              style={{ left: Math.min(x(hover) + 12, w - 176) }}
            >
              <p className="mb-1 font-medium">{weekly ? `Week of ${points[hover].label}` : points[hover].label}</p>
              {PLATFORMS.map((s) => (
                <p key={s} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: platformColor[s] }} aria-hidden />
                    {s}
                  </span>
                  <span className="tabular-nums">{points[hover].values[s] == null ? "No post" : num(points[hover].values[s] as number)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {series.length > 0 && missing.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {missing.join(" and ")} {missing.length === 1 ? "has" : "have"} no performance data in this period, so no line is drawn.
        </p>
      )}
    </div>
  );
}
