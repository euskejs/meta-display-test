import { createHash, timingSafeEqual } from "node:crypto";
import type { DisplayMessage } from "./messages";

type Writer = (channel: unknown, message: unknown) => Promise<DisplayMessage>;
const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 4096;

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers });
}

// Kept separate from the client-imported message helpers: this is server-only.
export function createDisplayApi(apiKey: string | undefined, write: Writer) {
  return async function POST(request: Request) {
    if (!apiKey || apiKey.length < 32) {
      return reply({ error: "External display API is not configured." }, 503);
    }
    const supplied = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(apiKey))) {
      return Response.json({ error: "A valid Bearer API key is required." }, {
        status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" },
      });
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply({ error: "Use Content-Type: application/json." }, 415);
    }

    let body: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "A JSON request body is required." }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return reply({ error: "Request body must not exceed 4096 bytes." }, 413);
        }
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply({ error: "Provide a valid JSON object with channel and message." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "Provide a JSON object with channel and message." }, 400);
    }
    const payload = body as Record<string, unknown>;
    try {
      const saved = await write(payload.channel, payload.message);
      return reply({ success: true, channel: String(payload.channel).toLowerCase(), ...saved }, 200);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 400) {
        return reply({ error: error.message }, 400);
      }
      return reply({ error: "Message could not be saved. Please try again later." }, 503);
    }
  };
}
