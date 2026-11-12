# Windows worker VM plan

Status: current plan for the existing Windows-specific runner, updated 2026-11-11.
Companion to `docs/NEXTJS-PORTAL.md`, `docs/HOSTING-PLAN.md` and `docs/LINUX-WORKER.md`.
Decision: the Windows VM runs **only the scan worker** until a Linux runner port is validated. The Next.js customer portal runs on Linux. This supersedes the earlier single Windows VPS choice.

## 1. Why a separate Windows VM

Our current `runner.mjs` and `swarm.mjs` use the Windows desktop carrier: `DeepSeek Harness.exe`, PowerShell paths and Windows process handling. The DSH CLI itself supports Linux and macOS, but our scan pipeline has not been ported. The customer portal does not need Windows and is better on Linux: cheaper, standard Next.js hosting, better process management, and, most importantly, separation from the scanner. A Linux worker spike is tracked in `docs/LINUX-WORKER.md`.

Model inference for the scan swarm is not part of this VM. OrcaRouter hosts the scan model and is called over the network as an API; the VM only runs the agent processes, the browser, nuclei and the report renderer. Report copy generation calls the DeepSeek API directly and does not need DSH. No GPU is required or provisioned.

The split gives us:
- no customer database, payment keys, Stripe secret or customer report keys on the Windows VM;
- no inbound ports on the Windows VM, so a compromised scan agent cannot be reached from the internet;
- a disposable worker: if the VM is lost or abused, we re-provision it and the web app keeps the queue, wallet and reports;
- an honest E2EE story: the worker sees report plaintext transiently during generation, encrypts it to the customer's public key, uploads only ciphertext, and holds no customer private key.

## 2. Sizing

| Item | Value |
|---|---|
| vCPU / RAM | 8 vCPU / 16-24 GB |
| Disk | 200 GB NVMe: 80 GB OS, 120 GB runs and logs |
| OS | Windows Server 2022 or 2025 Standard |
| Network | static public IPv4, EU region, no inbound ports |
| Capacity | one run at a time, 3-6 concurrent agents, 8-16 runs/day |
| Scaling | add identical worker VMs; the web queue assigns jobs |

16 GB is the practical minimum because each DSH agent is an Electron process and Chrome/nuclei add memory pressure. Disk is mostly run workspaces and logs; runs are deleted after upload.

## 3. Provider options

| Provider | Windows license | EU region | Snapshots | vTPM / BitLocker | Indicative monthly |
|---|---|---|---|---|---|
| Azure (B4ms / D4s_v5) | included | yes | yes | yes | $120-180 |
| OVHcloud Windows VPS | included | yes | yes | depending on offer | EUR 40-90 |
| Vultr Cloud Compute | included | yes | yes | depending on plan | $80-120 |
| Contabo Windows VPS | included | yes | yes | not always | EUR 20-50 |
| AWS EC2 (t3.xlarge) | included | yes | yes | yes | $120-200 |

Recommendation: start on **OVHcloud Windows VPS 8 vCPU / 24 GB / 200 GB NVMe in the EU**, or **Azure B4ms** when BitLocker/vTPM and support matter more than price. Verify the provider's acceptable-use policy permits authorized security testing from their IP space; keep authorization evidence ready for abuse tickets. Do not use free or consumer hosts for scanning egress.

## 4. Provisioning checklist

### 4.1 Create and harden the base VM

1. Create the VM with a static IP, EU region, Windows Server 2022/2025, and daily snapshots. Name it `hmw-worker-01`.
2. Connect through the provider console once. Install all Windows updates; set the timezone to Europe/Amsterdam; enable automatic restart after updates.
3. Create three local accounts:
   - `hmw-admin` (admin, used only for setup and maintenance, RDP through Cloudflare Access or Tailscale);
   - `hmw-svc` (service account for the worker and cloudflared, not a domain admin);
   - `hmw-scan` (standard user for the scan agents, no admin rights).
4. Disable RDP for the built-in Administrator and for `hmw-admin` from the public internet. RDP is reachable only through Cloudflare Access or Tailscale. The public firewall has **no inbound rules** other than the tunnel client's outbound connection.
5. Enable BitLocker on the system and data volumes when the provider exposes a vTPM. If not, use the provider's disk encryption at rest and document the gap; move to Azure before storing anything sensitive.
6. Set the power plan to high performance, disable sleep and hibernation, and configure the VM to start the worker service at boot.
7. Install Windows Defender and keep real-time protection on. Add only the run workspace and Chrome/Node/nuclei paths to exclusions if needed for performance, and document every exclusion.

### 4.2 Install software

Pin every version and record it in `docs/WORKER-IMAGE.md`:

- Node.js 24 LTS (matches the worker code; the current dev machine uses Node 22, test both).
- Git.
- Google Chrome (headless PDF printing).
- 7-Zip.
- Cloudflare `cloudflared` (outbound tunnel for management and web API if needed).
- DeepSeek Harness, installed under `C:\hmw\dsh`, auto-update disabled.
- Nuclei plus templates, under `C:\hmw\tools\nuclei`.
- Optional: Python 3 and LibreOffice only if the legacy DOCX report path is kept. The current kit report uses Chrome, so leave them out.

### 4.3 Configure DSH

- `DSH_HOME=C:\hmw\dsh-home`.
- Model provider key in the service environment or the DSH credential store, never in a file readable by `hmw-scan`.
- Provider and MCP configuration tested with a trivial headless run:
  `dsh headless --json -` with a one-line prompt, expecting NDJSON events and a `final` event.
- MCP servers: Playwright and Firecrawl if used; nuclei through its local binary. Verify the child sees the tools it needs.
- Pin the DSH version. Disable auto-update. Test upgrades on a snapshot before applying.
- Confirm the child runs without an interactive desktop session by running it from a Windows service or scheduled task with `ELECTRON_RUN_AS_NODE=1`.

### 4.4 Install the worker service

```
C:\hmw\worker\worker.mjs        queue client, runner, swarm, report, upload
C:\hmw\runs\<run-id>\           per-run workspace and logs
C:\hmw\logs\                    service logs
C:\hmw\config\worker.env        HMW_WEB_URL, HMW_WORKER_ID, HMW_WORKER_TOKEN
```

Install with NSSM (or a Windows service wrapper):

```
nssm install HMWWorker "C:\Program Files\nodejs\node.exe" "C:\hmw\worker\worker.mjs"
nssm set HMWWorker AppDirectory C:\hmw\worker
nssm set HMWWorker AppEnvironmentExtra HMW_WEB_URL=https://app.hackmywebsite.ai HMW_WORKER_ID=worker-01
nssm set HMWWorker AppStdout C:\hmw\logs\worker.out.log
nssm set HMWWorker AppStderr C:\hmw\logs\worker.err.log
nssm set HMWWorker AppRotateFiles 1
nssm set HMWWorker Start SERVICE_AUTO_START
```

Worker environment:
- `HMW_WEB_URL` (HTTPS to the Next.js app).
- `HMW_WORKER_ID` and `HMW_WORKER_TOKEN` (issued in the web admin; rotate quarterly).
- `HMW_RUNS_DIR=C:\hmw\runs`.
- `DSH_HOME`, `DSH_EXE`, `DSH_CLI`, `CHROME`, `NUCLEI_ALLOWED_TARGETS`.
- `ORCAROUTER_API_KEY` for scan-agent inference.
- `DEEPSEEK_API_KEY` for `report_ai.mjs` report copy. The report model defaults to `deepseek-flash`; set `DEEPSEEK_REPORT_MODEL` to override it.
- Optional report controls: `DEEPSEEK_BASE_URL`, `DEEPSEEK_MAX_TOKENS`.

The worker:
- polls `POST /api/worker/claim` every few seconds;
- heartbeats every 30 seconds;
- posts progress and internal cost events (never report plaintext);
- runs the scan in `C:\hmw\runs\<id>` with the agent's cwd confined there;
- generates the report, encrypts the bundle to the customer's public key, uploads only ciphertext;
- posts completion, clean-certificate inputs and internal cost;
- deletes the run directory after a successful upload and verification;
- checks a cancel flag between steps and kills the agent tree on cancel.

### 4.5 Network and firewall

- No inbound ports. RDP and management only through Cloudflare Access or Tailscale. Cloudflare Tunnel runs as a service.
- Outbound allow rules: TCP 80/443 to the internet (targets and package sources), TCP 443 to the web app and model API, UDP/TCP 53 to the configured resolvers. Block SMB, RDP, WinRM and all other outbound traffic.
- If the provider offers a cloud firewall, mirror the same policy there.
- Log outbound connections at the worker level (domain and port) for abuse review.
- The web app enforces the target policy: verified domains only, public IPs only, no private ranges, no metadata IP, no `.gov`/`.mil` by default. The worker re-checks DNS and redirects before probing.

### 4.6 Access and secrets

- No customer credentials, payment keys, Stripe secret, database password or report private keys on this VM.
- Worker token only grants claim/heartbeat/upload for its own worker id.
- Model API key in the service environment; the child agent inherits it today. Phase 2 adds a local model proxy with a per-run token so the child never sees the real key.
- BitLocker recovery key stored in the password manager, not on the VM.
- RDP/MFA accounts in the password manager; no shared accounts.

### 4.7 Isolation of scan agents

- Worker service runs as `hmw-svc`; the agent processes run as `hmw-scan` through a per-run job object or scheduled process with a restricted token.
- Per-run directory ACL: `hmw-scan` full control only inside `C:\hmw\runs\<id>`; no access to `C:\hmw\config`, `C:\hmw\dsh-home`, or other runs.
- DSH file policy set to workspace-write with the run directory as the workspace; verify with an escape test.
- `probe.mjs` copied into the run directory; prompts reference it with a relative path.
- Phase 2: AppLocker/WDAC allowlist for `node.exe`, `chrome.exe`, `nuclei.exe` and DSH, plus a local model proxy and egress proxy.
- Do not run scans as Administrator. Do not install customer tooling on the VM.

### 4.8 Operations

- Daily snapshot before the maintenance window; keep 7 daily, 4 weekly.
- Monthly Windows Update window: snapshot, patch, reboot, run the acceptance scan, roll back on failure.
- Monitor: worker heartbeat (web shows last seen), queue depth, disk space, CPU/RAM, stuck runs, failed uploads, Cloudflare Tunnel status.
- Alerts to email/Discord when heartbeat > 2 minutes, disk > 80%, a run exceeds its wall-clock cap, or an upload fails.
- Log rotation: worker logs daily, 14-day retention; run directories deleted after upload; Windows event log forwarded or archived.
- Remote access: Cloudflare Access with email OTP/Google, or Tailscale ACL. No public RDP.
- Reboot test monthly: VM restarts, services auto-start, worker re-registers and claims jobs.

### 4.9 Rebuild and disaster recovery

- Keep a provisioning script and an image snapshot. A worker holds no unique state: config is in the password manager, runs are ephemeral, encrypted bundles live in the web app or object storage.
- Rebuild: create VM, run setup script, restore config, register the worker token, start the service. The web queue resumes.
- If a VM is lost mid-run, the lease expires and the web marks the run `partial` or `failed`; the customer can re-run. The worker does not hold the only copy of a completed report.

## 5. Worker protocol (summary)

See `docs/NEXTJS-PORTAL.md` for the full contract. The worker:
1. claims a run with a lease;
2. receives target, mode, language, customer public key, internal budget cap and customer budget;
3. runs the scan and posts progress/cost events (no findings plaintext to the web);
4. generates the report bundle, encrypts it, uploads the envelope and hash;
5. posts completion plus internal cost and coverage;
6. deletes plaintext and waits for the next job.

## 6. Costs

| Item | Monthly |
|---|---|
| Windows VM (OVH 8 vCPU/24 GB) | EUR 40-90 |
| Azure alternative (B4ms) | $120-180 |
| Snapshots and static IP | $5-15 |
| Bandwidth | included or small |
| Cloudflare Tunnel | $0 |
| Total worker | roughly $50-200 |

One worker handles one run at a time. Add a second VM only when queue wait exceeds about 30 minutes or a large engagement needs a dedicated worker.

## 7. Acceptance tests

- Reboot: worker service starts, registers, claims a queued job.
- Kill the worker process mid-run: lease expires, web marks the run failed/partial, no duplicate charge.
- Kill an agent mid-step: worker salvages findings locally, marks the run partial, uploads what exists.
- No inbound ports open from the internet; RDP only through Access/Tailscale.
- BitLocker enabled (or documented provider encryption gap).
- Worker cannot read `C:\hmw\config` or another run's directory as `hmw-scan`.
- Target policy blocks private IPs, metadata IP, unverified domains and `.gov`/`.mil`.
- A test run uploads only ciphertext; the web cannot read the report.
- Disk cleanup after upload; logs rotate; alert fires on a stopped heartbeat.
- Model key is not present in the agent child process (phase 2 proxy test).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Provider AUP or abuse complaint about scanning | verified authorization, provider chosen for security testing, abuse inbox, pause on complaint |
| DSH auto-update breaks the worker | pin version, disable auto-update, snapshot, test upgrades |
| Electron needs an interactive session | run via service/scheduled task with `ELECTRON_RUN_AS_NODE=1`; test on the VM |
| Prompt-injected agent exfiltrates the model key | phase 1 rotation and spend cap; phase 2 local model proxy |
| Windows licensing or activation drift | use a provider with included license; document activation |
| Single VM outage stalls the queue | snapshots, rebuild script, add a second worker before launch |
| Data remanence on the VM | BitLocker, delete run directories, rebuild periodically |
| Cloudflare/Tailscale outage blocks management | break-glass provider console with MFA, documented runbook |
