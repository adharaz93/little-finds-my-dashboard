"use client";
import { useEffect, useRef } from "react";
import { statusColor } from "@/lib/utils";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] bg-white p-5 shadow-soft ring-1 ring-navy/[0.07] ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
  enter = false,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  enter?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className={enter ? "enter" : ""}>
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

// Shared button look, also used for links that should look like buttons.
export function btnClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  const styles = {
    primary: "bg-navy text-cream hover:bg-navy/85",
    ghost: "bg-white text-navy ring-1 ring-navy/10 hover:bg-baby",
    danger: "bg-white text-[#8a3a45] ring-1 ring-navy/10 hover:bg-pink",
  }[variant];
  const sizes = {
    md: "min-h-11 px-5 py-2 text-sm",
    sm: "min-h-11 px-4 py-1.5 text-sm sm:min-h-9 sm:text-[13px]",
  }[size];
  return `btn inline-flex items-center justify-center rounded-full font-medium ${sizes} ${styles} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={btnClass(variant, size, className)} {...props} />;
}

export function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-navy/10 ${color ?? "bg-baby"}`}>
      {children}
    </span>
  );
}

// Posted gets a check mark so it stays distinct from Ready and Scheduled even without colour.
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge color={statusColor[status]}>
      {status === "Posted" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {status}
    </Badge>
  );
}

// Platform and pillar share one badge shape; only the tint differs.
export const PlatformBadge = ({ children }: { children: React.ReactNode }) => <Badge color="bg-baby">{children}</Badge>;
export const PillarBadge = ({ children }: { children: React.ReactNode }) => <Badge color="bg-peach">{children}</Badge>;

export function StatCard({
  label,
  value,
  tone = "bg-baby",
  compact = false,
}: {
  label: string;
  value: string;
  tone?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-[20px] ${compact ? "px-4 py-3" : "p-5"} ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`font-serif tabular-nums ${compact ? "mt-1 text-4xl" : "mt-2 text-4xl sm:text-5xl"}`}>{value}</p>
    </div>
  );
}

const inputCls =
  "min-h-11 w-full rounded-xl bg-white px-3 py-2 text-base shadow-soft outline-none ring-1 ring-navy/15 focus:ring-2 focus:ring-navy/50 sm:text-sm";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input className={inputCls} {...p} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} className={inputCls} {...p} />
);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={inputCls} {...p} />;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Escape closes, Tab stays inside the dialog, focus returns to what opened it.
  // Runs once on mount: callers pass a fresh onClose every render.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (box.current?.querySelector<HTMLElement>("form input, form select, form textarea") ?? box.current?.querySelector<HTMLElement>("button"))?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab" || !box.current) return;
      const els = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/25 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream p-6 shadow-soft sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="btn -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-[20px] border border-dashed border-navy/20 p-6 text-center text-sm text-muted">{text}</p>;
}
