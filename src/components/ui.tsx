"use client";
import { useEffect } from "react";
import { statusColor } from "@/lib/utils";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-soft ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-4xl leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-navy text-cream hover:bg-navy/85",
    ghost: "bg-white text-navy shadow-soft hover:bg-baby",
    danger: "bg-white text-red-700 shadow-soft hover:bg-pink",
  }[variant];
  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${styles} ${className}`}
      {...props}
    />
  );
}

export function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color ?? "bg-baby"}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={statusColor[status]}>{status}</Badge>;
}

export function StatCard({ label, value, tone = "bg-baby" }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${tone}`}>
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-serif text-4xl">{value}</p>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-white px-3 py-2 text-sm shadow-soft outline-none ring-1 ring-navy/10 focus:ring-2 focus:ring-navy/40";

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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/25 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream p-6 shadow-soft sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-navy/20 p-6 text-center text-sm text-muted">{text}</p>;
}

export function DemoNote() {
  return (
    <p className="mb-4 rounded-xl bg-peach/70 px-4 py-2 text-xs text-navy">
      Demo data: the sample items are placeholders. Everything you add or edit is saved only in this browser.
    </p>
  );
}
