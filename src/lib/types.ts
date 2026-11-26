export const STATUSES = ["Idea", "Drafting", "Ready", "Scheduled", "Posted"] as const;
export type Status = (typeof STATUSES)[number];

export const PLATFORMS = ["Instagram", "TikTok", "Threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PILLARS = ["Product Finds", "Behind the Scenes", "Parenting Tips", "Promo", "Community"] as const;

// Where a set of numbers came from. Only "manual" and "synced" are real account performance.
export type MetricSource = "demo" | "manual" | "synced";

// Reach is "views" on TikTok. Null means the platform does not report that number.
export type Metrics = {
  reach: number;
  impressions: number | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  clicks?: number;
};

// A dated copy of a publication's numbers, so trends can use history once syncing exists.
export type MetricSnapshot = { at: string; source: MetricSource; metrics: Metrics };

// One platform's copy of a piece of content.
export type Publication = {
  id: string;
  platform: Platform;
  caption: string;
  status: Status;
  scheduledDate: string; // YYYY-MM-DD
  publishedDate: string; // YYYY-MM-DD, "" until posted
  postUrl: string;
  postId: string; // the platform's own id, needed for syncing
  metrics: Metrics | null;
  metricsSource: MetricSource | null;
  lastSyncedAt: string | null; // ISO timestamp of the last successful sync
  snapshots: MetricSnapshot[];
};

// The parent: the idea shared by every platform it goes out on.
export type ContentItem = {
  id: string;
  title: string;
  pillar: string;
  idea: string;
  assetUrl: string;
  notes: string;
  publications: Publication[];
  // True for the bundled sample items. Their numbers only ever appear in the demo preview.
  isDemo?: boolean;
};

export const ASSET_TYPES = ["Photo", "Video", "Design", "Document"] as const;
export type Asset = {
  id: string;
  name: string;
  type: (typeof ASSET_TYPES)[number];
  url: string;
  tags: string;
};

// The shape stored under lfm-studio-v1, kept so old records can be migrated.
export type LegacyContentItem = {
  id: string;
  title: string;
  caption: string;
  platform: string;
  pillar: string;
  status: Status;
  date: string;
  assetUrl: string;
  notes: string;
  postUrl: string;
  metrics: { reach: number; impressions: number; likes: number; comments: number; shares: number; saves: number; clicks: number } | null;
};
