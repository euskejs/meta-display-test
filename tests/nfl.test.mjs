import test from 'node:test';
import assert from 'node:assert/strict';
import { NFL_TEAMS, CONFERENCES, DIVISIONS } from '../lib/nfl-teams.ts';
import { currentSeason, parseScoreboard, teamSummary, displayUpdate } from '../lib/nfl-scores.ts';
import { createNflStore } from '../lib/nfl-store.ts';
import { createMessageStore } from '../lib/messages.ts';
import { fakeRedis } from './helpers/fake-redis.mjs';

const channel = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { KV_REST_API_URL: 'https://redis.example', KV_REST_API_TOKEN: 'test' };
const now = new Date('2026-09-15T00:00:00Z');
const game = { id: 'one', date: '2026-09-14T00:20:00Z', season: 2026, phase: 2, week: 1,
  home: 'DAL', away: 'PHI', homeScore: 14, awayScore: 7, state: 'in', completed: false, status: '8:00 - 3rd' };
const scores = (games = [game], date = now) => ({ season: 2026, fetchedAt: date.toISOString(), games: structuredClone(games) });

test('every conference/division has exactly four unique teams; Cowboys are NFC East', () => {
  assert.equal(NFL_TEAMS.length, 32);
  assert.equal(new Set(NFL_TEAMS.map(t => t.id)).size, 32);
  for (const conference of CONFERENCES) for (const division of DIVISIONS) {
    assert.equal(NFL_TEAMS.filter(t => t.conference === conference && t.division === division).length, 4);
  }
  assert.deepEqual(NFL_TEAMS.find(t => t.id === 'DAL'), { id: 'DAL', name: 'Dallas Cowboys', conference: 'NFC', division: 'East' });
});
test('season rolls over after February and regular-season record excludes playoffs', () => {
  assert.equal(currentSeason(new Date('2027-02-28T12:00Z')), 2026);
  assert.equal(currentSeason(new Date('2027-03-01T00:00Z')), 2027);
  const completed = { ...game, state: 'post', completed: true, status: 'Final/OT' };
  const summary = teamSummary(scores([completed,
    { ...completed, id: 'tie', homeScore: 7 },
    { ...completed, id: 'loss', homeScore: 0 },
    { ...completed, id: 'playoffs', phase: 3 },
    { ...completed, id: 'canceled', completed: false, status: 'Canceled' },
  ]), 'DAL', now);
  assert.equal(summary.record, '1–1–1');
  assert.ok(displayUpdate(scores(), 'DAL', now).message.length <= 280);
});
test('source parsing handles score strings, live clocks, finals, and missing scores safely', () => {
  const event = { id: 'espn-game', date: game.date, season: { year: 2026, type: 2 }, week: { number: 1 },
    competitions: [{ competitors: [
      { homeAway: 'home', team: { abbreviation: 'DAL' }, score: '14' },
      { homeAway: 'away', team: { abbreviation: 'PHI' }, score: '7' },
    ] }], status: { type: { state: 'in', completed: false, shortDetail: '8:00 - 3rd' } } };
  assert.equal(parseScoreboard({ events: [event] }, 2026, now).games[0].homeScore, 14);
  assert.equal(parseScoreboard({ events: [event] }, 2025, now).games.length, 0);
  delete event.competitions[0].competitors[0].score;
  assert.throws(() => parseScoreboard({ events: [event] }, 2026, now), /missing scores/);
  assert.throws(() => parseScoreboard({}, 2026, now), /events/);
});
test('preferences persist across instances, isolate channels, and reject invalid input', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport);
  assert.equal(await store.readPreference(channel), null);
  await store.savePreference(channel.toUpperCase(), 'DAL', true);
  assert.equal((await createNflStore(env, db.transport).readPreference(channel)).team, 'DAL');
  assert.equal(await store.readPreference(other), null);
  await assert.rejects(store.savePreference(channel, 'invalid', true), { status: 400 });
  await assert.rejects(store.savePreference('invalid', 'DAL', true), { status: 400 });
  await assert.rejects(store.savePreference(channel, 'DAL', 'true'), { status: 400 });
  await store.savePreference(channel, null, false);
  assert.equal(await store.readPreference(channel), null);
});
test('live scores reach existing display reader; duplicates skipped, finals/corrections delivered', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport), messages = createMessageStore(env, db.transport);
  await store.savePreference(channel, 'DAL', true);
  await store.savePreference(other, 'BUF', true);
  assert.equal((await store.sync(async () => scores(), now)).sent, 1);
  assert.match((await messages.read(channel)).message, /PHI 7 · DAL 14/);
  assert.equal(await messages.read(other), null);
  assert.equal((await store.sync(async () => assert.fail('Cached fetch expected'), now)).sent, 0);
  const later = new Date(now.getTime() + 60000);
  assert.equal((await store.sync(async () => scores([{ ...game, status: '7:00 - 3rd' }], later), later)).sent, 1);
  const finalTime = new Date(later.getTime() + 60000);
  const final = { ...game, state: 'post', completed: true, status: 'Final/OT' };
  assert.equal((await store.sync(async () => scores([final], finalTime), finalTime)).sent, 1);
  assert.match((await messages.read(channel)).message, /Final\/OT\n2026 regular season: 1–0–0/);
  const correctionTime = new Date(finalTime.getTime() + 60000);
  assert.equal((await store.sync(async () => scores([{ ...final, awayScore: 17 }], correctionTime), correctionTime)).sent, 1);
  assert.match((await messages.read(channel)).message, /0–1–0/);
});
test('paused and changed subscriptions cannot receive an in-flight update', async () => {
  for (const action of ['pause', 'switch', 'remove']) {
    const db = fakeRedis(), store = createNflStore(env, db.transport), messages = createMessageStore(env, db.transport);
    await store.savePreference(channel, 'DAL', true);
    await messages.write(channel, 'Manual text');
    db.setBeforePublish(() => {
      const hash = db.hashes.get('meta-display:nfl:preferences');
      if (action === 'remove') hash.delete(channel);
      else hash.set(channel, JSON.stringify({ team: action === 'switch' ? 'BUF' : 'DAL', enabled: action !== 'pause', revision: 'changed' }));
    });
    assert.equal((await store.sync(async () => scores(), now)).sent, 0);
    assert.equal((await messages.read(channel)).message, 'Manual text');
  }
});
test('source outages preserve data, release lock, and allow successful retry', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport), messages = createMessageStore(env, db.transport);
  await store.savePreference(channel, 'DAL', true);
  await store.sync(async () => scores(), now);
  const before = await messages.read(channel), later = new Date(now.getTime() + 60000);
  await assert.rejects(store.sync(async () => { throw new Error('Source failed'); }, later));
  assert.deepEqual(await messages.read(channel), before);
  assert.equal(db.values.has('meta-display:nfl:sync-lock'), false);
  await assert.rejects(store.sync(async () => scores([], later), later), /empty season/);
  assert.equal((await store.readScores(2026)).games.length, 1);
  assert.equal((await store.sync(async () => scores([{ ...game, homeScore: 21 }], later), later)).sent, 1);
});
test('overlapping workers skip and expired workers cannot publish', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport);
  db.values.set('meta-display:nfl:sync-lock', 'another-worker');
  assert.equal((await store.sync(async () => assert.fail('Must not fetch'), now)).skipped, true);
  db.values.delete('meta-display:nfl:sync-lock');
  await store.savePreference(channel, 'DAL', true);
  db.setBeforePublish(() => db.values.set('meta-display:nfl:sync-lock', 'new-worker'));
  await assert.rejects(store.sync(async () => scores(), now), /lock expired/);
  assert.equal(db.values.has(`meta-display:message:${channel}`), false);
  assert.equal(db.values.get('meta-display:nfl:sync-lock'), 'new-worker');
});
