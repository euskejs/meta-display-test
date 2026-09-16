# NFL live results tracker

The composer supports **NFL → Conference (AFC/NFC) → Division → Team**. Each division has four teams. Dallas is **NFC → East → Dallas Cowboys**. Team alignment is maintained in `lib/nfl-teams.ts`; the [NFL team directory](https://www.nfl.com/teams/) is the reference.

## Common URL for different users

Everyone can add `https://meta-display-test.vercel.app/display` in Meta AI. On first use, the glasses browser generates and remembers its own private channel and opens the team picker. Different browser storage profiles have independent selections. Reopening the URL reuses the saved channel; clearing site storage resets this pairing. If storage is unavailable, a warning explains that the selection may not survive reopening.

Existing `/display?channel=...` links still pair with the specified channel, which is saved locally before the channel parameter is removed from the address bar. Invalid explicit channel links show an error instead of silently switching displays. The UUID still exists internally for API calls; this hides it from the display URL, not from browser developer tools.

To control glasses from a separate phone composer or vendor API, use the original private pairing link once. Opening the common URL independently on two devices does not pair them. The composer continues to provide private channel-specific links for this purpose.

## Use

1. Open the bookmarked composer, or select **Change team** on the paired glasses display.
2. On the phone composer, choose a conference, division, and team, then click **Track this team**. On the glasses, use the large button menus: **Conference → Division → Team → Follow team**. Up/down moves the highlighted focus (wrapping at the ends), and Select/Enter activates the focused button. **Back** or Escape returns one step; **Back to display** exits without saving. The saved choice is focused when available. Confirmation saves the choice, returns to scores, and requests an immediate refresh. **Pause updates** and **Resume updates** remain available on the conference screen.
3. Keep the display web app open on the glasses. The composer can be closed after saving.
4. The composer lists every completed match oldest-first, including games played before you started tracking. The glasses cycle through one game every 10 seconds in the same order; an in-progress game is appended after the completed results and continues to receive score/status updates. With one result, that result stays on screen. The composer also shows the regular-season W–L–T record, next game, and season schedule.
5. Click **Pause automatic updates** before sending manual text you want to keep. **Resume updates** sends the current result again. Removing the saved team stops future updates and leaves the current display text intact.

Changing conference clears division and team; changing division clears team. Draft selections do not affect the saved subscription until **Track this team** (composer) or **Follow team** (glasses confirmation) is selected. Settings are stored per channel in Redis and follow the same composer bookmark across devices. The channel link grants access to these settings, as it does to manual messages.

## Optional background setup

No separate scheduler is required while the composer or glasses display is open. After tracking is enabled, the composer immediately requests a score refresh; the glasses also request one when opened and approximately every minute afterward. Requests only publish to their own saved, enabled channel and reuse the shared league snapshot. An optional scheduler keeps scores fresh even when both pages are closed. No scheduler account or production configuration is changed by this implementation.

1. Keep the existing Upstash Redis connection configured. It must support `GET`, `SET`, hashes, and `EVAL`.
2. Generate a scheduler secret with `openssl rand -hex 32`. Configure **CRON_SECRET** in Vercel Production and redeploy. Use a separate secret from `DISPLAY_API_KEY`; neither belongs in public JavaScript.
3. To refresh even with all pages closed, choose **one** scheduling option below, running every minute. You may run it once to populate results before inviting users.

### Any always-on Node.js host

Set these variables securely on that host (or in the ignored `.env.local` for local development):

```dotenv
NFL_SYNC_URL=https://meta-display-test.vercel.app/api/nfl/sync
CRON_SECRET=YOUR_SCHEDULER_SECRET
```

Run with Node.js 22.18+:

```bash
npm run nfl:worker -- --once
npm run nfl:worker
```

The worker calls the sync endpoint immediately and then every minute, without overlapping requests. Keep the process running under your host's service manager. It only needs the URL and scheduler secret; it does not need Redis or display API credentials. Stopping the worker stops background refreshes; open composers and glasses displays continue refreshing their enabled channels. For local testing, set the URL to `http://127.0.0.1:3000/api/nfl/sync` and run the app too.

### Vercel Pro or Enterprise Cron

Copy the `crons` entry from [vercel-cron.example.json](vercel-cron.example.json) into your root `vercel.json`, merging any existing settings, then deploy. Vercel supplies `Authorization: Bearer <CRON_SECRET>` to the endpoint.

Minute-level Vercel Cron requires Pro or Enterprise. Hobby allows only daily cron and rejects more frequent schedules at deployment; use an external scheduler or the Node worker on Hobby. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs). The example is deliberately not activated in the project root.

### Another scheduler

Configure a minute-by-minute HTTPS GET to `/api/nfl/sync` with the scheduler secret as a Bearer token. Do not put the secret in the URL. The route requires at least 32 characters and rejects unauthorized requests before accessing storage. It returns `200` with `{ "skipped": false, "sent": 1, "fetchedAt": "..." }`, or `skipped: true` if another worker holds the lock. Failures return `503`; the next scheduled run retries.

## Data and delivery behavior

- Source: ESPN's public structured [NFL scoreboard feed](https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard). This is an undocumented website feed, with no integration SLA. Review source usage terms for your deployment; no license or production availability is implied. The adapter is isolated in `lib/nfl-scores.ts` so it can be replaced.
- One shared full-season league fetch per minute, independent of the number of followers. Successful snapshots less than 55 seconds old are reused. With an open tracked display or a continuous scheduler this is roughly 1,440 source requests per day, plus Redis and hosting usage.
- The season is the current year from March onward; January/February use the previous year's season. Regular season and assigned playoff games are included, preseason is excluded, and playoff results do not affect the regular-season record. Future playoff placeholders are omitted until teams are assigned.
- Results are archived by season/game ID without expiry. New snapshots update scores and game statuses; completed games omitted by a later feed are retained. Empty responses cannot erase an existing season.
- A sync writes directly to the same Redis message key used by `POST /api/v1/display`. It does not make an HTTP round trip or expose that API's key. The glasses reader supports optional NFL pages in addition to ordinary single messages. Redeploy both the tracker and display page for chronological playback.
- Each completed result has its own page with date (Central time), week/playoff label, win/loss/tie, score, status, season, and current record. Pages are ordered by actual kickoff date, oldest-first, with live coverage appended. Every page stays within 280 UTF-16 code units; a full season is never truncated to a single message. A page counter indicates progress. Ordinary two-second polls and score corrections do not restart the 10-second rotation; switching teams or resuming tracking starts at the first page. Overtime/ties are supported. Changes to any page, including a historical score correction, trigger updates; identical page sequences are skipped. Manual/API messages replace the sequence with a single message. Pausing or switching teams is checked atomically at publication, so an in-flight worker cannot send an update for an obsolete setting.
- The sync uses a 50-second lock; expired workers cannot publish, overwrite snapshots, or release another worker's lock. Successful message and duplicate-marker writes are atomic. Display text and duplicate markers expire after seven days; preferences and season history do not.
- Expected latency is about one minute plus provider/network delays and the glasses' two-second poll. This is periodic live scoring, not a play-by-play stream or device-delivery acknowledgement.
- The composer requests a channel refresh and reads results every 30 seconds after the previous request finishes. The glasses independently request a channel refresh every 60 seconds after the previous request finishes. After three minutes without a fresh snapshot, it labels the results delayed. If storage/source fails, existing results and the display text are retained. Before the first sync, an enabled composer starts fetching automatically. Source failures show a retry message; paused subscriptions ask the user to resume updates.
- This remains a personal demo: no accounts, subscription quotas, or request rate limiting. Subscriber delivery is sequential within one function invocation; a large subscriber population needs batching/queues before scaling.

## Internal API

| Endpoint | Contract |
| --- | --- |
| `GET /api/nfl/preferences?channel=<UUID>` | Returns `{team: {id,name,conference,division} \| null, enabled: boolean}`. |
| `POST /api/nfl/preferences` | JSON `{channel, team: "DAL", enabled: true}`. Use `false` to pause or `team: null` to remove. Requires same-origin browser requests; body limit 4,096 bytes. |
| `GET /api/nfl/results?team=DAL` | Returns current season summary, games, source refresh time, and `stale`. Before the first sync, returns `pending: true`. |
| `POST /api/nfl/refresh?channel=<UUID>` | Same-origin channel refresh used by the composer/glasses. Unknown or paused channels are skipped; no scheduler secret is needed. Only the target channel is updated. |
| `GET /api/nfl/sync` | Optional protected scheduler endpoint described above. |

The vendor-facing text API in [API.md](API.md) is unchanged.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. Tests cover all divisions, season boundaries, source parsing, records, live/final updates, corrections, channel isolation, pause/switch races, duplicate suppression, outages, and overlapping workers. Tests use an in-memory Redis transport; production Upstash Lua execution and physical-glasses delivery still need a deployment smoke test.

After deployment: save a team and confirm a populated results panel and text on the paired display without running a worker. Close the composer and confirm the glasses continue refreshing. Reopen the glasses web app after deploying so it loads the new refresh code. If using the optional scheduler, also run its worker once and confirm `200`. Verify that a wrong scheduler key returns `401`, and that pausing prevents later automated replacements. During a live game, confirm score/status changes arrive without keeping the composer open.
