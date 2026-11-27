"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { btnClass } from "./ui";

// In-app replacements for the browser's confirm() and alert(). Some browsers (in-app browsers,
// embedded previews) cancel or hide native pop-ups silently, which made actions quietly do nothing.
//  - confirm(): an OK/Cancel box. Resolves true only when the action button is pressed.
//  - notify(..., "error"): a box with one OK button that stays until closed.
//  - notify(..., "success"): a short notice that disappears by itself.
// The data-dialog-* attributes are stable hooks for the browser tests.

type ConfirmOptions = { message: string; confirmLabel: string; danger?: boolean };
type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "error"; message: string; resolve: () => void };
type Notice = { id: number; message: string };

type Dialogs = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, kind?: "success" | "error") => Promise<void>;
};

const Ctx = createContext<Dialogs | null>(null);
const NOTICE_MS = 5000;
const FOCUSABLE = "button:not([disabled])";

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setQueue((q) => [...q, { id: ++nextId.current, kind: "confirm", options, resolve }])),
    [],
  );
  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    if (kind === "error") {
      return new Promise<void>((resolve) => setQueue((q) => [...q, { id: ++nextId.current, kind: "error", message, resolve }]));
    }
    const id = ++nextId.current;
    setNotices((n) => [...n, { id, message }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), NOTICE_MS);
    return Promise.resolve();
  }, []);

  const current = queue[0];
  const finish = useCallback((r: Request, ok: boolean) => {
    if (r.kind === "confirm") r.resolve(ok);
    else r.resolve();
    setQueue((q) => q.filter((x) => x.id !== r.id));
  }, []);

  return (
    <Ctx.Provider value={{ confirm, notify }}>
      {children}
      {current && <Box key={current.id} request={current} onDone={(ok) => finish(current, ok)} />}
      {/* Above the phone bottom bar; announced politely to screen readers. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {notices.map((n) => (
          <p key={n.id} data-dialog-kind="notice" className="pointer-events-auto max-w-md rounded-2xl bg-navy px-4 py-3 text-sm text-cream shadow-soft">
            <span data-dialog-message>{n.message}</span>
          </p>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function Box({ request, onDone }: { request: Request; onDone: (ok: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // Focus starts on the safe choice (Cancel, or OK for a message). Escape and Tab are handled in the
  // capture phase and stopped here, so a form open underneath never sees them: Escape closes only
  // this box. Focus returns to what was focused before it opened.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[data-dialog-cancel], [data-dialog-ok]")?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        done.current(false);
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      e.stopImmediatePropagation();
      const els = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const i = els.indexOf(document.activeElement as HTMLElement);
      const next = els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length];
      e.preventDefault();
      next?.focus();
    };
    window.addEventListener("keydown", h, true);
    return () => {
      window.removeEventListener("keydown", h, true);
      opener?.focus?.();
    };
  }, []);

  const isConfirm = request.kind === "confirm";
  const message = isConfirm ? request.options.message : request.message;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4" onClick={() => onDone(false)}>
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dialog-${request.id}-title`}
        aria-describedby={`dialog-${request.id}-message`}
        data-dialog-kind={request.kind}
        className="w-full max-w-md rounded-t-3xl bg-cream p-6 shadow-soft sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`dialog-${request.id}-title`} className="mb-2 font-serif text-2xl">{isConfirm ? "Please confirm" : "Something went wrong"}</h2>
        <p id={`dialog-${request.id}-message`} data-dialog-message className="whitespace-pre-line break-words text-sm">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {isConfirm ? (
            <>
              <button type="button" data-dialog-cancel className={btnClass("ghost")} onClick={() => onDone(false)}>Cancel</button>
              <button type="button" data-dialog-confirm className={btnClass(request.options.danger ? "danger" : "primary")} onClick={() => onDone(true)}>
                {request.options.confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" data-dialog-ok className={btnClass("primary")} onClick={() => onDone(false)}>OK</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useDialogs() {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDialogs must be used inside DialogProvider");
  return d;
}
