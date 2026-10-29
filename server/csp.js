// Security headers for the HTML pages. The pages run their code from inline <script> blocks, so the
// policy allows exactly those blocks by their sha256 (computed from the bytes being served, so an edit
// to a page never needs a second edit here) plus same-origin files. Inline style attributes stay
// allowed: the pages set them all over. Nothing frames the apps (Home Assistant reads the summary
// URLs only), so no site may frame them.

import { createHash } from 'node:crypto';

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

// The browser hashes a block after its HTML parser has turned every CRLF and lone CR into LF, so this does too
// (a Windows checkout serves CRLF).
export function inlineScriptHashes(html) {
  return [...html.matchAll(INLINE_SCRIPT)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`,
  );
}

export function pageHeaders(html) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return { 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' };
}
