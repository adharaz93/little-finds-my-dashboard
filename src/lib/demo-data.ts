import type { Asset, ContentItem, Metrics, Platform, Publication, Status } from "./types";

// DEMO DATA - sample content for preview only. Every number here is marked
// metricsSource "demo" and is never shown as real account performance.

const m = (reach: number, impressions: number | null, likes: number, comments: number, shares: number, saves: number | null): Metrics => ({
  reach, impressions, likes, comments, shares, saves,
});

const code: Record<Platform, string> = { Instagram: "ig", TikTok: "tt", Threads: "th" };

function pub(contentId: string, platform: Platform, status: Status, scheduledDate: string, caption: string, metrics: Metrics | null = null): Publication {
  return {
    id: `${contentId}-${code[platform]}`,
    platform,
    caption,
    status,
    scheduledDate,
    publishedDate: status === "Posted" ? scheduledDate : "",
    postUrl: "",
    postId: "",
    metrics,
    metricsSource: metrics ? "demo" : null,
    lastSyncedAt: null,
    snapshots: [],
  };
}

const DEMO_ITEMS: ContentItem[] = [
  {
    id: "c1", title: "Wooden stacking toys: 3 ways to play", pillar: "Product Finds", idea: "Three simple play ideas with one toy.", assetUrl: "", notes: "",
    publications: [
      pub("c1", "Instagram", "Posted", "2026-11-03", "Demo caption: simple play ideas for toddlers.", m(4200, 5600, 310, 42, 55, 120)),
      pub("c1", "TikTok", "Posted", "2026-11-04", "Demo caption: 3 ways to play, 15 seconds each.", m(11800, null, 640, 58, 96, 210)),
    ],
  },
  {
    id: "c2", title: "Behind the scenes: packing orders", pillar: "Behind the Scenes", idea: "A calm look at the packing table.", assetUrl: "", notes: "",
    publications: [
      pub("c2", "Threads", "Posted", "2026-11-10", "Demo caption: a peek at our packing table.", m(9800, 12400, 760, 95, 140, null)),
      pub("c2", "Instagram", "Posted", "2026-11-11", "Demo caption: packing day, in pictures.", m(3900, 5100, 260, 22, 31, 74)),
    ],
  },
  {
    id: "c3", title: "Gift guide: under RM50", pillar: "Promo", idea: "Budget-friendly gift ideas for the holidays.", assetUrl: "", notes: "",
    publications: [
      pub("c3", "Instagram", "Posted", "2026-11-17", "Demo caption: budget-friendly gift ideas.", m(5100, 6300, 280, 31, 70, 165)),
      pub("c3", "TikTok", "Posted", "2026-11-18", "Demo caption: five gifts under RM50.", m(8600, null, 410, 37, 88, 140)),
      pub("c3", "Threads", "Posted", "2026-11-18", "Demo caption: our under-RM50 list, one post.", m(2300, 2900, 96, 14, 11, null)),
    ],
  },
  {
    id: "c9", title: "Rainy day sensory bin", pillar: "Parenting Tips", idea: "A sensory bin from kitchen basics.", assetUrl: "", notes: "",
    publications: [
      pub("c9", "Instagram", "Posted", "2026-10-14", "Demo caption: a sensory bin from your kitchen.", m(3600, 4700, 240, 28, 40, 150)),
      pub("c9", "TikTok", "Posted", "2026-10-15", "Demo caption: sensory bin in 30 seconds.", m(7400, null, 380, 41, 62, 118)),
    ],
  },
  {
    id: "c4", title: "Weekend parenting tip: screen-free play", pillar: "Parenting Tips", idea: "Five screen-free activities.", assetUrl: "", notes: "Add link in comments",
    publications: [
      pub("c4", "Threads", "Scheduled", "2026-11-27", "Demo caption: 5 screen-free activities."),
      pub("c4", "Instagram", "Ready", "2026-11-28", "Demo caption: save this for the weekend."),
    ],
  },
  {
    id: "c5", title: "Year-end sale teaser", pillar: "Promo", idea: "Tease the year-end sale.", assetUrl: "", notes: "",
    publications: [pub("c5", "Instagram", "Ready", "2026-11-29", "Demo caption: something sweet is coming.")],
  },
  {
    id: "c6", title: "Customer story: Mei's reading corner", pillar: "Community", idea: "A customer's reading nook.", assetUrl: "", notes: "Waiting for photo permission",
    publications: [pub("c6", "Instagram", "Drafting", "2026-12-02", "")],
  },
  {
    id: "c7", title: "Unboxing new puzzle range", pillar: "Product Finds", idea: "Unbox the new puzzles.", assetUrl: "", notes: "",
    publications: [pub("c7", "TikTok", "Idea", "2026-12-05", "")],
  },
  {
    id: "c8", title: "Holiday shipping deadlines", pillar: "Community", idea: "Last order dates for the holidays.", assetUrl: "", notes: "",
    publications: [pub("c8", "Threads", "Idea", "2026-12-09", "")],
  },
];

export const DEMO_CONTENT: ContentItem[] = DEMO_ITEMS.map((c) => ({ ...c, isDemo: true }));

export const DEMO_ASSETS: Asset[] = [
  { id: "a1", name: "Demo: Product photos folder", type: "Photo", url: "https://example.com/product-photos", tags: "products, demo" },
  { id: "a2", name: "Demo: Brand logo pack", type: "Design", url: "https://example.com/logo-pack", tags: "brand" },
  { id: "a3", name: "Demo: Packing reel raw clips", type: "Video", url: "https://example.com/packing-clips", tags: "reel, bts" },
  { id: "a4", name: "Demo: Caption swipe file", type: "Document", url: "https://example.com/captions", tags: "copy" },
];
