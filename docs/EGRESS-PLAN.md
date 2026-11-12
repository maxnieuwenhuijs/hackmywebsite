# Static egress range and gateway for swarm scans

Status: approved 2026-11-10. This is the saved implementation plan for the proxy IP range and egress gateway workstream.

## Saved artifact

This file is the canonical plan. The operational runbook lives in [`infra/egress/README.md`](../infra/egress/README.md).

## Goal and success criteria

Give every scan a stable, controlled source IP from a leased IPv4 range, so customers can allowlist us, abuse handling is possible, and no agent can leak out of the worker's own public IP.

Success means:

1. All target traffic from a scan exits through one IP in our leased range, never from the worker's public IP.
2. Each run has one sticky egress IP, recorded in run metadata, evidence and the report.
3. The customer can allowlist the whole range or the assigned IP before the run.
4. The gateway is not an open proxy. It accepts only authenticated WireGuard peers.
5. If the gateway or tunnel is unavailable, scans fail closed. There is no direct-IP fallback.
6. The range has reverse DNS, an abuse contact, and is monitored for blocklist entries.
7. All traffic types work: `probe.mjs`, ad-hoc `fetch`, Chrome, nuclei, DNS.
8. Cost stays below roughly EUR 50 per month for the first production worker.

The key design decision: do **not** rely on an HTTP proxy setting inside each tool. Agents can write arbitrary scripts and use Chrome or nuclei directly, which bypasses `HTTPS_PROXY`. Use network-level routing through a WireGuard egress gateway instead.

## Current state

Inspected code and docs:

- [`probe.mjs`](../probe.mjs) calls `fetch` directly. It has no proxy support.
- [`runner.mjs`](../runner.mjs) spawns DSH with the environment it receives. It has no egress configuration.
- [`swarm.mjs`](../swarm.mjs) agents make direct HTTP requests through their own commands and tools.
- [`docs/WINDOWS-VM.md`](WINDOWS-VM.md) currently assumes a static public IPv4 on the worker and lists an egress proxy only as phase 2.
- [`docs/HOSTING-PLAN.md`](HOSTING-PLAN.md) has the same phase-2 note and says the worker has one static IP.
- [`apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma) has no egress fields on `Worker` or `Run`.
- The current portal only validates protocol, authorization and budget. There is no production worker yet and no proxy code.

## Recommendation

Lease a **static /28 IPv4 block** in the EU and run one Linux egress gateway in front of the Windows worker.

- `/28`: 16 addresses, about 13 usable. Enough for a gateway, control traffic, a scan pool and spare capacity.
- Start with one gateway. Add a second only when availability requires it.
- Use the range for **scan traffic only**. Keep the customer portal and database on separate addresses.
- Buy a range, not a rotating proxy subscription. Customers will allowlist it and abuse teams will correlate it.

### Provider shortlist

| Option | What it offers | Use |
|---|---|---|
| OVHcloud Additional IP | EU Additional IP blocks, reverse DNS via control panel/API | Primary candidate after written AUP confirmation |
| HammerVM Stockholm | /29 GBP 8.45/mo, /28 GBP 17.99/mo, BYOIP | Cheap fallback after AUP and reverse DNS confirmation |
| X-ZoneServers | /29 EUR 8/mo, /28 EUR 26/mo | Price benchmark only; its own article says no custom reverse DNS |
| Cloud NAT with elastic IPs | Fast setup, high per-IP cost | Temporary or emergency only |
| Commercial static ISP proxies | Fast, no infrastructure | Not primary: shared reputation, no PTR control, vendor AUP |

References:

- [X-ZoneServers additional IPv4 pricing](https://x-zoneservers.com/blog/extra-ipv4-dedicated-server-29-28-27-subnets)
- [HammerVM additional IPs](https://hammervm.com/d/additional-ips)
- [OVHcloud Additional IP documentation](https://docs.ovhcloud.com/de/guides/public-cloud/network-services/buy-additional-ip.md)
- [Hetzner IPv4 pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/)

Estimated monthly cost:

- `/28` range: EUR 18-26
- Gateway VPS: EUR 5-15
- Backups, logs, monitoring: EUR 3-8
- Total: roughly EUR 26-49 per month

Do not buy until the provider confirms in writing that authorized security testing is permitted, how abuse tickets are handled, and that reverse DNS is available. A cheap range that is terminated after the first abuse ticket is not cheap.

## Network design

```
Windows worker (no direct public scan egress)
  -> WireGuard client, one peer per worker
  -> Linux egress gateway
       - nftables SNAT: worker tunnel IP -> assigned public IP
       - verified-destination allowlist
       - private/reserved/metadata block
       - DNS resolver
       - flow logging: run id, source, destination, bytes, status
  -> Internet target
```

All worker traffic goes through the gateway, including model API and control-plane calls. That is deliberate: no direct route for an agent to bypass, a gateway outage fails closed, the gateway can log every destination, and Windows firewall can block all direct outbound TCP 80/443.

The gateway's public interface attaches the leased range. Management is private or Tailscale-only. WireGuard is the only public listening service.

### IP allocation

For a `/28`:

| Use | Count |
|---|---|
| Gateway and provider routing | 1 |
| Control and model API egress | 1 |
| Scan pool | 8-10 |
| Spare and failover | 1-2 |

Rules:

- The web queue assigns one public IP per run, sticky for the whole run.
- One worker runs one run at a time initially, so one tunnel peer maps to one public IP.
- The gateway maps tunnel source to the assigned public IP with nftables.
- A retried run keeps the same IP unless that IP is quarantined.
- Never rotate mid-run. Stable sessions matter for auth and allowlists.
- Quarantine an IP after repeated blocklist hits. Do not silently rotate.
- Publish the whole range to customers. Allowlisting one IP is an exception.

### Destination policy

- Allow only TCP 80 and 443 to public destinations.
- Block RFC1918, loopback, link-local, multicast, our own range, cloud metadata and reserved space.
- Block direct IPv6 egress or route it through the tunnel with the same policy. A Windows IPv6 leak defeats the design.
- Force DNS through the gateway resolver. Block public DoH and direct UDP 53 to arbitrary resolvers.
- Keep an allowlist of verified targets synchronized from the web app. For the MVP, block private/metadata and log everything; before public launch the allowlist is mandatory.
- Allow model API and control-plane hosts through a separate known-destination rule.
- Rate-limit per run and per public IP. Enforce the existing 50 requests per minute ceiling at worker and gateway.
- Log destination host/IP, bytes, status and run id. Do not log request bodies.

## Implementation changes

### 1. Infrastructure: `infra/egress/`

New directory with reproducible setup:

- `cloud-init.yaml`: Debian 12, WireGuard, nftables, unbound or dnsmasq, log shipping, Tailscale.
- `wg0.conf.example`: one peer per worker, no shared peer.
- `nftables.conf`: SNAT map, private-range blocks, rate limits, logging.
- `assignments.json` schema and `assignment-sync.mjs`.
- `egress-policy.mjs`: pulls verified targets from the web app and maintains the destination set.
- `README.md`: ordering, reverse DNS, firewall, provider AUP, failover, rebuild.

### 2. Gateway service

- Debian 12, systemd, unattended security updates.
- No public SSH. Admin through Tailscale or Cloudflare Access.
- WireGuard peer keys generated in the web admin, one per worker, rotated quarterly.
- nftables SNAT map: tunnel source -> public IP.
- Private sync API receives `{workerId, runId, egressIp, expiresAt}` from the web app.
- Flow logs to `/var/log/hmw-egress/` as JSONL, daily rotation, 30-day retention.
- Health endpoint on the private interface only.

### 3. Windows worker

- Install WireGuard client. Route all outbound traffic through the tunnel.
- Enable a WireGuard kill switch or Windows firewall rules so a tunnel outage blocks TCP 80/443. No direct fallback.
- Disable IPv6 on the worker or route it through the tunnel with the same policy. Test for leaks.
- Remove the old "static public IP for scanning" assumption. The public IP is only for provider management.
- Add environment:
  - `HMW_EGRESS_MODE=gateway`
  - `HMW_EGRESS_RANGE=203.0.113.0/28`
  - `HMW_EGRESS_IP=203.0.113.10` (assigned per run at claim time)
  - `HMW_EGRESS_GATEWAY=...`
- Report the observed public IP on heartbeat and at run start. The web compares it with the assigned value and fails the run on mismatch.

### 4. Runner and swarm metadata

[`runner.mjs`](../runner.mjs) and [`swarm.mjs`](../swarm.mjs):

- Add `egress: {ip, range, region, gatewayId}` to `scan.json`.
- Pass `HMW_EGRESS_*` into the DSH child environment.
- Do not add per-agent proxy flags. The network layer handles all tools.
- Add the assigned IP and range as metadata, never as a target or instruction.
- Include egress information in report data.

[`probe.mjs`](../probe.mjs):

- No proxy support is needed for the production path.
- Add a `--egress` diagnostic mode that prints the worker environment and observed egress IP. It must not bypass the tunnel.
- Keep direct mode for local labs on `127.0.0.1`; never send loopback traffic through the gateway.

### 5. Portal, schema and worker API

[`apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma):

- `Run`: add `egressIp String?`, `egressRange String?`, `egressRegion String?`, `egressAssignedAt DateTime?`.
- `Worker`: add `egressPeer String?`, `egressIp String?`, `egressRange String?`, `egressLastSeenAt DateTime?`.
- New `EgressPool` model: id, cidr, region, provider, status, ptr, lastAssignedAt, notes.

Worker claim response in [`docs/NEXTJS-PORTAL.md`](NEXTJS-PORTAL.md):

```
POST /api/worker/claim
-> 200 { runId, url, ..., egress: { ip, range, region, gatewayId } }
```

Add a worker endpoint for the observed egress check and gateway heartbeat. Reject a claim if no egress IP is available. Never silently fall back to the worker's public IP.

Admin:

- `GET /api/admin/egress/pool`
- `POST /api/admin/egress/assign`
- `POST /api/admin/egress/quarantine`
- egress health and blocklist status on `/admin`

Customer-facing:

- Start and run pages show: "Our scans for this run originate from `203.0.113.0/28`. Allowlist this range at your firewall or WAF."
- The report "Over dit rapport" section adds egress IP, range, user agent and run id.
- Evidence cards include the source IP and timestamp.

### 6. Monitoring and abuse

- Check PTR and whois for every IP after assignment.
- Monitor Spamhaus, UCEPROTECT and major blocklists daily.
- Alert on gateway down, WireGuard peer down, egress IP mismatch, blocklist hit, per-IP rate spike, abuse ticket.
- Quarantine after repeated abuse reports. Do not rotate silently.
- Keep an abuse runbook: verify authorization, identify run, stop it, preserve logs, reply to provider.
- Provider AUP and customer authorization records must be retrievable within minutes.

## Rollout phases

### Phase 0: procurement and validation, 1-2 days

- Send AUP questions to OVHcloud and HammerVM.
- Confirm reverse DNS, range routing, failover, abuse process and price.
- Order `/28` if approved; otherwise `/29`.
- Provision a temporary gateway VPS.
- Validate range with `whois`, `dig -x`, and a blocklist check.

### Phase 1: gateway, 3-5 days

- WireGuard, nftables, SNAT, DNS, private-range blocks, logging.
- Assignment map and private sync API.
- Fail-closed test with tunnel down.

### Phase 2: worker and runner, 3-5 days

- Install WireGuard on the worker.
- Block direct outbound 80/443, disable IPv6, test kill switch.
- Inject `HMW_EGRESS_*` at run start.
- Add egress check and mismatch failure.
- Add `scan.json` egress fields.

### Phase 3: portal, report, admin, 2-3 days

- Prisma migration and worker claim fields.
- Customer allowlist copy and report network facts.
- Admin pool page and quarantine action.

### Phase 4: hardening and HA, 3-5 days

- Allowlist sync from verified targets.
- Blocklist monitoring and abuse runbook.
- Second gateway or failover if needed.
- Rebuild and disaster recovery test.

## Tests and acceptance

Automated:

- Unit test CIDR validation, deterministic IP assignment, sticky assignment, quarantine behavior.
- `egress_check.mjs` from the worker:
  - fetch `https://api.ipify.org` or a controlled echo endpoint;
  - assert observed IP equals `HMW_EGRESS_IP`;
  - assert IP belongs to `HMW_EGRESS_RANGE`;
  - assert direct egress without the tunnel fails.
- Gateway integration test:
  - target echo server records source IP;
  - Chrome, nuclei, `probe.mjs` and plain `fetch` all show the pool IP.
- DNS leak test: query a resolver echo service; no leak outside the tunnel.
- IPv6 leak test: no public IPv6 route.
- Gateway exposure test: external scan finds only WireGuard; no HTTP proxy.
- Private/metadata block test: `127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`, `::1` rejected.
- Per-run stickiness: same IP across retries; next run can use another.
- Customer allowlist test: customer firewall accepts the range, rejects the worker's public IP.
- Rate-limit and kill-switch test.
- Rebuild test: recreate gateway, restore range, rerun checks.
- PTR and whois test.
- Blocklist check before first production run.

Acceptance:

- No scan traffic from the worker's public IP.
- 100 percent of target requests carry a pool IP.
- Customer can verify the range.
- Gateway has no open proxy.
- Tunnel failure stops scans.
- Logs map run -> IP -> destination.
- Cost within the monthly target.
- Documented runbook exists.

## Edge cases and failure modes

- Gateway down: worker cannot claim or scan; runs requeue. No direct fallback.
- WireGuard down: Windows firewall blocks egress; heartbeat goes offline.
- IP blocklisted: quarantine, alert, reassign next run; customer still has the range.
- Target blocks datacenter IPs: explain to customer; do not use residential proxies to evade. Offer allowlist guidance.
- CDN/redirect hosts: resolve and allow only verified target destinations; log the chain.
- DNS rebinding: resolve at the gateway, reject private answers, recheck redirects.
- IPv6 leak: disable or tunnel IPv6; test.
- Multiple workers: one peer per worker, pool assignment, collision check.
- IP range change: treat as a customer communication event; avoid it.
- Provider termination: keep a second provider option warm; document transfer.
- Local labs: direct mode only, never through the gateway.
- Non-80/443 targets: blocked by default; manual exception with logging.
- Our own portal in the destination: block to avoid loops.
- Abuse complaint: pause run, preserve logs, verify authorization, respond.

## Assumptions

- EU hosting and EU customers are the default.
- One Windows worker, one active run at a time, for the MVP.
- The provider permits authorized security testing and offers reverse DNS.
- The worker can run WireGuard and enforce a kill switch.
- The customer is willing to allowlist a static range. Residential IP requirements are out of scope.
- The web/worker API in `docs/NEXTJS-PORTAL.md` is still planned, not built.

## Out of scope

- Residential, mobile or rotating proxy networks.
- BYOIP /24 or own ASN. Revisit at 10+ workers or when a customer requires it.
- TLS interception. The gateway forwards traffic and does not decrypt it.
- Using the range for email, SaaS logins or anything other than authorized scan egress.
- Scanning without domain verification and recorded authorization.

## Saved-plan acceptance

- [x] Plan saved to this file.
- [x] Runbook created at [`infra/egress/README.md`](../infra/egress/README.md).
- [ ] Phase 0 AUP and PTR confirmations recorded before purchase.
- [ ] Gateway and worker implementation completed and accepted.
