"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Asset, ContentItem, Publication } from "./types";
import { DEMO_ASSETS, DEMO_CONTENT } from "./demo-data";
import { KEY_BEFORE_IMPORT, KEY_BEFORE_RESET, KEY_V2, loadState, serialize, type Backup, type Quarantined } from "./migrate";
import { flattenPosts, type Post } from "./posts";

// What the user should know about storage: load problems, and whether the last save worked.
export type StorageStatus = { notices: string[]; saveError: string | null; savingDisabled: boolean };

type Store = {
  content: ContentItem[];
  posts: Post[]; // one row per platform publication, newest data from `content`
  assets: Asset[];
  storage: StorageStatus;
  dismissNotices: () => void;
  saveContent: (c: ContentItem) => void;
  deleteContent: (id: string) => void;
  savePublication: (contentId: string, p: Publication) => void;
  saveAsset: (a: Asset) => void;
  deleteAsset: (id: string) => void;
  resetDemo: () => void;
  exportData: () => string; // everything, including set-aside records, as a backup file's text
  importBackup: (b: Backup) => boolean; // false when cancelled
};

const Ctx = createContext<Store | null>(null);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

const errorText = (e: unknown) =>
  e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)
    ? "Browser storage is full, so your latest changes were not saved."
    : "Your latest changes could not be saved to browser storage.";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<ContentItem[]>(DEMO_CONTENT);
  const [assets, setAssets] = useState<Asset[]>(DEMO_ASSETS);
  // Unreadable records, carried along and re-saved untouched so they are never lost.
  const quarantine = useRef<Quarantined[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storage, setStorage] = useState<StorageStatus>({ notices: [], saveError: null, savingDisabled: false });

  // Load after hydration: v2, else v1 (left in place as a backup), else the demo samples.
  useEffect(() => {
    const r = loadState(localStorage);
    quarantine.current = r.quarantine;
    /* eslint-disable react-hooks/set-state-in-effect -- must load after hydration to avoid a server/client mismatch */
    setContent(r.content);
    setAssets(r.assets);
    setStorage({ notices: r.notices, saveError: null, savingDisabled: !r.canWrite });
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Nothing is written until loading finished, and never when the load said writing is unsafe.
  useEffect(() => {
    if (!loaded || storage.savingDisabled) return;
    let saveError: string | null = null;
    try {
      localStorage.setItem(KEY_V2, serialize(content, assets, quarantine.current));
    } catch (e) {
      saveError = errorText(e);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reports the write result just made
    setStorage((s) => (s.saveError === saveError ? s : { ...s, saveError }));
  }, [content, assets, loaded, storage.savingDisabled]);

  const posts = useMemo(() => flattenPosts(content), [content]);
  const saveContent = useCallback((c: ContentItem) => setContent((l) => upsert(l, c)), []);
  const deleteContent = useCallback((id: string) => setContent((l) => l.filter((x) => x.id !== id)), []);
  const savePublication = useCallback(
    (contentId: string, p: Publication) =>
      setContent((l) => l.map((c) => (c.id === contentId ? { ...c, publications: upsert(c.publications, p) } : c))),
    [],
  );
  const saveAsset = useCallback((a: Asset) => setAssets((l) => upsert(l, a)), []);
  const deleteAsset = useCallback((id: string) => setAssets((l) => l.filter((x) => x.id !== id)), []);
  const dismissNotices = useCallback(() => setStorage((s) => ({ ...s, notices: [] })), []);
  const resetDemo = useCallback(() => {
    // Keep a copy of everything first, so a reset can be undone by hand.
    try {
      localStorage.setItem(KEY_BEFORE_RESET, serialize(content, assets, quarantine.current));
    } catch {
      if (!confirm("A backup of your current data couldn't be saved first. Reset anyway?")) return;
    }
    setContent(structuredClone(DEMO_CONTENT));
    setAssets(DEMO_ASSETS);
  }, [content, assets]);
  const exportData = useCallback(() => serialize(content, assets, quarantine.current), [content, assets]);
  const importBackup = useCallback(
    (b: Backup) => {
      // Same rule as reset: keep a copy of everything first, so an import can be undone by hand.
      try {
        localStorage.setItem(KEY_BEFORE_IMPORT, serialize(content, assets, quarantine.current));
      } catch {
        if (!confirm("A backup of your current data couldn't be saved first. Import anyway?")) return false;
      }
      quarantine.current = b.quarantine;
      setContent(b.content);
      if (b.assets) setAssets(b.assets);
      return true;
    },
    [content, assets],
  );

  return (
    <Ctx.Provider value={{ content, posts, assets, storage, dismissNotices, saveContent, deleteContent, savePublication, saveAsset, deleteAsset, resetDemo, exportData, importBackup }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
