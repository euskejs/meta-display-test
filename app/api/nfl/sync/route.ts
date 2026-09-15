import { createHash, timingSafeEqual } from "node:crypto";
import { createNflStore } from "@/lib/nfl-store";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "NFL scheduler is not configured." }, { status: 503, headers });
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "A valid scheduler key is required." }, { status: 401, headers });
  }
  try { return Response.json(await createNflStore(process.env).sync(), { headers }); }
  catch { return Response.json({ error: "NFL sync failed. The next scheduled run will retry." }, { status: 503, headers }); }
}
