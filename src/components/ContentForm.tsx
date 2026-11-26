"use client";
import { useState } from "react";
import { PILLARS, PLATFORM_FORMATS, PLATFORMS, STATUSES, type ContentItem, type Format, type Platform, type Publication } from "@/lib/types";
import { parseTags, uid } from "@/lib/utils";
import { today } from "@/lib/posts";
import { resolvePublishedDate } from "@/lib/capture";
import { useStore } from "@/lib/store";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function blankPublication(platform: Platform, date: string): Publication {
  return {
    id: uid(), platform, caption: "", status: "Idea", scheduledDate: date, publishedDate: "", postUrl: "", postId: "",
    metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [],
  };
}

export function blankContent(date = today()): ContentItem {
  return { id: uid(), title: "", pillar: PILLARS[0], idea: "", assetUrl: "", notes: "", publications: [blankPublication("Instagram", date)] };
}

// Add / edit modal. The content itself first, then one short block per platform.
// Post URL, post ID and published date sit under "More details" so the form stays short.
export default function ContentForm({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const { content, saveContent, deleteContent } = useStore();
  const isEdit = content.some((c) => c.id === item.id);
  const [f, setF] = useState(item);
  // Topics are typed as one comma-separated line and cleaned on save.
  const [tagText, setTagText] = useState((item.tags ?? []).join(", "));
  const set = <K extends keyof ContentItem>(k: K, v: ContentItem[K]) => setF((p) => ({ ...p, [k]: v }));
  const setPub = (id: string, patch: Partial<Publication>) =>
    setF((p) => ({ ...p, publications: p.publications.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const togglePlatform = (platform: Platform) => {
    const existing = f.publications.find((p) => p.platform === platform);
    if (!existing) {
      const date = f.publications[0]?.scheduledDate ?? today();
      set("publications", [...f.publications, blankPublication(platform, date)]);
      return;
    }
    if (f.publications.length === 1) return; // a content item keeps at least one platform
    if (existing.metrics && !confirm(`Remove ${platform}? Its performance numbers will be removed too.`)) return;
    set("publications", f.publications.filter((p) => p.id !== existing.id));
  };

  return (
    <Modal title={isEdit ? "Edit content" : "Add content"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          const tags = parseTags(tagText);
          const { tags: _previous, ...rest } = f;
          void _previous;
          saveContent({
            ...rest,
            ...(tags.length ? { tags } : {}),
            title: f.title.trim(),
            // Posted platforms get the shared published-date rule (keeps a date already entered).
            publications: f.publications.map((p) => (p.status === "Posted" ? { ...p, publishedDate: resolvePublishedDate(p) } : p)),
          });
          onClose();
        }}
      >
        <Field label="Title">
          <Input required value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pillar">
            <Select value={f.pillar} onChange={(e) => set("pillar", e.target.value)}>
              {PILLARS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Asset link">
            <Input type="url" placeholder="https://" value={f.assetUrl} onChange={(e) => set("assetUrl", e.target.value)} />
          </Field>
        </div>
        <Field label="Main idea">
          <Input value={f.idea} onChange={(e) => set("idea", e.target.value)} />
        </Field>
        <Field label="Topics (comma separated, optional)">
          <Input placeholder="e.g. toddler play, gift guide" value={tagText} onChange={(e) => setTagText(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Platforms</legend>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = f.publications.some((x) => x.platform === p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePlatform(p)}
                  className={`btn min-h-11 rounded-full px-4 text-sm ring-1 ${on ? "bg-navy text-cream ring-navy" : "bg-white text-navy ring-navy/15 hover:bg-baby"}`}
                >
                  {on ? "✓ " : "+ "}{p}
                </button>
              );
            })}
          </div>
        </fieldset>

        {f.publications.map((p) => (
          <div key={p.id} className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
            <p className="font-serif text-lg">{p.platform}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Status">
                <Select value={p.status} onChange={(e) => setPub(p.id, { status: e.target.value as Publication["status"] })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Scheduled date">
                <Input type="date" required value={p.scheduledDate} onChange={(e) => setPub(p.id, { scheduledDate: e.target.value })} />
              </Field>
              <Field label="Format">
                <Select value={p.format ?? ""} onChange={(e) => setPub(p.id, { format: (e.target.value || undefined) as Format | undefined })}>
                  <option value="">Not set</option>
                  {/* A stored format the platform doesn't list stays selectable, so editing never drops it. */}
                  {[...new Set([...PLATFORM_FORMATS[p.platform], ...(p.format ? [p.format] : [])])].map((x) => <option key={x}>{x}</option>)}
                </Select>
              </Field>
            </div>
            {/* Published fields belong to this platform only; they open once it is marked Posted
                (or already hold a value), so a new idea stays a short form. */}
            {p.status === "Posted" || p.publishedDate || p.postUrl ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                <Field label="Published date">
                  <Input type="date" value={p.publishedDate} onChange={(e) => setPub(p.id, { publishedDate: e.target.value })} />
                </Field>
                <Field label="Published post URL">
                  <Input type="url" placeholder="https://" value={p.postUrl} onChange={(e) => setPub(p.id, { postUrl: e.target.value })} />
                </Field>
              </div>
            ) : (
              <p className="text-xs text-muted">Published date and post URL appear here when this platform is marked Posted.</p>
            )}
            <Field label="Caption">
              <Textarea value={p.caption} onChange={(e) => setPub(p.id, { caption: e.target.value })} />
            </Field>
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted">More details</summary>
              <div className="mt-2 space-y-3">
                <Field label="Platform post ID">
                  <Input value={p.postId} onChange={(e) => setPub(p.id, { postId: e.target.value })} />
                </Field>
              </div>
            </details>
          </div>
        ))}

        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="flex justify-between pt-2">
          {isEdit ? (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Delete this content and all its platform posts?")) {
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
