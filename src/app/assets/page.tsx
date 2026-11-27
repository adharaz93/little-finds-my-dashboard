"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { ASSET_TYPES, type Asset } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useDialogs } from "@/components/dialogs";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, btnClass } from "@/components/ui";

const blank = (): Asset => ({ id: uid(), name: "", type: "Photo", url: "", tags: "" });
const ICON: Record<string, string> = { Photo: "▣", Video: "▶", Design: "✦", Document: "☰" };
const tone: Record<string, string> = { Photo: "bg-pink", Video: "bg-baby", Design: "bg-mint", Document: "bg-peach" };

export default function AssetsPage() {
  const { assets, saveAsset, deleteAsset } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [editing, setEditing] = useState<Asset | null>(null);
  const dialogs = useDialogs();

  const list = assets.filter(
    (a) => (type === "All" || a.type === type) && (a.name + a.tags).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Asset Library"
        subtitle="Keep links to your photos, videos and designs. Files stay where they are (Drive, Canva...)."
        action={<Button onClick={() => setEditing(blank())}>+ Add asset link</Button>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px]">
        <Input placeholder="Search name or tag..." aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Type filter" value={type} onChange={(e) => setType(e.target.value)}>
          <option>All</option>{ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>
      {list.length === 0 && <Empty text="No assets found." />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => (
          <Card key={a.id} className="flex flex-col gap-2">
            <div className={`flex h-32 items-center justify-center rounded-xl ${tone[a.type]}`}>
              <span className="font-serif text-4xl text-navy/40">{ICON[a.type]}</span>
            </div>
            <div><Badge color={tone[a.type]}>{a.type}</Badge></div>
            <h3 className="font-serif text-xl">{a.name}</h3>
            {a.tags && <p className="text-xs text-muted">{a.tags}</p>}
            <div className="mt-auto flex gap-2 pt-2">
              <a href={a.url} target="_blank" rel="noreferrer" className={btnClass("primary")}>Open link</a>
              <Button variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <Modal title={assets.some((a) => a.id === editing.id) ? "Edit asset" : "Add asset link"} onClose={() => setEditing(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveAsset(editing);
              setEditing(null);
            }}
          >
            <Field label="Name"><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as Asset["type"] })}>
                {ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Link"><Input required type="url" placeholder="https://" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} /></Field>
            <Field label="Tags (comma separated)"><Input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} /></Field>
            <div className="flex justify-between pt-2">
              {assets.some((a) => a.id === editing.id) ? (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (!(await dialogs.confirm({ message: "Delete this asset link?", confirmLabel: "Delete", danger: true }))) return;
                    deleteAsset(editing.id);
                    setEditing(null);
                  }}
                >
                  Delete
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
