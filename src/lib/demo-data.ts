import type { Asset, ContentItem } from "./types";

// DEMO DATA - sample content for preview only. Edit or delete freely.
const m = (reach: number, impressions: number, likes: number, comments: number, shares: number, saves: number, clicks: number) => ({
  reach, impressions, likes, comments, shares, saves, clicks,
});

export const DEMO_CONTENT: ContentItem[] = [
  { id: "c1", title: "Wooden stacking toys: 3 ways to play", caption: "Demo caption: simple play ideas for toddlers.", platform: "Instagram", pillar: "Product Finds", status: "Posted", date: "2026-11-03", assetUrl: "", notes: "", postUrl: "", metrics: m(4200, 5600, 310, 42, 55, 120, 88) },
  { id: "c2", title: "Behind the scenes: packing orders", caption: "Demo caption: a peek at our packing table.", platform: "Threads", pillar: "Behind the Scenes", status: "Posted", date: "2026-11-10", assetUrl: "", notes: "", postUrl: "", metrics: m(9800, 12400, 760, 95, 140, 210, 150) },
  { id: "c3", title: "Gift guide: under RM50", caption: "Demo caption: budget-friendly gift ideas.", platform: "Instagram", pillar: "Promo", status: "Posted", date: "2026-11-17", assetUrl: "", notes: "", postUrl: "", metrics: m(5100, 6300, 280, 31, 70, 165, 210) },
  { id: "c4", title: "Weekend parenting tip: screen-free play", caption: "Demo caption: 5 screen-free activities.", platform: "Threads", pillar: "Parenting Tips", status: "Scheduled", date: "2026-11-27", assetUrl: "", notes: "Add link in comments", postUrl: "", metrics: null },
  { id: "c5", title: "Year-end sale teaser", caption: "Demo caption: something sweet is coming.", platform: "Instagram", pillar: "Promo", status: "Ready", date: "2026-11-29", assetUrl: "", notes: "", postUrl: "", metrics: null },
  { id: "c6", title: "Customer story: Mei's reading corner", caption: "", platform: "Instagram", pillar: "Community", status: "Drafting", date: "2026-12-02", assetUrl: "", notes: "Waiting for photo permission", postUrl: "", metrics: null },
  { id: "c7", title: "Unboxing new puzzle range", caption: "", platform: "Threads", pillar: "Product Finds", status: "Idea", date: "2026-12-05", assetUrl: "", notes: "", postUrl: "", metrics: null },
  { id: "c8", title: "Holiday shipping deadlines", caption: "", platform: "Threads", pillar: "Community", status: "Idea", date: "2026-12-09", assetUrl: "", notes: "", postUrl: "", metrics: null },
];

export const DEMO_ASSETS: Asset[] = [
  { id: "a1", name: "Demo: Product photos folder", type: "Photo", url: "https://example.com/product-photos", tags: "products, demo" },
  { id: "a2", name: "Demo: Brand logo pack", type: "Design", url: "https://example.com/logo-pack", tags: "brand" },
  { id: "a3", name: "Demo: Packing reel raw clips", type: "Video", url: "https://example.com/packing-clips", tags: "reel, bts" },
  { id: "a4", name: "Demo: Caption swipe file", type: "Document", url: "https://example.com/captions", tags: "copy" },
];
