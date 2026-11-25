"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Insights from "./Insights";

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  bank: "M4 4h16v5H4zM4 11h16v4H4zM4 17h16v3H4z",
  posting: "M4 12l16-8-6 16-3-7z",
  analytics: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  assets: "M4 6h6l2 2h8v11H4z",
};

export const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/bank", label: "Content Bank", icon: "bank" },
  { href: "/posting", label: "Posting", icon: "posting" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/assets", label: "Assets", icon: "assets" },
];

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-sidebar p-5 lg:flex">
        <p className="font-serif text-3xl leading-none">Little Finds <span className="italic text-muted">MY</span></p>
        <p className="mb-10 mt-2 text-[11px] uppercase tracking-[0.22em] text-muted">Content Studio</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-colors ${
                active(n.href) ? "bg-white font-medium shadow-soft" : "text-muted hover:bg-white/60"
              }`}
            >
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main workspace */}
      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-8 lg:pb-10">
        <p className="mb-4 font-serif text-xl lg:hidden">Little Finds MY</p>
        {children}
      </main>

      {/* Insights (wide screens) */}
      <Insights />

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around bg-sidebar/95 shadow-soft px-1 py-2 backdrop-blur lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] ${
              active(n.href) ? "bg-white font-medium shadow-soft" : "text-muted"
            }`}
          >
            <Icon name={n.icon} />
            {n.label.split(" ").pop()}
          </Link>
        ))}
      </nav>
    </div>
  );
}
