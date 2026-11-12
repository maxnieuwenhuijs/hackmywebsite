# Worker API

Status: local contract implemented and smoke-tested on 2026-11-11. The Windows worker integration is still pending.

The portal and the scanner are separate. The web app never connects to MySQL from the worker. The worker claims a run, sends metadata, uploads only an encrypted bundle and completes the run over HTTPS.

## Authentication

Every worker route requires:

```http
Authorization: Bearer <WORKER_TOKEN>
```

The token is hashed with `WORKER_TOKEN_PEPPER` and matched against `Worker.tokenHash`. The seed creates a local worker named `local-worker`:

```env
WORKER_TOKEN=local-worker-token-2026
WORKER_TOKEN_PEPPER=local-worker-pepper
```

Missing or wrong tokens return `401`. Browser sessions are not accepted on worker routes.

## Endpoints

### Claim

```http
POST /api/worker/claim
```

Returns the oldest queued run and leases it for 10 minutes, or `{ "run": null }`.

Response includes:

- run id, target, host, tier, mode, language and budget
- briefing plan
- verified domain metadata
- active report public key and key id
- lease expiry

Starting a run emits the customer start notification.

### Heartbeat

```http
POST /api/worker/runs/:id/heartbeat
```

Body:

```json
{ "version": "worker-1.0", "egressIp": "203.0.113.10", "egressRange": "203.0.113.0/28" }
```

Extends the lease and updates the worker last-seen time.

### Events

```http
POST /api/worker/runs/:id/events
```

Body:

```json
{
  "events": [
    {
      "seq": 1,
      "type": "thought",
      "payload": { "agent": "mapper", "text": "The login page leaks which emails exist.", "important": true, "tag": "warning" }
    }
  ]
}
```

Events are metadata only. The endpoint rejects invalid shapes, batches over 200 events and payloads over 12 KB. Duplicate `(runId, seq)` pairs are ignored.

The customer Swarm thinking panel reads `type = "thought"` events.

### Control

```http
GET /api/worker/runs/:id/control
```

Returns `{ "cancelRequested": true | false }`.

### Upload encrypted bundle

```http
POST /api/worker/runs/:id/upload
```

Body:

```json
{
  "keyId": "rk_...",
  "sha256": "hex",
  "ciphertext": "base64",
  "envelope": {
    "version": 1,
    "alg": "AES-256-GCM",
    "keyAlg": "RSA-OAEP-256",
    "wrappedKey": "base64",
    "iv": "base64",
    "tag": "base64",
    "filename": "report.html",
    "contentType": "text/html",
    "plaintextSha256": "hex"
  }
}
```

Validation:

- the worker must own the run
- the run must be `RUNNING` or `REPORTING`
- the report key must belong to the run owner and be active
- the ciphertext SHA-256 must match
- ciphertext size must be between 32 bytes and 25 MB
- only the encrypted envelope and ciphertext are stored

The portal marks the run `REPORTING` and stores a `ReportBundle` with `plaintextDeletedAt` set.

### Complete

```http
POST /api/worker/runs/:id/complete
```

Body:

```json
{
  "status": "COMPLETE",
  "internalCostCents": 400,
  "chargedCents": 5000,
  "coverage": { "routesProbed": 12 },
  "findings": []
}
```

Allowed statuses: `COMPLETE`, `PARTIAL`, `FAILED`, `CANCELLED`.

Settlement:

- the run hold is released
- the customer balance is reduced by `chargedCents`
- a `CHARGE` ledger row is written when the charge is greater than zero
- a failed run releases the hold without a charge
- a sealed bundle gets its 48-hour delivery code
- the customer gets a completion notification

## Local smoke test

1. Start the portal with the mock worker disabled:

```powershell
$env:DEMO_MODE='0'
npm run start
```

2. Create a queued run in the portal.

3. Run:

```powershell
cd apps/web
npm run worker:smoke
```

The script claims the run, heartbeats, posts a thought, uploads an encrypted test bundle, completes the run and prints the run status, bundle id and delivery link.

Tested result:

- claim succeeded for the queued run
- heartbeat and event accepted
- encrypted upload accepted
- completion returned `COMPLETE` and the charged amount
- delivery link was created
- the browser decrypted the worker-uploaded bundle
- missing and wrong worker tokens returned `401`

## Standalone worker service

`worker/worker.mjs` is a standalone Windows worker client. It polls the claim endpoint, heartbeats, sends events, checks cancellation, builds the report in memory, encrypts it and uploads only ciphertext.

Local test result with the mock scan adapter:

- claimed a queued run
- completed in about 5 seconds
- uploaded an encrypted bundle
- run status `COMPLETE`
- charged amount applied
- delivery email marked sent
- delivery page decrypted the worker-generated report

The real DeepSeek Harness adapter is not wired into `worker/worker.mjs` yet. See `worker/README.md`.

## Not done yet

- Windows worker service wrapper.
- Real scanner integration behind the claim flow.
- Presigned object storage upload instead of JSON base64.
- Worker rate limits, audit and key rotation.
- Lease reassignment test under a killed worker.
- Real report kit and evidence index in the uploaded bundle.
- PDF and ZIP bundle generation.
- Production egress binding and metrics reporting.

## Related docs

- `docs/NEXTJS-PORTAL.md`
- `docs/WINDOWS-VM.md`
- `docs/REPORT-DELIVERY.md`
- `docs/TODO.md`
