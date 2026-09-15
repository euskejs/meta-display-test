import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStore, isSameOrigin, MessageError } from '../lib/messages.ts';
const channel = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' };
test('same-origin checks use the browser-facing host and reject cross-origin submissions', () => {
  const request = (origin) => new Request('http://localhost:3001/api/message', { headers: { host: '127.0.0.1:3001', origin } });
  assert.equal(isSameOrigin(request('http://127.0.0.1:3001')), true);
  for (const origin of ['http://evil.example', 'http://127.0.0.1:3002', 'null', 'https://127.0.0.1:3001']) {
    assert.equal(isSameOrigin(request(origin)), false);
  }
});
test('separate store instances share latest messages and isolate channels', async () => {
  const database = new Map();
  const transport = async (_, options) => {
    assert.equal(options.cache, 'no-store');
    const [command, key, value, expiry, seconds] = JSON.parse(options.body);
    if (command === 'GET') return Response.json({ result: database.get(key) ?? null });
    assert.equal(expiry, 'EX'); assert.equal(seconds, 604800);
    database.set(key, value); return Response.json({ result: 'OK' });
  };
  const sender = createMessageStore(env, transport);
  const reader = createMessageStore(env, transport);
  assert.equal(await reader.read(channel), null);
  await sender.write(channel, 'Hello\nCafé & 👓');
  assert.equal((await reader.read(channel)).message, 'Hello\nCafé & 👓');
  await sender.write(channel, 'Updated');
  assert.equal((await reader.read(channel)).message, 'Updated');
  assert.equal(await reader.read(other), null);
});
test('invalid channels and empty/oversized messages never reach storage', async () => {
  const store = createMessageStore(env, async () => { assert.fail('Unexpected storage call'); });
  for (const id of ['', null, '../../other', 'public']) await assert.rejects(store.read(id), { status: 400 });
  for (const message of ['', '  ', null, 4, 'x'.repeat(281)]) await assert.rejects(store.write(channel, message), { status: 400 });
});
test('missing config reports setup requirement', async () => {
  await assert.rejects(createMessageStore({}).read(channel), { status: 503, message: /not connected/ });
});
test('storage outage and command errors never report a successful send or leak secrets', async () => {
  for (const transport of [async () => { throw new Error('secret-token'); }, async () => Response.json({ error: 'secret-token' }), async () => new Response('', { status: 401 })]) {
    await assert.rejects(createMessageStore(env, transport).write(channel, 'Hello'), error => error instanceof MessageError && error.status === 503 && !error.message.includes('secret-token'));
  }
});
test('Vercel KV aliases are supported and corrupt data is rejected', async () => {
  const store = createMessageStore({ KV_REST_API_URL: env.UPSTASH_REDIS_REST_URL, KV_REST_API_TOKEN: 'alias-token' }, async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer alias-token');
    return Response.json({ result: 'broken-json' });
  });
  await assert.rejects(store.read(channel), { status: 503 });
});
