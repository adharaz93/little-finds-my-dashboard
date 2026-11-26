import type { ContentItem, MetricSource, Metrics, Platform, Publication, Status } from "./types";

// A flat view of one platform publication plus its parent's fields.
// Calendar, Posting, the Dashboard and Analytics work on these, so each
// platform's status moves on its own.
export type Post = {
  id: string; // publication id
  contentId: string;
  title: string;
  pillar: string;
  platform: Platform;
  status: Status;
  date: string; // the published date once posted, otherwise the scheduled date
  caption: string;
  postUrl: string;
  metrics: Metrics | null;
  metricsSource: MetricSource | null;
  publication: Publication;
  content: ContentItem;
};

export function flattenPosts(content: ContentItem[]): Post[] {
  return content.flatMap((c) =>
    c.publications.map((p) => ({
      id: p.id,
      contentId: c.id,
      title: c.title,
      pillar: c.pillar,
      platform: p.platform,
      status: p.status,
      date: p.status === "Posted" && p.publishedDate ? p.publishedDate : p.scheduledDate,
      caption: p.caption,
      postUrl: p.postUrl,
      metrics: p.metrics,
      metricsSource: p.metricsSource,
      publication: p,
      content: c,
    })),
  );
}

export const isReal = (s: MetricSource | null) => s === "manual" || s === "synced";

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
