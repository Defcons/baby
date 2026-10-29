// The pages' security headers: each inline script is allowed by its own hash, and nothing else inline is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inlineScriptHashes, pageHeaders } from '../server/csp.js';

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

test('each inline script is hashed, a script file is not', () => {
  const html = '<script src="sync.js"></script><script>\nconst a = 1;\n</script><script type="module">b()</script>';
  assert.deepEqual(inlineScriptHashes(html), [sha('\nconst a = 1;\n'), sha('b()')]);
});

test('a CRLF page hashes as the browser parses it, with LF', () => {
  assert.deepEqual(inlineScriptHashes('<script>\r\na();\rb();\r\n</script>'), [sha('\na();\nb();\n')]);
});

test('the policy allows only the page\'s own scripts and no framing', () => {
  const h = pageHeaders('<script>go()</script>');
  const csp = h['Content-Security-Policy'];
  assert.ok(csp.split('; ').includes(`script-src 'self' ${sha('go()')}`), csp);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.equal(h['Referrer-Policy'], 'no-referrer');
});

test('every real page has its inline scripts hashed', () => {
  for (const page of ['index.html', 'baby-tracker/index.html', 'contraction-tracker/index.html', 'pelvic-trainer/index.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const blocks = (html.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi) || []).length;
    assert.ok(blocks > 0, page);
    assert.equal(inlineScriptHashes(html).length, blocks, page);
  }
});
