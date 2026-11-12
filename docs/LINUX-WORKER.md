# Linux worker feasibility

Status: research note, 2026-11-11. No Linux worker is running yet.

## What changed

Earlier planning assumed DSH itself was Windows-only. That is too strong.

The DSH CLI is a cross-platform Node package:

- npm package: `@deepseek-ai/dsh`
- current version checked: `0.2.2-rc.1`
- Node engine: `>=24.9.0`
- entry modes include `dsh web` and `dsh --profile headless "job"`
- official CLI reference: https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md

There is also an independent community Linux guide:

- https://deepseekdsh.com/tutorials/linux

That guide is not official and only covers the local Web UI. It is useful as a starting point, not as proof that our scan runner works on Linux.

## What is still Windows-specific in our code

- `runner.mjs` launches `DeepSeek Harness.exe` with the desktop host CLI.
- `swarm.mjs` passes Windows paths and environment settings.
- The worker runbook uses NSSM, PowerShell and `C:\hmw` paths.
- Report generation and sealed delivery are already platform-neutral Node.

The blocker is our scan orchestration, not the DSH package itself.

## Cross-platform runtime port

Implemented on 2026-11-11:

- `dsh-runtime.mjs` selects the Windows desktop host or the Linux `dsh` CLI.
- Windows keeps the existing desktop transport.
- Linux uses `dsh --profile headless --json` with `DEEPSEEK_API_KEY`.
- `runner.mjs` and `swarm.mjs` now use the shared launcher.
- Linux uses `pricing.deepseek.json`; Windows keeps `pricing.json`.
- `scripts/linux-dsh-smoke.mjs` verifies the headless JSON path.

Smoke results:

- Linux container: provider `deepseek`, final answer returned from `/repo`.
- Windows host: provider `orca`, final answer returned from the workspace path.

This proves the process/spawn/event path on both platforms. A full agent swarm and a controlled target scan on Linux are still required before switching the production worker.

The Linux cost table is a peak-rate estimate. Recalibrate it from real scans before pricing a Linux worker.

## Spike result: 2026-11-11

Passed in a clean `node:24-bookworm-slim` container:

- `@deepseek-ai/dsh` installed successfully on Linux.
- Installed version: `0.2.2-rc.1`.
- `dsh --version` and `dsh --help` work.
- `dsh --profile headless` completed a read-only task.
- The agent used the `working_directory` and `bash` tools correctly.
- It reported `/tmp/dsh-test` and the test file without modifying anything.
- `dsh --profile headless --json` emitted newline-delimited events.
- Event types matched what `runner.mjs` already parses: `session`, `status`, `step_start`, `step_end`, `tool_call`, `tool_result`, `final`.
- Token usage is present on `step_end` events.

Not yet tested:

- Chromium and Playwright in the Linux worker.
- nuclei and templates.
- Browser-heavy or exploitation-focused scans.
- Streaming events into the portal worker API.
- Full swarm concurrency on Linux.
- Cost calibration for the DeepSeek model API.

The test container was removed after the check. No API key was written to the workspace.

## Linux spike checklist

- [x] Provision an Ubuntu-compatible Node 24.9+ environment.
- [x] Install `@deepseek-ai/dsh` globally.
- [x] Run `dsh --version` and `dsh --help`.
- [x] Run one read-only headless task in a fresh workspace.
- [x] Confirm tool calls work in headless mode.
- [x] Confirm `--json` event output.
- [ ] Install Chromium, Playwright and nuclei.
- [ ] Run a controlled scan against a local authorized lab.
- [x] Port `runner.mjs` and `swarm.mjs` to the shared DSH launcher.
- [ ] Run a full swarm on Linux.
- [ ] Route all traffic through WireGuard to the egress gateway.
- [ ] Run the standalone worker service on Linux with the ported adapter.
- [ ] Compare a full report against a Windows run.
- [ ] Decide: Linux becomes primary, or Windows remains the fallback.

## Requirements if the spike passes

- Ubuntu 24.04 LTS
- Node.js 24.9 or newer
- 4 to 8 vCPU, 8 to 16 GB RAM
- Chromium/Chrome and Playwright dependencies
- nuclei and templates
- outbound HTTPS only
- WireGuard to the egress gateway
- worker token and run directory
- no database, customer sessions, Stripe secret or report private key

A single DigitalOcean droplet could host the worker if CPU and RAM allow. Keep the web app and worker on separate droplets for isolation.

## Recommendation

Run the Linux spike before buying more Windows capacity. If headless DSH and the scan tools pass the controlled lab test, the Linux port removes the Windows VM from the critical path.

Until then, keep the Windows worker as the supported path.

## Related docs

- `docs/COMPUTE-DECISION.md`
- `docs/WINDOWS-VM.md`
- `docs/WORKER-API.md`
- `worker/README.md`
