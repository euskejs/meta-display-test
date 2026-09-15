# Meta Display Composer

Type a short message on the website and send it to a live page running on Meta Ray-Ban Display glasses. Add the display link to Meta AI once; message text is never included in that link.

## How it works

- `/` creates a random display channel, remembers it in this browser, and puts it in the composer URL for bookmarking.
- The composer saves messages through `POST /api/message` to Upstash Redis.
- `/display?channel=...` reads `GET /api/message` every two seconds. Keep this page open on the glasses.
- The latest message replaces the previous one, survives server restarts, and expires seven days after the last send. There is no message history.
- Failed reads retain the last displayed message and retry with backoff up to 30 seconds. A successful send confirms storage, not that the glasses have rendered it.
- Messages support line breaks and up to 280 UTF-16 characters. Keep notes short for the glasses screen.

Each channel link is an access key: anyone who knows it can read or send to that channel. Keep both the composer bookmark and glasses link private. This is a personal demo, without accounts or production abuse/rate-limit controls. Upstash credentials remain server-side. Polling uses storage commands and hosting requests while the display is open.

## Connect Upstash on Vercel

1. Open the `meta-display-test` project in Vercel.
2. Open **Storage** and create/connect **Upstash for Redis** through the Marketplace. Select a plan and region suitable for your use and connect it to this project's Production environment (and Preview if needed).
3. Verify that Vercel's environment variables contain either pair:
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the default Marketplace names are supported).
4. If creating Redis directly in the Upstash console, copy its HTTPS REST URL and write-capable REST token into those Vercel environment variables yourself. Do not use the read-only token or prefix them with `NEXT_PUBLIC_`.
5. Commit and push this implementation, then wait for Vercel to deploy it. If you add variables after deployment, redeploy so they take effect.

Official setup: https://upstash.com/docs/redis/howto/vercelintegration

## Pair the glasses and send messages

1. Open `https://meta-display-test.vercel.app/` on the phone or computer you will type on.
2. Bookmark the composer URL, including its generated `channel` value. Use that bookmark on another phone/computer to control the same display. Clearing browser storage without keeping the bookmark creates a new channel.
3. Click **Copy display link**. In Meta AI's Developer Mode, add this link under your Display glasses' **App connections → Web apps → Add a web app**.
4. Launch the added web app on the glasses and leave it open.
5. Type a message on the composer and click **Send to display**. The glasses page normally picks it up after the next two-second poll plus network latency.
6. Send a second message without changing the glasses URL. It replaces the first automatically.

Old links containing `?message=...` no longer display static messages; replace them with the generated display link. Opening `/display` without a channel shows pairing instructions.

## External applications

Use `POST /api/v1/display` with a Bearer key to update the same live display from another application. Configure `DISPLAY_API_KEY` in Vercel and redeploy first. See [the API guide](docs/API.md) for setup, curl/JavaScript examples, response codes, and verification steps.

## NFL live scores

Choose **Conference → Division → Team** in the composer, then **Track this team** to save a per-display subscription. The panel shows every completed match oldest-first, live scores, the season record, and the next game. The glasses cycle through the results every 10 seconds, one game per page, with any live game appended. **Pause automatic updates** lets you keep manual text on the display.

Automatic updates require `CRON_SECRET` and a scheduler calling `/api/nfl/sync` every minute. An always-on Node worker is included (`npm run nfl:worker`); Vercel Pro/Enterprise Cron and other schedulers are also supported. See [NFL setup and behavior](docs/NFL.md) before enabling production tracking. The glasses app must remain open; the composer can be closed.

## Local development

Use Node.js 22.18+ (or 24 LTS) for the built-in TypeScript test runner.

```bash
npm ci
```

Create an ignored `.env.local` with your own Redis REST credentials:

```dotenv
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR-WRITE-TOKEN
```

Then run:

```bash
npm run dev
```

Open the composer at `http://localhost:3000`, then **Open live display** in another tab. Send two different messages and confirm the display updates without refreshing. Localhost links cannot be used by the glasses; use the deployed HTTPS link there.

## Checks

```bash
npm run lint
npm test
npm run build
```

Tests use a fake Redis transport to verify separate sender/reader instances, channel isolation, validation, missing setup, and storage failures. They do not require real credentials. Browser testing can use a local Redis REST test server; production credentials and physical glasses still require a deployment/device test.

If the local environment prevents Turbopack from binding a worker port, `npm run build -- --webpack` is an alternate build verification command. It does not change Vercel's default build command.

## Troubleshooting

- **Message storage is not connected:** connect Redis and redeploy with the environment variables above.
- **Message storage is temporarily unavailable:** check Redis credentials, service status, and quota; the display retries automatically.
- **Different message on glasses:** use the exact display link generated by the current composer bookmark.
- **Vercel login on the glasses:** verify the production link opens in a private browser without authentication.
- **Old page after deployment:** close and reopen the glasses app. This update requires replacing the old static-message URL once.
