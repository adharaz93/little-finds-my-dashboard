"use client";
import { useRef } from "react";
import { useStore } from "@/lib/store";
import { readBackup } from "@/lib/migrate";
import { today } from "@/lib/posts";
import { lastDeletedLabel } from "@/lib/recovery";

const linkClass = "link inline-flex min-h-11 items-center text-xs text-muted";

// Data lives only in this browser, so a backup file is the way to keep it safe or move it.
// Import checks the file exactly like saved data and asks before replacing anything.
export default function BackupLinks() {
  const { content, assets, exportData, importBackup, lastDeleted, restoreLastDeleted } = useStore();
  const file = useRef<HTMLInputElement>(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportData()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `little-finds-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!f) return;
    const b = readBackup(await f.text());
    if (!b) {
      alert("This file isn't a Little Finds backup, so nothing was changed.");
      return;
    }
    const n = (x: number, w: string) => `${x} ${w}${x === 1 ? "" : "s"}`;
    const lines = [
      `Replace your current data (${n(content.length, "content item")}, ${n(assets.length, "asset")}) with this backup?`,
      `The backup has ${n(b.content.length, "content item")}${b.assets ? ` and ${n(b.assets.length, "asset")}` : "; your current assets are kept"}.`,
      ...(b.unreadable ? [`${n(b.unreadable, "record")} in the file couldn't be read and will be set aside, not deleted.`] : []),
      "A copy of your current data is kept in browser storage first.",
    ];
    if (confirm(lines.join("\n\n")) && importBackup(b)) alert("Backup imported.");
  };

  return (
    <>
      <button onClick={download} className={linkClass}>Export backup</button>
      <button onClick={() => file.current?.click()} className={linkClass}>Import backup</button>
      {/* Shown only when a readable recovery copy exists. */}
      {lastDeleted && (
        <button
          onClick={() => {
            const r = restoreLastDeleted();
            alert(r.ok ? r.message : r.error);
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
