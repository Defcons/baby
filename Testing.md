# baby (apps monorepo) — Pending Tests (unconfirmed)

<!-- STRICT pending-manual-test queue (six-doc bible; rules in ~/.claude/CLAUDE.md §5): every
     item = repro steps + pass criteria, runnable cold. Once CONFIRMED, graduate the fact
     (KnowledgeBase / the maps) and DELETE the item — this file holds only the unconfirmed. -->

_Updated 2026-08-08 (post-cutover). Graduated as CONFIRMED: #3 firewall probes, #4 HA against the new origin (repointed + confirmed by David), #5 migration data integrity (identical 510/510 id diff verified programmatically + phones checked). Machine-verified earlier: server round-trips, `/vapid`, headers/guards, backup+archival cycle, migrate byte-verify, domain end-to-end. Numbering keeps its gaps._

## 1. First real closed-app alert (post-cutover — proves the server cron end-to-end)
**Steps:** on a phone with 🔔 enabled, switch on a real alert rule (any tier), close the app fully, let the condition cross naturally (or set the threshold low once).
**Pass:** the push arrives within ~5 min of the threshold crossing with the app closed; the 🔔 diagnostics line shows a recent cron run.

## 2. Offline-first on the new origin
**Steps:** with the rehearsal room installed as PWA, airplane-mode the phone, reopen the app, log an entry, restore network.
**Pass:** app opens from the SW cache while offline; the entry exists locally; it reaches the other device within one poll (≈3 s) of reconnecting.

## 6. Push survives a quiet week (background, low priority)
**Steps:** none — after cutover, just note which device goes longest without opening the app.
**Pass:** a device that hasn't opened the app for >1 week still receives an alert push (proves `ensurePush` re-registration + endpoint stability against the new VAPID keys).

## 7. Multi-day timeline (3d/7d) on the phones
**Steps:** baby tracker → timeline card → tap `3d`, then `7d`; find an evening cluster-feeding stretch and compare it across days; toggle back to `24h`.
**Pass:** one row per day with hours aligned (evening feeds stack visually), today carries the now-marker, bars/dots match the log, and the 24h view + drag scrubber behave exactly as before. (DOM-verified locally with seeded data, 2026-08-08 — phone look-and-feel is what's pending.)
