import { createNflStore } from "@/lib/nfl-store";
import { findTeam } from "@/lib/nfl-teams";
import { currentSeason, teamSummary } from "@/lib/nfl-scores";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const team = findTeam(new URL(request.url).searchParams.get("team"));
  if (!team) return Response.json({ error: "Choose a valid NFL team." }, { status: 400, headers });
  try {
    const store = createNflStore(process.env);
    const [scores, lastSync] = await Promise.all([store.readScores(), store.health()]);
    if (!scores) return Response.json({ season: currentSeason(), pending: true, lastSync }, { headers });
    return Response.json({ ...teamSummary(scores, team.id), season: scores.season, fetchedAt: scores.fetchedAt,
      stale: Date.now() - Date.parse(scores.fetchedAt) > 180000, lastSync, pending: false }, { headers });
  } catch {
    return Response.json({ error: "Results are temporarily unavailable. Please retry." }, { status: 503, headers });
  }
}
