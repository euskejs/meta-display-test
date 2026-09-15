import { findTeam } from "./nfl-teams.ts";

export type Game = {
  id: string; date: string; season: number; phase: number; week: number;
  home: string; away: string; homeScore: number | null; awayScore: number | null;
  state: "pre" | "in" | "post"; completed: boolean; status: string;
};
export type Scores = { season: number; fetchedAt: string; games: Game[] };

export function currentSeason(now = new Date()) {
  // The postseason belongs to the previous fall's season.
  return now.getUTCFullYear() - (now.getUTCMonth() < 2 ? 1 : 0);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected NFL data format.");
  return value as Record<string, unknown>;
}
function score(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 0) throw new Error("Invalid NFL score.");
  return number;
}
function teamId(value: unknown) {
  const id = object(value).abbreviation;
  // ESPN uses WSH and occasionally WAS; Jacksonville has also used JAC.
  return id === "WAS" ? "WSH" : id === "JAC" ? "JAX" : id;
}

export function parseScoreboard(payload: unknown, season: number, now = new Date()): Scores {
  const events = object(payload).events;
  if (!Array.isArray(events)) throw new Error("NFL feed did not contain events.");
  const games: Game[] = [];
  for (const value of events) {
    const event = object(value);
    const eventSeason = object(event.season);
    if (eventSeason.year !== season || ![2, 3].includes(Number(eventSeason.type))) continue;
    const competition = object((event.competitions as unknown[])?.[0]);
    const competitors = competition.competitors;
    if (!Array.isArray(competitors)) throw new Error("NFL game is missing competitors.");
    const home = competitors.map(object).find((item) => item.homeAway === "home");
    const away = competitors.map(object).find((item) => item.homeAway === "away");
    // Future playoff placeholders have no assigned team yet.
    if (!home || !away || !home.team || !away.team) continue;
    const homeId = teamId(home.team), awayId = teamId(away.team);
    if (!findTeam(homeId) || !findTeam(awayId)) {
      if (Number(eventSeason.type) === 3 && !object(event.status).type) continue;
      // ESPN's unassigned postseason participants use abbreviation TBD.
      if (!homeId || !awayId || homeId === "TBD" || awayId === "TBD") continue;
      throw new Error("NFL feed contains an unknown team.");
    }
    const status = object(object(event.status).type);
    if (!["pre", "in", "post"].includes(String(status.state)) || typeof event.id !== "string" ||
      typeof event.date !== "string" || !Number.isFinite(Date.parse(event.date))) throw new Error("Invalid NFL game state.");
    const homeScore = score(home.score), awayScore = score(away.score);
    if ((status.state === "in" || status.completed === true) && (homeScore === null || awayScore === null)) throw new Error("NFL game is missing scores.");
    const detail = status.shortDetail ?? status.description;
    if (typeof detail !== "string") throw new Error("NFL game is missing status text.");
    games.push({
      id: event.id, date: event.date, season, phase: Number(eventSeason.type),
      week: Number(object(event.week).number), home: String(homeId), away: String(awayId),
      homeScore, awayScore, state: status.state as Game["state"], completed: status.completed === true,
      status: detail.slice(0, 70),
    });
  }
  return { season, fetchedAt: now.toISOString(), games: games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)) };
}

export async function fetchScores(season = currentSeason(), request = fetch): Promise<Scores> {
  const response = await request(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}0901-${season + 1}0301&limit=1000`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("NFL score source is unavailable.");
  return parseScoreboard(await response.json(), season);
}

export function teamSummary(scores: Scores, team: string, now = new Date()) {
  const games = scores.games.filter((game) => game.home === team || game.away === team)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
  const finals = games.filter((game) => game.completed);
  let wins = 0, losses = 0, ties = 0;
  for (const game of finals.filter((game) => game.phase === 2)) {
    const own = game.home === team ? game.homeScore! : game.awayScore!;
    const opponent = game.home === team ? game.awayScore! : game.homeScore!;
    if (own > opponent) wins++; else if (own < opponent) losses++; else ties++;
  }
  const live = games.find((game) => game.state === "in" && !game.completed);
  const latest = finals.at(-1);
  const next = games.find((game) => game.state === "pre" && Date.parse(game.date) >= now.getTime());
  return { games, finals, live, latest, next, record: `${wins}–${losses}–${ties}` };
}

export function teamLogoUrl(team: string) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png`;
}

export function displayUpdate(scores: Scores, team: string, now = new Date()) {
  const summary = teamSummary(scores, team, now);
  const game = summary.live ?? summary.latest ?? summary.next;
  if (!game) return null;

  const lines: string[] = [
    findTeam(team)?.name ?? team,
    `${scores.season} regular season: ${summary.record}`,
  ];

  if (summary.live) {
    const live = summary.live;
    lines.push(`LIVE ${live.away} ${live.awayScore} · ${live.home} ${live.homeScore}`);
    lines.push(live.status);
  }

  if (summary.finals.length) {
    const compact = summary.finals.map((result) => {
      const own = result.home === team ? result.homeScore! : result.awayScore!;
      const opponent = result.home === team ? result.awayScore! : result.homeScore!;
      const outcome = own > opponent ? "W" : own < opponent ? "L" : "T";
      return `${outcome} ${result.away} ${own}-${opponent}`;
    });
    lines.push(`Results: ${compact.join(" | ")}`);
  }

  if (summary.next) {
    const next = summary.next;
    lines.push(`Next: ${next.away} at ${next.home}`);
    lines.push(next.status);
  }

  const message = lines.join("\n").slice(0, 280);
  return { game, teamId: team, logoUrl: teamLogoUrl(team), message, pages: [message] };
}
