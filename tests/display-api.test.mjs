import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplayApi } from '../lib/display-api.ts';
import { createMessageStore } from '../lib/messages.ts';

const key = 'test-key-with-at-least-32-characters';
const channel = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function request(body, token = key, type = 'application/json') {
  return new Request('https://display.example/api/v1/display', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
test('API writes through Redis and the existing glasses reader sees each update', async () => {
  const database = new Map();
  const store = createMessageStore({ KV_REST_API_URL: 'https://redis.example', KV_REST_API_TOKEN: 'redis-secret' }, async (_, init) => {
    const [command, name, value] = JSON.parse(init.body);
    if (command === 'SET') database.set(name, value);
    return Response.json({ result: command === 'SET' ? 'OK' : database.get(name) ?? null });
  });
  const api = createDisplayApi(key, store.write);
  for (const message of ['Hello\nCafé 👓', 'Replacement']) {
    const response = await api(request({ channel, message }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const saved = await response.json();
    assert.equal(saved.success, true);
    assert.equal(saved.channel, channel);
    assert.equal((await store.read(channel)).message, message);
    assert.ok(Date.parse(saved.updatedAt));
  }
  const invalid = await api(request({ channel, message: 'x'.repeat(281) }));
  assert.equal(invalid.status, 400);
  assert.equal((await store.read(channel)).message, 'Replacement');
  assert.equal((await api(request({ channel: 'invalid', message: 'Hello' }))).status, 400);
  assert.equal((await api(request({ channel, message: ' ' }))).status, 400);
});
test('missing configuration and invalid credentials fail before storage', async () => {
  const write = async () => assert.fail('Must not write');
  for (const config of [undefined, '', 'short']) {
    assert.equal((await createDisplayApi(config, write)(request({}))).status, 503);
  }
  const api = createDisplayApi(key, write);
  for (const token of ['', 'wrong', key + '-extra']) {
    const response = await api(request({}, token));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  }
  const noAuth = new Request('https://display.example', { method: 'POST', body: '{}' });
  assert.equal((await api(noAuth)).status, 401);
});
test('invalid JSON, wrong media type and oversized bodies fail before storage', async () => {
  const api = createDisplayApi(key, async () => assert.fail('Must not write'));
  for (const body of ['{', 'null', '[]', '"string"']) assert.equal((await api(request(body))).status, 400);
  assert.equal((await api(request({}, key, 'text/plain'))).status, 415);
  assert.equal((await api(request({ message: '👓'.repeat(1100) }))).status, 413);
});
test('storage failures never leak credentials or report success', async () => {
  const api = createDisplayApi(key, async () => { throw new Error('private-redis-token'); });
  const response = await api(request({ channel, message: 'Hello' }));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private-redis-token'), false);
});
