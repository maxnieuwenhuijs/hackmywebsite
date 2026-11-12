# hackmywebsite.ai launch TODO

Status date: 2026-11-11
Working preview: http://localhost:3123
Current state: working SaaS foundation with mock scan lifecycle and a local end-to-end sealed report delivery path. Production worker and egress integration still outstanding.

Linux worker setup: [LINUX-SERVER-TODO.md](LINUX-SERVER-TODO.md).

## Progress since 2026-11-10

- [x] Browser-generated report key with a user passphrase.
- [x] Encrypted private key stored server-side; passphrase never leaves the browser.
- [x] Mock worker generates an HTML report, encrypts it with AES-256-GCM, wraps the file key with RSA-OAEP and stores only ciphertext.
- [x] 48-hour delivery code with hashed code and token.
- [x] Delivery page with code validation, browser decryption, sandboxed preview and HTML download.
- [x] Run page links the user to the sealed report and shows the local delivery code in dev mode.
- [x] Wrong delivery code tested at the API.
- [x] Stored report file checked for plaintext leakage.
- [x] Swarm thinking warning styling keeps agent colours on names and tags.
- [x] Worker claim, heartbeat, events, control, encrypted upload and completion endpoints.
- [x] Worker token authentication and rejection tests.
- [x] Worker-uploaded encrypted bundle delivered and decrypted in the browser.
- [x] Local worker smoke test script.
- [x] Recovery kit download containing the encrypted private key and key metadata, without the passphrase.
- [x] Delivery code reissue with old-code invalidation and audit row.
- [x] Admin worker fleet page with status, egress, leases and active runs.
- [x] Admin run cancellation for queued and running runs, with hold release and actual-use charge.
- [x] Email outbox sender with Resend adapter, dev log mode, retry and admin flush.
- [x] Email outbox admin page with pending, sent and failed states.
- [x] Client-side ZIP download with report HTML and manifest.
- [x] Print / Save as PDF from the decrypted report.
- [x] In-memory rate limits for top-up, assessment creation, domain verification, report key setup and delivery codes.
- [x] Rate-limit unit test.
- [x] Standalone Windows worker service client with mock scan adapter, heartbeat, cancel check, encrypted upload and completion.
- [x] Standalone worker end-to-end run delivered and decrypted through the portal.
- [x] Linux DSH install and headless tool-use spike in a Node 24 container.
- [x] Confirm Linux `dsh --profile headless --json` event schema matches `runner.mjs`.
- [x] Cross-platform `dsh-runtime.mjs` launcher for Windows desktop and Linux CLI.
- [x] Port `runner.mjs` and `swarm.mjs` to the shared launcher.
- [x] Smoke-test the launcher on Linux and Windows.
- [x] Work-email verification codes queued through the email outbox and dev sender.
- [x] Fixed structured evidence rendering in reports: object evidence is serialized, never `[object Object]`.
- [x] Added a report build guard that refuses to write a report containing `[object Object]`.
- [x] Rebuilt the latest report with structured proof JSON.
- [x] Fixed glossary term injection corrupting report HTML: terms are now matched with word boundaries and inserted through placeholders.
- [x] Added a report build guard against malformed glossary markup.
- [x] Corrected the receipt finding: rate limiting exists but is bypassable via X-Forwarded-For; real receipt exposure remains suspected.
- [x] Fixed evidence mapping so local lab files and board logs are not shown as technical proof.
- [x] Added a "Deels bevestigd" status for confirmed access with unproven impact.
- [x] Added a budget-advice agent that writes a "Meer budget, meer dekking" block near the top of the report.
- [x] Added a prior-run handoff so a rerun receives findings, tested areas and the previous advice.
- [ ] Linux DSH worker spike: Chromium, nuclei, controlled lab scan.
- [ ] Full Linux swarm run and cost calibration.
- [x] Standalone production web server verified locally.
- [x] Production Dockerfile, Compose stack, Caddy config, migration service and environment template.
- [x] Web container and migration container built and tested against MariaDB.
- [x] Database backup script for the Compose stack.

## Already done

- [x] Branded marketing site and legal/authorization copy.
- [x] Auth.js magic-link foundation with roles and local dev sign-in.
- [x] Customer portal: dashboard, assessments, domains, wallet, notifications.
- [x] Admin portal: overview, runs, customers, verifications, payments, egress, audit.
- [x] MariaDB schema, migrations and local seed.
- [x] Wallet top-up, credit lots, holds and ledger foundation.
- [x] Stripe Checkout and webhook adapter behind environment keys.
- [x] Domain verification with DNS, work email, HTTP file and meta tag.
- [x] Manual admin verification approval.
- [x] Three tiers with budget caps and consent.
- [x] 1, 2 or 3 briefings by budget.
- [x] Live Swarm thinking with per-agent colours, collapsed default, warning styling.
- [x] Report dossier with agent colours and warning labels.
- [x] Report AI switched to direct DeepSeek API for report copy.
- [x] Local mock worker with start, briefings, completion and notifications.
- [x] Egress admin UI with demo pool and metrics.
- [x] Local docs, screenshots and architecture notes.

## P0: paid launch blockers

### 1. Final sealed report pipeline

- [ ] Worker builds `findings.json`, `evidence.json`, report content and HTML in one deterministic pipeline.
- [ ] Validate DeepSeek report JSON against a schema before rendering.
- [ ] Build HTML, PDF and evidence index.
- [ ] Encrypt the full bundle with AES-256-GCM and the customer public key.
- [ ] Upload only the encrypted envelope, wrapped key, IV, tag, SHA-256 and size.
- [ ] Delete every plaintext copy from the worker after upload.
- [ ] Store `ReportBundle` ciphertext metadata in the portal.
- [ ] Reject any worker upload that is not a valid encrypted envelope.
- [ ] Add a fixture bundle and test decrypt round trip.

### 2. Customer report delivery

- [x] Local report passphrase and key setup flow.
- [x] Downloadable recovery kit.
- [x] Local 48-hour delivery code hash and URL token.
- [x] Local `/delivery/<token>` page with code entry.
- [x] Browser-side decryption, never server-side.
- [x] Sandboxed HTML preview.
- [x] Client-side ZIP download with report HTML and manifest.
- [x] Browser print and Save as PDF.
- [ ] Worker-generated PDF and ZIP bundle files.
- [x] Code expiry, max downloads, lockout foundation and audit events.
- [x] Code reissue from the account.
- [x] Final report ready notification and email outbox without report content in email.
- [x] Test: wrong code, wrong passphrase, tampered ciphertext path and plaintext storage check.

### 3. Real worker API and Windows worker

- [x] Local worker claim endpoint with leases.
- [x] Local heartbeat endpoint.
- [x] Local batch event endpoint, idempotent by run and sequence.
- [x] Local control endpoint for cancel.
- [x] Local completion endpoint with cost, coverage and bundle id.
- [x] Local encrypted bundle upload endpoint.
- [x] Hashed worker tokens and token rejection.
- [x] Worker token routes reject browser sessions.
- [x] Lease expiry reset foundation.
- [x] Standalone Windows worker service client with NSSM runbook.
- [ ] Windows service installation on the production VM.
- [ ] Connect the real scanner, Chrome, nuclei and egress assignment.
- [ ] Kill the full process tree on cancel.
- [ ] Replace `DEMO_MODE` mock worker in production.
- [x] End-to-end run through the standalone worker service with the mock scan adapter.
- [ ] Lease reassignment test under a killed worker.
- [ ] Presigned object storage upload and worker rate limits.

### 4. Live egress and proxy pool

- [ ] Procure the approved static `/28` IPv4 range.
- [ ] Provider AUP review and abuse contact.
- [ ] Reverse DNS / PTR records.
- [ ] WireGuard egress gateway.
- [ ] nftables SNAT and fail-closed policy.
- [ ] No open proxy listener.
- [ ] Verify outbound IP for every assignment.
- [ ] Gateway metrics exporter into `EgressMetric`.
- [ ] Real active assignments per run and worker.
- [ ] Admin quarantine and release actions with audit.
- [ ] Replace the seeded demo pool with live data.
- [ ] Alert on pool down, range change or unexpected egress IP.

### 5. Production auth and email

- [ ] Verify the Resend sending domain.
- [ ] Magic-link sign-in with production sender.
- [x] Email outbox sender, retry and admin flush.
- [ ] Bounce handling and suppression list.
- [x] Work-email verification codes through the outbox.
- [x] Final report code email.
- [ ] Turn off `ALLOW_DEV_LOGIN`, `ALLOW_DEV_ADMIN`, `ALLOW_DEV_PAYMENTS`, `ALLOW_DEV_EMAIL` and `ALLOW_DEV_VERIFICATION`.
- [ ] Remove or protect the local dev-login routes in production.
- [ ] Test sign-in, sign-out and session expiry.

### 6. Stripe production

- [ ] Live Stripe keys in the secret manager.
- [ ] Create or verify the top-up product and prices.
- [ ] Register the production webhook URL.
- [ ] Test checkout success, cancel and duplicate webhook.
- [ ] Test ledger credit exactly once.
- [ ] Handle payment failure and abandoned checkout.
- [ ] Define refund and chargeback handling.
- [ ] Add invoice and receipt references.
- [ ] Confirm no internal cost or markup leaks to customer receipts.

### 7. Security and ownership hardening

- [ ] DNS verification resolves only to public IPs.
- [ ] Block private, loopback, link-local, metadata and internal targets.
- [ ] HTTP verification follows limited redirects and blocks private destinations.
- [ ] Work-email code attempt limits and resend limits.
- [ ] Re-check ownership at run start, not only at creation.
- [x] Rate limit top-up, verification, assessment, report key and report access.
- [ ] CSRF and same-site cookie review.
- [ ] IDOR tests on runs, domains, reports and admin pages.
- [ ] Escape target-controlled evidence everywhere, including decrypted report HTML.
- [ ] Admin RBAC and audit coverage review.
- [ ] Secret rotation checklist and no secrets in logs.
- [ ] Abuse detection and a manual stop button.
- [ ] Authorization, AUP, privacy policy and DPA text.

### 8. Production infrastructure and backups

- [ ] Deploy the web app to the Linux droplet.
- [x] Production Dockerfile and Docker Compose stack.
- [x] Caddy TLS and security headers configuration.
- [x] Standalone server verified locally.
- [x] Managed or hardened MariaDB with daily backups.
- [x] Database backup script for the Compose stack.
- [ ] Object storage bucket for ciphertext only.
- [ ] Cloudflare WAF, TLS and tunnel or proxy.
- [ ] PM2 or systemd with one web instance.
- [ ] Error tracking and structured logs.
- [ ] Uptime and queue-depth monitoring.
- [ ] Restore drill from a database backup.
- [ ] Retention and deletion jobs for reports, codes and logs.
- [ ] Staging environment separate from production.

## P1: pilot hardening

### 9. Wallet and billing correctness

- [ ] Consume credit lots FIFO.
- [ ] Expire credit lots with a scheduled job.
- [ ] Release unused hold on partial and failed runs.
- [ ] Charge only actual usage.
- [ ] Clean-result credit with the $15 fee.
- [ ] Refund flow for failed, cancelled and abuse cases.
- [ ] Ledger invariants and reconciliation report.
- [ ] Prevent double spend under concurrent run creation.

### 10. Queue and run controls

- [ ] Queue ETA and position.
- [x] Admin cancel with hold release and actual-use charge.
- [ ] Customer cancel request.
- [x] Worker fleet status page.
- [ ] Retry policy for transient worker failures.
- [ ] Run timeouts and stall detection.
- [ ] Abuse hold before a run starts.

### 11. Testing

- [ ] Unit tests for wallet, ledger, briefing cadence, verification hashing and permissions.
- [ ] Playwright E2E: sign in, top up, verify, queue, complete, deliver, decrypt.
- [ ] Authorization tests for every customer and admin route.
- [ ] Worker API contract tests.
- [ ] XSS test with hostile target evidence.
- [ ] Load test for SSE and 50 concurrent viewers.
- [ ] Crash test: kill worker mid-run, verify no double charge and no plaintext.

### 12. UX and accessibility

- [ ] Mobile pass on every customer page.
- [ ] Keyboard pass on Swarm thinking, forms and delivery.
- [ ] Empty, loading and error states.
- [ ] Report history and reissue code in the account.
- [ ] Redacted proof preview decision.
- [ ] Clear run cancellation and refund messaging.
- [ ] Contrast and focus-state audit.

### 13. Report quality

- [ ] DeepSeek output schema validation.
- [ ] Prompt-injection defense for target-controlled text.
- [ ] Sample review of 10 reports.
- [ ] Evidence-to-finding matching review.
- [ ] Cost cap per report.
- [ ] Fallback when the model returns invalid JSON.
- [ ] Sealed bundle hash shown in the customer UI.

## P2: after launch

- [ ] Team accounts and multiple users.
- [ ] Scheduled recurring assessments.
- [ ] API access for customers.
- [ ] Multilingual report delivery.
- [ ] More granular agent activity and proof preview.
- [ ] Referral credits.
- [ ] Analytics dashboard for the customer.
- [ ] Automated retest of fixed findings.

## Critical path

1. Final report bundle and 48-hour delivery.
2. Real worker API and Windows worker.
3. Live egress pool and gateway.
4. Production auth, email, Stripe and object storage.
5. Security, legal and backup readiness.
6. One paid pilot run with full evidence and delivery.

## Definition of launched

A new customer can:

1. Sign in with a magic link.
2. Top up with a live card.
3. Verify a domain they own.
4. Choose a tier and budget.
5. Have a real worker run the assessment through the live egress pool.
6. Receive start and briefing notifications.
7. Receive a 48-hour code.
8. Download and decrypt the sealed final report.
9. Get correct ledger settlement and a refund if the run fails.
10. Contact support with no staff access to plaintext report content.
