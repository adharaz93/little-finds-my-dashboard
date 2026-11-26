"use client";
import { useState } from "react";
import type { Metrics, Platform } from "@/lib/types";
import {
  METRIC_ORDER, OPTIONAL_METRICS, localToday, metricLabel, parseMetricDraft, toMetricDraft,
  type MetricDraft, type MetricKey,
} from "@/lib/capture";
import { captureDateError } from "@/lib/history";
import { engagementRate, formatDate, hasRate, pct } from "@/lib/utils";
import { Button, Field, Input } from "./ui";

export type CaptureValues = { metrics: Metrics; capturedOn: string; note: string };

// The numbers form, used to add a capture and to edit one. Validation is P1a's: nothing is
// saved until every field is valid, required numbers can't be blank, and blank optional numbers
// mean "not reported". The date can't be in the future or before the post was published.
export default function CaptureForm({
  platform, publishedDate, initial = null, initialDate, initialNote = "", dateRequired = true, latest = null,
  isDuplicate, submitLabel, onSubmit, onCancel,
}: {
  platform: Platform;
  publishedDate: string;
  initial?: Metrics | null;
  initialDate: string;
  initialNote?: string;
  dateRequired?: boolean; // false only when editing a capture whose date was never known
  latest?: Metrics | null; // offered as "Copy latest numbers" on a blank form
  isDuplicate?: (capturedOn: string, metrics: Metrics) => boolean;
  submitLabel: string;
  onSubmit: (v: CaptureValues) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<MetricDraft>(toMetricDraft(initial));
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(initialNote);
  // Messages appear after the first Save attempt, then update as the user types.
  const [tried, setTried] = useState(false);
  const today = localToday();
  const parsed = parseMetricDraft(d);
  const errors = parsed.ok ? {} : parsed.errors;
  const dateError = captureDateError(date, publishedDate, today, dateRequired);
  const optional = (k: MetricKey) => OPTIONAL_METRICS.includes(k);
  const duplicate = parsed.ok && date && !dateError && isDuplicate?.(date, parsed.metrics);

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed.ok || dateError) {
          setTried(true);
          return;
        }
        onSubmit({ metrics: parsed.metrics, capturedOn: date, note: note.trim() });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          <Field label={dateRequired ? "Numbers as of" : "Numbers as of (optional)"}>
            <Input
              type="date"
              value={date}
              max={today}
              min={/^\d{4}-\d{2}-\d{2}$/.test(publishedDate) ? publishedDate : undefined}
              aria-invalid={tried && dateError ? true : undefined}
              aria-describedby={tried && dateError ? "capture-date-err" : undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {tried && dateError && <p id="capture-date-err" className="mt-1 text-xs text-[#8a3a45]">{dateError}</p>}
        </div>
        <Field label="Note (optional)">
          <Input placeholder="e.g. IG Insights" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {latest && !initial && (
        <button type="button" className="link inline-flex min-h-11 items-center text-xs text-muted" onClick={() => setD(toMetricDraft(latest))}>
          Copy latest numbers
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        {METRIC_ORDER.map((k) => {
          const err = tried ? errors[k] : undefined;
          return (
            <div key={k}>
              <Field label={optional(k) ? `${metricLabel(k, platform)} (optional)` : metricLabel(k, platform)}>
                {/* Text, not type=number: a number field silently empties "1,200". */}
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={optional(k) ? "Not reported" : undefined}
                  value={d[k]}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `metric-err-${k}` : undefined}
                  onChange={(e) => setD({ ...d, [k]: e.target.value })}
                />
              </Field>
              {err && <p id={`metric-err-${k}`} className="mt-1 text-xs text-[#8a3a45]">{err}</p>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Reach, likes, comments and shares are required (enter 0 if none). Leave optional numbers blank if the platform doesn&apos;t report them.</p>
      <p className="text-sm">Engagement rate: <b>{parsed.ok && hasRate(parsed.metrics) ? pct(engagementRate(parsed.metrics)) : "–"}</b></p>
      {duplicate && (
        <p role="status" className="rounded-xl bg-peach px-3 py-2 text-xs">You already have these numbers for {formatDate(date)}. You can still save if this is a new reading.</p>
      )}
      {tried && (!parsed.ok || dateError) && <p role="alert" className="text-sm text-[#8a3a45]">Fix the highlighted fields to save.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
