# Windows worker client

Standalone worker service client for the hackmywebsite.ai worker API.

This version uses a local mock scan adapter. It proves the full worker lifecycle without the DeepSeek agent runtime. The production scanner adapter is still to be wired into `runMockScan`.

## What it does

1. Polls `POST /api/worker/claim`.
2. Sends heartbeat.
3. Sends thought and progress events.
4. Checks the cancel flag.
5. Builds a report in memory.
6. Encrypts the report with the customer public key.
7. Uploads only the encrypted envelope and ciphertext.
8. Completes the run with cost and coverage.
9. Deletes its temporary run directory.

It never connects to MySQL and never holds a customer session, report private key or Stripe secret. It does not write a plaintext report to disk.

## Environment

```env
HMW_WEB_URL=https://app.hackmywebsite.ai
HMW_WORKER_TOKEN=replace-with-worker-token
HMW_RUNS_DIR=C:\hmw\runs
HMW_POLL_MS=5000
HMW_HEARTBEAT_MS=15000
HMW_MOCK_SCAN_MS=15000
```

The worker token must match a `Worker` row whose `tokenHash` was created with the same `WORKER_TOKEN_PEPPER`.

## Local test

1. Start the web app with the in-process mock worker disabled:

```powershell
cd apps/web
$env:DEMO_MODE='0'
npm run start
```

2. Queue a run in the portal.

3. Start the worker:

```powershell
node worker/worker.mjs
```

4. Watch the run complete and open the sealed report from the run page.

The smoke script in `apps/web/scripts/worker-smoke.mjs` tests the API without the polling service.

## Windows service

Install with NSSM:

```powershell
nssm install HMWWorker "C:\Program Files\nodejs\node.exe" "C:\hmw\worker\worker.mjs"
nssm set HMWWorker AppDirectory C:\hmw\worker
nssm set HMWWorker AppEnvironmentExtra HMW_WEB_URL=https://app.hackmywebsite.ai HMW_WORKER_TOKEN=... HMW_RUNS_DIR=C:\hmw\runs
nssm set HMWWorker AppStdout C:\hmw\logs\worker.out.log
nssm set HMWWorker AppStderr C:\hmw\logs\worker.err.log
nssm set HMWWorker Start SERVICE_AUTO_START
nssm start HMWWorker
```

## Not done yet

- Real DeepSeek Harness scan adapter.
- Live swarm event bridge.
- Egress binding through WireGuard.
- Worker-side PDF/ZIP evidence bundle.
- Heartbeat failure recovery and lease reassignment test.
- Signed service binaries and auto-update.

## Related docs

- `docs/WORKER-API.md`
- `docs/WINDOWS-VM.md`
- `docs/TODO.md`
