# External display API

External applications can replace the latest text on a paired display using:

```text
POST https://meta-display-test.vercel.app/api/v1/display
```

This endpoint is intended for backend services, scripts, and native applications that can keep credentials secure. Browser frontends should call their own backend; this endpoint does not enable cross-origin browser access (CORS). Never embed the API key in public JavaScript.

## One-time setup

1. Generate a random API key locally:

   ```bash
   openssl rand -hex 32
   ```

2. In **Vercel → meta-display-test → Settings → Environment Variables**, save the generated value as `DISPLAY_API_KEY` for **Production**, using a Secret variable. The key must contain at least 32 characters. Do not prefix it with `NEXT_PUBLIC_`.
3. Save the same value in the external application's secret settings. This is an application API key, not your Redis token.
4. Push this code and deploy it. Redeploy after adding or rotating the key. Redis must already be connected.
5. Open the composer, copy its glasses display link, and take the UUID after `channel=`. Use that exact value in API calls. The glasses must be displaying that same channel.

The configured key can write to any valid channel UUID. Keep it private. The existing composer API still uses the private channel link as its access key; adding this external API does not change that access model. There is no account-level authorization or rate limiting in this personal demo.

## Request

Headers:

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

JSON body:

```json
{
  "channel": "YOUR_CHANNEL_UUID",
  "message": "Your meeting starts in five minutes."
}
```

- `channel`: the UUID from your existing display link, not the entire URL.
- `message`: a nonempty string up to 280 UTF-16 code units, including whitespace before trimming. Leading/trailing whitespace is removed; internal line breaks are preserved.
- Request bodies are limited to 4096 bytes.

Set `DISPLAY_API_KEY` securely in your calling environment, then run this example after replacing `YOUR_CHANNEL_UUID`:

```bash
curl --fail-with-body \
  --request POST 'https://meta-display-test.vercel.app/api/v1/display' \
  --header "Authorization: Bearer ${DISPLAY_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{"channel":"YOUR_CHANNEL_UUID","message":"Hello from my external app"}'
```

Backend JavaScript (Node.js):

```js
const response = await fetch('https://meta-display-test.vercel.app/api/v1/display', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.DISPLAY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    channel: process.env.DISPLAY_CHANNEL,
    message: 'Your meeting starts in five minutes.',
  }),
  signal: AbortSignal.timeout(15000),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log('Saved at:', result.updatedAt);
```

## Responses

A successful request returns HTTP 200:

```json
{
  "success": true,
  "channel": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "message": "Hello from my external app",
  "updatedAt": "2026-09-11T18:00:00.000Z"
}
```

HTTP 200 confirms that Redis saved the message. It does not confirm that the glasses rendered it. Keep the display web app open; it normally fetches the new text on its next two-second poll, plus network latency. The API cannot launch the glasses app remotely.

Each successful call replaces the prior text and resets its seven-day expiry. Concurrent writers (including the composer) use last-write-wins ordering at Redis. There is no message queue or delivery acknowledgement. If a request times out, it might already have saved; retrying the same text is safe, but may overwrite newer text from another writer.

Errors have the form `{"error":"Explanation"}`:

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON, channel, or message |
| 401 | Missing or incorrect Bearer key |
| 413 | Request body exceeds 4096 bytes |
| 415 | Content-Type is not application/json |
| 503 | API key is not configured, or storage is unavailable |

Unsupported methods such as GET receive the framework's HTTP 405 response. API responses are not cached.

## Verify after deployment

1. Open your paired live display in a browser or on the glasses.
2. Send the curl request. Expect HTTP 200 and then the new text without refreshing.
3. Send a second message to the same channel. It should replace the first.
4. Repeat with a wrong API key. Expect HTTP 401 and no message change.

Automated tests use the real request handler with a fake Redis transport. Live Vercel/Upstash and physical-glasses verification must be performed after deployment.
