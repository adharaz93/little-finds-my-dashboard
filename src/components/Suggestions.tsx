"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { inRange, lastDays, measured, type DataView } from "@/lib/analytics";
import { buildSuggestions, type Suggestion } from "@/lib/suggestions";
import { isSnoozed } from "@/lib/prefs";
import { Button } from "./ui";

// Suggestions for one view. Real: the user's own items and numbers. Demo: the samples only.
// Uses the last 90 days of numbers and hides dismissed suggestions (until they expire).
export function useSuggestions(view: DataView): Suggestion[] {
  const { content, posts, today, prefs } = useStore();
  return useMemo(() => {
    if (!today) return [];
    const items = content.filter((c) => (view === "demo" ? c.isDemo === true : c.isDemo !== true));
    const numbers = inRange(measured(posts, view), lastDays(90, today));
    return buildSuggestions(items, numbers, today).filter((s) => !isSnoozed(prefs, s.id, today));
  }, [content, posts, today, prefs, view]);
}

const actionLabel = (s: Suggestion) =>
  s.action.type === "new" ? "Add as idea" : s.action.type === "crosspost" ? `Add ${s.action.platform} idea` : s.action.label;

// variant "rail": compact, top `limit`, real data only. "full": every suggestion, as cards.
export default function Suggestions({ view = "real", variant, limit }: { view?: DataView; variant: "rail" | "full"; limit?: number }) {
  const { acceptSuggestion, dismissSuggestion } = useStore();
  const all = useSuggestions(view);
  const list = limit ? all.slice(0, limit) : all;
  const [status, setStatus] = useState("");
  const demo = view === "demo";

  const accept = (s: Suggestion) => {
    const r = acceptSuggestion(s);
    setStatus(r.ok ? r.message : r.error);
  };
  const actions = (s: Suggestion) =>
    demo ? null : (
      <span className="mt-1 flex flex-wrap gap-x-3">
        {s.action.type === "link" ? (
          <Link href={s.action.href} className="link inline-flex min-h-11 items-center text-xs">{s.action.label}</Link>
        ) : variant === "rail" ? (
          <button onClick={() => accept(s)} className="link inline-flex min-h-11 items-center text-xs" aria-label={`${actionLabel(s)}: ${s.title}`}>{actionLabel(s)}</button>
        ) : (
          <Button size="sm" onClick={() => accept(s)} aria-label={`${actionLabel(s)}: ${s.title}`}>{actionLabel(s)}</Button>
        )}
        {variant === "rail" ? (
          <button onClick={() => dismissSuggestion(s.id)} className="link inline-flex min-h-11 items-center text-xs text-muted" aria-label={`Dismiss: ${s.title}`}>Dismiss</button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => dismissSuggestion(s.id)} aria-label={`Dismiss: ${s.title}`}>Dismiss</Button>
        )}
      </span>
    );

  const live = <p className="sr-only" role="status" aria-live="polite">{status}</p>;

  if (variant === "rail") {
    return (
      <>
        {live}
        {list.length === 0 && <p className="mt-2 text-muted">No suggestions right now.</p>}
        <ul className="mt-2 space-y-3">
          {list.map((s) => (
            <li key={s.id}>
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-muted">{s.why}</p>
              {actions(s)}
            </li>
          ))}
        </ul>
        {status && <p className="mt-1 text-xs text-muted" aria-hidden>{status}</p>}
      </>
    );
  }

  return (
    <section className="mt-4" aria-labelledby="suggestions-heading">
      <h2 id="suggestions-heading" className="mb-1 font-serif text-xl">Suggestions</h2>
      <p className="mb-3 text-xs text-muted">
        Based on your own posts and plans. {demo ? "Demo preview: actions are turned off." : "Dismissed suggestions stay hidden for 30 days."}
      </p>
      {live}
      {list.length === 0 ? (
        <p className="rounded-[20px] bg-white px-4 py-6 text-center text-sm text-muted ring-1 ring-navy/[0.07]">No suggestions right now.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((s) => (
            <li key={s.id} className="min-w-0 rounded-[20px] bg-white px-4 py-3 ring-1 ring-navy/[0.07]">
              <p className="font-medium">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">{s.why}</p>
              {actions(s)}
            </li>
          ))}
        </ul>
      )}
      {status && <p className="mt-2 text-sm" aria-hidden>{status}</p>}
    </section>
  );
}
