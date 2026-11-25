"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Asset, ContentItem } from "./types";
import { DEMO_ASSETS, DEMO_CONTENT } from "./demo-data";

type Store = {
  content: ContentItem[];
  assets: Asset[];
  saveContent: (c: ContentItem) => void;
  deleteContent: (id: string) => void;
  saveAsset: (a: Asset) => void;
  deleteAsset: (id: string) => void;
  resetDemo: () => void;
};

const Ctx = createContext<Store | null>(null);
const KEY = "lfm-studio-v1";

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<ContentItem[]>(DEMO_CONTENT);
  const [assets, setAssets] = useState<Asset[]>(DEMO_ASSETS);
  const [loaded, setLoaded] = useState(false);

  // Load saved data from this browser (localStorage) after first render.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        /* eslint-disable react-hooks/set-state-in-effect -- must load after hydration to avoid a server/client mismatch */
        setContent(d.content);
        setAssets(d.assets);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ content, assets }));
    } catch {}
  }, [content, assets, loaded]);

  const saveContent = useCallback((c: ContentItem) => setContent((l) => upsert(l, c)), []);
  const deleteContent = useCallback((id: string) => setContent((l) => l.filter((x) => x.id !== id)), []);
  const saveAsset = useCallback((a: Asset) => setAssets((l) => upsert(l, a)), []);
  const deleteAsset = useCallback((id: string) => setAssets((l) => l.filter((x) => x.id !== id)), []);
  const resetDemo = useCallback(() => {
    setContent(DEMO_CONTENT);
    setAssets(DEMO_ASSETS);
  }, []);

  return (
    <Ctx.Provider value={{ content, assets, saveContent, deleteContent, saveAsset, deleteAsset, resetDemo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
