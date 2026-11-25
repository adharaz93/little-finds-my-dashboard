export const STATUSES = ["Idea", "Drafting", "Ready", "Scheduled", "Posted"] as const;
export type Status = (typeof STATUSES)[number];

export const PLATFORMS = ["Instagram", "Threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PILLARS = ["Product Finds", "Behind the Scenes", "Parenting Tips", "Promo", "Community"] as const;

export type Metrics = {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
};

export type ContentItem = {
  id: string;
  title: string;
  caption: string;
  platform: Platform;
  pillar: string;
  status: Status;
  date: string; // YYYY-MM-DD
  assetUrl: string;
  notes: string;
  postUrl: string;
  metrics: Metrics | null;
};

export const ASSET_TYPES = ["Photo", "Video", "Design", "Document"] as const;
export type Asset = {
  id: string;
  name: string;
  type: (typeof ASSET_TYPES)[number];
  url: string;
  tags: string;
};
