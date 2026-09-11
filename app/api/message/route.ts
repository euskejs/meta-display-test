import { createMessageStore, MessageError } from "@/lib/messages";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  return Response.json(
    { error: error instanceof MessageError ? error.message : "Unable to process the message. Please try again." },
    { status: error instanceof MessageError ? error.status : 500, headers },
  );
}
export async function GET(request: Request) {
  try {
    const channel = new URL(request.url).searchParams.get("channel");
    return Response.json({ message: await createMessageStore(process.env).read(channel) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Send messages from the composer website." }, { status: 403, headers });
  }
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new MessageError("Message is too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new MessageError("Invalid message request.", 400); }
    if (!body || typeof body !== "object") throw new MessageError("Invalid message request.", 400);
    return Response.json({ message: await createMessageStore(process.env).write(body.channel, body.message) }, { headers });
  } catch (error) { return failure(error); }
}
