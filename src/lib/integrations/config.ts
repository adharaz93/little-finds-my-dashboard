// SERVER ONLY. Imported by the route handlers under app/api/integrations.
// Reads which credentials exist (never returns their values). There is no token
// store yet, so no account can be "connected" and no metrics are ever produced here.
import type { Platform } from "../types";
import type { ConnectionState, SyncResult } from "./types";

const PROVIDERS: Record<Platform, { api: string; env: string[] }> = {
  Instagram: { api: "Instagram API with Instagram Login (Meta Graph API)", env: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"] },
  TikTok: { api: "TikTok Display API (Login Kit)", env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"] },
  Threads: { api: "Threads API (Meta)", env: ["THREADS_APP_ID", "THREADS_APP_SECRET", "THREADS_REDIRECT_URI"] },
};

// Shared requirement: tokens are encrypted at rest with this key once a store exists.
const SHARED_ENV = ["TOKEN_ENCRYPTION_KEY"];

// Placeholder for the server-side token store (a database table, see docs/analytics-integrations.md).
// Until it exists every platform reports "connection required".
async function getStoredToken(platform: Platform): Promise<null> {
  void platform;
  return null;
}

export async function connectionStates(): Promise<ConnectionState[]> {
  return Promise.all(
    (Object.keys(PROVIDERS) as Platform[]).map(async (platform) => {
      const { api, env } = PROVIDERS[platform];
      const missing = [...env, ...SHARED_ENV].filter((k) => !process.env[k]);
      const token = await getStoredToken(platform);
      return { platform, api, configured: missing.length === 0, connected: token !== null, missing, lastSuccessfulSync: null };
    }),
  );
}

// Called by "Refresh now" and, later, by the scheduled job. It never invents numbers:
// without credentials and a stored token it reports why it could not sync.
export async function syncAll(): Promise<SyncResult[]> {
  const states = await connectionStates();
  return states.map((s) => {
    if (!s.configured) {
      return { platform: s.platform, status: "not_configured", message: `Server settings missing: ${s.missing.join(", ")}`, syncedAt: null };
    }
    if (!s.connected) {
      return { platform: s.platform, status: "connection_required", message: "Connect the account first.", syncedAt: null };
    }
    // Real fetch goes here once OAuth and the token store exist (see docs).
    return { platform: s.platform, status: "error", message: "Sync is not implemented yet.", syncedAt: null };
  });
}
