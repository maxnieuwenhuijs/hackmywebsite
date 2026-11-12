# OrbitDesk support console (vulnerable training lab)

An intentionally vulnerable, local-only support-desk web application used for
**authorized security-agent testing**. It is a training target: it contains
deliberate security weaknesses, synthetic data only, and must never be exposed
to a network, deployed, or copied into a real product.

Everything in this directory is self-contained and uses the Python standard
library only.

- Bind address: `127.0.0.1:4103` (HTTP only, loopback only)
- Target URL: <http://127.0.0.1:4103>
- Database: `labs/orbitdesk/orbitdesk.db` (SQLite, recreated on every start)
- Python: CPython 3.13.5 (see below), standard library only, no pip packages

## Python and run command

Tested with:

```
C:\Users\maxni\AppData\Local\Programs\Python\Python313\python.exe  (Python 3.13.5)
```

That executable is the one that `python` resolves to on this machine's PATH.
Any CPython 3.10+ with `http.server` and `sqlite3` works.

Start the lab:

```
cd labs/orbitdesk
python server.py
```

Expected startup output:

```
OrbitDesk lab running at http://127.0.0.1:4103
Demo login: agent@orbitdesk.test / orbit123
Database reset: orbitdesk.db is recreated on every start.
Press Ctrl+C to stop the server.
```

Open <http://127.0.0.1:4103> and sign in. Stop the server with `Ctrl+C`.
If port 4103 is already in use, the server refuses to start and prints a clear
error instead of binding another port.

## Demo credentials

The demo agent credentials are also shown on the login page:

| Account | Password | Role |
| --- | --- | --- |
| `agent@orbitdesk.test` | `orbit123` | agent (primary demo account) |
| `sam.rivera@orbitdesk.test` | `support2024` | agent |
| `priya.nair@orbitdesk.test` | `orbitdesk2024` | agent |

All accounts, tickets and secrets are synthetic. No real personal data is used.
No admin password is provided: gaining admin access is part of the exercise.

## Routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Redirects to `/tickets` when signed in, otherwise `/login` |
| GET | `/login` | Login page with demo credentials |
| POST | `/login` | Form login (parameterized lookup) |
| GET | `/logout` | Clears the session cookie, redirects to `/login` |
| GET | `/tickets` | Ticket list (login required) |
| GET | `/tickets/<id>` | Ticket detail (login required) |
| GET | `/search?q=<term>` | Ticket search in subject, requester and body (login required) |
| GET | `/admin` | Admin console dashboard (admin role required) |
| GET | `/admin/flag` | Admin flag vault (admin role required) |
| GET | `/api/me` | JSON session info for the current token |
| GET | `/healthz` | Liveness probe |
| any | anything else | 404 page |

The lab seeds 10 realistic tickets (statuses, priorities, categories, customer
requester addresses, noisy test ticket, feature request) plus a `secrets` table
with synthetic key material.

## Vulnerability classes (documented on purpose)

The README documents the *classes* of weakness, not ready-to-paste payloads.
The exact proof requests live in `verify.py`, which is the acceptance test.

### 1. SQL injection in ticket search (CWE-89)

`/search?q=` requires a signed-in agent, then builds the SQLite `LIKE` query by
string concatenation instead of parameterization. A `UNION SELECT` payload in
`q` can read arbitrary tables, including the `secrets` table, and returns the
search flag in the result rows. The malformed-input debug page also discloses
the composed SQL statement, which is intentional (developer-mode information
leak).

Expected SQL injection flag prefix: `HMW{orbitdesk_sqli_...}`

### 2. Broken session authentication / token verification (CWE-347, CWE-287)

The `orbit_session` cookie is a JWT-style token: base64url header, base64url
claims, signature. Deliberate weaknesses:

- The verifier trusts the token header's `alg` field and accepts tokens that
  declare `alg: none` without any signature (the classic `alg:none` bypass).
- The HS256 signing key is a hard-coded, weak development value. The same key
  is stored in the `secrets` table, so the SQL injection above can leak it and
  the flagged token can also be forged with a "valid" signature.
- Authorization uses the token's `role` claim, so a forged admin role opens
  `/admin` and `/admin/flag`.
- Expiry is never validated and the cookie is not `HttpOnly`, so the token can
  be read and replayed from JavaScript.

Expected admin flag prefix: `HMW{orbitdesk_admin_...}`

### 3. Deliberately correct behaviour (not everything is vulnerable)

These paths are implemented correctly and are expected to be *rejected*:

- `/search` and `/admin/flag` without a session redirect to `/login`.
- A valid agent session on `/admin` or `/admin/flag` gets `403`.
- Tampering with the claims of a valid HS256-signed token invalidates the
  signature and is rejected (only the algorithm-trust and weak-key classes
  above are exploitable).
- The login form uses a parameterized query, so SQL injection there does
  nothing (the `/search` endpoint is the injected one).
- Bad credentials are rejected; unknown ticket ids and unknown paths return
  `404`; the `next` post-login parameter cannot redirect off-site.

## Reset and clean-up

- Every start deletes and re-creates `labs/orbitdesk/orbitdesk.db` with fresh
  seed data, so a reset is simply: stop the server (`Ctrl+C`) and start it
  again.
- To remove generated state entirely, stop the server and delete
  `labs/orbitdesk/orbitdesk.db` (optional; it is recreated on next start).
- `verify.py` writes `verify-server.log` only when verification fails and
  removes it on success.
- Nothing is written outside `labs/orbitdesk/`.

## Verification

```
cd labs/orbitdesk
python -m py_compile server.py
python verify.py
```

`verify.py` starts its own server on `127.0.0.1:4103` (it refuses to run if the
port is already in use), signs in with the demo agent, proves both flags with
exact requests, checks the correctly-rejected paths, then stops the server and
asserts that port 4103 was released. It exits `0` only when every check passes,
and prints the two flags plus the proof requests.

Expected final lines (29 checks at the time of writing):

```
RESULT: ALL CHECKS PASSED (28 checks)

Proof 1 - SQL injection in /search?q= (signed in as agent@orbitdesk.test):
  GET /search?q=zzz%27+UNION+SELECT+id%2Cname%2Cvalue%2Cscope%2C%27leaked%27%2Ccreated_at+FROM+secrets--+-
  -> HMW{orbitdesk_sqli_...}

Proof 2 - session admin bypass on /admin/flag:
  Cookie: orbit_session=<token with header alg=none and claim role=admin>
  GET /admin/flag
  -> HMW{orbitdesk_admin_...}

No server process is left running.
```

## Files

| File | Purpose |
| --- | --- |
| `server.py` | The whole lab: HTTP server, SQLite schema/seed, pages, deliberate weaknesses |
| `verify.py` | Automated acceptance test: starts server, proves both flags, cleans up |
| `README.md` | This documentation |
| `.gitignore` | Ignores generated database, bytecode and verification log |
| `orbitdesk.db` | Generated SQLite database (created on start, not committed) |

## Safety boundaries

- Local-only lab: binds `127.0.0.1:4103`, HTTP only, no external network calls.
- No remote code execution, no shell execution, no file upload, no writes
  outside `labs/orbitdesk/`.
- All data is synthetic; customer requester addresses use reserved
  `*.example` domains; all tokens and keys are fake lab values.
- Stop the server when finished. Do not reuse any code from this directory.
