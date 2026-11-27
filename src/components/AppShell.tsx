"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import InsightsRail from "./Insights";
import { useStore } from "@/lib/store";
import { storageNote } from "@/lib/setup";

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  bank: "M4 4h16v5H4zM4 11h16v4H4zM4 17h16v3H4z",
  posting: "M4 12l16-8-6 16-3-7z",
  analytics: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  assets: "M4 6h6l2 2h8v11H4z",
};

export const NAV = [
  { href: "/", label: "Dashboard", short: "Home", icon: "dashboard" },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "calendar" },
  { href: "/bank", label: "Content Bank", short: "Bank", icon: "bank" },
  { href: "/posting", label: "Posting", short: "Posting", icon: "posting" },
  { href: "/analytics", label: "Analytics", short: "Stats", icon: "analytics" },
  { href: "/assets", label: "Assets", short: "Assets", icon: "assets" },
];

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

// Storage problems are shown, never hidden: unsaved changes and records set aside on load.
function StorageNotice() {
  const { storage, dismissNotices } = useStore();
  const { notices, saveError, savingDisabled } = storage;
  if (!saveError && !savingDisabled && notices.length === 0) return null;
  return (
    <div role="alert" className="mb-4 space-y-1 rounded-xl bg-peach px-3 py-2 text-xs">
      {saveError && <p className="font-medium">{saveError} Keep this tab open and free up space, or copy anything important elsewhere.</p>}
      {savingDisabled && <p className="font-medium">Saving is turned off for this session to protect your existing data.</p>}
      {notices.map((n) => <p key={n}>{n}</p>)}
      {notices.length > 0 && !saveError && !savingDisabled && (
        <button onClick={dismissNotices} className="link inline-flex min-h-8 items-center text-muted">Dismiss</button>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { content } = useStore();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_320px]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-sidebar p-5 lg:flex">
        <p className="font-serif text-3xl leading-none">Little Finds <span className="italic text-muted">MY</span></p>
        <p className="mb-10 mt-2 text-xs uppercase tracking-[0.22em] text-muted">Content Studio</p>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`relative flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-colors ${
                active(n.href) ? "bg-white font-medium" : "text-muted hover:bg-white/60 hover:text-navy"
              }`}
            >
              {active(n.href) && <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-navy" aria-hidden />}
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main workspace */}
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-32 pt-6 sm:px-8 lg:pb-10">
        <p className="mb-4 font-serif text-2xl lg:hidden">Little Finds <span className="italic text-muted">MY</span></p>
        <StorageNotice />
        {children}
        {/* The one place the storage note lives; it mentions the samples only while they exist. */}
        <footer className="mt-12 border-t border-navy/10 pt-4 text-xs text-muted">{storageNote(content)}</footer>
      </main>

      {/* Insights rail (xl and up) */}
      <InsightsRail />

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-navy/10 bg-sidebar/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      >
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] ${
              active(n.href) ? "bg-white font-medium text-navy" : "text-muted"
            }`}
          >
            <Icon name={n.icon} />
            {n.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
