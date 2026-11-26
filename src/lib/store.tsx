"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Asset, ContentItem, Publication } from "./types";
import { DEMO_ASSETS, DEMO_CONTENT } from "./demo-data";
import { KEY_BEFORE_IMPORT, KEY_BEFORE_RESET, KEY_V2, loadState, serialize, type Backup, type Quarantined } from "./migrate";
import { flattenPosts, type Post } from "./posts";
import { EMPTY_REMINDERS, dueCheckpoints, type ReminderSummary } from "./reminders";
import { localToday } from "./capture";
import { KEY_LAST_DELETED, commitRecoveryCopy, contentDeletionRecord, planRestore, publicationRemovalRecord, readLastDeleted, type LastDeleted } from "./recovery";

// What the user should know about storage: load problems, and whether the last save worked.
export type StorageStatus = { notices: string[]; saveError: string | null; savingDisabled: boolean };

type Store = {
  content: ContentItem[];
  posts: Post[]; // one row per platform publication, newest data from `content`
  assets: Asset[];
  storage: StorageStatus;
  dismissNotices: () => void;
  // Saves the content form. If it removes platforms that hold performance data, a recovery copy is
  // written first; if that fails nothing is saved and the error is returned.
  saveContentSafely: (c: ContentItem) => Result;
  deleteContent: (id: string) => Result; // if the item holds performance data, writes the recovery copy first; nothing is deleted if that fails
  lastDeleted: LastDeleted | null; // the current recovery copy, if one exists and is readable
  // Performance reminders, worked out once here and shared. Empty until the browser date is known.
  reminders: ReminderSummary;
  restoreLastDeleted: () => { ok: true; message: string } | { ok: false; error: string };
  savePublication: (contentId: string, p: Publication) => void;
  saveAsset: (a: Asset) => void;
  deleteAsset: (id: string) => void;
  resetDemo: () => void;
  exportData: () => string; // everything, including set-aside records, as a backup file's text
  importBackup: (b: Backup) => boolean; // false when cancelled
};

export type Result = { ok: true } | { ok: false; error: string };

const COPY_FAILED = "A recovery copy couldn't be saved (browser storage is full or blocked), so nothing was deleted. Export a backup or free up space, then try again.";

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
  const [lastDeleted, setLastDeleted] = useState<LastDeleted | null>(null);
  // The visitor's local date. Null on the server and the first browser render (so the HTML matches),
  // set after the page loads and refreshed when the tab becomes visible again. No timers.
  const [today, setToday] = useState<string | null>(null);
  // After a restore, the recovery copy is cleared only once the restored data has been saved.
  const clearCopyAfterSave = useRef(false);
  const restoring = useRef(false);

  // Load after hydration: v2, else v1 (left in place as a backup), else the demo samples.
  useEffect(() => {
    const r = loadState(localStorage);
    quarantine.current = r.quarantine;
    /* eslint-disable react-hooks/set-state-in-effect -- must load after hydration to avoid a server/client mismatch */
    setContent(r.content);
    setAssets(r.assets);
    setStorage({ notices: r.notices, saveError: null, savingDisabled: !r.canWrite });
    setLastDeleted(readLastDeleted(localStorage)); // read only: an unreadable copy is ignored, never changed
    setToday(localToday());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // A tab left open past midnight picks up the new date when it is shown again.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setToday(localToday()); // same date: no re-render
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  // Nothing is written until loading finished, and never when the load said writing is unsafe.
  useEffect(() => {
    if (!loaded || storage.savingDisabled) return;
    let saveError: string | null = null;
    try {
      localStorage.setItem(KEY_V2, serialize(content, assets, quarantine.current));
      if (clearCopyAfterSave.current) {
        clearCopyAfterSave.current = false;
        try {
          localStorage.removeItem(KEY_LAST_DELETED);
        } catch {
          // Left in place: a later restore of the same data is refused as a duplicate.
        }
      }
    } catch (e) {
      saveError = errorText(e);
      // The restored data wasn't saved: keep the recovery copy, and don't let a later save clear a newer one.
      clearCopyAfterSave.current = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reports the write result just made
    setStorage((s) => (s.saveError === saveError ? s : { ...s, saveError }));
  }, [content, assets, loaded, storage.savingDisabled]);

  const posts = useMemo(() => flattenPosts(content), [content]);
  const reminders = useMemo(() => (today ? dueCheckpoints(content, today) : EMPTY_REMINDERS), [content, today]);
  const deleteContent = useCallback(
    (id: string): Result => {
      const item = content.find((c) => c.id === id);
      if (!item) return { ok: true };
      // No performance data: no copy, so an existing copy with real history is kept as it is.
      const record = contentDeletionRecord(item, new Date().toISOString());
      if (!commitRecoveryCopy(localStorage, record)) return { ok: false, error: COPY_FAILED };
      if (record) setLastDeleted(record);
      setContent((l) => l.filter((x) => x.id !== id));
      return { ok: true };
    },
    [content],
  );
  const saveContentSafely = useCallback(
    (c: ContentItem): Result => {
      // Only platforms with performance data are copied; removing empty ones keeps any existing copy.
      const record = publicationRemovalRecord(content.find((x) => x.id === c.id), c, new Date().toISOString());
      if (!commitRecoveryCopy(localStorage, record)) return { ok: false, error: COPY_FAILED.replace("nothing was deleted", "nothing was saved") };
      if (record) setLastDeleted(record);
      setContent((l) => upsert(l, c));
      return { ok: true };
    },
    [content],
  );
  const restoreLastDeleted = useCallback((): { ok: true; message: string } | { ok: false; error: string } => {
    if (restoring.current) return { ok: false, error: "A restore is already in progress." };
    // Storage is the source of truth: re-read it, so a copy replaced or damaged meanwhile is never applied.
    const record = readLastDeleted(localStorage);
    if (!record) {
      setLastDeleted(null);
      return { ok: false, error: "The recovery copy is no longer available, so nothing was restored." };
    }
    const plan = planRestore(content, record);
    if (!plan.ok) return plan;
    restoring.current = true;
    clearCopyAfterSave.current = true;
    setContent(plan.content);
    setLastDeleted(null);
    return { ok: true, message: plan.message };
  }, [content]);
  useEffect(() => {
    restoring.current = false; // a restore has been applied once content changes
  }, [content]);
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
    <Ctx.Provider value={{ content, posts, assets, storage, dismissNotices, saveContentSafely, deleteContent, lastDeleted, restoreLastDeleted, reminders, savePublication, saveAsset, deleteAsset, resetDemo, exportData, importBackup }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
