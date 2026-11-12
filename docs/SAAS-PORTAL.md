# SaaS portal

Status: foundation implemented in `apps/web` on 2026-11-10. This document is the working contract for the customer portal and the private admin area.

## Product shape

hackmywebsite.ai is a prepaid, authorized security assessment SaaS.

The customer signs in, tops up a wallet, proves ownership of the target domain, chooses one of three assessment tiers, sets a budget cap and queues the run. The scanner runs on the Windows worker. The portal owns the account, money, ownership proof, queue state, briefings, notifications and admin controls.

The provider never gets a plaintext final report. The final bundle is end-to-end encrypted and delivered through the existing 48-hour code flow. Interim briefings are portal and email metadata, not raw evidence.

## Customer journey

1. Magic-link sign-in. Auth.js v5 with Resend in production and a local dev sign-in behind `ALLOW_DEV_LOGIN=1`.
2. Top up. Minimum $50. Credit lots expire after 42 days. The account has a balance, a held amount and a ledger.
3. Verify ownership of the target. One sufficient method:
   - DNS TXT at `_hackmywebsite.<host>`.
   - Six-digit work-email code sent to a role inbox on the domain.
   - HTTP file at `/.well-known/hackmywebsite-verification.txt`, or the strict meta tag equivalent.
4. Choose a tier and a budget cap. The tier minimum and the available balance are enforced server-side.
5. The run is placed in `QUEUED`. The customer gets an in-app notification when a worker starts it.
6. Depending on the budget, 1, 2 or 3 live briefings are published during the run.
7. The run completes and the final sealed report is delivered. In local preview, the mock worker seals a branded HTML bundle with the customer report key. In production, the Windows worker will add the full evidence bundle. The portal shows status and delivery messaging, never plaintext report content.

Ownership proof is valid for 90 days. Only the exact host and `www.` are covered. Other subdomains are separate. Verification is checked again when a run is queued.

## Swarm thinking

The assessment page includes a live "Swarm thinking" panel. It is a curated, human-readable stream of short operator notes from the swarm, not raw model reasoning or private chain-of-thought.

- The panel opens collapsed by default and shows the latest note in a one-line preview.
- The panel uses the site's white theme. There is no local theme toggle; a dark panel only returns if the whole product gets a dark theme.
- The expand button opens the full stream, legend and warnings. The choice is per page view.
- Each agent has a fixed colour: Mapper emerald, Authz sky, Injector amber, Chain fuchsia, Exploiter violet and Reporter orange.
- Notes are stored as `RunEvent` rows with `type = "thought"` and a payload of `agent`, `text`, `tag`, `step` and `important`.
- The panel polls `/api/assessments/[id]/events` while the run is active and stops when the run leaves `RUNNING`.
- Important notes use red text, red underline, a red dot, a red left border and a visible `WARNING` label. The agent name and tag keep the agent colour so the source stays distinguishable.
- High and critical findings also use red text, an underline and a `WARNING` label.
- The same treatment is applied to the dossier section of the final report: each agent gets a colour, important quotes are red and underlined, and a `WAARSCHUWING` label is rendered.
- The stream contains only current findings and safe observations. It never contains raw evidence or the sealed final report.

The mock worker generates a representative thought sequence for local preview. The Windows worker can publish the same event shape over the worker API when that integration lands.

## Tiers and briefings

| Tier | Minimum | Internal mode | Briefings | Consent |
|---|---|---|---|---|
| Recon | $50 | recon, non-invasive | 1 | standard authorization |
| Pentest | $200 | pentest, read-only exploitation | 2 | standard authorization |
| Deep | $500 | pentest, full aggressive swarm | 3 | explicit aggressive consent |

Briefing cadence:

| Budget cap | Briefings | Thresholds |
|---|---|---|
| $50 to $199.99 | 1 | 50% |
| $200 to $499.99 | 2 | 33%, 66% |
| $500 and above | 3 | 25%, 50%, 75% |

The final report is always included. Briefings contain current findings, coverage, agent stats and a timestamp. They do not contain raw evidence or the sealed bundle.

## Wallet contract

- `Wallet.balanceCents` is the topped-up balance.
- `Wallet.heldCents` is the sum of active run caps.
- Available = balance minus held.
- A run creation writes a `HOLD` ledger entry and increments held.
- Completion writes a `CHARGE` ledger entry, releases the hold and decrements the balance by the actual charge.
- Stripe Checkout is used when `STRIPE_SECRET_KEY` is set. The webhook verifies the signature, is idempotent by Stripe session id, writes a credit lot and ledger entry and emits a notification.
- The local dev provider is only for local testing.
- The customer never sees the internal cost multiplier. Prices, caps and the $15 clean fee are customer-facing only.

## Auth and roles

- Auth.js v5 magic links with the Prisma adapter.
- Production email provider: Resend. Sender is `EMAIL_FROM`.
- Local dev provider: enabled only by `ALLOW_DEV_LOGIN=1`, never in production.
- `ADMIN_EMAILS` allowlist promotes accounts to `ADMIN` on sign-in.
- Customer routes are under the `(portal)` route group and require a session.
- `/admin/**` requires the `ADMIN` role, or a local dev-admin session when `ALLOW_DEV_ADMIN=1`.
- The old public `/start` file flow and `/api/start/*` routes have been removed. `/start` now redirects into the signed-in assessment flow.

## Admin area

- Overview: customers, paid revenue, running and queued runs, verified domains, recent runs, egress summary.
- Runs: target, customer, tier, budget, charged, status, cancellation control.
- Customers: email, role, balance, held, runs, domains.
- Verifications: domain, customer, method, status, expiry.
- Payments: provider, amount, status, timestamp.
- Email: outbox, pending, sent and failed states, retry and dev log mode.
- Workers: status, version, last seen, egress assignment, lease expiry, active runs and worker API state.
- Egress: pools, status, assignments, 24-hour request, error and byte counts, quarantine and release.
- Audit: admin and system actions.

The egress page is driven by `EgressPool`, `EgressAssignment` and `EgressMetric`. It must show an empty or unprovisioned state rather than fake gateway numbers. The local seed creates a clearly marked demo pool for UI work.

## Data model additions

- `AssessmentTier`, `BriefingStatus`, `EgressStatus` enums.
- `Run`: `tier`, `briefingPlan`, `briefingsSent`, `egressIp`, `egressRange`, `egressAssignedAt`, `coverage`, `findings`.
- `RunBriefing`: `runId`, `seq`, `thresholdPct`, `status`, `findings`, `coverage`, `agentStats`, delivery timestamp.
- `Notification`: user, kind, title, body, href, read state.
- `EmailOutbox`: queued notifications and delivery metadata.
- `EgressPool`, `EgressAssignment`, `EgressMetric`.
- `Domain`: `verifiedMethod`, `verificationVersion`.
- `DomainVerification`: hashed token, method, attempts, expiry, evidence.
- `Wallet`: `heldCents`.
- `User` relations for notifications and email outbox.

Migrations are in `apps/web/prisma/migrations`.

## Local preview

The preview is at http://localhost:3123 while the app runs. Use:

- `admin@hackmywebsite.test` for the admin area.
- `demo@hackmywebsite.test` for a customer with $500 and a verified demo domain.
- `ALLOW_DEV_VERIFICATION=1` for the local dev verification button.
- `DEMO_MODE=1` for the in-process mock worker. It starts queued runs, sends 1, 2 or 3 briefings by budget and completes the run with mock findings.

The mock worker is not production behavior. Production uses the Windows worker and the worker API.

## Local sealed delivery

- Report passphrase setup in the browser. The private key is encrypted client-side; the server stores only the encrypted key and public key.
- The mock worker builds an HTML report, encrypts it with AES-256-GCM, wraps the file key with RSA-OAEP, stores ciphertext on disk and creates a 48-hour delivery code.
- The delivery page decrypts in the browser, verifies the plaintext SHA-256 and previews the report in a sandboxed iframe.
- The customer can download the HTML, generate a ZIP with the report and manifest, or use Print / Save as PDF.
- Rate limits protect top-up, assessment creation, domain verification, report key setup and delivery attempts. The current limiter is in memory and must move to Redis before multi-instance web hosting.
- The account can download a recovery kit with the encrypted private key and key metadata. It cannot decrypt without the passphrase.
- The customer can reissue a 48-hour delivery code. Old codes are locked and an audit row is written.
- The local delivery code is fixed by `DEV_DELIVERY_CODE` when `ALLOW_DEV_EMAIL=1`. Production generates a random code and emails it.
- The report bundle is deliberately HTML only in local preview. The real evidence bundle, PDF/ZIP packaging and object storage come from the production worker.

## Production gaps

- Stripe live keys and webhook registration.
- Resend sender domain verification.
- Real Windows worker service and scanner integration. The local worker API contract, token auth, claim, heartbeat, events, encrypted upload and completion are implemented. A standalone Windows worker service client with a mock scan adapter has completed the full run and delivery flow; the real scanner adapter is still pending.
- Production report bundle from real evidence, PDF/ZIP packaging, recovery kit and code reissue.
- Real egress `/28` procurement, gateway, nftables SNAT, PTR and live metrics.
- Production object storage for encrypted bundles.
- Email sender domain verification and bounce handling.
- Admin manual verification review and abuse workflow.
- Full test suite and load tests.

## Related documents

- `docs/EGRESS-PLAN.md`
- `infra/egress/README.md`
- `docs/NEXTJS-PORTAL.md`
- `docs/WORKER-API.md`
- `docs/REPORT-DELIVERY.md`
- `docs/REPORT-AI.md`
- `deploy/README.md`
- `docs/WINDOWS-VM.md`
- `docs/HOSTING-PLAN.md`
