"use client";
import { useState } from "react";
import { PILLARS, PLATFORMS, STATUSES, type ContentItem } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function blankContent(date = "2026-12-01"): ContentItem {
  return {
    id: uid(), title: "", caption: "", platform: "Instagram", pillar: PILLARS[0], status: "Idea",
    date, assetUrl: "", notes: "", postUrl: "", metrics: null,
  };
}

// Add / edit modal. Pass `item` to edit an existing entry or a blank one to add.
export default function ContentForm({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const { content, saveContent, deleteContent } = useStore();
  const isEdit = content.some((c) => c.id === item.id);
  const [f, setF] = useState(item);
  const set = <K extends keyof ContentItem>(k: K, v: ContentItem[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={isEdit ? "Edit content" : "Add content"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          saveContent({ ...f, title: f.title.trim() });
          onClose();
        }}
      >
        <Field label="Title">
          <Input required value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={f.platform} onChange={(e) => set("platform", e.target.value as ContentItem["platform"])}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value as ContentItem["status"])}>
              {STATUSES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Pillar">
            <Select value={f.pillar} onChange={(e) => set("pillar", e.target.value)}>
              {PILLARS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <Field label="Caption">
          <Textarea value={f.caption} onChange={(e) => set("caption", e.target.value)} />
        </Field>
        <Field label="Asset link (Drive, Canva, etc.)">
          <Input type="url" placeholder="https://" value={f.assetUrl} onChange={(e) => set("assetUrl", e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="flex justify-between pt-2">
          {isEdit ? (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Delete this content?")) {
                  deleteContent(f.id);
                  onClose();
                }
              }}
            >
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
