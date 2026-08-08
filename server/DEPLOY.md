# Deploy — baby suite (self-hosted)

The deployment run-book (host setup, CI wiring, ingress/reverse-proxy,
firewall, data migration and the cutover checklist) lives in the **private
homelab configuration repo** — per this repo's privacy rule, infrastructure
topology stays out of public git.

What is public is visible in the tree anyway: one small container serves the
static pages plus `/api/{baby,pelvic,contraction}` (the worker code bridged
unchanged onto a file-backed KV) with an internal 5-minute cron; data lives in
a host volume owned by uid 1000; `.env` supplies `BABY_VAPID_JWK` +
`PELVIC_VAPID_JWK`; `GET /healthz` for monitoring; pushes to `main` deploy via
the GitHub Actions workflow.
