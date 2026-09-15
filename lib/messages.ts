export const MAX_MESSAGE_LENGTH = 280;
const CHANNEL_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isChannel(value: unknown): value is string {
  return typeof value === "string" && CHANNEL_PATTERN.test(value);
}
export class MessageError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export type DisplayMessage = { message: string; updatedAt: string };
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  // Next may use its listening hostname in request.url (e.g. localhost),
  // even when the browser reached the server through 127.0.0.1.
  const expected = new URL(request.url);
  const host = request.headers.get("host");
  if (host) expected.host = host;
  return origin === expected.origin;
}
export function createMessageStore(env: Record<string, string | undefined>, request = fetch) {
  const command = createRedisCommand(env, request);
  function key(channel: unknown) {
    if (!isChannel(channel)) throw new MessageError("Use the display link from the composer website.", 400);
    return `meta-display:message:${channel.toLowerCase()}`;
  }
  return {
    async read(channel: unknown): Promise<DisplayMessage | null> {
      const result = await command(["GET", key(channel)]);
      if (result === null) return null;
      try {
        const value = JSON.parse(result);
        if (typeof value.message !== "string" || typeof value.updatedAt !== "string") throw new Error();
        return value;
      } catch { throw new MessageError("The saved message could not be read. Send it again from the website.", 503); }
    },
    async write(channel: unknown, message: unknown): Promise<DisplayMessage> {
      const storageKey = key(channel);
      if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
        throw new MessageError(`Enter a message between 1 and ${MAX_MESSAGE_LENGTH} characters.`, 400);
      }
      const value = { message: message.trim(), updatedAt: new Date().toISOString() };
      const result = await command(["SET", storageKey, JSON.stringify(value), "EX", 604800]);
      if (result !== "OK") throw new MessageError("Message was not saved. Please try again.", 503);
      return value;
    },
  };
}

export function createRedisCommand(env: Record<string, string | undefined>, request = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return async function command(args: (string | number)[]) {
    if (!url || !token) throw new MessageError("Message storage is not connected. Connect Upstash Redis in Vercel and redeploy.", 503);
    try {
      const response = await request(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Storage request failed");
      const body = await response.json();
      if (body.error || !("result" in body)) throw new Error("Storage command failed");
      return body.result;
    } catch {
      throw new MessageError("Message storage is temporarily unavailable. Please try again.", 503);
    }
  }
}
