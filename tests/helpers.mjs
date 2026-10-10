// Shared test helpers: a temp-dir KV, real push keys, and a fetch stub.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeKV } from '../server/kv.js';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

export function tempKV() {
  const dir = mkdtempSync(join(tmpdir(), 'baby-test-'));
  return { kv: makeKV(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A VAPID private key (what the server holds) and a browser subscription's keys.
export async function vapidJwk() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
}
export async function subKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
}

// Replaces global fetch for one test; returns the recorded calls.
export function stubFetch(t, status = 201) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status }); };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

export function quietConsoleError(t) {
  const real = console.error;
  console.error = () => {};
  t.after(() => { console.error = real; });
}

export const FCM = 'https://fcm.googleapis.com/fcm/send/test-device';
