import type { Platform } from "../types";

// Shapes shared by the API routes and the browser. They never carry tokens or secrets.

// configured: the app's OAuth credentials are set on the server.
// connected: an account has been authorised and a token is held server-side.
export type ConnectionState = {
  platform: Platform;
  api: string;
  configured: boolean;
  connected: boolean;
  missing: string[]; // names of missing server settings, never their values
  lastSuccessfulSync: string | null;
};

export type SyncStatus = "synced" | "not_configured" | "connection_required" | "error";

export type SyncResult = {
  platform: Platform;
  status: SyncStatus;
  message: string;
  syncedAt: string | null;
};
