import { isSameOrigin, MessageError } from "@/lib/messages";
import { createNflStore } from "@/lib/nfl-store";
import { findTeam } from "@/lib/nfl-teams";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  return Response.json({ error: error instanceof MessageError ? error.message : "Unable to save or load your team. Please try again." },
    { status: error instanceof MessageError ? error.status : 503, headers });
}

export async function GET(request: Request) {
  try {
    const channel = new URL(request.url).searchParams.get("channel");
    const saved = await createNflStore(process.env).readPreference(channel);
    return Response.json({ team: findTeam(saved?.team) ?? null, enabled: saved?.enabled ?? false }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Save your team from the composer website." }, { status: 403, headers });
  }
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new MessageError("Use Content-Type: application/json.", 415);
    }
    const reader = request.body?.getReader();
    if (!reader) throw new MessageError("Provide a JSON request body.", 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new MessageError("Request body is too large.", 413); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new MessageError("Provide valid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.team !== null && !findTeam(body.team))) {
      throw new MessageError("Choose a valid NFL team.", 400);
    }
    const saved = await createNflStore(process.env).savePreference(body.channel, body.team, body.enabled);
    return Response.json({ team: findTeam(saved?.team) ?? null, enabled: saved?.enabled ?? false }, { headers });
  } catch (error) { return failure(error); }
}
