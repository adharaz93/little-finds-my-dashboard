import { syncAll } from "@/lib/integrations/config";

// "Refresh now" and the future scheduled job both call this.
// It returns a status per platform and never returns made-up metrics.
export async function POST() {
  const results = await syncAll();
  const ok = results.every((r) => r.status === "synced");
  return Response.json({ ok, results }, { status: ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
