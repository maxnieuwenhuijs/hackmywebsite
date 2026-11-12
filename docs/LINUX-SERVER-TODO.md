# Linux server TODO: worker with DeepSeek Harness

Status: planning and partial validation. The Linux headless DSH path is smoke-tested. A full Chromium, nuclei and controlled scan still has to pass before Linux replaces the Windows worker.

Related docs:

- [Linux worker feasibility](LINUX-WORKER.md)
- [Worker API](WORKER-API.md)
- [Worker client](../worker/README.md)
- [Launch TODO](TODO.md)

## 1. Choose the right provider first

Do not order a normal VPS for scanning without written AUP approval.

Required:

- [ ] Provider explicitly allows authorized vulnerability scanning and penetration testing
- [ ] Written confirmation saved outside this repository
- [ ] Dedicated public IPv4, not CGNAT or a shared proxy pool
- [ ] Provider permits the planned outbound traffic
- [ ] Abuse contact and escalation process known
- [ ] Location chosen for target latency

Candidate providers are tracked in the egress research. BinaryLane is the current verified example. Vultr and Linode/Akamai require their own confirmation.

## 2. Provision the worker VPS

Minimum for one concurrent scan:

- [ ] Ubuntu 24.04 LTS
- [ ] 4 to 8 vCPU
- [ ] 8 to 16 GB RAM
- [ ] 100 GB or more NVMe
- [ ] Dedicated public IPv4
- [ ] Inbound ports closed
- [ ] Outbound HTTPS allowed
- [ ] SSH key access
- [ ] Swap enabled if RAM is 8 GB or less

Do not install the customer database, Stripe secret, portal sessions or customer report private keys on this worker.

## 3. Base hardening

- [ ] Create a non-root `hmw` user
- [ ] Add the deployment SSH key
- [ ] Disable password SSH login
- [ ] Disable direct root SSH login
- [ ] Enable unattended security updates
- [ ] Enable a host firewall
- [ ] Allow SSH only from the admin IP
- [ ] Deny all inbound ports except SSH
- [ ] Set the hostname and timezone
- [ ] Enable NTP
- [ ] Configure log rotation
- [ ] Confirm no database or customer secrets exist on the host

Example checks:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp
sudo ufw enable
```

## 4. Install the runtime

- [ ] Install Node.js 24.9 or newer with a version manager
- [ ] Confirm `node --version` is 24.9+
- [ ] Install Git, curl, jq, unzip and build essentials
- [ ] Install Chromium or Chrome
- [ ] Install Playwright browser dependencies
- [ ] Install nuclei and update templates
- [ ] Install DeepSeek Harness CLI

Commands:

```bash
npm install -g @deepseek-ai/dsh --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs
dsh --version
```

Install browser dependencies:

```bash
npx playwright install --with-deps chromium
```

Install nuclei:

```bash
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
nuclei -update-templates
```

If Go is not available, use the official nuclei release binary and verify the checksum.

## 5. Configure DeepSeek and DSH

- [ ] Create a dedicated DeepSeek API key for this worker
- [ ] Do not put the key in the repository
- [ ] Add it to `/etc/hmw/worker.env` with mode `600`
- [ ] Set `DEEPSEEK_API_KEY`
- [ ] Set `DSH_HOME` to a worker-owned directory
- [ ] Verify the model list is reachable
- [ ] Confirm the key has a spend limit

```bash
sudo install -d -m 700 -o hmw -g hmw /etc/hmw
sudo install -m 600 -o hmw -g hmw /dev/null /etc/hmw/worker.env
```

Example:

```env
DEEPSEEK_API_KEY=replace-me
DSH_HOME=/home/hmw/.dsh
HMW_WEB_URL=https://app.example.com
HMW_WORKER_TOKEN=replace-me
HMW_RUNS_DIR=/home/hmw/runs
```

## 6. Check out the code and install

- [ ] Clone the repository
- [ ] Check out the intended release commit
- [ ] Run `node --check` on the worker and report scripts
- [ ] Install only the dependencies required by the worker

The worker does not need the Next.js database connection.

## 7. Add the worker to the portal

- [ ] Generate a unique worker token
- [ ] Store only its hash in the `Worker` table
- [ ] Use the same `WORKER_TOKEN_PEPPER` as the portal
- [ ] Set the worker name
- [ ] Confirm the worker appears in `/admin/workers`
- [ ] Send the plaintext token only to the worker host

Current limitation: worker registration is manual. A production admin registration page is still needed.

## 8. Egress

- [ ] Decide one static IP or a routed `/28`
- [ ] If using WireGuard, create the peer and keys
- [ ] Add the peer to the gateway
- [ ] Confirm the worker's outbound IP is the approved egress IP
- [ ] Set reverse DNS on the egress IP
- [ ] Publish an abuse contact
- [ ] Add the IP to the admin egress inventory
- [ ] Confirm the gateway fails closed

Check the exit IP:

```bash
curl -fsS https://ifconfig.me
```

## 9. Smoke tests

- [ ] `dsh --version`
- [ ] `node scripts/linux-dsh-smoke.mjs`
- [ ] Run a read-only headless task
- [ ] Confirm the event stream uses `status`, `tool_call`, `tool_result` and `final`
- [ ] Confirm token usage appears on `step_end`
- [ ] Run a controlled scan against a local lab
- [ ] Confirm Chromium launches
- [ ] Confirm nuclei runs with a scoped target
- [ ] Confirm the worker can claim a queued run
- [ ] Confirm heartbeat and cancellation
- [ ] Confirm encrypted upload
- [ ] Confirm the portal decrypts the uploaded report

## 10. Run the worker as a service

Use systemd. Do not rely on an interactive terminal.

Create `/etc/systemd/system/hmw-worker.service`:

```ini
[Unit]
Description=hackmywebsite.ai scan worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hmw
Group=hmw
WorkingDirectory=/opt/hackmywebsite
EnvironmentFile=/etc/hmw/worker.env
ExecStart=/usr/bin/node worker/worker.mjs
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/hmw/runs
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

- [ ] `systemctl daemon-reload`
- [ ] `systemctl enable --now hmw-worker`
- [ ] Check `systemctl status`
- [ ] Check journal logs
- [ ] Reboot and confirm the worker returns
- [ ] Confirm no secrets appear in logs

## 11. Full Linux validation

- [ ] Run a full swarm on a controlled lab target
- [ ] Compare findings with a Windows run
- [ ] Confirm report quality
- [ ] Confirm the budget advisor works on Linux
- [ ] Confirm a rerun receives previous findings and advice
- [ ] Confirm cost per step is calibrated against DeepSeek billing
- [ ] Confirm Chromium does not leak or crash
- [ ] Confirm nuclei templates are current
- [ ] Confirm the worker stops at budget and cancellation

Do not switch production traffic to Linux until these pass.

## 12. Acceptance

- [ ] Worker has no database credentials
- [ ] Worker has no Stripe secret
- [ ] Worker has no customer report private key
- [ ] Egress IP is the approved IP
- [ ] All scans are within customer scope
- [ ] Report upload contains ciphertext only
- [ ] Plaintext report is deleted
- [ ] Service restarts automatically
- [ ] Lease recovery works
- [ ] Admin sees worker status and last heartbeat
- [ ] Runbook and incident contact are current

## 13. Open questions

- [ ] Which provider is approved for the worker?
- [ ] One static IP or routed `/28`?
- [ ] Full Linux or Windows fallback for the first paid customer?
- [ ] Who owns the DeepSeek spend limit?
- [ ] Which Chromium version is pinned?
- [ ] Which nuclei template version is pinned?
- [ ] What is the target concurrency per worker?
