import { test } from 'node:test';
import assert from 'node:assert/strict';
import baby from '../baby-tracker/worker/index.js';
import pelvic from '../pelvic-trainer/worker/index.js';
import contraction from '../contraction-tracker/worker/index.js';
import { tempKV, FCM } from './helpers.mjs';

const call = (worker, env, method, path, body) =>
  worker.fetch(new Request('http://internal' + path, { method, body: body === undefined ? undefined : JSON.stringify(body) }), env);
const room = (i) => 'room' + String(i).padStart(6, '0');
const states = {
  baby: { revision: 1, entries: [] },
  pelvic: { revision: 1, sessions: [] },
  contraction: { revision: 1, contractions: [] },
};

for (const [name, worker] of [['baby', baby], ['pelvic', pelvic], ['contraction', contraction]]) {
  test(`${name}: new rooms stop at 20, existing rooms keep working`, async (t) => {
    const { kv, cleanup } = tempKV();
    t.after(cleanup);
    const env = { STATE: kv };
    for (let i = 0; i < 20; i++) assert.equal((await call(worker, env, 'PUT', `/state/${room(i)}`, states[name])).status, 200);
    assert.equal((await call(worker, env, 'PUT', `/state/${room(20)}`, states[name])).status, 403);
    assert.equal((await call(worker, env, 'PUT', `/state/${room(0)}`, { ...states[name], revision: 2 })).status, 200);
    assert.equal(JSON.parse(await kv.get(`room:${room(0)}`)).revision, 2);
  });
}

const sub = (i) => ({ endpoint: `${FCM}-${i}`, keys: { p256dh: 'x', auth: 'y' } });

test('baby: subscriptions only for rooms that exist, at most 20 devices', async (t) => {
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv };
  assert.equal((await call(baby, env, 'POST', `/subscribe/${room(1)}`, sub(0))).status, 404);
  await kv.put(`room:${room(1)}`, JSON.stringify(states.baby));
  for (let i = 0; i < 20; i++) assert.equal((await call(baby, env, 'POST', `/subscribe/${room(1)}`, sub(i))).status, 200);
  assert.equal((await call(baby, env, 'POST', `/subscribe/${room(1)}`, sub(20))).status, 403);
  assert.equal((await call(baby, env, 'POST', `/subscribe/${room(1)}`, { ...sub(3), alerts: { feed: { on: true, min: 90 } } })).status, 200);
  assert.equal(Object.keys(JSON.parse(await kv.get(`subs:${room(1)}`))).length, 20);
});

test('baby: status, test and unsubscribe on an unknown room store nothing', async (t) => {
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv, VAPID_JWK: '{}' };
  await call(baby, env, 'POST', `/status/${room(7)}`, { endpoint: FCM });
  await call(baby, env, 'POST', `/test/${room(7)}`);
  await call(baby, env, 'POST', `/unsubscribe/${room(7)}`, { endpoint: FCM });
  assert.deepEqual((await kv.list()).keys, []);
});

test('pelvic: at most 20 reminder devices, existing ones can update', async (t) => {
  const { kv, cleanup } = tempKV();
  t.after(cleanup);
  const env = { STATE: kv };
  const pf = (i, times = ['09:00']) => ({ ...sub(i), times, tz: 'Europe/Oslo' });
  for (let i = 0; i < 20; i++) assert.equal((await call(pelvic, env, 'POST', '/subscribe', pf(i))).status, 200);
  assert.equal((await call(pelvic, env, 'POST', '/subscribe', pf(20))).status, 403);
  assert.equal((await call(pelvic, env, 'POST', '/subscribe', pf(5, ['10:00']))).status, 200);
  assert.equal(Object.keys(JSON.parse(await kv.get('subs'))).length, 20);
});
