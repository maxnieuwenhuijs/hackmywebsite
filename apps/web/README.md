# hackmywebsite.ai web portal

Branded SaaS portal and private admin area for hackmywebsite.ai.

This app is the customer-facing product and the operator console. It owns accounts, wallet balances, ownership verification, assessment tiers, queue state, briefings and admin egress controls. The scanner runs on a separate Windows worker and the egress gateway is a separate Linux service. The web app stores report metadata and encrypted bundle references, never plaintext final reports.

Read the wider architecture:

- `../../docs/SAAS-PORTAL.md`
- `../../docs/WORKER-API.md`
- `../../deploy/README.md`
- `../../docs/NEXTJS-PORTAL.md`
- `../../docs/EGRESS-PLAN.md`
- `../../docs/REPORT-DELIVERY.md`
- `../../docs/WINDOWS-VM.md`

## Stack

- Next.js 16.2.0 App Router, React 19, TypeScript
- Tailwind CSS v4
- Prisma 7.5 with the MariaDB driver adapter
- MariaDB 11 locally (MySQL 8 compatible schema)
- Auth.js v5 magic links with Resend, plus a local dev sign-in
- Stripe Checkout and webhook adapter behind `STRIPE_SECRET_KEY`
- Resend for magic links and work-email verification codes

## Local setup

```bash
cd apps/web
cp .env.example .env.local
# set DATABASE_URL, AUTH_SECRET and ADMIN_EMAILS in .env.local
docker compose up -d db
npm install --ignore-scripts
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000.

For the preview used in this workspace:

```bash
cd apps/web
docker compose up -d db
npm run db:seed
npm run dev
```

Local development flags (never enable in production):

```env
ALLOW_DEV_LOGIN=1
ALLOW_DEV_PAYMENTS=1
ALLOW_DEV_VERIFICATION=1
ALLOW_DEV_EMAIL=1
DEMO_MODE=1
ADMIN_EMAILS="admin@hackmywebsite.test"
```

With `ALLOW_DEV_LOGIN=1`, `/login` accepts an email and signs in without sending mail. `ADMIN_EMAILS` decides who becomes an admin. With `DEMO_MODE=1`, an in-process mock worker picks up queued runs, publishes briefings and completes the run. It also generates mock findings. This is preview data only.

`npm run db:seed` creates:

- `admin@hackmywebsite.test` as an admin.
- `demo@hackmywebsite.test` as a customer with $500 of credit and a verified demo domain.
- A demo egress pool and 24 hours of traffic samples.

## Customer flow

1. Sign in with a magic link. The JWT session carries the account id and role.
2. Top up the prepaid balance. Minimum is $50. Credit expires after 42 days. Stripe Checkout is used when configured; the local dev payment provider is used otherwise.
3. Verify ownership with DNS TXT, a work email code, or an HTTP file or meta tag. One proof is enough. Verification is valid for 90 days and is checked again when a run is queued.
4. Set a report passphrase in `/report-key`. The browser generates the RSA key pair and encrypts the private key with the passphrase.
5. Choose one of three tiers. All budgets are caps and unused balance is released.
6. The run is queued. The customer gets an in-app notification when it starts.
7. Depending on budget, the customer gets 1, 2 or 3 live briefings with current findings. The final report is sealed and delivered separately.
8. The final report is encrypted end to end. A 48-hour code unlocks the ciphertext, and the browser decrypts it with the report passphrase.

The assessment page also shows a live **Swarm thinking** stream. It is collapsed by default with a one-line latest-note preview and uses the same white theme as the rest of the portal. Each agent has its own colour, and important notes use red text, an underline, a red dot, a red border and a `WARNING` label. The agent name and tag keep their own colour so the source stays identifiable. High and critical findings use the same warning treatment. The report dossier uses the same colour and warning language.

### Tiers

| Tier | Minimum | Mode | Briefings | Consent |
|---|---|---|---|---|
| Recon | $50 | recon | 1 | standard authorization |
| Pentest | $200 | pentest | 2 | standard authorization |
| Deep | $500 | pentest | 3 | explicit aggressive consent |

Briefing thresholds are based on the budget cap:

- $50 to $199.99: one briefing at 50%.
- $200 to $499.99: two briefings at 33% and 66%.
- $500 and above: three briefings at 25%, 50% and 75%.

The final report is always included.

### Verification

- **DNS:** TXT record at `_hackmywebsite.<host>` containing the generated token.
- **Work email:** six-digit code sent to an address on the verified domain. Codes expire after 15 minutes.
- **HTTP:** exact token at `https://<host>/.well-known/hackmywebsite-verification.txt`, or the strict meta tag equivalent.

Only the exact hostname and `www.` are covered. Other subdomains are separate domains.

## Admin area

`/admin` is protected by `ADMIN_EMAILS` / the `ADMIN` role. The local dev admin cookie also works when `ALLOW_DEV_ADMIN=1`.

- `/admin` overview: customers, revenue, queue, verified domains, recent runs.
- `/admin/runs`: budget and status.
- `/admin/customers`: balance, hold and activity.
- `/admin/verifications`: ownership method and expiry.
- `/admin/payments`: provider and payment state.
- `/admin/email`: outbox, retry and dev send log.
- `/admin/workers`: worker status, leases, egress and active runs.
- `/admin/egress`: pools, assignments, 24-hour request/error/traffic metrics, quarantine and release.
- `/admin/audit`: audit log.

### Email outbox

Transactional email is queued in `EmailOutbox`. Admin can flush and retry from `/admin/email`. A cron job can call:

```text
POST /api/internal/email/flush
x-cron-secret: <CRON_SECRET>
```

With `RESEND_API_KEY` set the sender uses Resend. With `ALLOW_DEV_EMAIL=1` messages are marked sent with `providerId=dev-log` and only a masked recipient is logged. Work-email verification codes and final report delivery codes use the same outbox.

The egress page only shows real data when an `EgressPool` and metrics exist. The local seed creates a clearly marked demo pool. It does not invent gateway statistics in production.

## Stripe

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to use Checkout. The webhook endpoint is:

```text
POST /api/webhooks/stripe
```

It verifies the signature, credits the wallet once, writes a ledger entry and emits an in-app notification. Without keys the local dev provider is used.

## Database

Prisma 7 reads the datasource URL from `prisma.config.ts`, which loads `.env.local` or `.env`. Migrations live in `prisma/migrations`. The adapter is configured in `src/lib/db.ts`.

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | production build |
| `npm run start` | run the standalone build |
| `npm run db:generate` | generate the Prisma client |
| `npm run db:migrate` | create and apply a dev migration |
| `npm run db:deploy` | apply migrations in production |
| `npm run db:seed` | local demo admin, customer, worker and egress data |
| `npm run worker:smoke` | claim a queued run through the worker API and test upload and completion |
| `npm run test:rate` | run the in-memory rate-limit checks |
| `npm run db:studio` | Prisma Studio |

## Preview limitations

- The mock worker is for local preview only. The worker API contract is implemented and tested locally. Production still needs the Windows service wrapper and real scanner integration.
- The local seal path is now end to end: report key setup, encrypted HTML bundle, 48-hour code, browser decryption, sandboxed preview, ZIP download and Print / Save PDF. It uses mock findings and a local HTML report. The real worker evidence bundle, server-side PDF/ZIP packaging and production object storage are still to be wired.
- Egress data is seeded demo data locally. The real `/28` procurement and gateway are in `../../docs/EGRESS-PLAN.md` and `../../infra/egress/README.md`.
- Stripe live keys, Resend sender domain and production object storage are not configured in this workspace.
- The local delivery code is fixed by `DEV_DELIVERY_CODE` while `ALLOW_DEV_EMAIL=1`. Production generates a random code and emails it.
