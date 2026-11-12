# Egress gateway runbook

Status: draft for the approved plan in [`docs/EGRESS-PLAN.md`](../../docs/EGRESS-PLAN.md). Nothing has been purchased or provisioned. Do not buy IPs or create the gateway until Phase 0 AUP and PTR confirmations are recorded.

## What this is

One Linux gateway owns a static IPv4 block and is the only route from a Windows scan worker to the internet. The worker joins through WireGuard. The gateway SNATs each worker to its assigned public IP, blocks private and metadata destinations, and logs every flow by run.

No HTTP proxy. Agents can call `fetch`, Chrome, nuclei or an arbitrary script, so an HTTP proxy setting would be bypassable. The tunnel is the control point.

## Topology

```
Windows worker
  wg0: 10.77.0.11/32
  persistent tunnel, kill switch, no direct 80/443
        |
        | WireGuard UDP 51820
        v
Linux egress gateway
  wg0: 10.77.0.1/24
  public: 203.0.113.0/28
  nftables SNAT, destination policy, DNS, JSONL flow logs
        |
        v
Internet target
```

`203.0.113.0/28` is an example from the documentation range. Replace it with the leased block.

## Provider Phase 0 checklist

Send these questions before ordering:

1. Does the AUP permit authorized penetration testing and security assessment traffic from this IP space? Get a written answer.
2. What is the abuse process and expected response time? Who is the abuse contact?
3. Is custom reverse DNS included for every address? What is the propagation delay?
4. Is the block routed to one server, and can it be moved to a replacement server?
5. Can the block be announced or failed over if the gateway host fails?
6. Is the IP geolocation correct for the EU target market?
7. Are there restrictions on outbound port 80/443, DNS or request volume?
8. Are there setup fees, minimum terms or IPv4 justification requirements?
9. Can we keep the same range if we upgrade to a larger block? If not, how is migration handled?
10. Is there a written escalation path for an abuse ticket that is a false positive from an authorized test?

Record the answers and the order confirmation in `docs/EGRESS-PLAN.md` or an internal procurement note. Do not buy from a provider that cannot answer 1, 3 and 5.

Recommended candidate order: OVHcloud Additional IP first, HammerVM Stockholm second. X-ZoneServers is a price reference only because its article says it does not offer custom reverse DNS.

## IP plan

Fill this in before Phase 1:

| Address | Use | PTR | Notes |
|---|---|---|---|
| .1 | Gateway public / provider | | Provider router or gateway |
| .2 | Control and model API egress | | Separate from scan reputation |
| .3-.12 | Scan pool | | Assign one per run |
| .13-.14 | Spare / failover | | Quarantine and HA |
| .15 | Reserved | | Do not use |

Rules:

- One public IP per active run.
- Sticky for the run and its retries.
- Do not rotate mid-run.
- Quarantine on repeated blocklist hits or an abuse ticket. Do not silently reassign.
- Publish the full range to customers. Individual IPs are an exception.

## Gateway build order

1. Create a Debian 12 VPS in the same EU region as the worker. No public SSH.
2. Attach the routed public block to the gateway. Configure the interface and confirm the provider's gateway.
3. Install WireGuard, nftables, unbound or dnsmasq, and Tailscale for admin.
4. Enable IP forwarding:
   ```
   net.ipv4.ip_forward = 1
   net.ipv6.conf.all.forwarding = 0
   ```
5. Harden SSH: no password auth, no public port 22; administer through Tailscale only.
6. Install the WireGuard server. One peer per worker. Generate keys in the web admin or a local secret store, not in this repo.
7. Add the SNAT map. Example shape:
   ```
   # one line per worker/run assignment
   map egress_map {
        type ipv4_addr : ipv4_addr;
        elements = { 10.77.0.11 : 203.0.113.10 }
   }
   ```
   The actual file is `nftables.conf`, added in Phase 1.
8. Add the private block list:
   ```
   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8,
   169.254.0.0/16, 100.64.0.0/10, 224.0.0.0/4, 240.0.0.0/4
   ```
   Also block the leased range itself and the worker's public IP.
9. Add the DNS resolver. Force DNS through the gateway; block direct UDP 53 to arbitrary resolvers and public DoH.
10. Add JSONL flow logging:
    - timestamp
    - worker id
    - run id
    - assigned egress IP
    - destination host/IP and port
    - bytes out and in
    - HTTP status if available
    - action (allow/block)
    - never request bodies
11. Add a private sync endpoint for assignments:
    ```
    POST /assign { workerId, runId, egressIp, expiresAt }
    ```
    Only reachable on the private interface. Reject unknown workers and IPs outside the pool.
12. Add a private health endpoint. No public health or metrics endpoint.

## WireGuard

- One peer per worker. No shared peer.
- Worker key pairs generated per worker and rotated quarterly.
- Gateway `AllowedIPs` for each peer is the worker tunnel address only, for example `10.77.0.11/32`.
- Worker `AllowedIPs = 0.0.0.0/0, ::/0` so all traffic is forced through the tunnel.
- `PersistentKeepalive = 25`.
- On Windows, enable the WireGuard kill switch or add firewall rules that block all outbound TCP 80/443 when the tunnel is not up.
- Disable IPv6 on the worker, or route `::/0` through the tunnel and apply the same block policy. Test for leaks.

## Assignment flow

1. Web claims a queued run.
2. Web picks a free egress IP from the pool, sticky to the run.
3. Web includes `{ ip, range, region, gatewayId }` in the worker claim response.
4. Web calls the gateway private sync endpoint with the worker and run id.
5. Worker starts; gateway SNATs the worker tunnel source to the assigned IP.
6. Worker verifies the observed egress IP and reports it on heartbeat and at run start.
7. Web fails the run if the observed IP is outside the assigned IP/range.
8. On completion, cancel or failure, web releases the assignment after the gateway rule is removed.

If no egress IP is available, the claim fails. There is no direct-IP fallback.

## Worker configuration

Environment:

```
HMW_EGRESS_MODE=gateway
HMW_EGRESS_RANGE=203.0.113.0/28
HMW_EGRESS_IP=203.0.113.10
HMW_EGRESS_GATEWAY=wg-gw-01
```

The runner passes these to the DSH child and writes them into `scan.json` as metadata. The report and evidence include the assigned IP and range.

Local labs on `127.0.0.1` stay in direct mode. Never route loopback through the gateway.

## Verification checklist

Run from the worker:

```powershell
# 1. Observed public IP matches the assignment
curl.exe -s https://api.ipify.org

# 2. Direct egress is blocked when the tunnel is down
# Stop WireGuard, then retry the same request. It must fail.

# 3. Target sees the assigned IP
# Use a controlled echo endpoint or a customer test endpoint.

# 4. DNS is through the gateway
nslookup example.com

# 5. IPv6 does not leak
curl.exe -6 -s https://api64.ipify.org
```

Run on the gateway:

```bash
# WireGuard peer is handshaking
wg show

# SNAT is correct
conntrack -L | head

# Private destinations are blocked
curl -s --interface 203.0.113.10 http://169.254.169.254/ ; echo $?

# Reverse DNS
dig -x 203.0.113.10 +short

# Gateway is not an open proxy
# Scan the gateway from the outside. Only WireGuard may answer.
```

Acceptance:

- Chrome, nuclei, `probe.mjs` and plain `fetch` all show the pool IP.
- The worker's own public IP never reaches a target.
- The tunnel-down test fails closed.
- `169.254.169.254`, RFC1918 and loopback are blocked.
- DNS and IPv6 do not leak.
- The customer can allowlist the range and verify the source.
- The gateway has no public HTTP proxy or SSH.

## Failure and abuse

- **Gateway down:** worker cannot claim or scan. Runs requeue. Do not bypass.
- **Tunnel down:** firewall blocks egress; heartbeat offline.
- **IP blocklisted:** quarantine the address; alert; assign another pool IP next run; keep the customer range unchanged.
- **Target blocks datacenter IPs:** explain the limitation. Do not use residential proxies to evade. Offer allowlist guidance.
- **Abuse ticket:** stop the run, preserve logs, verify the authorization record and target verification, reply to the provider with evidence, and quarantine the IP if the complaint stands.
- **Provider termination:** move to the pre-qualified second provider; update customer allowlist communication; treat range change as a customer-visible event.
- **Gateway rebuild:** recover config from the documented files, restore WireGuard peers, restore the assignment map, and rerun the verification checklist.

## Files to add in Phase 1

```
infra/egress/
  README.md              # this runbook
  cloud-init.yaml        # Debian gateway bootstrap
  wg0.conf.example       # peer shape, no real keys
  nftables.conf          # SNAT, blocks, logging, rate limits
  assignments.json       # example schema only
  assignment-sync.mjs    # private API for web -> gateway
  egress-policy.mjs      # verified target set and health
  /var/log/hmw-egress/   # runtime, not in git
```

Secrets, private keys and the real IP block stay out of git. The real range and PTR records live in the deployment environment and the internal procurement note.

## References

- [Static egress plan](../../docs/EGRESS-PLAN.md)
- [X-ZoneServers additional IPv4 pricing](https://x-zoneservers.com/blog/extra-ipv4-dedicated-server-29-28-27-subnets)
- [HammerVM additional IPs](https://hammervm.com/d/additional-ips)
- [OVHcloud Additional IP documentation](https://docs.ovhcloud.com/de/guides/public-cloud/network-services/buy-additional-ip.md)
- [Hetzner IPv4 pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/)
