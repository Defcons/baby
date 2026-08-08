// One-time VAPID key generator for the pelvic-reminders worker.
// Run locally (node genvapid.mjs), then paste the printed JSON when asked by:
//   npx wrangler secret put VAPID_JWK
// The private key never leaves your machine; the app fetches the matching
// public key from the worker's GET /vapid endpoint.
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log('Paste this whole line as the VAPID_JWK secret:\n');
console.log(JSON.stringify(jwk));
