# Deployment source and prerequisites

The existing installation uses laptop hosting. Source publication does not create a cloud server or transfer account authorization. No paid hosting, new API billing or public research-document sharing is required.

## Existing host

After dependencies and a build are present, run `npm run team:start`. It preserves the existing private configuration and keys, refuses occupied ports, starts four loopback AI workers and an authenticated backend, and publishes only the guarded app through a temporary Cloudflare HTTPS tunnel. The address changes after a restart. Keep the host awake and online.

Do not run setup over existing keys. An existing installation's private `.local/` state is deliberately absent from this repository. Each person connects their own managed ChatGPT account through the app; do not copy account authentication caches.

## Fresh authorized host

1. Install Node.js 24+, the supported Codex CLI and a cloudflared executable. Install dependencies and build the frontend.
2. Supply the host's reviewed private context files `SOLAIR-reconciled-setup-baseline.md` and `SOLAIR-GUI-Orca-plan.md` under ignored `deploy/context/`. These are operator inputs, not included research evidence or public defaults.
3. Prepare a scoped Google connection. `deploy/google/Bridge.gs` and the engine provide an optional Apps Script bridge; the manifest is included. This requires authorization under a Google account with access to the intended duplicate, source inbox and backup folder. The original SolAir document allowlist remains enforced.
4. With a real HTTPS origin, use the explicitly selected setup script. `scripts/prepare-laptop-team.mjs` uses the local Google connector; `scripts/prepare-team.mjs` additionally expects a deployed Apps Script `/exec` endpoint. Read the script's prerequisites first. They refuse existing credentials and create only private configuration when prerequisites pass.
5. For the bridge, privately configure its signing key and exact HTTPS asset origin. Never put those values in Git, logs, chat or the frontend.
6. Create the first owner with the local private setup key, issue separate one-use invitations and obtain each member's own ChatGPT consent.
7. Verify authentication, actor attribution, isolated quota routing, stale-revision rejection, backups, native preservation and affected-page PDF layout on a duplicate before enabling maintained-document writes.

`npm run deploy:check` is a read-only prerequisite report; it does not provision hosting or prove acceptance. Container/Caddy sources are optional and require Docker/Compose plus an authorized host. Cloud hosting and account acceptance must be verified on the actual destination.

Only the authenticated application may be publicly reachable. Keep worker ports private. The local unauthenticated development server must not be tunneled directly. Do not disable safeguards or enable scheduling to make startup succeed.

## Updates and recovery

Preserve private configuration, account homes and database state across source updates. Stop services deliberately before a private database backup. After an interrupted Google update, inspect saved job/native verification and reconcile before retrying Apply. Never blindly replay a write or regenerate credentials after a partial setup. Retest the affected flows after rebuilding.
