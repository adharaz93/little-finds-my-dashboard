import type { Asset, ContentItem } from "./types";
import { PILLARS } from "./types";
import { DEMO_ASSETS } from "./demo-data";

// Phase 3 P3-1: setting the studio up for real use. Pure, so the rules can be tested.

// Pillars to offer in a dropdown: the account's pillars first, then any other pillar already used
// by saved content (older or demo pillars), so nothing saved ever becomes unselectable.
export function pillarOptions(content: readonly ContentItem[], current?: string): string[] {
  const known = new Set<string>(PILLARS);
  const extra = new Set<string>();
  for (const p of [...content.map((c) => c.pillar), current ?? ""]) {
    const v = p.trim();
    if (v && !known.has(v)) extra.add(v);
  }
  return [...PILLARS, ...[...extra].sort((a, b) => a.localeCompare(b))];
}

// A bundled demo asset the user hasn't changed (same id and the same fields).
const isUntouchedDemoAsset = (a: Asset) =>
  DEMO_ASSETS.some((d) => d.id === a.id && d.name === a.name && d.type === a.type && d.url === a.url && d.tags === a.tags);

export type DemoCounts = { content: number; assets: number };

export function demoCounts(content: readonly ContentItem[], assets: readonly Asset[]): DemoCounts {
  return { content: content.filter((c) => c.isDemo === true).length, assets: assets.filter(isUntouchedDemoAsset).length };
}

// Removes the bundled samples: content flagged as demo, and demo asset links that were never edited.
// Everything else is returned unchanged and in its original order.
export function withoutDemoSamples(content: readonly ContentItem[], assets: readonly Asset[]): { content: ContentItem[]; assets: Asset[] } {
  return { content: content.filter((c) => c.isDemo !== true), assets: assets.filter((a) => !isUntouchedDemoAsset(a)) };
}

// The footer note shown on every page. It mentions the samples only while some are still there.
export function storageNote(content: readonly ContentItem[]): string {
  const saved = "Everything you add or edit is saved only in this browser, so export a backup regularly from the Dashboard.";
  return content.some((c) => c.isDemo === true)
    ? `Sample items are shown until you remove them (Dashboard → Remove demo samples). ${saved}`
    : saved;
}

export function removeDemoMessage(n: DemoCounts): string {
  const part = (x: number, w: string) => `${x} demo ${w}${x === 1 ? "" : "s"}`;
  const what = [n.content ? part(n.content, "content item") : "", n.assets ? part(n.assets, "asset link") : ""].filter(Boolean).join(" and ");
  return `Remove ${what}?\n\nYour own content and assets stay. A copy of everything is kept in browser storage first.`;
}
