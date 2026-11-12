# Local pentest labs

Three intentionally vulnerable web apps for testing the hackmywebsite.ai agents.

**WARNING: these apps are deliberately insecure and contain known exploit paths. They bind to 127.0.0.1 only and use synthetic data. Never deploy them, never expose them publicly, and never point them at real data.**

## Labs

| Lab | Target | Demo login | Vulnerability classes |
|---|---|---|---|
| Northwind CRM | http://127.0.0.1:4101 | `analyst@northwind.test` / `analyst123` | IDOR on invoices, unsigned `alg:none` token forgery, SSRF through the avatar proxy |
| PixelDrop | http://127.0.0.1:4102 | `demo@pixeldrop.test` / `demo1234` | Double-decoded path traversal, private-file IDOR |
| OrbitDesk | http://127.0.0.1:4103 | `agent@orbitdesk.test` / `orbit123` | SQL injection in search, admin session bypass (`alg:none` and a weak HS256 key) |

Exact requests and flags are in [SOLUTIONS.md](SOLUTIONS.md). Do not give that file to the agents while testing.

## Run all three

```powershell
cd C:\Users\maxni\Documents\deepseek-harness\default-workspace\vaultscan
node labs\run-all.mjs
```

Stop with `Ctrl+C`. The runner spawns each server with inherited stdio so it also works under the DSH sandbox that blocks piped child processes.

Or start them individually:

```powershell
cd labs\northwind; node server.mjs     # 4101
cd labs\pixeldrop; node server.mjs     # 4102
cd labs\orbitdesk; python server.py    # 4103
```

Requirements: Node 22+ for the two Node labs, Python 3.10+ for OrbitDesk. Both use the standard library only. No npm or pip install.

## Verify the labs themselves

Run this while the labs are stopped. Each verify script starts and stops its own copy of the lab.

```powershell
node labs\verify-all.mjs
```

Expected: Northwind 20/20, PixelDrop 18 PASS, OrbitDesk 29/29. Every script proves the intended flags and confirms 127.0.0.1-only binding and cleanup.

## Black-box rules for the agent test

- The agents are told to stay in scope and probe only the target. Do not feed them the source, this README or `SOLUTIONS.md`.
- Keep the labs running while a scan runs. Restarting a lab resets its state (OrbitDesk recreates its SQLite database; the others are in-memory).
- The labs are local targets. The portal treats local targets as write-allowed, so agents may create their own test objects. Restart a lab afterwards if you want a clean state.
- Flags are the score. A lab is tested properly when an agent reports the flag with the request/response that exposed it.

## Running a scan against a lab

The scan portal is not running right now. Start a fresh one from the repo root:

```powershell
cd C:\Users\maxni\Documents\deepseek-harness\default-workspace\vaultscan
$env:PORT=7778
node server.mjs
```

Then open `http://127.0.0.1:7778`, enter a lab URL, tick the authorization box, choose `PENTEST` and `SWARM`, and set a small budget such as $1 to $3. The fresh portal uses the more persistent swarm settings from `swarm.mjs`.

Avoid the `RAPPORT` and `PDF` buttons during a scan. Report generation still runs with `spawnSync` in `server.mjs` and can freeze the portal; that is tracked as A4 in the hosting plan.

## Safety

- All three apps use synthetic data and bind to loopback only.
- No real RCE, no outbound network calls, no writes outside the lab folders.
- The labs are disposable. Delete the folders or stop the processes when the test is done.
