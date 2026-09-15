import { isChannel, isSameOrigin } from "@/lib/messages";
import { createNflStore } from "@/lib/nfl-store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Uses the paired channel's existing access model. It never refreshes other
// displays and does not expose the scheduler secret to a browser.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!isSameOrigin(request)) return Response.json({ error: "Refresh scores from your paired display or composer." }, { status: 403, headers });
  const channel = new URL(request.url).searchParams.get("channel");
  if (!isChannel(channel)) return Response.json({ error: "Use your paired display link." }, { status: 400, headers });
  try {
    return Response.json(await createNflStore(process.env).sync(undefined, undefined, channel), { headers });
  } catch {
    return Response.json({ error: "Scores could not be refreshed. Please retry shortly." }, { status: 503, headers });
  }
}
