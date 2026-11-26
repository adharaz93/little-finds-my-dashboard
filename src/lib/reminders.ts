import type { ContentItem, Platform, Publication } from "./types";
import { isValidDate } from "./capture";
import { addDays, daysBetween } from "./analytics";
import { dayN } from "./history";

// Performance reminders (P1d Task 4). Pure: worked out from existing data on every call, nothing is
// stored. Day 0 is the published date; all dates are local YYYY-MM-DD calendar dates.
//
// Each Posted publication on non-demo content is in at most one checkpoint window at a time.
// A checkpoint is done when a capture that isn't removed has a known date on or after it.
// Undated captures and captures dated before publishing never complete a checkpoint.

export const CHECKPOINTS = [
  { day: 1, from: 1, to: 6 },
  { day: 7, from: 7, to: 29 },
  { day: 30, from: 30, to: 44 },
] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number]["day"]; // 1 | 7 | 30

export type DueReminder = {
  contentId: string;
  publicationId: string;
  title: string;
  platform: Platform;
  checkpoint: Checkpoint; // which numbers are due
  age: number; // days since publishing, as of `today`
  dueOn: string; // publishedDate + checkpoint
  lastCapturedOn: string | null; // newest dated capture that isn't removed, for context
};
export type MissingDate = { contentId: string; publicationId: string; title: string; platform: Platform };
export type ReminderSummary = { due: DueReminder[]; missingPublishedDate: MissingDate[] };

// The checkpoint whose window contains this age, or null (publish day, future dates, day 45+).
export function checkpointFor(age: number): Checkpoint | null {
  return CHECKPOINTS.find((c) => age >= c.from && age <= c.to)?.day ?? null;
}

// Dated captures that count: not removed, with a valid date.
const datedCaptures = (p: Publication) => p.snapshots.filter((s) => !s.deleted && isValidDate(s.capturedOn));

// True when a counted capture is on or after the checkpoint day.
export function checkpointDone(p: Publication, checkpoint: Checkpoint): boolean {
  return datedCaptures(p).some((s) => (dayN(s.capturedOn, p.publishedDate) ?? -1) >= checkpoint);
}

export function dueCheckpoints(content: readonly ContentItem[], today: string): ReminderSummary {
  const due: DueReminder[] = [];
  const missingPublishedDate: MissingDate[] = [];
  if (!isValidDate(today)) return { due, missingPublishedDate };

  for (const item of content) {
    if (item.isDemo === true) continue;
    for (const p of item.publications) {
      if (p.status !== "Posted") continue;
      const base = { contentId: item.id, publicationId: p.id, title: item.title, platform: p.platform };
      if (!isValidDate(p.publishedDate)) {
        missingPublishedDate.push(base);
        continue;
      }
      const age = daysBetween(p.publishedDate, today);
      const checkpoint = checkpointFor(age);
      if (checkpoint == null || checkpointDone(p, checkpoint)) continue;
      const last = datedCaptures(p).map((s) => s.capturedOn!).sort().at(-1) ?? null;
      due.push({ ...base, checkpoint, age, dueOn: addDays(p.publishedDate, checkpoint), lastCapturedOn: last });
    }
  }

  // Most overdue first, then title, then platform: the same order every time.
  const order = (a: MissingDate, b: MissingDate) => a.title.localeCompare(b.title) || a.platform.localeCompare(b.platform) || a.publicationId.localeCompare(b.publicationId);
  due.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || order(a, b));
  missingPublishedDate.sort(order);
  return { due, missingPublishedDate };
}

/* ---------- display helpers (P1d Task 5; the rules above are unchanged) ---------- */

export const EMPTY_REMINDERS: ReminderSummary = { due: [], missingPublishedDate: [] };

export const reminderLabel = (checkpoint: Checkpoint) => `Day ${checkpoint} numbers due`;

// Key for one publication. Content id + publication id, because older data can repeat a
// publication id across different content items.
export const reminderKey = (contentId: string, publicationId: string) => `${contentId}\u0000${publicationId}`;

// Due reminders by publication, for badges and for de-duplicating task counts.
export function indexReminders(summary: ReminderSummary): Map<string, DueReminder> {
  return new Map(summary.due.map((r) => [reminderKey(r.contentId, r.publicationId), r]));
}
