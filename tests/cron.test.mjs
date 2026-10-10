import { test } from 'node:test';
import assert from 'node:assert/strict';
import baby, { checkAlerts } from '../baby-tracker/worker/index.js';
import { tempKV, vapidJwk, subKeys, stubFetch, quietConsoleError, FCM } from './helpers.mjs';

const HOUR = 3600000;

test('daily maintenance still backs up good rooms after a malformed one', async (t) => {
  quietConsoleError(t);
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv, VAPID_JWK: await vapidJwk() };
  // sorts before the good room, so it is processed first
  await kv.put('room:00000000', JSON.stringify({ revision: 1, entries: 'not a list' }));
  await kv.put('room:00000001', JSON.stringify({ revision: 1, entries: [{ id: 'x', type: 'diaper', start: -1e20 }] }));
  await kv.put('room:goodroom1', JSON.stringify({ revision: 1, entries: [{ id: 'd1', type: 'diaper', start: Date.now() - HOUR }] }));

  const held = [];
  await baby.scheduled({}, env, { waitUntil: (p) => held.push(p) });
  await Promise.allSettled(held);

  const today = new Date().toISOString().slice(0, 10);
  assert.notEqual(await kv.get(`backup:goodroom1:${today}`), null);
});

test('daily maintenance archives entries older than 35 days', async (t) => {
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv, VAPID_JWK: await vapidJwk() };
  const oldStart = Date.now() - 40 * 24 * HOUR, newStart = Date.now() - HOUR;
  await kv.put('room:goodroom1', JSON.stringify({ revision: 1, entries: [
    { id: 'd-old', type: 'diaper', start: oldStart }, { id: 'd-new', type: 'diaper', start: newStart },
  ] }));

  const held = [];
  await baby.scheduled({}, env, { waitUntil: (p) => held.push(p) });
  await Promise.all(held);

  const hot = JSON.parse(await kv.get('room:goodroom1'));
  assert.deepEqual(hot.entries.map((e) => e.id), ['d-new']);
  assert.ok(hot.archivedBefore > oldStart && hot.archivedBefore < newStart);
  const arch = JSON.parse(await kv.get(`archive:goodroom1:${new Date(oldStart).toISOString().slice(0, 7)}`));
  assert.deepEqual(arch.map((e) => e.id), ['d-old']);
});

test('alert check pushes once, then waits for the repeat window', async (t) => {
  const calls = stubFetch(t);
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv, VAPID_JWK: await vapidJwk() };
  await kv.put('subsrooms', JSON.stringify(['goodroom1']));
  await kv.put('subs:goodroom1', JSON.stringify({ b: { endpoint: FCM, keys: await subKeys(), alerts: { feed: { on: true, min: 60, crit: 'normal' } } } }));
  await kv.put('room:goodroom1', JSON.stringify({ revision: 1, entries: [{ id: 'b1', type: 'bottle', start: Date.now() - 3 * HOUR, amount: 100, unit: 'ml' }] }));

  await checkAlerts(env);
  await checkAlerts(env);

  assert.equal(calls.length, 1);
  assert.ok(JSON.parse(await kv.get('alerted:goodroom1'))['b:feed']);
});

test('alert check still reaches good rooms after a malformed one', async (t) => {
  quietConsoleError(t);
  const calls = stubFetch(t);
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv, VAPID_JWK: await vapidJwk() };
  const alerts = { feed: { on: true, min: 60, crit: 'normal' } };
  await kv.put('subsrooms', JSON.stringify(['badroom01', 'goodroom1']));
  await kv.put('subs:badroom01', JSON.stringify({ a: { endpoint: FCM + '-bad', keys: await subKeys(), alerts } }));
  await kv.put('room:badroom01', JSON.stringify({ revision: 1, entries: 5 }));
  await kv.put('subs:goodroom1', JSON.stringify({ b: { endpoint: FCM + '-good', keys: await subKeys(), alerts } }));
  await kv.put('room:goodroom1', JSON.stringify({ revision: 1, entries: [{ id: 'b1', type: 'bottle', start: Date.now() - 3 * HOUR, amount: 100, unit: 'ml' }] }));

  await checkAlerts(env).catch(() => {});

  assert.deepEqual(calls.map((c) => c.url), [FCM + '-good']);
});
