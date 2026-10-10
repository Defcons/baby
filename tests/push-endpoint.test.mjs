import { test } from 'node:test';
import assert from 'node:assert/strict';
import baby from '../baby-tracker/worker/index.js';
import pelvic from '../pelvic-trainer/worker/index.js';
import { sendPush } from '../baby-tracker/worker/webpush.js';
import { sendPush as sendPushPelvic } from '../pelvic-trainer/worker/webpush.js';
import { tempKV, vapidJwk, subKeys, stubFetch, FCM } from './helpers.mjs';

const GOOD = [
  FCM,
  'https://android.googleapis.com/gcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/abc',
  'https://wns2-db5p.notify.windows.com/w/?token=abc',
];
const BAD = [
  'http://fcm.googleapis.com/fcm/send/abc',
  'https://example.com/push',
  'https://localhost:8443/x',
  'https://192.0.2.10/x',
  'https://[::1]/x',
  'https://fcm.googleapis.com.example.com/x',
  'https://evil-googleapis.com/x',
  'https://user:pw@fcm.googleapis.com/fcm/send/abc',
  'https://fcm.googleapis.com:8443/fcm/send/abc',
];

async function subscribeBaby(env, endpoint) {
  await env.STATE.put('room:testroom1', JSON.stringify({ revision: 1, entries: [] }));
  const req = new Request('http://internal/subscribe/testroom1', {
    method: 'POST', body: JSON.stringify({ endpoint, keys: { p256dh: 'x', auth: 'y' } }),
  });
  return (await baby.fetch(req, env)).status;
}
async function subscribePelvic(env, endpoint) {
  const req = new Request('http://internal/subscribe', {
    method: 'POST', body: JSON.stringify({ endpoint, keys: { p256dh: 'x', auth: 'y' }, times: ['09:00'], tz: 'Europe/Oslo' }),
  });
  return (await pelvic.fetch(req, env)).status;
}

for (const [name, subscribe] of [['baby', subscribeBaby], ['pelvic', subscribePelvic]]) {
  test(`${name} /subscribe accepts the browser push services`, async (t) => {
    const { kv, cleanup } = tempKV();
    t.after(cleanup);
    for (const ep of GOOD) assert.equal(await subscribe({ STATE: kv }, ep), 200, ep);
  });

  test(`${name} /subscribe refuses any other endpoint`, async (t) => {
    const { kv, cleanup } = tempKV();
    t.after(cleanup);
    for (const ep of BAD) assert.equal(await subscribe({ STATE: kv }, ep), 400, ep);
  });
}

for (const [name, send] of [['baby', sendPush], ['pelvic', sendPushPelvic]]) {
  test(`${name} sendPush does not follow redirects`, async (t) => {
    const calls = stubFetch(t);
    const status = await send({ endpoint: FCM, keys: await subKeys() }, { title: 't' }, JSON.parse(await vapidJwk()), 'mailto:test@example.com');
    assert.equal(status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual');
  });

  test(`${name} sendPush refuses a stored non-push endpoint without sending`, async (t) => {
    const calls = stubFetch(t);
    await assert.rejects(send({ endpoint: 'https://example.com/push', keys: await subKeys() }, { title: 't' }, JSON.parse(await vapidJwk()), 'mailto:test@example.com'));
    assert.equal(calls.length, 0);
  });
}
