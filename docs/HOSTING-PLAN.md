# hackmywebsite.ai: findings recovery, real cost model, and prepaid hosted launch

Approved 2026-11-04. Canonical plan for the vaultscan / hackmywebsite.ai project.
Supersedes ad-hoc decisions; the original build notes live in `default-workspace/vaultscan-PLAN.md`.

## Live status snapshot (checked 2026-11-04 12:50 CET)

- **agent101.nl run `scan-mw1x6of3-bd2bc4` finished at 12:34:47 CET.** The portal reports `status=COMPLETE`, phase `done`, round **3 of 3**, **411 steps, $8.6443 of $10**, **24 merged findings**.
- Round 3 ran only `exploiter-r3` (15 steps, $0.2307, 5 findings). It read the shared board and salvaged part of the no-report evidence, including the board-confirmed malformed-input 500 (`IMPACT-5`). `mapper-r2` and `injector-r2` still have no parseable final; their provenance, leads and raw RSC-header evidence remain board-only.
- Final findings include the clickjacking correction (`X-02`, `IMPACT-1`), dataset export and cost amplification proofs (`IMPACT-2`, `IMPACT-3`), and the negative write-ACL proof (`IMPACT-4`). `findings.json` still uses mixed keys and lacks canonical request/response fields for some findings; normalize in recovery.
- **The five stale "running" runs were retired at 11:53:54 CET by the owner session** (only agent101 was kept). They are now `INTERRUPTED` / phase `done` with reason `stopped by owner during cleanup; run was orphaned`; no data was deleted.
- The portal is serving on `127.0.0.1:7777`; it has not been restarted. A post-completion snapshot is still needed before the recovery run.
- Changes so far: this plan, `docs/STATUS-2026-11-04.md`, `docs/REPORT-DELIVERY.md`, `docs/NEXTJS-PORTAL.md`, `docs/WINDOWS-VM.md`, `docs/COMPUTE-DECISION.md`, the read-only snapshot, and the Next.js scaffold under `apps/web`. No changes to the scan portal/worker source yet.

## 0. Ground truth verified before planning

| Fact | Evidence |
|---|---|
| Portal = local zero-dependency Node app (`server.mjs`), UI in `public/`, scans in `scans/<id>/` | `server.mjs`, `public/app.js` |
| Swarm writes findings only after each agent's process closes; a killed run leaves `scan.json` status `running` forever | `swarm.mjs` `mergeReport`, `runAgent` |
| Agent101 run is the only genuinely live one; 5 stale `running` rows exist | portal API + file mtimes |
| Findings use mixed schema (`confidence`, `evidence`, `impact`) and have no request/response, so the portal's COPY CURL and evidence panes render empty | `findings.json` of that run, `public/app.js` |
| Board (`board.jsonl`) holds the strongest round-2 evidence and a correction that is not surfaced in the portal | `scans/.../board.jsonl` |
| 21 runs: **$28.46 internal spend, 1,254 steps, 128 findings** => **$0.0227/step, $0.222/finding**; `pricing.json` claims **$0.0113/step** (2x understated) | aggregated from all `scan.json`/`findings.json` |
| Report AI costs **$0.0034 per language** on `deepseek-flash` for the tested report (4,598 in / 4,533 out tokens); PDF is Chrome print of the same HTML | `report_ai.mjs`, `report_kit_build.mjs`, `report_kit/bundle.mjs` |
| Repo root has **778 files / 40 MB**, 458 scratch `.mjs` probes; workspace 113.8 MB; scans 10.3 MB | filesystem count |
| No auth, no accounts, no queue, no payments, no ownership verification; budget $0.05-$50 internal; binds 127.0.0.1 | `server.mjs` |
| DSH scanner runtime is Windows-only (Electron `.exe` + `dsh.cmd` + registry), so production scanning needs Windows | `runner.mjs`, `runtimes/cli/bin/dsh.cmd` |
| Node 24 ships `node:sqlite` (tested here), so the hosted MVP can stay dependency-free | `node:sqlite` smoke test |
| Agent shell access + model API key in env = prompt-injection/exfiltration risk for a public paid service | `runner.mjs` env |

## 1. Goal and success criteria

**Goal:** (A) recover the agent101 findings and make every run crash-safe and debuggable in the portal; (B) clean the project; (C) measure true cost per run; (D) launch a hosted, prepaid, ownership-verified service at 12.5x markup, $50 minimum, with queue/ETA, wallet, clean-result guarantee and expiry; (E) make large budgets drive proportionally larger swarms; (F) deliver every report by email with a 48-hour access code, encrypted end-to-end so staff cannot open stored reports; (G) run the customer product as a Next.js app on Linux with the scanner on a separate worker VM, Windows as fallback until the Linux worker is validated.

Success criteria:
1. Portal shows the agent101 run as **PARTIAL/COMPLETE** with normalized findings, evidence, board posts and per-agent diagnostics; no run can stay `running` after a crash.
2. Killing any agent/run mid-flight never loses already-produced findings or board entries.
3. Root has <= ~30 files; agents write only inside their run workspace; per-run cost is recorded in `cost.json`.
4. A new customer can sign up, verify ownership of a domain, top up $50+, queue a run, see position/ETA, receive findings + report, and get the clean-result credit. An unverified or private-IP target cannot start.
5. Internal costs and token counts are never exposed in the customer UI; only budget, charges and fees are.
6. Large budgets ($250/$1,000/$10,000) scale roster, rounds and workers without breaking the budget guard.
7. Every completed report is emailed as a 48-hour code plus an encrypted bundle; decryption needs the owner's passphrase; no plaintext report survives on our disk, logs, email or backups, and support cannot open it.
8. The customer product is a Next.js app on Linux; the separate worker VM holds no customer database, payment secret, session or report private key, and the web app stores only report ciphertext. The worker may be Windows or a validated Linux worker.
9. Every completed local scan report has a budget advice block near the top, generated by the advice agent, with concrete extra work and an honest statement that more budget does not guarantee findings.
10. A rerun on the same target receives the previous findings, tested areas and previous advice. The swarm continues from that context instead of starting from zero.

## 2. Save locations

- This file: `vaultscan/docs/HOSTING-PLAN.md` (canonical).
- Delivery contract: `vaultscan/docs/REPORT-DELIVERY.md`.
- Next.js portal plan: `vaultscan/docs/NEXTJS-PORTAL.md`.
- Windows worker VM plan: `vaultscan/docs/WINDOWS-VM.md`.
- Linux worker plan: `vaultscan/docs/LINUX-WORKER.md`.
- Linux server setup TODO: `vaultscan/docs/LINUX-SERVER-TODO.md`.
- Canonical launch checklist: `vaultscan/docs/TODO.md`.
- Operator instructions: `vaultscan/INSTRUCTIONS.md`.
- Compute decision (no Runpod): `vaultscan/docs/COMPUTE-DECISION.md`.
- Original build notes remain at `default-workspace/vaultscan-PLAN.md`; a pointer is kept in the team log rather than overwriting the old plan.
- Status log: `vaultscan/docs/STATUS-2026-11-04.md`.

## 3. P0 order of operations (live run finished 12:34:47)

1. Save the plan files.
2. Take a post-completion snapshot of the run: copy `scan.json`, `findings.json`, `board.jsonl` and agent event tails into `scans/<id>/snapshot-<timestamp>/` so nothing can be lost.
3. Implement recovery/crash-safety/portal-debug code in place; the running portal keeps its old code until restart.
4. Run recovery/normalizer on fixtures first, then on the snapshot and the final run.
5. Restart the portal on the new code, run `recover --all`, normalize findings, keep the five orphaned runs `INTERRUPTED`/`PARTIAL`, and re-enable normal operation.
6. Clean the workspace, run the cost ledger over all 21 scans, generate `docs/COST-MODEL.md`, then proceed to the hosted MVP.

## 4. Workstream A - Record and communicate findings

### A1. Recover `scan-mw1x6of3-bd2bc4`
- `lib/findings.mjs` normalizer: map `confidence -> status`, `evidence -> evidence`, `impact -> impact`, derive `category`, keep `severity`, assign IDs, add `provenance {agent, round, sources}`. Extract request/response only when evidence holds a real HTTP exchange; otherwise render evidence/impact.
- `tools/recover.mjs <scan-id|--all>`: merge every agent `final` (salvage the last `final` from `events.jsonl`), ingest `board.jsonl` (`finding|lead|endpoint`), turn board findings into findings and leads/endpoints into `diagnostics.json`, apply the round-2 clickjacking correction, mark `PARTIAL`/`INTERRUPTED` with reason/endedAt/coverage/agent outcomes, write atomically, regenerate the report on demand.
- **`completed-no-report` salvage:** an agent that closes without a parseable final must not be treated as "clean". Extract its board posts, last final text if any, and tool results; classify as `salvaged` or `no-report`; never drop board findings. Agent101's `mapper-r2` and `injector-r2` are the first test case, including the RSC-header 500 finding.
- Acceptance: agent101 appears with all merged findings + r2 evidence, status not `running`, report builds, no secrets leaked.

### A2. Crash-safe pipeline (all future runs)
- Atomic temp-file + rename writes for `scan.json`/`findings.json`.
- Persist findings after **every** agent round and phase; keep `findings.partial.json` during a run.
- Heartbeat per agent/run; `reconcileScans()` on portal/worker start: any `running` run without a live child/lease becomes `PARTIAL` (has findings) or `INTERRUPTED`, with recovery metadata.
- On kill/cancel/watchdog: salvage reports, board and partial state first; never erase confirmed findings when a later phase returns empty.
- Move each agent's cwd to `scans/<id>/work/`; copy `probe.mjs`; board at `scans/<id>/work/board.jsonl`; update prompts; verify with a test that the child cannot write outside it.

### A3. Portal "debug" surfaces ("communicate")
- Routes: `GET /api/scans/:id/diagnostics`, `GET /api/scans/:id/board`, `GET /api/scans/:id/findings`.
- UI: per-run debug panel (agent table, board feed, coverage goal, `PARTIAL/INTERRUPTED` banner), "Copy diagnostics", "Download debug.json" (masked), "Open raw events".
- Findings cards render evidence/impact/request/response and provenance; COPY CURL only for real requests.
- Completion/partial notification hook (email + optional webhook), SSE updates for agent/board; keep raw `events.jsonl` replay with size caps.

### A4. Report generation must not block the portal

The first agent101 PDF request froze the local portal on 7777. `server.mjs` builds reports with `spawnSync` inside the HTTP handler, so a slow AI report writer (or a stuck child process tree) blocks the entire Node event loop. Fix:

- Run report generation as an async child process with a hard wall-clock timeout and a process-tree kill.
- Persist a report job state (`queued|running|done|error`, startedAt, finishedAt, language, error) and expose a status endpoint. The HTTP request returns 202 instead of holding the connection.
- Queue one report job at a time per scan; cache each language; never regenerate a fresh HTML/PDF when the cached artifact is newer than the findings.
- Run the AI writer once per language with the existing budget, then build the kit HTML and print the PDF in a separate renderer. Do not hold the portal event loop open.
- The UI polls the report status and enables the RAPPORT/PDF buttons when ready.
- Add a test that starts a report job with a deliberately slow mock child and proves the portal still serves `/api/scans` and SSE during generation.

## 5. Workstream B - Clean-up

- Inventory then quarantine: move root agent scratch into `archive/agent-scratch/2026-11-04/`; keep evidence (`w-clickjack-proof.png`, EVIDENCE docs) in the relevant scan's `evidence/`. Delete duplicates (`chunks*`, `A_chunks*`, repeated HTML dumps) only after reference check.
- New tree: `server.mjs`, `worker.mjs`, `runner.mjs`, `swarm.mjs`, `config.mjs`, `db.mjs`, `lib/`, `prompts/`, `public/`, `report-kit/`, `tools/`, `docs/`, `scans/` (gitignored), `archive/` (gitignored), `README.md`, `.env.example`, `.gitignore`.
- Replace every hardcoded `C:\Users\maxni\...` path with `config.mjs` (env overrides + Windows defaults: `DSH_EXE`, `DSH_CLI`, `CHROME`, optionally `PYTHON/LO` for the legacy DOCX path).
- Keep **one** report pipeline (kit HTML + Chrome PDF); remove the legacy `/report.html` + `report_pdf.py` path after a fallback test.
- `probe.mjs` becomes `tools/probe.mjs`, copied per run; prompts reference `./probe.mjs`; probe UA -> `hackmywebsite.ai/2.0`.
- Add `README`, `docs/ARCHITECTURE.md`; init git and commit the cleaned baseline (no scans, secrets, `.dsh-home`).

## 6. Workstream C - Real cost accounting

Deliverables: `lib/cost.mjs`, `cost.json` per scan, `tools/cost-report.mjs`, `docs/COST-MODEL.md`, admin cost dashboard.

| Item | Value | Notes |
|---|---|---|
| LLM rates | $0.80/M in, $1.60/M out, $0.15/M cache-read | `pricing.json` |
| Measured average | $0.0227/step, $0.222/finding | 21 runs, 1,254 steps, $28.46 |
| Variance | ~3x per run ($0.013-$0.134/step) | long transcripts pricier; use per-mode medians |
| Report AI | $0.066/language measured | 8 languages ~ $0.53 if all generated |
| PDF/HTML | ~5 s worker time | no API cost |
| Storage | ~0.5 MB/run | negligible |
| Payment fee | assume 2.5% + $0.30 (verify at launch) | $1.55 on $50, $25.30 on $1,000 |
| Fixed infra | Linux web droplet + MySQL + worker VM + backups + email + domain ~ $80-300/mo | allocate per run at volume |
| Support | 5-10 min/run at $30/h | $2.50-5.00 |
| Reserve | 1% of charge | chargebacks/fraud |

Formulas: `cost = Σ in*0.8 + out*1.6 + cache*0.15 /1e6`; `charge = ceil_cent(cost * 12.5)`; report/render costs included before markup.

Examples (dirty, full spend): $50 charge, ~$10.30 cost, ~$39.70 margin (79%); $250 charge with $150 used, ~$21.70 cost; clean at min ticket with flat $15: ~$4.70 margin.

Recalibrate `pricing.json` presets and UI estimates; add optimization backlog (cheaper mapper model, tool-output caps, fewer continuation phases, translation cache, report reuse).

## 7. Workstream D - Hosted product architecture

**Split architecture:** a self-hosted Next.js 16 customer portal on our own Linux droplet (MySQL, Auth.js, Stripe, queue, SSE, delivery, admin) plus a separate self-hosted worker VM that runs only the scanner. Scan-agent inference stays with OrcaRouter as an API; report copy generation and the budget advisor call the DeepSeek API directly. There is no GPU in our infrastructure. Full plans: `docs/NEXTJS-PORTAL.md`, `docs/WINDOWS-VM.md`, `docs/LINUX-WORKER.md`, `docs/COMPUTE-DECISION.md` and `docs/REPORT-AI.md`.

**Why split:** the current runner was built around the Windows desktop host, but the DSH CLI itself is cross-platform and a Linux headless port is now smoke-tested. The worker VM holds no customer database, payment secret, session or report private key, so a scanner compromise cannot reach customer accounts. Report plaintext exists only transiently on the worker; the web stores ciphertext envelopes only.

**Web stack:** Next.js 16.2.0 App Router, TypeScript, React 19, Tailwind v4, Prisma 7.5.0 + MySQL 8, Auth.js v5 (magic links via Resend), Stripe Checkout + signed webhook. Deploy standalone on a 2 vCPU / 4 GB Ubuntu droplet with PM2 or systemd, Cloudflare WAF/Tunnel. One web instance for SSE initially; add Redis pub/sub before scaling the web tier.

**Worker:** Windows Server 2022/2025 VM, 8 vCPU / 16-24 GB / 200 GB NVMe, EU region, static IP, no inbound ports, Cloudflare Access or Tailscale for RDP. Node 24, pinned DSH, Chrome, nuclei, NSSM service. It claims jobs over outbound HTTPS, posts metadata progress and internal cost, generates and encrypts the report bundle, uploads ciphertext only, then deletes plaintext. It never connects to MySQL.

**Data model:** Prisma/MySQL plus object storage. Tables include users/sessions, domains/verifications, wallets/credit lots/ledger, payments/refunds, runs/agents/events, report bundles, delivery codes, user keys, workers, audit log, abuse flags, settings. Integers in cents. The web stores report ciphertext and metadata, never plaintext findings. See `docs/NEXTJS-PORTAL.md`.

**Run statuses:** `pending_verification -> queued -> running -> reporting -> complete | partial | inconclusive | failed | cancelled`, plus `refunded`.

**Worker API:** claim, heartbeat, batch events, encrypted upload, complete, control. Worker tokens are hashed, scoped to one worker, rotated quarterly, rate-limited and audited; worker routes reject browser sessions.

**Customer UI:** Next.js pages for wallet and expiry, domains and verification, new-run wizard (target, budget $50-$10,000, scope/ETA, mode, language), queue position and ETA, live progress without internal cost or tokens, report delivery by 48-hour code with browser decryption, ledger and invoices. Admin pages show queue, workers, verification, refunds, cost-vs-charge and abuse, never report content.

## 8. Workstream E - Ownership verification

Methods, any one sufficient:
1. DNS TXT `_hackmywebsite.<domain>` = `hmw-verify=<token>`.
2. HTTP file `https://<domain>/.well-known/hackmywebsite-verification.txt` or meta tag.
3. Email at the domain (`security@`, `admin@`, `hostmaster@`, `postmaster@`, `abuse@`, WHOIS registrant); clicking the link proves control. Account email on the same company domain counts as work-email evidence.
4. Manual review for agencies/staging/IP targets: signed authorization letter + support approval.

Rules: token TTL 7 days; verification valid 90 days, re-checked at run start; target must be the verified domain/subdomain; DNS must resolve only to public IPs at verification and run start; block private/reserved/loopback/link-local/cloud-metadata; block `.gov`/`.mil`/critical infrastructure by default; IP-literal targets only by manual approval; rate-limit attempts; store method, evidence hash, IP/UA, timestamps and TOS version.

## 9. Workstream F - Pricing, wallet, refunds, expiry

Defaults (config): `MARKUP=12.5`, `MIN_TOPUP_USD=50`, `MIN_RUN_BUDGET_USD=50`, `MAX_RUN_BUDGET_USD=10000`, `CREDIT_EXPIRY_DAYS=42`, `CLEAN_FEE_USD=15`, `CLEAN_REFUND_REVIEW_USD=250`, USD, B2B only at launch.

Money flow:
- Top-up >= $50 creates a credit lot with its own expiry + ledger row.
- Run start reserves the full budget (hold); unused is released at end.
- `internal_cap = customer_budget / 12.5`; meter real cost; `charge = ceil_cent(cost * 12.5)`.
- **Dirty run** (confirmed medium/high/critical): charge stands; show only charge, never tokens/cost.
- **Clean run** (certificate below): reverse the charge, release the hold, debit the flat **$15 assessment fee**; the rest stays on account. Refunds/credits above the review threshold go to admin review (TOS fair-use) because a flat $15 on a fully-spent $1,000 clean run would lose ~$65. This is the one economics item to confirm before public launch.
- **Inconclusive** (goal unmet, target unreachable, auth-blocked, our fault): full release, no fee, free re-run offer.
- **Cancel by customer:** charge actual metered cost, release the rest.
- Clean certificate = `COMPLETE` + coverage goal met + zero confirmed medium/high/critical + zero suspected high/critical + target reachable throughout + report generated. Low/info only still counts as clean.
- Expiry: per-lot 42 days; reminders at day 30 and 38; active holds/queued runs pause expiry; daily expiry job; forfeiture audited; TOS reviewed by Dutch counsel (B2B only at launch).
- VAT: prices ex-VAT; Stripe Tax; validate EU VAT IDs; reverse charge; 21% NL otherwise; invoices stored; accountant sign-off.

## 10. Workstream G - Queue, ETA, scopes, large swarms

- FIFO queue with visible position; `ETA = ceil(active_ahead / workers) * rolling_median_duration(class)`, shown as a window (0.7x-1.5x), updated as history grows. Seed table:
  - $50-$99: queue + 1-3 h
  - $100-$249: 2-6 h
  - $250-$499: 4-12 h
  - $500-$999: 12-24 h
  - $1,000-$4,999: 1-3 business days (scheduled)
  - $5,000+: custom, up to 5-10 business days in waves
- One active run per worker initially; later 2-3 workers. Deep runs (>=$250) can be scheduled outside peak so they do not block small tickets; state this in the wizard.
- Big-budget scaling and persistence: `max_agents = min(32, max(12, ceil(internalBudget * 3)))`, up to 8 rounds, up to 5 fresh-angle retries per role, retry slice 0.65, concurrency `min(6, max(4, ceil(internalBudget / 2)))`, 99.5% budget guard, resumable waves, checkpointing, per-agent survival rule, 7-day wall-clock cap, daily progress email. Roles are mapper, authz, injector, exploiter and the new chain builder. Retries cover clean, no-report and test-failed outcomes. Each mode gets a `capacityFor(budget)` unit test. The swarm also writes a short human dossier (`dossier.jsonl`) for the report.
- Notifications: queued (position + window), started, 50%, completed/partial/failed, report ready, credit expiry, refund settled.

## 11. Workstream H - Security, isolation, legal

Top risk: the scanned site can prompt-inject the agent; agents have shell + API key.
- Per-run workspace only; agents cannot write the project or other runs; escape test required.
- Dedicated non-admin Windows scan user; worker holds no customer credentials/payment secrets; report generation outside the agent process.
- Phase 2: local model proxy with a per-run token (real provider key never in the child), egress allowlist (target host + model proxy) with logging; optional per-run Hyper-V sandbox for enterprise.
- Target policy server-side before enqueue and inside `probe.mjs` (private ranges, metadata IP, DNS rebinding, redirects, non-http schemes, userinfo, ports; block `.gov/.mil`/critical infra).
- Rate limits/concurrency caps; provider monthly spend cap; kill switch; abuse queue; suspend on suspicious patterns.
- App security: single-use magic links, secure cookies, CSRF, XSS escaping of findings (target-controlled text), path/id validation, signed report URLs, admin 2FA, Cloudflare WAF, audit log, no secrets in logs, encryption at rest, backups.
- Legal: B2B TOS, acceptable use, authorization representation, verification evidence retention, refund/expiry terms, DPA + privacy policy, GDPR retention (raw events 90 days, findings/reports 12 months, billing 7 years), jurisdiction NL, liability insurance review before launch.

## 11a. Workstream I - Sealed report delivery (48h code + end-to-end encryption)

Full contract in `docs/REPORT-DELIVERY.md`. Summary:

- **Honest boundary:** the AI scan and report generation see plaintext transiently; after generation the bundle is encrypted to a customer-held public key, plaintext is securely deleted, and all stored/emailed artifacts are ciphertext. Staff, support and DB/storage admins cannot open a stored report. Do not claim the scan process is zero-knowledge.
- **Keys:** at account setup the browser generates an RSA-OAEP 3072 key pair; the private key is encrypted with a customer passphrase (PBKDF2-SHA-256 600k iterations + AES-256-GCM) and stored only as ciphertext; the passphrase never leaves the browser. No escrow, no master key. Recovery kit downloadable; lost passphrase means old reports are unrecoverable. Key ids support rotation.
- **Bundle:** ZIP with `report.html`, `report.pdf`, `findings.json`, evidence index and scan summary; AES-256-GCM file key wrapped with RSA-OAEP; envelope stores `wrappedKey`, `iv`, `tag`, `sha256`; integrity checked before decrypt; 250 MB limit, split parts for larger.
- **Email code:** 12-character base32 code + separate URL token; only HMAC hashes stored; 48h expiry; max 5 downloads, max 10 attempts; rate-limited and lockable; no findings or report content in the email; code authenticates ciphertext download only, decryption still needs the passphrase.
- **UX:** email with code, link and expiry; `/delivery` page fetches the envelope, asks for the passphrase, decrypts locally, previews HTML in a sandboxed frame and offers PDF/ZIP/encrypted-copy download; logged-in owner can reissue a code; support can only reissue, never decrypt.
- **Finalize:** generate bundle in a locked temp dir, encrypt, write only the envelope, securely delete plaintext, redact logs, and assert with a test that a known report phrase appears nowhere on disk, in logs, email payloads or backups.
- **Dependencies:** needs the P1 accounts/DB; can be prototyped now with fixture bundles and a local key pair.
- **Edge cases:** missing key (`pending_key` email), expired/reissued code, leaked code (ciphertext only), forgotten passphrase, key rotation, tampered bundle, large bundles, mobile, optional encrypted attachment under 10 MB, legal deletion.

## 12. Tests and acceptance

- Unit (`node --test`): normalizer/dedupe, board ingestion, clean certificate, wallet holds, ledger invariants, clean settlement, expiry, ETA math, target policy, verification tokens.
- Crash tests: kill an agent mid-step and the whole worker; assert findings/board survive, status reconciles, no orphan `running`.
- Replay tests: recorded `events.jsonl` through the pipeline with no LLM spend.
- Integration: Stripe checkout/webhook fixtures, full lifecycle top-up to credit, PDF/HTML fixtures, auth/CSRF/IDOR tests.
- E2E Playwright: signup -> verify a local test domain -> pay (test mode) -> queue -> run against a controlled fixture site -> findings -> report -> clean refund -> expiry.
- Next.js portal: auth/CSRF/IDOR, wallet and ledger math, queue claim/lease/reclaim, SSE replay, Stripe webhook idempotency, domain verification, worker route isolation, encrypted upload only, delivery code expiry, no plaintext report in the web database or storage.
- Report advice: advisor block first in the report, 2 to 4 concrete items, no invented findings, partial status respected, no em dash.
- Rerun context: a second run on the same host gets the previous findings, tested areas and advice in the prompt; no PII or tokens in the handoff.
- Windows worker: service auto-start after reboot, heartbeat, lease expiry, cancel, target policy, ciphertext-only upload, plaintext deletion, disk cleanup.
- Cost test: one cheap real scan; ledger vs provider usage within 1%; `cost.json` matches; no internal fields in customer responses.
- Isolation test: prompt-injected fixture tries to read the API key/write outside workspace; must fail.

## 13. Phases

- **P0 (after the live run finishes):** save plan, snapshot, A1 recovery, A2 crash-safety, A3 debug panel, cost ledger v0 + `docs/COST-MODEL.md`, cleanup script, mark the 5 stale runs INTERRUPTED.
- **P1 (1-2 weeks):** Next.js portal MVP: Prisma/MySQL schema, Auth.js magic links, domain verification, Stripe top-ups/wallet, queue + worker API, customer pages, SSE, sealed delivery, Linux web droplet staging, worker VM staging (Windows fallback or validated Linux). Closed beta with 1-5 customers.
- **P2 (1-2 weeks):** Redis pub/sub and web scaling, worker isolation and egress proxy, big-swarm scaling, admin console, refund/expiry automation, legal pages, backups/monitoring, load and security tests, production launch.
- **P3:** multi-worker/scheduler, priority/enterprise, team accounts, SLA, public API, self-serve translations.

## 14. Assumptions / decisions to confirm

1. "The portal" = this hackmywebsite portal, and "findings" = agent101 recovery + all future runs (your choice).
2. Clean result = credit back 100% of the charge, flat $15 assessment fee (your choice). Economics caveat: above ~$120 of actual charge the flat fee loses money on fully-spent clean runs; the plan adds admin review for credits above $250 and a TOS fair-use clause. Set `CLEAN_FEE_PCT=15` above $100 charge if you prefer a safer guarantee.
3. Split hosting: Next.js customer portal on a Linux droplet and the scanner on a dedicated worker VM. Windows remains the fallback; the validated Linux worker can replace it. This supersedes the earlier single Windows VPS choice. Stripe default (cards + iDEAL + SEPA); Mollie fallback.
4. USD pricing, B2B only, 42-day credit expiry, EU/NL hosting. Web: Next.js 16.2.0, Prisma 7.5.0, MySQL 8, Auth.js v5, Stripe, Redis later. Worker: Node 24 plus the Windows DSH runtime, or the Linux DSH CLI after full validation.
5. `scans/` and raw agent output are evidence and are kept/archived, not deleted.
6. No scans are started during implementation; only fixtures/free targets until you approve a paid test. The live agent101 run is not killed or restarted.
7. Sealed delivery requires every owner to set a report passphrase at account setup. The emailed 48-hour code is an access token, not the decryption key. If the code itself must decrypt the files, that cannot be zero-knowledge: we generate and email it, and the email provider sees it. The recommended passphrase design is the only one that matches "even we cannot see the report".
8. The AI scan and report generation necessarily process target data in plaintext. The zero-knowledge guarantee applies to stored and delivered report artifacts, not to the live scan pipeline; this wording must be used in the TOS and marketing.
9. Vercel is not the MVP host because of SSE, worker APIs and database control. It stays an option after the Redis/SSE work if a static/serverless split makes sense.
10. Runpod is not used for the MVP. The agents are API-driven, not GPU workloads. The original Windows-only assumption is superseded: the DSH CLI is cross-platform and the Linux headless profile is smoke-tested, but full scan validation is still pending. The worker VM remains the scanner host; Runpod is reconsidered only for self-hosted models or after a full Linux migration. See `docs/COMPUTE-DECISION.md` and `docs/LINUX-WORKER.md`.

## 15. Out of scope for this plan

- Rewriting the scan engine in another language. Moving the worker to Linux is a validated port of the existing engine, not a rewrite.
- Consumer (B2C) sales, subscriptions, SSO, public API, on-prem installs.
- Replacing the current swarm roles with a different agent framework.
- Fixing the findings in the target sites themselves (that is the customer's work).

## 16. Implementation update 2026-11-11

This section records what changed after the original plan. It does not replace the plan above; where the two conflict, this section wins.

### 16.1 Budget advice agent

New file: `advisor.mjs`.

After a scan finishes, a separate advice agent reads the findings, budget, spend and coverage, then writes `advice.json` next to the report.

The report renders a **Meer budget, meer dekking** block directly below the hero, before the overview:

- headline
- short summary
- 2 to 4 concrete extra steps
- estimated extra budget per step
- why that work is still missing
- expected outcome
- explicit limit: more budget buys coverage and verification, not a guarantee of new findings

The advice is generated with `deepseek-flash`. If the model is unavailable, a heuristic fallback keeps the report usable.

Pipeline order in `server.mjs`:

```text
evidence_build -> report_ai -> advisor -> report_kit_build -> bundle
```

Acceptance:

- advice block appears at the top of the report
- no invented findings
- unproven impact stays explicitly suspected
- no em dash, no emoji
- the advice is useful even when the run found little

Status: implemented in the local scan pipeline. The SaaS sealed-report pipeline still needs the same advisor.

### 16.2 Rerun context and swarm memory

New file: `handoff.mjs`.

When a new run starts for the same host, the runner and swarm load:

- the previous scan id
- previous findings and status
- tested areas
- previous budget advice
- previous coverage limits

`runner.mjs` appends this context to the scan prompt. `swarm.mjs` passes it to every role prompt. Agents are told:

- do not repeat work unless the new budget enables a materially different test
- do not claim a previous finding is fixed without verifying it
- build on previous evidence and advice

The report tells the customer that the next run receives this context. This turns a rerun into a continuation instead of a fresh start.

Acceptance:

- a rerun on the same host includes previous findings and advice
- the new run records `previousScanId`
- the swarm does not blindly repeat the previous tests
- no tokens, passwords or personal data enter the handoff context

Status: implemented for `runner.mjs` and `swarm.mjs`. The SaaS worker still needs to pass the same handoff into a real worker run.

### 16.3 Report accuracy corrections

The report pipeline now treats confirmed access and unproven impact separately:

- new status `deels_bevestigd`
- visible note that says what is confirmed and what is not
- `report_ai` prompt updated to use the partial status
- report builder no longer shows `[object Object]`
- glossary terms are inserted with placeholders and word boundaries
- evidence selection excludes file reads, board logs, `HTTP/1.1` and content types
- technical evidence must contain the request path or a finding-specific marker
- the receipt finding was corrected: rate limiting exists, but `X-Forwarded-For` bypassed it; real receipt disclosure remains suspected

This is now a quality gate, not just a presentation fix. A report must not call an impact confirmed when the scan only proved access.

### 16.4 Linux worker and hosting

The DSH CLI was verified on Linux with the headless JSON profile. The event schema matches `runner.mjs`.

New file: `dsh-runtime.mjs`.

It selects:

- Windows desktop host and OrcaRouter on Windows
- Linux `dsh --profile headless --json` and DeepSeek on Linux

`runner.mjs` and `swarm.mjs` both use it.

This supersedes the original Windows-only assumption in section 14, item 10 and in `docs/COMPUTE-DECISION.md`. The current runner is still tested primarily on Windows. The Linux worker requires:

- full swarm test
- Chromium and nuclei
- controlled lab scan
- cost calibration
- egress routing

Status: headless runtime smoke-tested on Linux and Windows. Full Linux scan is still pending.

### 16.5 Production deployment artifacts

Added:

- `apps/web/Dockerfile` with build, migrator and runner stages
- `deploy/docker-compose.yml` with MariaDB, migration job, web and Caddy
- `deploy/Caddyfile`
- `deploy/.env.production.example`
- `deploy/backup-db.sh`
- `deploy/README.md`

Verified locally:

- production standalone server
- web container against MariaDB
- migration container with no pending migrations
- Docker Compose configuration
- backup script runbook

No production droplet is deployed yet.

### 16.6 Remaining P0 after this update

- real DeepSeek Harness scan adapter in the worker
- full Linux worker validation and cost calibration
- live egress IP or `/28`
- production Resend domain and Stripe keys
- object storage for encrypted reports
- SaaS sealed report using the budget advisor and handoff
- full security test pass
- production deployment, restore drill and monitoring

### 16.7 Plan correction

The original plan says DSH is Windows-only. That is no longer accurate. The DSH CLI is cross-platform. Our runner was Windows-specific, and that porting work is now partially complete. The Windows worker remains the fallback until the Linux scan path is fully validated.

The canonical operational docs for this update are:

- `INSTRUCTIONS.md`
- `docs/LINUX-WORKER.md`
- `deploy/README.md`
- `docs/TODO.md`
