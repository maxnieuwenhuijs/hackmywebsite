# hackmywebsite.ai complete instruction set

This document explains how to run, test, deploy and operate the hackmywebsite.ai SaaS.

It covers:

- local customer portal and admin area
- wallet, ownership verification and assessments
- sealed report delivery and decryption
- worker API and Windows worker
- Linux worker feasibility
- egress and `/28` planning
- DigitalOcean deployment
- Stripe, Resend and DeepSeek configuration
- backups, security and launch checks

Status date: 2026-11-11.

## 1. Current status

Working locally:

- branded marketing site
- customer portal
- admin portal
- magic-link foundation and local dev sign-in
- wallet top-ups and ledger
- domain verification with DNS, email code and HTTP file/meta tag
- three assessment tiers
- budget holds and queue
- 1, 2 or 3 live briefings by budget
- notifications
- swarm thinking with agent colours and warnings
- report key setup and browser encryption
- encrypted report delivery
- 48-hour delivery codes and code reissue
- recovery kit
- HTML, ZIP and Print / Save PDF report actions
- budget advice near the top of local scan reports
- prior-run handoff for a rerun of the same target
- worker API with token auth
- standalone Windows worker client with a mock scanner
- email outbox with Resend adapter and dev log mode
- production Docker, Compose, Caddy, migration and backup configuration

Not launch-ready yet:

- real DeepSeek Harness scan adapter in the worker
- full Linux worker scan test with Chromium and nuclei
- live egress IPs or `/28`
- live Stripe keys
- verified Resend domain
- production object storage
- full security test pass
- production deployment and monitoring
- final report evidence package from a real scan

Do not sell a live assessment until the launch checklist in section 20 is complete.

## 2. Architecture

```text
Customer browser
      |
      v
Next.js web app on Linux
  - auth
  - wallet
  - domains
  - queue
  - admin
  - encrypted report delivery
      |
      | worker API, outbound HTTPS
      v
Windows worker or Linux worker
  - DSH agents
  - Chrome and nuclei
  - encrypted report upload
      |
      v
Egress gateway
  - WireGuard
  - static IP or /28
  - nftables SNAT
      |
      v
Authorized target website
```

Important boundaries:

- The worker never connects to MySQL.
- The worker never receives customer sessions, Stripe secrets or the report private key.
- The web app stores ciphertext only.
- Customers decrypt reports in the browser.
- The admin area cannot read report plaintext.

## 3. Repository layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js portal, API and admin |
| `apps/web/prisma` | schema and migrations |
| `apps/web/Dockerfile` | production web and migration image |
| `deploy` | production Compose stack, Caddy and backup |
| `worker` | standalone Windows worker client |
| `runner.mjs` | single-agent scan runner |
| `swarm.mjs` | multi-agent scan runner |
| `dsh-runtime.mjs` | Windows desktop or Linux DSH launcher |
| `report_ai.mjs` | DeepSeek report copy generator |
| `report_kit_build.mjs` | report HTML builder |
| `docs` | architecture, delivery, egress, Linux worker and TODO |
| `infra/egress` | egress gateway runbook |

## 4. Prerequisites

### Local development

- Windows, macOS or Linux
- Node.js 22 or newer for the web app
- npm 10 or newer
- Docker Desktop with Docker Compose
- Git

For a Linux worker test:

- Node.js 24.9 or newer
- DSH CLI
- Chromium or Chrome
- Playwright
- nuclei

### Production

- Ubuntu 24.04 Linux droplet, 2 vCPU / 4 GB RAM minimum
- Docker Engine and Docker Compose plugin
- domain name with DNS access
- Stripe account
- Resend account
- DigitalOcean Spaces or another S3-compatible bucket
- Windows VM or Linux worker VM
- static egress IP or routed `/28`

## 5. Local setup from zero

### 5.1 Go to the app

```powershell
cd apps/web
```

### 5.2 Create the environment file

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`. For local demo use:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3123
AUTH_SECRET=replace-with-a-long-random-string
AUTH_URL=http://localhost:3123
DATABASE_URL="mysql://hmw:hmwpass@127.0.0.1:3308/hmw"
DATABASE_POOL_SIZE=5
ADMIN_EMAILS="admin@hackmywebsite.test"

ALLOW_DEV_LOGIN=1
ALLOW_DEV_ADMIN=1
ALLOW_DEV_PAYMENTS=1
ALLOW_DEV_EMAIL=1
ALLOW_DEV_VERIFICATION=1
DEMO_MODE=1
DEV_DELIVERY_CODE="K7QM-3XPD-9RTA"

RESEND_API_KEY=
EMAIL_FROM="hackmywebsite.ai <no-reply@hackmywebsite.test>"
CRON_SECRET=local-cron-secret

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

DELIVERY_CODE_PEPPER=local-delivery-pepper
WORKER_TOKEN_PEPPER=local-worker-pepper
WORKER_TOKEN=local-worker-token-2026
REPORT_STORAGE_DIR=
```

Never commit `.env.local`.

### 5.3 Start MariaDB

```powershell
docker compose up -d db
docker compose ps
```

The database listens on `127.0.0.1:3308`.

### 5.4 Install dependencies

```powershell
npm install
```

If the local sandbox blocks lifecycle scripts:

```powershell
npm install --ignore-scripts
npx prisma generate
```

### 5.5 Apply migrations

```powershell
npx prisma migrate deploy
npx prisma generate
```

### 5.6 Seed local data

```powershell
npm run db:seed
```

This creates:

- `admin@hackmywebsite.test`
- `demo@hackmywebsite.test`
- a verified demo domain
- a demo egress pool
- the `local-worker` worker token record

### 5.7 Start the portal

```powershell
npm run dev -- -p 3123
```

Open:

```text
http://localhost:3123
```

For a production-style local run:

```powershell
npm run build
npm start -- -p 3123
```

The local preview currently runs at `http://localhost:3123`.

## 6. Local sign-in

Open `/login`.

Local mode accepts an email and signs in without sending mail.

Use:

```text
admin@hackmywebsite.test
```

The account becomes an admin because it is in `ADMIN_EMAILS`.

Use the demo customer:

```text
demo@hackmywebsite.test
```

`ALLOW_DEV_LOGIN` must be `1`. Never enable it in production.

Production uses Auth.js magic links with Resend.

## 7. Customer flow

### 7.1 Create a report key

Go to:

```text
/dashboard -> Report key
```

or open:

```text
/report-key
```

1. Choose a passphrase of at least 12 characters.
2. Confirm it.
3. Click **Create report key**.

The browser generates an RSA key pair.

The private key is encrypted with the passphrase and stored encrypted on the server.

The passphrase is never sent to the server.

There is no passphrase reset. Losing the passphrase makes old reports unrecoverable.

Download the recovery kit from the same page. It contains the encrypted private key and KDF metadata, not the passphrase.

### 7.2 Top up

Open:

```text
/wallet
```

Local demo uses the dev payment provider.

Production uses Stripe Checkout when Stripe keys are configured.

1. Minimum top up is `$50`.
2. A credit lot is created.
3. Credit expires after 42 days.
4. A run holds its budget cap.
5. Unused hold is released when the run ends.

The customer never sees internal cost or markup.

### 7.3 Verify a domain

Open:

```text
/domains
```

Add the exact hostname or URL.

One proof is enough:

**DNS**

Add a TXT record at:

```text
_hackmywebsite.<host>
```

Use the generated token as the value.

**Work email**

Request a code to an address on the same domain.

The code is queued through the email outbox and expires after 15 minutes.

**HTTP**

Serve the exact token at:

```text
https://<host>/.well-known/hackmywebsite-verification.txt
```

Or add the strict meta tag:

```html
<meta name="hackmywebsite-verification" content="TOKEN">
```

Verification is valid for 90 days.

Only the exact host and `www.` are covered. Other subdomains are separate.

Local demo also has a dev verification button.

### 7.4 Choose an assessment

Open:

```text
/assessments/new
```

Three tiers:

| Tier | Minimum | Briefings | Consent |
|---|---:|---:|---|
| Recon | $50 | 1 | standard authorization |
| Pentest | $200 | 2 | standard authorization |
| Deep | $500 | 3 | explicit aggressive consent |

1. Choose a verified domain.
2. Choose the tier.
3. Set the budget cap.
4. Confirm authorization.
5. Queue the assessment.

The balance is checked server-side.

### 7.5 Briefing cadence

The budget decides the number of live briefings:

| Budget | Briefings | Thresholds |
|---|---:|---|
| $50 to $199.99 | 1 | 50% |
| $200 to $499.99 | 2 | 33%, 66% |
| $500 and above | 3 | 25%, 50%, 75% |

The final report is always included.

Briefings contain findings, coverage and agent stats. They do not contain raw evidence.

### 7.6 Swarm thinking

The assessment page has a Swarm thinking panel.

- collapsed by default
- latest note visible as a preview
- white theme
- per-agent colours
- important notes in red with underline and WARNING labels
- high and critical findings also get warning labels
- live updates while the run is active

### 7.7 Final report

When the mock worker (or a real worker) completes:

1. A sealed HTML report is encrypted.
2. A 48-hour delivery code is created.
3. A delivery email is queued.
4. The run page shows **Open sealed report**.
5. `/delivery/<token>` asks for the delivery code and the report passphrase.
6. Decryption happens in the browser.
7. The report preview is sandboxed.
8. The customer can download HTML, download a ZIP, or print / save as PDF.

The server only stores ciphertext.

Local dev code is set by `DEV_DELIVERY_CODE`.

Production code is random and emailed.

### 7.8 Reissue a delivery code

On a completed run:

1. Click **Email me a new code**.
2. Old codes are locked.
3. A new code and token are created.
4. An audit row is written.
5. The latest notification has the new delivery link.

### 7.9 Budget advice and rerun context

A completed scan can get a short advice block near the top of the report.

- The block is written by `advisor.mjs`.
- It explains what extra budget would buy.
- It is honest that more budget gives more coverage, not a guarantee of new findings.
- It lists 2 to 4 concrete extra steps with an estimated extra budget.
- The local report pipeline runs it automatically after the report copy is generated.

Manual run:

```powershell
node advisor.mjs scans/<scan-id> --lang nl
node report_kit_build.mjs scans/<scan-id> --lang nl
node report-kit/bundle.mjs scans/<scan-id>/rapport.nl.src.html scans/<scan-id>/rapport.nl.html
```

Before a rerun, `handoff.mjs` loads the previous run for the same host:

- previous findings
- tested areas
- previous budget advice
- previous scan id

`runner.mjs` and `swarm.mjs` append that context to the new prompt. The swarm therefore knows what was already tested and starts from the previous result instead of zero.

The report block also says that the next run will receive this context.

### 7.10 Translated reports

A finished scan can be rendered in any supported report language.

URL:

```text
/api/scans/<scan-id>/rapport.html?lang=en
/api/scans/<scan-id>/rapport.pdf?lang=de
```

Supported codes:

```text
nl, en, de, fr, es, pt, it, zh
```

Pipeline:

1. `report_ai.mjs --lang <code>` writes `content.<code>.json`.
2. For non-Dutch languages a dedicated translation pass rewrites all human-readable JSON fields and keeps technical evidence untouched.
3. `advisor.mjs --lang <code>` writes `advice.<code>.json`.
4. `report_kit_build.mjs --lang <code>` renders the localized page and advice block.
5. `report-kit/bundle.mjs` writes the self-contained `rapport.<code>.html`.
6. The PDF route prints that HTML.

Manual rebuild:

```powershell
$d = "scans/<scan-id>"
node report_ai.mjs $d --lang en
node advisor.mjs $d --lang en
node report_kit_build.mjs $d --lang en
node report-kit/bundle.mjs "$d\rapport.en.src.html" "$d\rapport.en.html"
```

Verified:

- English report
- German report
- localized advice labels
- technical evidence left unchanged
- language selector in the local portal

When a translation fails, the build logs it. Re-run the command before publishing the report.

## 8. Admin area

Open:

```text
/admin
```

The admin account must be in `ADMIN_EMAILS`, or use the local dev admin.

Pages:

| Page | Purpose |
|---|---|
| `/admin` | overview, revenue, runs, domains, egress |
| `/admin/runs` | all runs and cancel control |
| `/admin/customers` | customers, balance, hold, activity |
| `/admin/verifications` | verification method, status, expiry and manual approval |
| `/admin/payments` | top-ups and payment state |
| `/admin/email` | email outbox, flush and retry |
| `/admin/workers` | worker status, leases, egress and current runs |
| `/admin/egress` | pool, assignments, traffic, quarantine and release |
| `/admin/audit` | audit log |

### Cancel a run

Admin can cancel queued, running or reporting runs from `/admin/runs`.

- queued runs cancel immediately
- running runs get a cancellation request
- the remaining hold is released
- actual usage is charged
- user gets a notification
- action is audit logged

## 9. Worker API

Docs: `docs/WORKER-API.md`.

Authentication:

```http
Authorization: Bearer <WORKER_TOKEN>
```

The token must match a `Worker.tokenHash` created with `WORKER_TOKEN_PEPPER`.

Endpoints:

```text
POST /api/worker/claim
POST /api/worker/runs/:id/heartbeat
POST /api/worker/runs/:id/events
GET  /api/worker/runs/:id/control
POST /api/worker/runs/:id/upload
POST /api/worker/runs/:id/complete
```

Lifecycle:

1. Claim returns the oldest queued run and a 10-minute lease.
2. Heartbeat extends the lease.
3. Events send thought and progress metadata.
4. Control tells the worker if cancellation was requested.
5. Upload stores only an encrypted envelope and ciphertext.
6. Complete releases the hold, charges actual usage and creates delivery.

Worker routes reject browser sessions. Missing or wrong tokens return `401`.

### Local worker smoke test

Start the web app with the in-process mock worker off:

```powershell
cd apps/web
$env:DEMO_MODE='0'
npm run dev -- -p 3123
```

Queue a run in the portal.

Then:

```powershell
cd apps/web
npm run worker:smoke
```

The script claims the run, heartbeats, sends a thought, uploads an encrypted test bundle, completes the run and prints the delivery link.

## 10. Standalone worker client

Docs: `worker/README.md`.

The current worker client uses a mock scan adapter.

Environment:

```env
HMW_WEB_URL=https://app.hackmywebsite.ai
HMW_WORKER_TOKEN=replace-with-worker-token
HMW_RUNS_DIR=C:\hmw\runs
HMW_POLL_MS=5000
HMW_HEARTBEAT_MS=15000
HMW_MOCK_SCAN_MS=15000
```

Run:

```powershell
node worker/worker.mjs
```

It:

- polls claim
- heartbeats
- sends events
- checks cancel
- builds a report in memory
- encrypts the report with the customer public key
- uploads only ciphertext
- completes the run
- deletes its temporary run directory
- never writes plaintext report to disk

### Windows service with NSSM

```powershell
nssm install HMWWorker "C:\Program Files\nodejs\node.exe" "C:\hmw\worker\worker.mjs"
nssm set HMWWorker AppDirectory C:\hmw\worker
nssm set HMWWorker AppEnvironmentExtra HMW_WEB_URL=https://app.hackmywebsite.ai HMW_WORKER_TOKEN=... HMW_RUNS_DIR=C:\hmw\runs
nssm set HMWWorker AppStdout C:\hmw\logs\worker.out.log
nssm set HMWWorker AppStderr C:\hmw\logs\worker.err.log
nssm set HMWWorker Start SERVICE_AUTO_START
nssm start HMWWorker
```

Current limitation: the real DeepSeek Harness scan adapter is not wired in yet.

## 11. Linux worker

Docs: `docs/LINUX-WORKER.md`.

The DSH CLI is cross-platform.

Tested in a clean Node 24 container:

- `@deepseek-ai/dsh` installed
- version `0.2.2-rc.1`
- Node requirement `>=24.9.0`
- `dsh --profile headless --json` worked
- the agent used tools
- event types match our parser

The shared launcher is `dsh-runtime.mjs`.

On Linux it uses:

```text
dsh --profile headless --json
DEEPSEEK_API_KEY
```

On Windows it uses the desktop host and OrcaRouter.

### Linux requirements

- Ubuntu 24.04
- Node.js 24.9 or newer
- npm
- Chromium or Chrome
- Playwright dependencies
- nuclei and templates
- WireGuard to egress
- 4 to 8 vCPU, 8 to 16 GB RAM
- outbound HTTPS only

### Linux smoke test

```bash
export DEEPSEEK_API_KEY=...
node scripts/linux-dsh-smoke.mjs
```

Expected output includes:

```json
{
  "provider": "deepseek",
  "final": "The full path of the current workspace is ..."
}
```

Still required before production:

- full swarm on Linux
- Chromium and nuclei tests
- controlled lab scan
- Linux cost calibration
- worker scan adapter
- egress routing

## 12. Egress and `/28`

Docs: `docs/EGRESS-PLAN.md` and `infra/egress/README.md`.

### What `/28` means

A `/28` is a CIDR block of **16 public IPv4 addresses**.

Example:

```text
203.0.113.0/28
```

Covers:

```text
203.0.113.0 to 203.0.113.15
```

Usually 14 are usable after network and broadcast.

A `/28` is not 28 servers. It is a routed range.

### MVP options

1. One static IP
   - cheapest
   - fine for the first pilot
   - all scans share one source
2. A few reserved IPs
   - better separation
   - more cost
3. A `/28`
   - 16 addresses
   - better for parallel runs
   - needs a provider that routes the range and accepts the scanning AUP

A normal DigitalOcean droplet does not include a `/28`.

### Egress gateway requirements

- Linux gateway
- static public IP or routed `/28`
- WireGuard peer for each worker
- nftables SNAT
- fail closed if the tunnel is down
- no open proxy listener
- PTR records
- abuse contact
- metrics exporter into `EgressMetric`
- admin quarantine and release
- no fake statistics

The admin egress page shows an unprovisioned state until real data exists.

## 13. Production deployment on DigitalOcean

Docs: `deploy/README.md`.

DigitalOcean Droplets are Linux only. You cannot run the Windows worker on a standard droplet.

Recommended:

- Linux droplet for web, database and Caddy
- separate Windows VM or Linux worker
- Linux egress gateway
- Spaces for ciphertext

### 13.1 Droplet

- Ubuntu 24.04
- 2 vCPU, 4 GB RAM minimum
- 80 GB SSD
- Docker and Compose plugin
- firewall: 22 from your IP, 80 and 443 public

### 13.2 DNS

Create an A record:

```text
app.example.com -> droplet public IPv4
```

### 13.3 Environment

```bash
cd deploy
cp .env.production.example .env.production
```

Edit every value:

- domain
- database passwords
- auth secret
- admin email
- Resend key
- Stripe keys
- worker token
- peppers
- cron secret

Production flags:

```env
ALLOW_DEV_LOGIN=0
ALLOW_DEV_ADMIN=0
ALLOW_DEV_PAYMENTS=0
ALLOW_DEV_EMAIL=0
ALLOW_DEV_VERIFICATION=0
DEMO_MODE=0
```

Do not commit `.env.production`.

### 13.4 Start

```bash
chmod +x backup-db.sh
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

The migration job runs before the web container starts.

Caddy gets TLS automatically when DNS points at the droplet.

Check:

```bash
curl -fsS https://app.example.com/api/health
```

### 13.5 First admin

1. Open `https://app.example.com/login`.
2. Use the address in `ADMIN_EMAILS`.
3. Auth.js creates the user on first magic-link sign-in.
4. Set the report key.
5. Top up through Stripe.
6. Add and verify a domain.
7. Queue a test run.

### 13.6 Updates

```bash
git pull
cd deploy
docker compose --env-file .env.production up -d --build
```

## 14. Stripe

Customer portal uses Stripe Checkout and a signed webhook.

Configure:

```env
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test
```

Webhook:

```text
POST /api/webhooks/stripe
```

Start with test keys.

Test:

- successful top-up
- cancelled checkout
- duplicate webhook
- failed payment
- refund
- chargeback

The webhook credits the wallet once and writes a ledger row.

## 15. Resend and email

Configure:

```env
RESEND_API_KEY=re_...
EMAIL_FROM="hackmywebsite.ai <no-reply@yourdomain>"
CRON_SECRET=replace-with-long-random
```

Verify the sending domain in Resend.

Email types:

- magic-link sign-in through Auth.js
- work-email verification code
- final report delivery code

The outbox is available at:

```text
/admin/email
```

Flush:

```text
POST /api/internal/email/flush
x-cron-secret: <CRON_SECRET>
```

With `ALLOW_DEV_EMAIL=1`, messages are marked `sent` with `providerId=dev-log` and no real email leaves the system.

## 16. DeepSeek and report AI

Report copy generation calls the DeepSeek API directly.

Docs: `docs/REPORT-AI.md`.

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_REPORT_MODEL=deepseek-flash
DEEPSEEK_MAX_TOKENS=16000
```

Command:

```powershell
node report_ai.mjs scans/<scan-id> --lang nl --budget 0.30 --model deepseek-flash
```

The report writer records:

- `generatedBy: deepseek-api`
- provider
- model
- usage
- cost
- budget

The scan swarm still uses its configured DSH provider.

## 17. Backups and restore

### Database backup

```bash
cd deploy
./backup-db.sh
```

The script keeps 14 daily dumps.

### Restore

```bash
gunzip -c backups/hmw-YYYYMMDDTHHMMSSZ.sql.gz | \
  docker compose --env-file .env.production exec -T db \
  mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"
```

Test the restore on staging.

Encrypted report volume must also be backed up, or moved to object storage.

## 18. Security operations

Required:

- TLS only
- all dev flags off
- separate production secrets
- admin allowlist
- worker token rotation
- least-privilege database user
- no plaintext report storage
- no report content in email
- no secrets in logs
- rate limits enabled
- audit log review
- worker and egress separation

Current limitations:

- rate limiter is in memory
- move to Redis before multiple web instances
- worker API rate limits are not applied yet
- bounce suppression is not implemented
- full CSRF, IDOR and XSS test pass is still required

Report passphrase rules:

- the customer holds it
- support cannot reset it
- losing it means losing old reports
- recovery kit does not contain the passphrase

## 19. Testing commands

From `apps/web`:

```powershell
npm run build
npx tsc --noEmit
npm run test:rate
```

Worker API smoke:

```powershell
$env:DEMO_MODE='0'
npm run dev -- -p 3123
```

Then in another terminal:

```powershell
npm run worker:smoke
```

Cross-platform DSH smoke:

```bash
node scripts/linux-dsh-smoke.mjs
```

Report AI smoke:

```powershell
node report_ai.mjs scans/<scan-id> --lang nl --budget 0.30
```

Production container:

```bash
docker build -f apps/web/Dockerfile --target runner -t hmw-web:test apps/web
```

## 20. Launch checklist

### Product

- [ ] customer sign-in works with production Resend
- [ ] top-up works with Stripe test mode
- [ ] top-up works with Stripe live mode
- [ ] all three verification methods work
- [ ] manual admin verification works
- [ ] three tiers queue correctly
- [ ] briefings match budget
- [ ] start and completion notifications work
- [ ] final report decrypts in browser
- [ ] ZIP and Print / Save PDF work
- [ ] reissue code locks the old code
- [ ] recovery kit downloads
- [ ] admin cancel releases the hold

### Worker

- [ ] real scan adapter wired
- [ ] Windows or Linux worker tested
- [ ] heartbeat and lease recovery tested
- [ ] kill a worker mid-run and verify recovery
- [ ] egress IP is correct
- [ ] encrypted upload has no plaintext
- [ ] real findings reach the report
- [ ] worker logs do not contain secrets

### Egress

- [ ] provider AUP signed
- [ ] static IP or `/28` routed
- [ ] WireGuard works
- [ ] nftables SNAT works
- [ ] no open proxy
- [ ] PTR records set
- [ ] metrics reach admin
- [ ] quarantine works

### Production

- [ ] DNS and TLS
- [ ] database backups
- [ ] restore drill
- [ ] object storage
- [ ] monitoring
- [ ] error tracking
- [ ] legal pages
- [ ] support address
- [ ] abuse address
- [ ] incident contact

## 21. Troubleshooting

| Problem | Check |
|---|---|
| Login loops or 500 | `AUTH_URL`, `AUTH_SECRET`, database connection |
| Prisma cannot spawn engine | local file sandbox; run with full access or use production Linux |
| Database access denied | use the compose MariaDB credentials, not MySQL root |
| No admin account | add email to `ADMIN_EMAILS` and sign in |
| Domain verification fails | exact host, TXT name, code expiry, public target |
| Report key missing | open `/report-key` |
| Report shows `[object Object]` | report was built before the evidence serializer fix; rebuild it, the builder now refuses to publish that output |
| Report shows raw `<span class="term">` markup | report was built before the glossary fix; rebuild it, the builder now refuses malformed glossary output |
| Report will not decrypt | wrong passphrase or wrong code |
| Delivery link expired | reissue from the run page |
| Email pending | `/admin/email`, provider key, `CRON_SECRET` |
| Worker gets 401 | token and `WORKER_TOKEN_PEPPER` mismatch |
| Worker never claims | `DEMO_MODE=0`, queued run exists |
| Caddy no certificate | DNS points to droplet, ports 80 and 443 open |
| Docker web unhealthy | database URL reachable from container, migration completed |
| Egress page empty | no real pool or metrics provisioned |

## 22. Key documents

- `docs/SAAS-PORTAL.md`
- `docs/WORKER-API.md`
- `docs/REPORT-DELIVERY.md`
- `docs/REPORT-AI.md`
- `docs/EGRESS-PLAN.md`
- `docs/LINUX-WORKER.md`
- `docs/WINDOWS-VM.md`
- `docs/TODO.md`
- `deploy/README.md`
- `worker/README.md`
- `infra/egress/README.md`

## 23. Do not do

- do not commit `.env.local` or `.env.production`
- do not enable dev login flags in production
- do not store report plaintext in the web database
- do not send report content by email
- do not use the Windows worker as a database client
- do not expose the worker or egress gateway with inbound ports
- do not run an open proxy
- do not promise stealth; targets can see request logs
- do not sell a live assessment before the launch checklist is complete
