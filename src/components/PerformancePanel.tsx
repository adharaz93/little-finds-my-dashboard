"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { MetricSnapshot, MetricSource, Metrics, Platform, Publication } from "@/lib/types";
import { METRIC_ORDER, localToday, metricLabel, type MetricKey } from "@/lib/capture";
import { addCapture, editCapture, ensureSnapshotIds, latestSnapshot, removeCapture, restoreCapture } from "@/lib/snapshots";
import { dayN, dayNLabel, displayOrder, editDiffs, findDuplicate, type HistoryEntry } from "@/lib/history";
import { engagementRate, formatDate, hasRate, num, pct } from "@/lib/utils";
import CaptureForm, { type CaptureValues } from "./CaptureForm";
import CaptureTimeline from "./CaptureTimeline";
import { Badge, Button, Modal, PlatformBadge, StatusBadge } from "./ui";

// Where a set of numbers came from, as a badge. Shared with Analytics.
export const SOURCE_BADGE: Record<MetricSource, { t: string; c: string }> = {
  demo: { t: "Demo", c: "bg-peach" },
  manual: { t: "Entered by hand", c: "bg-mint" },
  synced: { t: "Synced", c: "bg-baby" },
};

const RECENT = 5; // captures shown before "Show all"
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const enteredOn = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const value = (n: number | null | undefined) => (n == null ? "Not reported" : num(n));
const captureName = (s: MetricSnapshot) => (s.capturedOn ? formatDate(s.capturedOn) : `date unknown (entered ${enteredOn(s.at)})`);

// One publication's performance: latest numbers, add a capture, and its history (newest first),
// with edit, remove (soft) and restore. Every action is one P1b operation and one save.
export default function PerformancePanel({ contentId, publicationId, onClose }: { contentId: string; publicationId: string; onClose: () => void }) {
  const { content, savePublication } = useStore();
  const item = content.find((c) => c.id === contentId);
  const pub = item?.publications.find((p) => p.id === publicationId);
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "add" } | { kind: "edit"; index: number }>({ kind: "list" });
  const [showAll, setShowAll] = useState(false);
  const [announce, setAnnounce] = useState("");

  if (!item || !pub) {
    return (
      <Modal title="Performance" onClose={onClose}>
        <p className="text-sm text-muted">This post no longer exists.</p>
      </Modal>
    );
  }

  const save = (p: Publication, message: string) => {
    savePublication(item.id, p);
    setAnnounce(message);
    setMode({ kind: "list" });
  };
  // Snapshots saved before P1b have no id; they get one in the same save as the action.
  const withIds = () => ensureSnapshotIds(pub);
  const source: MetricSource = item.isDemo ? "demo" : "manual";

  const add = (v: CaptureValues) => save(addCapture(pub, { metrics: v.metrics, source, capturedOn: v.capturedOn, ...(v.note ? { note: v.note } : {}) }), "Capture added.");
  const edit = (index: number, v: CaptureValues) => {
    const base = withIds();
    save(editCapture(base, base.snapshots[index].id!, { metrics: v.metrics, capturedOn: v.capturedOn || undefined, note: v.note }), "Capture updated.");
  };
  const remove = (e: HistoryEntry) => {
    if (!confirm(`Remove the capture from ${captureName(e.snap)}? You can restore it later from "Removed".`)) return;
    const base = withIds();
    save(removeCapture(base, base.snapshots[e.index].id!), "Capture removed. You can restore it from Removed.");
  };
  const restore = (e: HistoryEntry) => {
    const base = withIds();
    save(restoreCapture(base, base.snapshots[e.index].id!), "Capture restored.");
  };

  const order = displayOrder(pub.snapshots);
  const latest = latestSnapshot(pub.snapshots);
  const dated = showAll ? order.dated : order.dated.slice(0, RECENT);
  const editing = mode.kind === "edit" ? pub.snapshots[mode.index] : null;
  const history = order.dated.length + order.undated.length + order.removed.length;
  const beforeHistory = pub.metrics && pub.snapshots.length === 0;

  return (
    <Modal title="Performance" onClose={onClose} size="wide">
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <p className="font-medium">{item.title}</p>
      <p className="mb-3 mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <PlatformBadge>{pub.platform}</PlatformBadge>
        <StatusBadge status={pub.status} />
        {pub.format && <Badge>{pub.format}</Badge>}
        <span>{pub.publishedDate ? `Published ${formatDate(pub.publishedDate)}` : "No published date"}</span>
      </p>
      {item.isDemo && (
        <p className="mb-3 rounded-xl bg-peach px-3 py-2 text-xs">This is a demo sample. Its numbers only appear in the demo preview, never as your account&apos;s performance.</p>
      )}

      {/* Latest numbers */}
      <section aria-label="Latest numbers" className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
        {pub.metrics ? (
          <>
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                Latest
                {latest ? ` · ${latest.capturedOn ? `${formatDate(latest.capturedOn)} · ${dayNLabel(dayN(latest.capturedOn, pub.publishedDate))}` : "date unknown"}` : " · recorded before history was kept"}
              </span>
              {pub.metricsSource && <Badge color={SOURCE_BADGE[pub.metricsSource].c}>{SOURCE_BADGE[pub.metricsSource].t}</Badge>}
            </p>
            <MetricGrid m={pub.metrics} platform={pub.platform} />
          </>
        ) : (
          <p className="text-sm text-muted">No numbers yet.</p>
        )}
        {beforeHistory && <p className="mt-2 text-xs text-muted">These numbers were recorded before history was kept. They&apos;ll be saved to history with your next capture.</p>}
      </section>

      <CaptureTimeline pub={pub} />

      {mode.kind === "add" ? (
        <section aria-label="Add capture" className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
          <h3 className="mb-2 font-serif text-lg">Add capture</h3>
          <CaptureForm
            platform={pub.platform}
            publishedDate={pub.publishedDate}
            initialDate={localToday()}
            latest={pub.metrics}
            isDuplicate={(d, m) => !!findDuplicate(pub.snapshots, d, m)}
            submitLabel="Save capture"
            onSubmit={add}
            onCancel={() => setMode({ kind: "list" })}
          />
        </section>
      ) : mode.kind === "list" ? (
        <Button className="mb-4" onClick={() => setMode({ kind: "add" })}>+ Add capture</Button>
      ) : null}

      {editing && mode.kind === "edit" && (
        <section aria-label="Edit capture" className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
          <h3 className="font-serif text-lg">Edit capture</h3>
          <p className="mb-2 text-xs text-muted">Entered {when(editing.at)} · {SOURCE_BADGE[editing.source].t}. Changed numbers are kept in its edit history.</p>
          <CaptureForm
            platform={pub.platform}
            publishedDate={pub.publishedDate}
            initial={editing.metrics}
            initialDate={editing.capturedOn ?? ""}
            initialNote={editing.note ?? ""}
            dateRequired={!!editing.capturedOn}
            isDuplicate={(d, m) => !!findDuplicate(pub.snapshots, d, m, mode.index)}
            submitLabel="Save changes"
            onSubmit={(v) => edit(mode.index, v)}
            onCancel={() => setMode({ kind: "list" })}
          />
        </section>
      )}

      <h3 className="mb-2 font-serif text-xl">History <span className="text-base text-muted">({order.dated.length + order.undated.length})</span></h3>
      {history === 0 && <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm text-muted ring-1 ring-navy/[0.07]">No captures yet. Add the first one after the post goes live.</p>}
      <ol className="space-y-2">
        {dated.map((e) => (
          <CaptureCard key={e.key} e={e} pub={pub} onEdit={() => setMode({ kind: "edit", index: e.index })} onRemove={() => remove(e)} />
        ))}
      </ol>
      {order.dated.length > RECENT && (
        <button className="link mt-2 inline-flex min-h-11 items-center text-sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show recent only" : `Show all (${order.dated.length})`}
        </button>
      )}

      {order.undated.length > 0 && (
        <details className="mt-3 rounded-2xl bg-white/60 p-3 ring-1 ring-navy/[0.07]">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Date unknown ({order.undated.length})</summary>
          <p className="mb-2 text-xs text-muted">Saved before capture dates were recorded. Edit one to add its date.</p>
          <ol className="space-y-2">
            {order.undated.map((e) => (
              <CaptureCard key={e.key} e={e} pub={pub} onEdit={() => setMode({ kind: "edit", index: e.index })} onRemove={() => remove(e)} />
            ))}
          </ol>
        </details>
      )}

      {order.removed.length > 0 && (
        <details className="mt-3 rounded-2xl bg-white/60 p-3 ring-1 ring-navy/[0.07]">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Removed ({order.removed.length})</summary>
          <p className="mb-2 text-xs text-muted">Removed captures don&apos;t count towards current numbers. Restore one to bring it back.</p>
          <ol className="space-y-2">
            {order.removed.map((e) => (
              <CaptureCard key={e.key} e={e} pub={pub} removed onRestore={() => restore(e)} />
            ))}
          </ol>
        </details>
      )}
    </Modal>
  );
}

function MetricGrid({ m, platform }: { m: Metrics; platform: Platform }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
      {METRIC_ORDER.map((k) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted">{metricLabel(k, platform)}</dt>
          <dd className={`tabular-nums ${m[k] == null ? "text-xs text-muted" : "font-medium"}`}>{value(m[k])}</dd>
        </div>
      ))}
      <div className="min-w-0">
        <dt className="text-xs text-muted">Engagement rate</dt>
        <dd className={`tabular-nums ${hasRate(m) ? "font-medium" : "text-xs text-muted"}`}>{hasRate(m) ? pct(engagementRate(m)) : "No reach"}</dd>
      </div>
    </dl>
  );
}

function CaptureCard({ e, pub, removed = false, onEdit, onRemove, onRestore }: {
  e: HistoryEntry; pub: Publication; removed?: boolean; onEdit?: () => void; onRemove?: () => void; onRestore?: () => void;
}) {
  const s = e.snap;
  const diffs = editDiffs(s);
  const name = captureName(s);
  return (
    <li className={`rounded-2xl p-3 ring-1 ${removed ? "bg-cream/60 text-navy/70 ring-navy/10" : "bg-white ring-navy/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <b className="font-semibold">{s.capturedOn ? formatDate(s.capturedOn) : "Date unknown"}</b>
          <span className="text-muted"> · {dayNLabel(dayN(s.capturedOn, pub.publishedDate))}</span>
          {!s.capturedOn && <span className="text-xs text-muted"> · entered {enteredOn(s.at)}</span>}
        </p>
        <span className="flex flex-wrap gap-1">
          {removed && <Badge color="bg-white">Removed</Badge>}
          <Badge color={SOURCE_BADGE[s.source].c}>{SOURCE_BADGE[s.source].t}</Badge>
        </span>
      </div>
      <MetricGrid m={s.metrics} platform={pub.platform} />
      {s.note && <p className="mt-2 text-xs"><span className="text-muted">Note:</span> {s.note}</p>}
      {diffs.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted">Edited {diffs.length}×</summary>
          <ul className="mt-1 space-y-1">
            {diffs.map((d, i) => (
              <li key={i}>
                <span className="text-muted">{when(d.at)}:</span>{" "}
                {d.changes.length === 0
                  ? "no number changes"
                  : d.changes.map((c) => `${metricLabel(c.key as MetricKey, pub.platform)} ${value(c.from)} → ${value(c.to)}`).join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {removed ? (
          <Button variant="ghost" size="sm" onClick={onRestore} aria-label={`Restore capture from ${name}`}>Restore</Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit capture from ${name}, ${pub.platform}`}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove capture from ${name}, ${pub.platform}`}>Remove</Button>
          </>
        )}
      </div>
    </li>
  );
}
