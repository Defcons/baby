# ToDo — baby (apps monorepo)

<!-- STRICT deferral ledger (six-doc bible; rules in ~/.claude/CLAUDE.md §5): EVERY deferred
     item, idea set aside, or "later" promise gets logged here AT THE MOMENT of deferral —
     nothing lives only in chat. Prune the Done section on next touch. Privacy rule applies
     here too: infra topology stays in the PRIVATE homelab run-book; items point, not copy. -->

_Updated 2026-08-08 — self-hosting migration queue, post feature-merge + history-squash decision (ResearchJournal 2026-08-08)._

## Open

- [ ] **History squash hand-off (David, next)**: mirror full history to the private Gitea, force-push the clean root as `main`, delete the `selfhost` branch on GitHub, optional GitHub-support cache purge; other machines re-clone. Command list provided in-session; the private run-book records it.
- [ ] **Remaining infra steps (David)**: firewall rule + positive/negative probes, ingress (tunnel hostname + proxy host), split-horizon check, then the rehearsal room — private run-book §1c/§1e/§1f. (Host setup §1a/§1b/§1d is DONE: server built, healthz green, CI key + deploy-script entry in place.)
- [ ] **Server clone branch one-timer**: after the squash lands, point the server's clone at `main` (one command, in the private run-book).
- [ ] **Cutover evening** (after rehearsal passes, Testing.md #1): migrate data (dry-run first, eyeball counts), switch every family device AND the HA URLs the same evening, remove old github.io PWA icons. Ground rule: nobody logs on the old origin mid-window.
- [ ] **Watch period → retirement** (1–2 weeks after cutover): flip `MOVED_BANNER` ×3 apps, final snapshot, delete the three CF workers, disable GitHub Pages, consider flipping the repo private, rewrite the then-obsolete quota docs (OrientationMap KV budget, CLAUDE.md quota mandate, KnowledgeBase §3) + graduate Testing.md items.
- [ ] Add `/healthz` on the new origin to the homelab uptime monitoring once live — alert delivery depends on the home server now (was Cloudflare's SLA).
- [ ] _(pre-existing, RJ backlog)_ The docs-claimed node tests (`sync.js` merge, `checkAlerts`/`dueAlerts`) are not in the repo — find or rebuild before next touching merge/alert logic.

## Blocked / needs the user

## Done (prune on next touch)

- [x] 2026-08-08: server host setup through healthz (private run-book §1a/§1b/§1d) — build green, `.env` loaded, deploy key + script entry installed.
- [x] 2026-08-08: `selfhost` → feature-merge with the remote line reconciled on `squash-prep` (growth chart / bath / grams / paging / age chip preserved together with the origin-aware self-host work).
