# Next.js customer portal plan

Status: proposed 2026-11-04. Supersedes the zero-dependency Node portal for the hosted product.
Companion docs: `docs/HOSTING-PLAN.md`, `docs/WINDOWS-VM.md`, `docs/REPORT-DELIVERY.md`.

## 1. Decision

Build the hosted customer portal as a **self-hosted Next.js 16 application on our own Linux droplet**, with the scan worker on a **self-hosted Windows VM**.

- Web: Next.js 16.2.0 App Router, TypeScript, Tailwind CSS v4, React 19.
- Data: Prisma 7.5.0 + MySQL 8.0.
- Auth: Auth.js v5 with the Prisma adapter and email magic links (Resend).
- Payments: Stripe Checkout + webhook; wallet and ledger in our database.
- Reports: generated on the Windows worker, encrypted to the customer's public key, stored as ciphertext; the web app never receives report plaintext.
- Model: scan-agent inference uses OrcaRouter as an API. Report copy generation uses the DeepSeek API directly (`report_ai.mjs`). There is no GPU in our infrastructure.
- Hosting: our own small Linux droplet (DigitalOcean or equivalent), Node 24, MySQL 8, PM2 or systemd, Cloudflare Tunnel/WAF. Not Vercel for the MVP because of long-lived SSE, worker APIs and database control; revisit later.

The current `server.mjs` portal stays as the owner's local debugging tool until the Next.js app reaches parity.

## 2. Why split web and worker

- The scanner must run on Windows (DSH); the portal should not.
- The worker has no customer database, no Stripe secret, no report private key, no customer session. A compromise of the scanner host does not expose customer accounts or payments.
- The web app stores only ciphertext for reports, so support cannot read them.
- The worker is disposable and can be rebuilt from an image without losing the queue, wallet or delivered reports.
- Next.js on Linux is standard, cheap and easier to operate than a Windows web host.

## 3. Architecture

```
Browser
  -> Cloudflare
     -> Next.js web app (Linux droplet, Node 24, MySQL 8)
        - Auth.js, wallet, Stripe, domains, queue, SSE, delivery, admin
        - stores: MySQL, encrypted report bundles (Spaces or local disk)
     <- worker API (outbound HTTPS from the Windows VM)
        -> Windows worker VM
           - claims jobs, runs DSH agents, generates report, encrypts bundle
           - no customer DB, no customer private keys, no Stripe
           - uploads ciphertext only, then deletes plaintext
```

The web app is the source of truth. The worker never talks to MySQL directly.

## 4. Repository layout

Target monorepo:

```
vaultscan/
  apps/
    web/                 Next.js portal
    worker/              Windows scan worker (runner, swarm, report, upload)
  packages/
    shared/              types, pricing, findings schema, crypto envelope, validation
  docs/
  prisma/                schema and migrations for the web app
```

Interim during P0: keep the current worker files at the repo root so the live local portal keeps working. Create `apps/web` first; move the worker into `apps/worker` after the crash-safe work and the live run are finished.

## 5. Web app structure

```
apps/web/
  src/app/
    page.tsx                          marketing and pricing
    (auth)/login/page.tsx             magic-link sign-in
    (auth)/verify/page.tsx
    dashboard/page.tsx                wallet, active runs, reports
    domains/page.tsx                  add and verify a domain
    runs/page.tsx                     archive with status and queue position
    runs/[id]/page.tsx                run detail, live progress, report delivery
    runs/new/page.tsx                 target, budget, mode, language wizard
    wallet/page.tsx                   balance, credit lots, expiry, top-up
    wallet/ledger/page.tsx
    invoices/page.tsx
    settings/page.tsx                 profile, report passphrase, key rotation
    delivery/[token]/page.tsx         public 48h code download and browser decrypt
    admin/page.tsx                    queue, workers, verification review
    admin/runs/[id]/page.tsx          metadata only, no report content
    admin/workers/page.tsx
    admin/refunds/page.tsx
    admin/costs/page.tsx              internal cost vs charge, margin
    api/auth/[...nextauth]/route.ts
    api/runs/route.ts
    api/runs/[id]/route.ts
    api/runs/[id]/stream/route.ts     SSE
    api/runs/[id]/cancel/route.ts
    api/domains/route.ts
    api/domains/[id]/verify/route.ts
    api/payments/checkout/route.ts
    api/payments/webhook/route.ts
    api/delivery/[id]/route.ts
    api/delivery/[id]/download/route.ts
    api/worker/claim/route.ts
    api/worker/heartbeat/route.ts
    api/worker/runs/[id]/events/route.ts
    api/worker/runs/[id]/upload/route.ts
    api/worker/runs/[id]/complete/route.ts
    api/worker/runs/[id]/control/route.ts
    api/cron/expire-credits/route.ts
    api/cron/reconcile-runs/route.ts
  src/components/                     shared UI, forms, tables, charts
  src/lib/
    db.ts, auth.ts, stripe.ts, mail.ts, pricing.ts, queue.ts,
    verification.ts, crypto.ts, ratelimit.ts, audit.ts, sse.ts
  prisma/schema.prisma
  next.config.ts
  package.json
```

Conventions follow the existing Next.js/Prisma/Tailwind rules: params are Promises in Next 16, Tailwind v4 uses `@theme` in `globals.css` and no `tailwind.config.ts`, Prisma client is generated and imported from the generated path, no em dashes in user-facing copy, no emoji, border radius from the brand scale.

## 6. Data model (Prisma / MySQL)

Auth.js: `User`, `Account`, `Session`, `VerificationToken`.
Portal:
- `Domain(id, userId, hostname, status, verifiedAt, expiresAt, method, evidenceJson)`
- `DomainVerification(id, domainId, token, method, expiresAt, usedAt, ip, userAgent)`
- `Wallet(id, userId, currency, balanceCents, updatedAt)`
- `CreditLot(id, userId, cents, remainingCents, expiresAt, source, createdAt)`
- `LedgerEntry(id, userId, runId?, kind, amountCents, balanceAfterCents, metaJson, createdAt)`
- `Payment(id, userId, provider, providerId, amountCents, status, invoiceUrl, rawJson, createdAt)`
- `Refund(id, userId, paymentId?, runId?, amountCents, reason, status, createdAt)`
- `UserKey(id, userId, keyId, publicKeySpki, encryptedPrivateKey?, kdfSalt, kdfIters, createdAt, revokedAt)`
- `Run(id, userId, domainId, url, host, mode, engine, status, customerBudgetCents, internalCapCents, internalCostCents, chargedCents, cleanCert, language, queuedAt, startedAt, finishedAt, workerId, leaseExpiresAt, heartbeatAt, cancelRequested, error)`
- `RunAgent(id, runId, agentId, role, round, retry, status, steps, internalCostCents, findingsCount, survived, error)`
- `RunEvent(id, runId, seq, type, payloadJson, createdAt)` (metadata only; no report plaintext)
- `ReportBundle(id, runId, keyId, storageKey, envelopeJson, sha256, bytes, createdAt, plaintextDeletedAt)`
- `DeliveryCode(id, bundleId, userId, codeHmac, tokenHash, expiresAt, maxDownloads, downloads, attempts, lockedAt, createdAt, lastUsedAt)`
- `Worker(id, name, tokenHash, status, lastSeenAt, version, capabilitiesJson)`
- `AuditLog(id, actor, action, target, metaJson, ip, userAgent, createdAt)`
- `AbuseFlag(id, runId, userId, reason, status, createdAt)`
- `Setting(key, valueJson)`

Money is integer cents. Every wallet change writes a ledger row. Report content is not stored in MySQL; only the encrypted bundle reference and hash.

## 7. Auth and ownership verification

- Auth.js email provider (Resend) with single-use magic links; database sessions; secure, HttpOnly cookies; `AUTH_SECRET` in env.
- Role `ADMIN` for staff; admin routes also behind Cloudflare Access and 2FA.
- Domain verification methods: DNS TXT `_hackmywebsite.<domain>`, HTTP file `/.well-known/hackmywebsite-verification.txt`, meta tag, email to domain role addresses or WHOIS registrant.
- Token TTL 7 days, verification valid 90 days, re-checked at run creation; DNS must resolve only to public IPs; block private, loopback, link-local, metadata, `.gov`, `.mil` by default; IP-literal targets by manual review.
- All verification evidence stored in `DomainVerification` with IP, UA, method and timestamp.
- Run creation fails closed if the domain is unverified, expired or not public.

## 8. Wallet, pricing, payments

- Stripe Checkout for top-ups; minimum $50; metadata `userId` and `kind=topup`; success/cancel URLs.
- Webhook `checkout.session.completed` is idempotent by event id and creates a credit lot plus ledger row.
- `internalCap = customerBudget / 12.5`; the worker enforces the cap; the web settles after completion.
- Dirty run: charge = ceil(cost × 12.5). Clean run: credit back the charge and keep the flat $15 assessment fee. Inconclusive: full release. See `docs/HOSTING-PLAN.md`.
- Credit lots expire after 42 days; active holds and queued runs pause expiry; reminders at day 30 and 38; daily cron.
- VAT: prices ex-VAT; Stripe Tax; EU VAT ID validation and reverse charge; 21% NL otherwise; invoices stored.
- Internal costs and token counts are admin-only. Customer API responses never include them.

## 9. Queue and worker API

Claim:
```
POST /api/worker/claim
Authorization: Bearer <worker-token>
-> 200 {runId, url, host, mode, engine, language, internalBudgetUsd,
        customerBudgetUsd, publicKey, keyId, deliveryPreference}
```
or `204 No Content`.

The web selects the oldest queued run with `SELECT ... FOR UPDATE SKIP LOCKED`, sets `workerId`, status `running`, lease and heartbeat.

Heartbeat: `POST /api/worker/heartbeat` every 30 s, extends the lease and reports version/capabilities.

Events: `POST /api/worker/runs/:id/events` with a batch of progress and cost events, idempotent by `(runId, seq)`. Payloads are metadata only: phase, step, internal cost, agent status, budget remaining. No report text, no findings evidence.

Cancel: `GET /api/worker/runs/:id/control` returns `{cancelRequested}`; the worker kills the run and reports partial.

Upload: `POST /api/worker/runs/:id/upload` multipart or presigned Spaces URL. Only the encrypted envelope, wrapped key, IV, tag, sha256 and size are accepted. The web rejects any request that is not ciphertext.

Complete: `POST /api/worker/runs/:id/complete` with status, internal cost, coverage, clean-certificate inputs and bundle id. The web settles the wallet, writes the ledger and triggers delivery.

Security: worker tokens are hashed in the database, scoped to one worker, rotated quarterly, rate-limited and audited. Worker routes reject browser sessions. The worker connects outbound over HTTPS; no inbound ports on the Windows VM.

## 10. Live updates

- `GET /api/runs/:id/stream` is an SSE route handler with `runtime = 'nodejs'`.
- Worker events are stored in `RunEvent` and published to an in-memory hub keyed by run id.
- The stream replays the last N events, then goes live; heartbeat comments every 15 s.
- Single web instance for the MVP. When we need more than one instance, move the hub to Redis pub/sub and keep SSE on one connection per run.
- The customer sees status, budget usage in customer currency, queue position and ETA; never tokens or internal cost.

## 11. Report delivery and E2EE

Detailed contract in `docs/REPORT-DELIVERY.md`.

- The browser creates an RSA-OAEP key pair; the private key is encrypted with the customer's report passphrase and stored as ciphertext.
- The run claim includes the public key and key id.
- The worker generates the ZIP bundle, encrypts it with AES-256-GCM and a random file key, wraps the file key with the public key, uploads the envelope and deletes plaintext.
- The web stores ciphertext; it cannot open reports.
- On completion the web creates a 48-hour code and emails the link plus code.
- The delivery page fetches the envelope, asks for the passphrase, decrypts in the browser, previews the HTML in a sandboxed frame and offers PDF/ZIP/encrypted download.
- The customer can reissue a code from the account; support can reissue but cannot decrypt.
- If the worker dies before upload, the run is failed/partial and no plaintext report exists on the web; the customer can re-run.

## 12. Hosting the web app

- New Linux droplet: Ubuntu 24.04, 2 vCPU / 4 GB / 80 GB (DigitalOcean or equivalent), separate from the RLM production droplet.
- Node 24 LTS, MySQL 8 on the same droplet for the MVP, or a managed MySQL when we need failover.
- Next.js standalone build; PM2 or systemd with one instance; Nginx/Caddy or Cloudflare Tunnel; Cloudflare WAF and rate limits.
- SSE requires a single instance initially. Do not run a multi-instance PM2 cluster until the Redis hub exists.
- Backups: nightly MySQL dump plus encrypted bundle storage; retention and restore drill.
- Monitoring: uptime, queue depth, failed webhooks, SSE connections, error rate, disk, DB.
- Secrets: `AUTH_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `WORKER_TOKEN_PEPPER`, `DELIVERY_CODE_PEPPER`, object storage keys. No secrets in the repo.
- Environments: local, staging, production. Staging shares no customer data.

## 13. Local development

- `npm install` (npm workspaces) or pnpm via corepack; lockfile committed.
- `docker compose` for MySQL, Redis (later) and Mailpit, or point `DATABASE_URL` at a dev database.
- `npx prisma migrate dev`; seed an admin user and a test domain.
- `npm run dev` for the web app; `npm run worker:mock` to claim jobs and emit recorded events without spending model tokens.
- Stripe CLI for webhook forwarding; test cards; no live keys.
- Playwright E2E against a controlled fixture target; no live scans without explicit approval.

## 14. Migration from the current portal

1. Keep `server.mjs` and `public/` as the local owner portal; do not restart or replace them during the live agent101 run.
2. Extract shared logic into `packages/shared`: pricing, findings schema, clean certificate, report envelope format.
3. Build the Next.js app with mocked worker events first; verify pages, auth, wallet math, verification and delivery with fixtures.
4. Add the worker API and a mock worker; run a full lifecycle with no model spend.
5. Point the real Windows worker at staging; run one small authorized scan; verify encryption, upload, code email and decryption.
6. Cut over the customer product to production; keep the local portal for owner debugging.
7. Retire the old portal only after the Next.js app passes the acceptance suite.

## 15. Testing

- Unit: pricing, ledger invariants, clean settlement, expiry, queue ETA, target policy, crypto envelope (server and browser).
- Integration: Stripe webhook fixtures, domain verification with stub DNS/HTTP, worker claim/heartbeat/upload, SSE replay.
- E2E: signup, verify, top up (test mode), create run, mock worker completes, code email, decrypt, clean refund, expiry.
- Security: auth/CSRF/IDOR, worker route isolation, upload validation, XSS in target-controlled evidence (must be escaped or decrypted client-side), SSRF target policy, rate limits.
- Crash: kill mock worker mid-run; lease recovery; no plaintext report in web storage; no double charge.
- Performance: SSE with 50 concurrent viewers; queue 100 runs.

## 16. Build order

1. Scaffold `apps/web` with Next.js 16, TypeScript, Tailwind v4, Prisma, Auth.js, Stripe, Resend.
2. Prisma schema, migrations, seed, `lib/db`, `lib/auth`, `lib/pricing`, `lib/queue`.
3. Marketing, auth, dashboard shell, wallet, domains and verification.
4. Run wizard, run list/detail, SSE, mock worker.
5. Stripe checkout, webhook, ledger, invoices, expiry cron.
6. Worker API, Windows worker integration, E2EE envelope, delivery codes and email.
7. Admin pages, audit, abuse flags, monitoring.
8. Staging deploy on the Linux droplet; Windows worker VM; end-to-end test.
9. Production cutover.

## 17. Costs (web side)

| Item | Monthly |
|---|---|
| Linux droplet 2 vCPU / 4 GB | $24-48 |
| MySQL self-hosted | included |
| Object storage / backups | $5-15 |
| Cloudflare | $0-20 |
| Email (Resend) | $0-15 |
| Domain | $1 |
| Total web | roughly $30-100 |

Combined with the Windows worker ($50-200), fixed infrastructure is roughly $80-300/month before payment fees and support.

## 18. Risks and open decisions

- **SSE on one instance**: acceptable for beta; add Redis before scaling the web tier.
- **MySQL on the web droplet**: simple but a single point of failure; managed MySQL or a replica before paying customers depend on it.
- **Next.js/Auth.js/Prisma versions**: pin exact versions; Next 16 params are Promises; Prisma 7.5 generated client import path; test upgrades on staging.
- **Vercel alternative**: easier deploy but constraints on SSE, worker APIs and database; revisit after the MVP if traffic is low.
- **E2EE key loss**: unrecoverable by design; warn at setup, require a recovery kit download.
- **Worker compromise**: no customer data on the VM; rotate model key; phase 2 local proxy.
- **All-in-one alternative**: Next.js can run on the Windows VM, but it puts customer accounts on the same host as the scanner. Not recommended.
