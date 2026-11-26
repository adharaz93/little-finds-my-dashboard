# Analytics: data model and API sync readiness

## Data model (localStorage `lfm-studio-v2`)

- **ContentItem** (the parent): title, pillar, main idea, asset link, notes, `publications[]`.
- **Publication** (one per platform): platform (Instagram, TikTok, Threads), caption, status,
  scheduled date, published date, post URL, platform post ID, `metrics`, `metricsSource`,
  `lastSyncedAt`, `snapshots[]`.
- **metricsSource** is `demo`, `manual` or `synced`. Only `manual` and `synced` count as real
  performance. Analytics shows real data by default and demo numbers only in a labelled preview.
- `impressions` and `saves` are `null` when a platform does not report them ("Not reported").

### Migration

On load the store reads `lfm-studio-v2`. If it is absent it reads `lfm-studio-v1` and converts
each old item into a parent with one publication. Untouched demo samples become the new demo
samples; anything else keeps its values, and old numbers are marked `manual`. The v1 key is never
written or deleted, so it remains a backup.

## Sync architecture (prepared, not connected)

| Piece | Where | State |
|---|---|---|
| Connection status | `GET /api/integrations/status` | Done. Reports configured / connected and the names of missing settings. |
| Refresh now | `POST /api/integrations/sync` | Done. Returns a status per platform; never returns metrics without a real API response. |
| Provider config | `src/lib/integrations/config.ts` | Done. One entry per platform. |
| OAuth start / callback | `app/api/integrations/[platform]/connect`, `/callback` | **To build** |
| Token store | a server database table, encrypted with `TOKEN_ENCRYPTION_KEY` | **To build** (needs the database decision) |
| Metric fetch per platform | inside `syncAll()` | **To build** |
| Scheduled sync | a cron calling `POST /api/integrations/sync` with a secret header | **To build** |
| Snapshots | `Publication.snapshots[]` locally; a `metric_snapshots` table on the server | Shape done; server table to build |

Tokens must only ever live on the server. The browser receives connection states and sync
results, never tokens.

## What is still needed from you

1. **Instagram** (Instagram API with Instagram Login): a Meta developer app, an Instagram
   professional (Business or Creator) account, and the `instagram_business_basic` and
   `instagram_business_manage_insights` permissions approved through App Review.
   Settings: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`.
2. **TikTok** (Login Kit + Display API): a TikTok for Developers app with `user.info.basic` and
   `video.list` scopes approved. The Display API gives per-video views, likes, comments and shares;
   reach and saves are not provided. Settings: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
   `TIKTOK_REDIRECT_URI`.
3. **Threads** (Threads API): a Meta app with the Threads use case, and `threads_basic` and
   `threads_manage_insights` permissions. Settings: `THREADS_APP_ID`, `THREADS_APP_SECRET`,
   `THREADS_REDIRECT_URI`.
4. **Shared:** `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64), a server database for tokens and
   snapshots (to be decided before adding Supabase or similar), a deployed HTTPS URL for the OAuth
   redirects, and a scheduler (for example Vercel Cron) plus a `CRON_SECRET`.

Each platform's exact permission names and available metrics should be checked against its
current developer documentation at the time of the App Review submission.
