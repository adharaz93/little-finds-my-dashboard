import type { ContentItem } from "./types";
import type { Post } from "./posts";
import { indexReminders, reminderKey, type ReminderSummary } from "./reminders";

// One line of the To-do list (Dashboard) and the Pending tasks list (Insights rail).
export type Task = { n: number; t: string; href: string };

// The task list. Pure, so the counting rules can be tested. Lines with a count of zero are hidden.
// Reminders come from the store (dueCheckpoints); before the browser's date is known they are empty
// and the list is exactly the original one.
export function buildTasks(posts: readonly Post[], content: readonly ContentItem[], reminders: ReminderSummary): Task[] {
  const due = indexReminders(reminders);
  return [
    { n: posts.filter((c) => c.status === "Drafting" && !c.caption).length, t: "drafts need a caption", href: "/bank" },
    { n: posts.filter((c) => c.status === "Ready").length, t: "ready to schedule", href: "/posting" },
    { n: reminders.due.length, t: "posts due for numbers", href: "/posting" },
    // Counted separately: these can't get reminders until they have a published date.
    { n: reminders.missingPublishedDate.length, t: "posted items need a published date", href: "/bank" },
    // A post already counted as due for numbers isn't counted again here.
    { n: posts.filter((c) => c.status === "Posted" && !c.metrics && !due.has(reminderKey(c.contentId, c.id))).length, t: "posts need performance data", href: "/analytics" },
    { n: content.filter((c) => c.publications.some((p) => p.status !== "Idea") && !c.assetUrl).length, t: "items missing an asset link", href: "/bank" },
  ].filter((x) => x.n > 0);
}
