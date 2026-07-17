# CODE-MAP — contraction-timer

_Last verified: 2026-07-16_

Two-file app: static page on GitHub Pages + Cloudflare Worker for cross-device sync.

- **`index.html`** — the whole app (vanilla JS, no build). Key symbols:
  - `pull` / `pushState` / `applyRemote` / `touch` — sync protocol: full-state last-write-wins, `revision` = `Date.now()` of last local mutation; poll every `POLL_MS` (4s) + on visibility/online.
  - `updateMainUI` — single place button/timer reflect `active`; called for both local taps and remote adoption. `tick` interval guard lives here.
  - Sync room comes from `#r=<id>` URL fragment (kept out of this public repo on purpose), then persisted in `localStorage[ROOM_KEY]`. No fragment ever seen → local-only mode.
  - `localStorage` v2 schema `{revision, contractions, active}`; one-shot migration from v1 in `load()`.
  - Theme: `data-theme` on `<html>`, CSS vars per theme, per-device pref in `localStorage['ctTheme']` (NOT synced). Inline head script applies it pre-paint.
  - Avg window: `#avgWindowSel` picks the span for the two avg stats — a contraction count (`5`/`8`/`10`) or a time span (`15m`/`30m`/`60m`/`120m`); per-device pref in `localStorage['ctAvgWindow']` (NOT synced). `windowSetForGaps`/`windowSetForDuration` resolve it against `contractions`; a 15s interval re-renders while a time-based window is active so contractions age out without a new tap.
  - `editRow`/`deleteRow` — per-row ✎/✕ via event delegation on `#logList` (`data-edit`/`data-del`); edit re-sorts by `start`, both call `touch()` to sync.
  - Deploy habit: snapshot live KV state to `backups/` (gitignored — room id is the credential) BEFORE pushing app changes.
- **`worker/index.js`** — Cloudflare Worker `contraction-sync` (account davidsen908, KV binding `STATE`). GET/PUT `/state/:room`, CORS `*`, validates JSON + numeric `revision`. Deploy: `npx wrangler deploy` (needs `wrangler login`).

Gotchas:
- KV is eventually consistent cross-colo (up to ~60s); same-household devices hit the same colo so sync is effectively instant. Don't "fix" apparent staleness when testing from different networks.
- Conflict model is wholesale LWW — two devices mutating in the same poll window can clobber one tap. Accepted: one person logs in practice.
- Worker PUTs can return CF edge error 1042 for ~1 min right after a fresh deploy — transient, retry.
