# hackmywebsite.ai

Authorized security assessments with a branded customer portal, an admin area and sealed report delivery.

This repository contains the web portal, worker API, report pipeline, deployment configuration and the setup plan for a Linux worker with DeepSeek Harness.

## Start here

- [Complete instruction set](INSTRUCTIONS.md)
- [Launch TODO](docs/TODO.md)
- [Canonical build plan](docs/HOSTING-PLAN.md)
- [Linux server TODO](docs/LINUX-SERVER-TODO.md)
- [Worker API](docs/WORKER-API.md)
- [Deployment guide](deploy/README.md)

## What is included

- Next.js 16 customer portal and admin area
- Wallet, domain verification and assessment queue
- Worker API with token auth, leases and encrypted upload
- Sealed report delivery with a browser-held passphrase
- Budget advice agent near the top of scan reports
- Translated reports for Dutch, English, German, French, Spanish, Portuguese, Italian and Chinese
- Prior-run handoff for swarm reruns
- DSH launcher for Windows desktop and Linux headless
- Local scan runner, swarm and report kit
- Docker, Compose, Caddy and migration configuration
- Local lab applications for controlled testing

## Quick local start

```powershell
cd apps/web
Copy-Item .env.example .env.local
docker compose up -d db
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev -- -p 3123
```

Open `http://localhost:3123`.

Local seed accounts:

```text
admin@hackmywebsite.test
demo@hackmywebsite.test
```

## Scan report pipeline

The local scanner pipeline is:

```text
evidence_build.mjs -> report_ai.mjs -> advisor.mjs -> report_kit_build.mjs -> report-kit/bundle.mjs
```

The budget advice is written to `advice.json` and rendered near the top of the report. A rerun on the same target loads previous findings, tested areas and advice through `handoff.mjs`.

## Security and privacy

This is a security product. Do not commit:

- customer evidence
- scan output
- access tokens, API keys or credentials
- Stripe or Resend secrets
- report private keys
- personal data

`scans/`, runtime data and environment files are excluded by `.gitignore`.

Only scan targets for which you have explicit written authorization. Provider AUP approval is required for the worker egress host.

## Status

The SaaS foundation and local sealed-report flow work. The production worker adapter, live egress and production credentials are still outstanding. See `docs/TODO.md`.
