"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { readBackup } from "@/lib/migrate";
import { today } from "@/lib/posts";
import { lastDeletedLabel } from "@/lib/recovery";
import { lastExportLabel, readLastExport, writeLastExport } from "@/lib/exportInfo";
import { useDialogs } from "./dialogs";
import { runCopyFirst } from "@/lib/copyFirst";

const linkClass = "link inline-flex min-h-11 items-center text-xs text-muted";

// Data lives only in this browser, so a backup file is the way to keep it safe or move it.
// Import checks the file exactly like saved data and asks before replacing anything.
export default function BackupLinks() {
  const { content, assets, exportData, importBackup, lastDeleted, restoreLastDeleted } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const dialogs = useDialogs();
  // Last successful export. Read in the browser after load (undefined until then, so the
  // prerendered HTML and the first render match); null means never.
  const [lastExport, setLastExport] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after load
    setLastExport(readLastExport(localStorage));
  }, []);

  const download = () => {
    // The time is recorded only once the file was built and handed to the browser without error.
    // (Browsers don't tell pages when a Save dialog is cancelled, so that can't be detected.)
    try {
      const url = URL.createObjectURL(new Blob([exportData()], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `little-finds-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      void dialogs.notify("The backup couldn't be created, so nothing was exported. Your data is unchanged.", "error");
      return;
    }
    const at = new Date().toISOString();
    writeLastExport(localStorage, at); // if storage refuses, the label still updates for this session
    setLastExport(at);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!f) return;
    const b = readBackup(await f.text());
    if (!b) {
      void dialogs.notify("This file isn't a Little Finds backup, so nothing was changed.", "error");
      return;
    }
    const n = (x: number, w: string) => `${x} ${w}${x === 1 ? "" : "s"}`;
    const lines = [
      `Replace your current data (${n(content.length, "content item")}, ${n(assets.length, "asset")}) with this backup?`,
      `The backup has ${n(b.content.length, "content item")}${b.assets ? ` and ${n(b.assets.length, "asset")}` : "; your current assets are kept"}.`,
      ...(b.unreadable ? [`${n(b.unreadable, "record")} in the file couldn't be read and will be set aside, not deleted.`] : []),
      "A copy of your current data is kept in browser storage first.",
    ];
    if (!(await dialogs.confirm({ message: lines.join("\n\n"), confirmLabel: "Import", danger: true }))) return;
    const ran = await runCopyFirst(dialogs.confirm, (o) => importBackup(b, o), {
      message: "A backup of your current data couldn't be saved first. Import anyway?", confirmLabel: "Import anyway",
    });
    if (ran) void dialogs.notify("Backup imported.");
  };

  return (
    <>
      <button onClick={download} className={linkClass}>Export backup</button>
      {lastExport !== undefined && (
        <span className="inline-flex min-h-11 items-center text-xs text-muted" aria-live="polite">{lastExportLabel(lastExport)}</span>
      )}
      <button onClick={() => file.current?.click()} className={linkClass}>Import backup</button>
      {/* Shown only when a readable recovery copy exists. */}
      {lastDeleted && (
        <button
          onClick={() => {
            const r = restoreLastDeleted();
            void (r.ok ? dialogs.notify(r.message) : dialogs.notify(r.error, "error"));
          }}
          className={linkClass}
        >
          {lastDeletedLabel(lastDeleted)}
        </button>
      )}
      <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-hidden tabIndex={-1} onChange={onFile} />
    </>
  );
}
