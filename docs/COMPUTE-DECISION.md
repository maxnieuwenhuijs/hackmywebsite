# Compute decision: current Windows worker, Linux feasibility open

Status: decided 2026-11-04 for the current Windows-specific runner. Updated 2026-11-11 after checking the DSH Linux CLI.

References: [Runpod pricing](https://www.runpod.io/pricing) (page states pricing updated 2026-10-28), `docs/WINDOWS-VM.md`, `docs/LINUX-WORKER.md`, `docs/NEXTJS-PORTAL.md`.

## Decision

**No Runpod setup for the MVP.** The current scan runners run on a dedicated Windows worker VM because our `runner.mjs` and `swarm.mjs` still launch the Windows desktop host and use PowerShell paths. The web portal runs on a small Linux droplet. Both are self-hosted on our own infrastructure. Scan-agent inference uses OrcaRouter as an API. Report copy generation calls the DeepSeek API directly.

The DSH CLI itself is not Windows-only. The npm package supports Linux and exposes `dsh --profile headless`. Our runner and swarm now use a shared cross-platform launcher; the Linux CLI path has passed a headless JSON smoke test. A full Linux swarm and controlled scan are still required before switching production.

## Who hosts what

| Layer | Host | What we run |
|---|---|---|
| Scan model inference | OrcaRouter API | Nothing; we send tokens and pay per token |
| Report copy inference | DeepSeek API (`https://api.deepseek.com`) | Nothing; `report_ai.mjs` sends the findings and pays per token |
| Agent orchestration and scanning | Current Windows VM | Our Windows-specific runner, swarm, Chrome, nuclei, report generation |
| Future Linux worker | Optional Linux VM or droplet | DSH CLI, headless profile, Chromium, nuclei, ported runner |
| Web portal, API, queue, wallet, SSE | Our Linux droplet | Next.js, MySQL, Stripe webhook |
| TLS, WAF, tunnels | Cloudflare | DNS and edge protection |
| Encrypted report storage | Object storage (Spaces or B2) | Ciphertext only |
| Email | Resend | Magic links and 48h delivery codes |
| Payments | Stripe | Checkout, invoices, webhooks |

The external compute providers in the path are model APIs only, not general-purpose agents. Everything that maps, probes, browses, encrypts and reports runs on our own machines.

## Why Runpod does not fit

1. **No local model.** The scan agents call OrcaRouter (currently $0.80/M input, $1.60/M output, $0.15/M cache-read). `report_ai.mjs` calls the DeepSeek API directly with `deepseek-flash` or `deepseek-v4-pro`. There is no model to host on a GPU. The bottleneck is tokens, CPU and network, not VRAM.
2. **Current Windows dependency, not a DSH limitation.** Our current runner launches `DeepSeek Harness.exe` and uses PowerShell, registry and Windows paths. The DSH CLI package is cross-platform and supports Linux with `dsh --profile headless`. Porting our runner and scan pipeline is required before Linux can replace Windows.
3. **Cost.** Runpod GPU pods are billed per second and are priced for GPU work. Always-on examples from the pricing page:
   - RTX A5000 24 GB: $0.27/hr, about $197/month;
   - A40 48 GB: $0.59/hr, about $430/month;
   - L40S 48 GB: $1.09/hr, about $795/month;
   - H100 PCIe 80 GB: $2.89/hr, about $2,100/month;
   - storage is extra, from $0.10/GB/month for container disk.
   A Windows worker VM with 8 vCPU / 16-24 GB costs roughly $40-150/month and is the only host that can run our current Windows-specific runner. A Linux VM with Node 24.9 or newer may be enough after the runner port; validate it with the checklist in `docs/LINUX-WORKER.md`.
4. **No benefit to the scan.** A GPU does not make HTTP probing, nuclei, browser automation or the model API calls faster. The agents are I/O-bound and the model is remote.
5. **Egress and compliance.** Runpod is a third-party GPU cloud; putting the scanner there would add egress, persistence and AUP questions for authorized scanning, with no operational gain.

## What we use instead

| Layer | Host | Monthly |
|---|---|---|
| Customer portal, API, queue, wallet, SSE | Linux droplet, 2 vCPU / 4 GB, MySQL 8 | $24-48 |
| Scanner worker | Windows Server 2022/2025 VM, 8 vCPU / 16-24 GB / 200 GB NVMe | $40-150 |
| Encrypted report storage / backups | Object storage (Spaces or B2) | $5-15 |
| Total | | roughly $80-300 |

One Windows worker handles one run at a time with 3-6 concurrent agents. Add a second worker when queue wait exceeds about 30 minutes. This is far cheaper than an always-on GPU pod and matches the actual workload.

## When Runpod could make sense later

- **Self-hosting a model.** If monthly API spend grows beyond roughly $1,500-2,000 and an open model can match the quality, an A40/L40S pod at $0.59-1.09/hr (about $430-795/month always on) could be evaluated against API cost. This is a model-provider decision, not a scanner-host decision.
- **Linux-native scanner.** If we rewrite the scanner to a Linux-native agent runtime, CPU pods or serverless containers could provide burst capacity. That is a large rewrite and not in scope.
- **GPU inference for a different product feature** (for example local embeddings or media analysis). Not part of the security assessment MVP.

## Decision rule

Revisit Runpod only if one of these becomes true:
1. model API spend is consistently above $2,000/month and self-hosting is proven on quality;
2. the scan runtime becomes Linux-native;
3. a product feature genuinely needs GPU compute.

Until then, Runpod is not in the architecture, the cost model, or the deployment plan.
