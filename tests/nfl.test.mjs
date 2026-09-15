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
  assert.match((await messages.read(channel)).message, /Dallas Cowboys\n2026 regular season: 1–0–0/);
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

test('completed games remain ordered by kickoff, live coverage stays newest, and the next match is appended', () => {
  const first = { ...game, id: 'first', date: '2026-09-07T00:20Z', completed: true, state: 'post', status: 'Final' };
  const second = { ...first, id: 'second', date: '2026-09-14T00:20Z', week: 2, homeScore: 3 };
  const live = { ...game, id: 'live', date: '2026-09-21T00:20Z', week: 3 };
  const future = { ...game, id: 'future', date: '2026-09-28T00:20Z', week: 4, state: 'pre', completed: false, homeScore: null, awayScore: null, status: 'Sun 1:00PM' };
  const input = scores([future, second, live, first]);
  const summary = teamSummary(input, 'DAL', now);
  assert.deepEqual(summary.finals.map(g => g.id), ['first', 'second']);
  assert.deepEqual(input.games.map(g => g.id), ['future', 'second', 'live', 'first']);
  const update = displayUpdate(input, 'DAL', now);
  assert.equal(update.pages.length, 1);
  assert.match(update.pages[0], /Dallas Cowboys/);
  assert.match(update.pages[0], /LIVE/);
  assert.match(update.pages[0], /Next: PHI at DAL/);
  assert.equal(update.message, update.pages[0]);
});

test('upcoming games are included in the display when there are no newer live results', () => {
  const completed = { ...game, id: 'complete', date: '2026-09-07T00:20Z', completed: true, state: 'post', status: 'Final' };
  const future = { ...game, id: 'next', date: '2026-09-28T00:20Z', week: 4, state: 'pre', completed: false, homeScore: null, awayScore: null, status: 'Sun 1:00PM' };
  const update = displayUpdate(scores([future, completed]), 'DAL', now);
  assert.equal(update.pages.length, 1);
  assert.match(update.pages[0], /Results:/);
  assert.match(update.pages[0], /Next: PHI at DAL/);
  assert.equal(update.message, update.pages[0]);
});

test('compact results show the date and correct outcome wording for losses', () => {
  const lost = { ...game, id: 'nyg-loss', date: '2026-09-14T00:20:00Z', home: 'DAL', away: 'NYG', homeScore: 7, awayScore: 14, state: 'post', completed: true, status: 'Final' };
  const update = displayUpdate(scores([lost]), 'DAL', now);
  assert.match(update.pages[0], /Sep 14 L vs NYG 7-14/);
  assert.doesNotMatch(update.pages[0], /Lost DAL/);
  assert.doesNotMatch(update.pages[0], /L DAL/);
});

test('single-page summaries keep the full team state and react to historical corrections', async () => {
  const history = Array.from({ length: 17 }, (_, index) => ({ ...game, id: `week-${index}`, week: index + 1,
    date: new Date(Date.UTC(2026, 8, 7 + index * 7)).toISOString(), state: 'post', completed: true, status: 'Final' }));
  const db = fakeRedis(), store = createNflStore(env, db.transport), reader = createMessageStore(env, db.transport);
  await store.savePreference(channel, 'DAL', true);
  await store.sync(async () => scores(history), now);
  const saved = await reader.read(channel);
  assert.equal(saved.pages.length, 1);
  assert.ok(saved.pages[0].length <= 280);
  assert.match(saved.pages[0], /Results:/);
  const later = new Date(now.getTime() + 60000);
  history[0].homeScore = 21;
  assert.equal((await store.sync(async () => scores(history, later), later)).sent, 1);
  assert.match((await reader.read(channel)).pages[0], /21/);
  await reader.write(channel, 'Manual override');
  assert.equal((await reader.read(channel)).pages, undefined);
});

test('single-page summaries include a team logo URL for the glasses display', () => {
  const update = displayUpdate(scores([game]), 'DAL', now);
  assert.equal(update.teamId, 'DAL');
  assert.match(update.logoUrl, /\/dal\.png$/i);
});

test('opening a tracked display bootstraps an empty score store and only publishes to that channel', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport), reader = createMessageStore(env, db.transport);
  await store.savePreference(channel, 'DAL', true);
  await store.savePreference(other, 'DAL', true);
  assert.equal(await store.readScores(2026), null);
  const source = async () => scores([{ ...game, completed: true, state: 'post', status: 'Final' }]);
  assert.equal((await store.sync(source, now, channel)).sent, 1);
  assert.equal((await store.readScores(2026)).games.length, 1);
  assert.match((await reader.read(channel)).message, /Dallas Cowboys/);
  assert.equal(await reader.read(other), null);
  // Another display reuses the shared snapshot, without requiring a scheduler.
  assert.equal((await store.sync(async () => assert.fail('Must reuse cached scores'), now, other)).sent, 1);
  assert.match((await reader.read(other)).message, /Dallas Cowboys/);
});

test('display refresh never fetches for unknown or paused subscriptions', async () => {
  const db = fakeRedis(), store = createNflStore(env, db.transport);
  const source = async () => assert.fail('Must not fetch scores');
  assert.equal((await store.sync(source, now, channel)).skipped, true);
  await store.savePreference(channel, 'DAL', false);
  assert.equal((await store.sync(source, now, channel)).skipped, true);
  await assert.rejects(store.sync(source, now, 'invalid'), { status: 400 });
  assert.equal(await store.readScores(2026), null);
});
