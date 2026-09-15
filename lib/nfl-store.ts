import { randomUUID } from "node:crypto";
import { createRedisCommand, isChannel, MessageError } from "./messages.ts";
import { findTeam } from "./nfl-teams.ts";
import { currentSeason, displayUpdate, fetchScores, type Scores } from "./nfl-scores.ts";

export type Preference = { team: string; enabled: boolean; revision: string };
const PREFERENCES = "meta-display:nfl:preferences";
const LOCK = "meta-display:nfl:sync-lock";
const HEALTH = "meta-display:nfl:last-sync";
export const PUBLISH_SCRIPT = `
if redis.call('GET', KEYS[4]) ~= ARGV[5] then return 0 end
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
if redis.call('GET', KEYS[3]) == ARGV[3] then return 0 end
redis.call('SET', KEYS[2], ARGV[4], 'EX', 604800)
redis.call('SET', KEYS[3], ARGV[3], 'EX', 604800)
return 1`;
const RELEASE_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
export const GUARDED_SET_SCRIPT = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[2], ARGV[2]) return 1";

function channelId(channel: unknown) {
  if (!isChannel(channel)) throw new MessageError("Use the display link from the composer website.", 400);
  return channel.toLowerCase();
}
function preference(raw: string): Preference {
  const value = JSON.parse(raw);
  if (!value || !findTeam(value.team) || typeof value.enabled !== "boolean" || typeof value.revision !== "string") {
    throw new MessageError("Saved tracking settings could not be read.", 503);
  }
  return value;
}

export function createNflStore(env: Record<string, string | undefined>, transport = fetch) {
  const command = createRedisCommand(env, transport);
  return {
    async readPreference(channel: unknown): Promise<Preference | null> {
      const raw = await command(["HGET", PREFERENCES, channelId(channel)]);
      return raw === null ? null : preference(raw);
    },
    async savePreference(channel: unknown, team: unknown, enabled: unknown): Promise<Preference | null> {
      const id = channelId(channel);
      if (team === null) { await command(["HDEL", PREFERENCES, id]); return null; }
      if (!findTeam(team) || typeof enabled !== "boolean") throw new MessageError("Choose an NFL team and whether to enable updates.", 400);
      const value = { team: String(team), enabled, revision: randomUUID() };
      await command(["HSET", PREFERENCES, id, JSON.stringify(value)]);
      return value;
    },
    async readScores(season = currentSeason()): Promise<Scores | null> {
      const raw = await command(["GET", `meta-display:nfl:season:${season}`]);
      return raw === null ? null : JSON.parse(raw);
    },
    async health(): Promise<string | null> { return command(["GET", HEALTH]); },
    async sync(source = fetchScores, now = new Date()) {
      const token = randomUUID();
      if (await command(["SET", LOCK, token, "NX", "EX", 50]) !== "OK") return { skipped: true, sent: 0 };
      try {
        const season = currentSeason(now);
        const scoresKey = `meta-display:nfl:season:${season}`;
        const oldRaw = await command(["GET", scoresKey]);
        const old: Scores | null = oldRaw ? JSON.parse(oldRaw) : null;
        const age = old ? now.getTime() - Date.parse(old.fetchedAt) : Infinity;
        const scores = old && age >= 0 && age < 55000 ? old : await source(season);
        // Only this worker can publish. A timed-out worker cannot overwrite a newer run.
        if (await command(["GET", LOCK]) !== token) throw new Error("NFL sync lock expired.");
        if (scores !== old) {
          // Empty/unexpected responses must not erase an existing season history.
          if (old?.games.length && !scores.games.length) throw new Error("NFL source returned an empty season.");
          const archive = new Map(old?.games.filter((game) => game.completed).map((game) => [game.id, game]) ?? []);
          for (const game of scores.games) archive.set(game.id, game);
          scores.games = [...archive.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
          if (await command(["EVAL", GUARDED_SET_SCRIPT, 2, LOCK, scoresKey, token, JSON.stringify(scores)]) !== 1) {
            throw new Error("NFL sync lock expired.");
          }
        }
        const entries: string[] = await command(["HGETALL", PREFERENCES]);
        let sent = 0;
        for (let i = 0; i < entries.length; i += 2) {
          const channel = entries[i], raw = entries[i + 1];
          if (!isChannel(channel)) continue;
          const setting = preference(raw);
          if (!setting.enabled) continue;
          const update = displayUpdate(scores, setting.team, now);
          if (!update) continue;
          const fingerprint = JSON.stringify([setting.revision, update.pages]);
          const saved = JSON.stringify({ message: update.message, pages: update.pages,
            sequenceId: `${scores.season}:${setting.team}:${setting.revision}`, updatedAt: now.toISOString() });
          const published = await command(["EVAL", PUBLISH_SCRIPT, 4, PREFERENCES,
            `meta-display:message:${channel}`, `meta-display:nfl:last:${channel}`, LOCK,
            channel, raw, fingerprint, saved, token]);
          sent += Number(published);
        }
        if (await command(["EVAL", GUARDED_SET_SCRIPT, 2, LOCK, HEALTH, token, now.toISOString()]) !== 1) {
          throw new Error("NFL sync lock expired.");
        }
        return { skipped: false, sent, fetchedAt: scores.fetchedAt };
      } finally { await command(["EVAL", RELEASE_SCRIPT, 1, LOCK, token]); }
    },
  };
}
