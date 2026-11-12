#!/usr/bin/env node
// PixelDrop - intentionally vulnerable local security lab.
//
// AUTHORIZED LAB USE ONLY. This server is deliberately insecure and must never
// be exposed beyond 127.0.0.1. It contains no real data and makes no outbound
// network calls. It serves synthetic demo content only.
//
// Run:  node server.mjs
// Then: http://127.0.0.1:4102
//
// Intended vulnerabilities (see README.md):
//   1. Double-decoded path traversal in GET /download?file=...
//   2. IDOR in GET /api/files/:id (authenticated, but no ownership check).
//
// Everything is pure Node.js standard library. No npm dependencies.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LAB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(LAB_ROOT, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const STATIC_DIR = path.join(PUBLIC_DIR, 'static');

// Hard requirement: localhost only. Never bind 0.0.0.0.
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PIXELDROP_PORT || '4102', 10);

const MAX_DOWNLOAD_BYTES = 256 * 1024;
const MAX_METADATA_BODY_BYTES = 8 * 1024;
const MAX_DESCRIPTION_CHARS = 512;
const MAX_LOGIN_BODY_BYTES = 4 * 1024;

// The IDOR flag is kept base64-encoded in this source on purpose: a traversal
// request against server.mjs must not hand out the second flag. It is only
// returned by the vulnerable private-file API response.
const IDOR_FLAG = Buffer.from('SE1Xe3BpeGVsZHJvcF9pZG9yXzZkMTNiOH0=', 'base64').toString('utf8');

// ---------------------------------------------------------------------------
// Synthetic demo data (in memory)
// ---------------------------------------------------------------------------

const users = [
  {
    id: 'usr_1000',
    email: 'admin@pixeldrop.test',
    password: 'pixeldrop-admin-2099',
    name: 'Studio Admin',
    role: 'admin',
  },
  {
    id: 'usr_1001',
    email: 'mira@pixeldrop.test',
    password: 'design-2024',
    name: 'Mira (design)',
    role: 'editor',
  },
  {
    id: 'usr_1042',
    email: 'demo@pixeldrop.test',
    password: 'demo1234',
    name: 'Demo Reviewer',
    role: 'viewer',
  },
];

const sessions = new Map(); // token -> userId
const submissions = []; // in-memory metadata uploads

const publicFiles = [
  {
    name: 'welcome.txt',
    label: 'Welcome note and demo account info',
    uploaded: '2024-10-01',
  },
  {
    name: 'roadmap-q4.txt',
    label: 'Q4 plan for the share-link rewrite',
    uploaded: '2024-10-12',
  },
  {
    name: 'brand-assets.md',
    label: 'Brand asset manifest used by the press kit',
    uploaded: '2024-10-18',
  },
  {
    name: 'meeting-notes-2024-11-03.txt',
    label: 'Weekly design sync notes',
    uploaded: '2024-11-03',
  },
  {
    name: 'pixel-art-pack.json',
    label: 'Demo pixel-art palette pack',
    uploaded: '2024-11-05',
  },
  {
    name: 'onboarding-checklist.md',
    label: 'Checklist for new studio members',
    uploaded: '2024-11-07',
  },
];

// Path -> reason. The download route rejects these with 403 (correct behaviour).
const restrictedFiles = new Map([
  ['internal/acl-test.txt', 'Restricted to the safety team'],
]);

const privateFiles = [
  {
    id: 1001,
    ownerId: 'usr_1001',
    name: 'handover-notes.txt',
    mime: 'text/plain; charset=utf-8',
    uploaded: '2024-11-02',
    content: [
      'PIXELDROP PRIVATE DROP - handover-notes.txt',
      'owner: mira@pixeldrop.test (usr_1001)',
      '',
      'Safety-team handover, week 44.',
      '',
      '- ACL review is due before the holiday demo. Ticket PD-311 tracks the',
      '  missing per-file ownership check in the prototype.',
      '- The private API still resolves drops by numeric id without checking',
      '  whether the caller owns the drop. Do not show this to partners.',
      '- Release token for the lab recorder: ' + IDOR_FLAG,
      '',
      'Do not forward this drop outside the studio.',
      '',
    ].join('\n'),
  },
  {
    id: 1002,
    ownerId: 'usr_1001',
    name: 'moodboard-sources.txt',
    mime: 'text/plain; charset=utf-8',
    uploaded: '2024-10-27',
    content: [
      'PIXELDROP PRIVATE DROP - moodboard-sources.txt',
      'owner: mira@pixeldrop.test (usr_1001)',
      '',
      'Reference links for the winter campaign moodboard.',
      'Synthetic notes only. No credentials live in this drop.',
      '',
    ].join('\n'),
  },
  {
    id: 1003,
    ownerId: 'usr_1000',
    name: 'key-rotation-runbook.txt',
    mime: 'text/plain; charset=utf-8',
    uploaded: '2024-10-22',
    content: [
      'PIXELDROP PRIVATE DROP - key-rotation-runbook.txt',
      'owner: admin@pixeldrop.test (usr_1000)',
      '',
      'Lab runbook for rotating demo signing keys.',
      'This is a synthetic exercise document; no production keys are stored.',
      '',
      '1. Generate a new throwaway key.',
      '2. Restart the local lab.',
      '3. Re-run verify.mjs.',
      '',
    ].join('\n'),
  },
  {
    id: 1004,
    ownerId: 'usr_1042',
    name: 'my-todo.txt',
    mime: 'text/plain; charset=utf-8',
    uploaded: '2024-11-08',
    content: [
      'PIXELDROP PRIVATE DROP - my-todo.txt',
      'owner: demo@pixeldrop.test (usr_1042)',
      '',
      '- Sign in with the demo account and open the Files page.',
      '- Download welcome.txt and compare with the onboarding checklist.',
      '- Submit one metadata-only upload (name + visibility + description).',
      '',
    ].join('\n'),
  },
  {
    id: 1005,
    ownerId: 'usr_1042',
    name: 'draft-post.md',
    mime: 'text/markdown; charset=utf-8',
    uploaded: '2024-11-09',
    content: [
      '# Draft: PixelDrop release note',
      '',
      'Owner: demo@pixeldrop.test (usr_1042)',
      '',
      'PixelDrop now keeps a public drop list and a private drop API.',
      'Private drops are still a prototype: the per-file access check is',
      'tracked in PD-311 and is not enforced by the API yet.',
      '',
    ].join('\n'),
  },
];

const staticRoutes = new Map([
  ['/robots.txt', { file: path.join(PUBLIC_DIR, 'robots.txt'), type: 'text/plain; charset=utf-8' }],
  ['/static/app.js', { file: path.join(STATIC_DIR, 'app.js'), type: 'text/javascript; charset=utf-8' }],
  ['/static/style.css', { file: path.join(STATIC_DIR, 'style.css'), type: 'text/css; charset=utf-8' }],
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MIME_BY_EXTENSION = new Map([
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

function mimeForFile(name) {
  return MIME_BY_EXTENSION.get(path.extname(name).toLowerCase()) || 'application/octet-stream';
}

function fileSize(relativePath) {
  try {
    return fs.statSync(path.join(UPLOADS_DIR, relativePath)).size;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  const rounded = index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendHtml(res, status, html) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(
    status,
    baseHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
    }),
  );
  res.end(body);
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  res.writeHead(
    status,
    baseHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
    }),
  );
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(
    status,
    baseHeaders({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': body.length,
    }),
  );
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, baseHeaders({ Location: location }));
  res.end();
}

// Deliberately does decodeURIComponent() zero times: the raw, still-encoded
// query value is what the vulnerable download handler needs.
function rawQueryParam(requestUrl, name) {
  const queryIndex = requestUrl.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }
  const query = requestUrl.slice(queryIndex + 1);
  for (const pair of query.split('&')) {
    if (!pair) {
      continue;
    }
    const equalsIndex = pair.indexOf('=');
    const key = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
    if (key === name) {
      return equalsIndex === -1 ? '' : pair.slice(equalsIndex + 1);
    }
  }
  return null;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let tooLarge = false;
    let size = 0;
    const chunks = [];

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };

    req.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        finish(reject, httpError(413, `request body too large (limit ${maxBytes} bytes)`));
        return;
      }
      finish(resolve, Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => finish(reject, error));
  });
}

function parseBody(req, rawBody) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      return { type: 'json', data: JSON.parse(rawBody || '{}') };
    } catch {
      throw httpError(400, 'invalid JSON body');
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = {};
    for (const [key, value] of new URLSearchParams(rawBody)) {
      form[key] = value;
    }
    return { type: 'form', data: form };
  }
  if (contentType.includes('multipart/form-data')) {
    throw httpError(415, 'multipart uploads are not supported; this lab accepts metadata only');
  }
  return { type: 'other', data: {} };
}

function parseCookies(req) {
  const cookies = {};
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = part.slice(0, equalsIndex).trim();
    const value = part.slice(equalsIndex + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function currentUser(req) {
  const token = parseCookies(req).pd_session;
  if (!token) {
    return null;
  }
  const userId = sessions.get(token);
  if (!userId) {
    return null;
  }
  return users.find((candidate) => candidate.id === userId) || null;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

function userById(userId) {
  return users.find((candidate) => candidate.id === userId) || null;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function acceptsJson(req) {
  return String(req.headers.accept || '').toLowerCase().includes('application/json');
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function renderTopbar(user) {
  const authBlock = user
    ? `<span class="small muted">Signed in as ${escapeHtml(user.name)}</span><a href="/logout">Sign out</a>`
    : '<a href="/login">Sign in</a>';
  return [
    '<header class="topbar">',
    '  <div class="brand"><span class="brand-mark">PD</span>PixelDrop</div>',
    '  <nav class="topnav">',
    '    <a href="/files">Files</a>',
    '    <a href="/api/public/files">Public API</a>',
    `    ${authBlock}`,
    '  </nav>',
    '</header>',
  ].join('\n');
}

function layout({ title, body, user }) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)} | PixelDrop</title>`,
    '  <link rel="stylesheet" href="/static/style.css">',
    '  <script src="/static/app.js" defer></script>',
    '</head>',
    '<body>',
    renderTopbar(user),
    body,
    `<footer class="footer">PixelDrop local lab - http://${HOST}:${PORT} - synthetic data only. Reset by restarting the server.</footer>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function renderLoginPage({ user = null, error = null }) {
  const errorBlock = error ? `<div class="notice error">${escapeHtml(error)}</div>` : '';
  const body = `
  <main class="container">
    <section class="card">
      <h1>Sign in to PixelDrop</h1>
      <p class="muted">Local file-sharing drop for the PixelForge design studio.</p>
      ${errorBlock}
      <form method="post" action="/login" data-login-form>
        <label for="email">Email</label>
        <input id="email" type="email" name="email" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" type="password" name="password" autocomplete="current-password" required>
        <button type="submit">Sign in</button>
        <p class="small muted" data-login-hint></p>
      </form>
    </section>
    <section class="card">
      <h2>Demo account</h2>
      <p class="muted">This local instance ships with one working demo login. Use it to review the private drop API.</p>
      <div class="creds">email: demo@pixeldrop.test<br>password: demo1234</div>
      <p class="small muted">Synthetic lab credentials. Never reuse them anywhere else.</p>
    </section>
  </main>`;
  return layout({ title: 'Sign in', body, user });
}

function renderFilesPage({ user, flash = null, error = null }) {
  const noticeBlock = flash
    ? `<div class="notice ${flash.type === 'error' ? 'error' : 'success'}">${escapeHtml(flash.message)}</div>`
    : error
      ? `<div class="notice error">${escapeHtml(error)}</div>`
      : '';

  const publicRows = publicFiles
    .map((file) => {
      const size = formatBytes(fileSize(file.name));
      return [
        '<tr>',
        `  <td><code>${escapeHtml(file.name)}</code><div class="small muted">${escapeHtml(file.label)}</div></td>`,
        `  <td>${size}</td>`,
        `  <td>${escapeHtml(file.uploaded)}</td>`,
        '  <td><span class="badge ok">public</span></td>',
        `  <td><a href="/download?file=${encodeURIComponent(file.name)}">Download</a></td>`,
        '</tr>',
      ].join('\n');
    })
    .join('\n');

  const restrictedRows = [...restrictedFiles.entries()]
    .map(([restrictedPath, reason]) => {
      const size = formatBytes(fileSize(restrictedPath));
      return [
        '<tr>',
        `  <td><code>${escapeHtml(restrictedPath)}</code><div class="small muted">${escapeHtml(reason)}</div></td>`,
        `  <td>${size}</td>`,
        '  <td>2024-10-30</td>',
        '  <td><span class="badge locked">restricted</span></td>',
        '  <td class="muted">403 for this account</td>',
        '</tr>',
      ].join('\n');
    })
    .join('\n');

  let privateSection;
  if (user) {
    const ownFiles = privateFiles.filter((file) => file.ownerId === user.id);
    const privateRows = ownFiles.length
      ? ownFiles
          .map((file) =>
            [
              '<tr>',
              `  <td><code>${escapeHtml(file.name)}</code></td>`,
              `  <td>${escapeHtml(String(file.id))}</td>`,
              `  <td>${formatBytes(Buffer.byteLength(file.content))}</td>`,
              '  <td><span class="badge">private</span></td>',
              `  <td><a href="/api/files/${escapeHtml(String(file.id))}">Open via API</a></td>`,
              '</tr>',
            ].join('\n'),
          )
          .join('\n')
      : '<tr><td colspan="5" class="muted">No private drops yet.</td></tr>';
    privateSection = `
    <section class="card">
      <h2>Your private drops</h2>
      <p class="small muted">Signed in as ${escapeHtml(user.email)}. The list below only shows drops owned by your account; opening one uses the private file API.</p>
      <table>
        <thead><tr><th>File</th><th>ID</th><th>Size</th><th>Visibility</th><th>Action</th></tr></thead>
        <tbody>
${privateRows}
        </tbody>
      </table>
    </section>`;
  } else {
    privateSection = `
    <section class="card">
      <h2>Your private drops</h2>
      <div class="notice">Sign in to see and open your private drops. <a href="/login">Go to sign in</a></div>
    </section>`;
  }

  let uploadSection;
  if (user) {
    const ownSubmissions = submissions.filter((submission) => submission.ownerId === user.id);
    const submissionRows = ownSubmissions.length
      ? ownSubmissions
          .map((submission) =>
            [
              '<tr>',
              `  <td><code>${escapeHtml(submission.name)}</code></td>`,
              `  <td>${escapeHtml(submission.visibility)}</td>`,
              `  <td>${escapeHtml(submission.submittedAt)}</td>`,
              `  <td><span class="badge">${escapeHtml(submission.status)}</span></td>`,
              '</tr>',
            ].join('\n'),
          )
          .join('\n')
      : '<tr><td colspan="4" class="muted">No metadata submissions yet.</td></tr>';
    uploadSection = `
    <section class="card">
      <h2>Upload file metadata</h2>
      <p class="small muted">Metadata only: name, visibility and a short description (max ${MAX_DESCRIPTION_CHARS} characters). Binary uploads are disabled in this lab.</p>
      <form method="post" action="/upload" data-upload-form>
        <label for="name">File name</label>
        <input id="name" type="text" name="name" placeholder="drop-notes.txt" required>
        <label for="visibility">Visibility</label>
        <select id="visibility" name="visibility">
          <option value="public">public</option>
          <option value="private">private</option>
        </select>
        <label for="description">Description</label>
        <textarea id="description" name="description" maxlength="${MAX_DESCRIPTION_CHARS}" placeholder="What is in this drop?"></textarea>
        <button type="submit">Submit metadata</button>
      </form>
    </section>
    <section class="card">
      <h2>Your metadata submissions</h2>
      <table>
        <thead><tr><th>File</th><th>Visibility</th><th>Submitted</th><th>Status</th></tr></thead>
        <tbody>
${submissionRows}
        </tbody>
      </table>
    </section>`;
  } else {
    uploadSection = '';
  }

  const body = `
  <main class="container">
    ${noticeBlock}
    <section class="card">
      <div class="inline">
        <h1>Public drops</h1>
        <span class="small muted">${publicFiles.length} files on this instance</span>
      </div>
      <p class="small muted">Anyone with the link can download a public drop. The download endpoint accepts a single <code>file</code> query parameter.</p>
      <table>
        <thead><tr><th>File</th><th>Size</th><th>Uploaded</th><th>Visibility</th><th>Action</th></tr></thead>
        <tbody>
${publicRows}
        </tbody>
      </table>
    </section>
    <section class="card">
      <h2>Restricted drops</h2>
      <table>
        <thead><tr><th>File</th><th>Size</th><th>Uploaded</th><th>Visibility</th><th>Action</th></tr></thead>
        <tbody>
${restrictedRows}
        </tbody>
      </table>
    </section>
${privateSection}
${uploadSection}
  </main>`;
  return layout({ title: 'Files', body, user });
}

function renderNotFoundPage({ user = null, pathname = '' }) {
  const body = `
  <main class="container">
    <section class="card">
      <h1>404 - drop not found</h1>
      <p class="muted">There is no page at <code>${escapeHtml(pathname)}</code> on this PixelDrop instance.</p>
      <p><a href="/files">Back to public drops</a></p>
    </section>
  </main>`;
  return layout({ title: 'Not found', body, user });
}

function renderErrorPage({ status, message, user = null }) {
  const body = `
  <main class="container">
    <section class="card">
      <h1>${status} - request failed</h1>
      <div class="notice error">${escapeHtml(message)}</div>
      <p><a href="/files">Back to public drops</a></p>
    </section>
  </main>`;
  return layout({ title: `Error ${status}`, body, user });
}

function sendLoginPage(res, { status = 200, user = null, error = null } = {}) {
  sendHtml(res, status, renderLoginPage({ user, error }));
}

function sendFilesPage(res, { status = 200, user = null, flash = null, error = null } = {}) {
  sendHtml(res, status, renderFilesPage({ user, flash, error }));
}

function sendErrorPage(res, status, message, user = null) {
  sendHtml(res, status, renderErrorPage({ status, message, user }));
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

async function handleLoginPost(req, res) {
  const rawBody = await readBody(req, MAX_LOGIN_BODY_BYTES);
  const body = parseBody(req, rawBody);
  const email = String(body.data.email || '').trim().toLowerCase();
  const password = String(body.data.password || '');
  const wantsJson = body.type === 'json' || acceptsJson(req);
  const user = users.find((candidate) => candidate.email === email && candidate.password === password);

  if (!user) {
    if (wantsJson) {
      sendJson(res, 401, { ok: false, error: 'invalid credentials' });
      return;
    }
    sendLoginPage(res, { status: 401, error: 'Invalid email or password.' });
    return;
  }

  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, user.id);
  const cookie = `pd_session=${token}; HttpOnly; SameSite=Lax; Path=/`;

  if (wantsJson) {
    res.setHeader('Set-Cookie', cookie);
    sendJson(res, 200, { ok: true, user: publicUser(user), sessionToken: token });
    return;
  }

  res.writeHead(302, baseHeaders({ 'Set-Cookie': cookie, Location: '/files' }));
  res.end();
}

function handleLogout(req, res) {
  const token = parseCookies(req).pd_session;
  if (token) {
    sessions.delete(token);
  }
  res.writeHead(
    302,
    baseHeaders({
      'Set-Cookie': 'pd_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',
      Location: '/',
    }),
  );
  res.end();
}

// ---------------------------------------------------------------------------
// VULNERABILITY 1: double-decoded path traversal in GET /download?file=...
// ---------------------------------------------------------------------------
//
// Intended bug chain:
//   1. Read the RAW query value (no decoding yet).
//   2. decodeURIComponent() once -> "first pass".
//   3. Run a naive traversal guard on the first-pass value: reject ".." only
//      when it is already a dot-dot path segment. A double-encoded payload
//      such as "..%252F..%252Fsecret%252Fflag.txt" becomes
//      "..%2F..%2Fsecret%2Fflag.txt" here: no literal separators, no match.
//   4. BUG: decodeURIComponent() a second time -> "../../secret/flag.txt".
//   5. Join the twice-decoded value onto the public upload directory.
//
// Request: GET /download?file=..%252F..%252Fsecret%252Fflag.txt
// Result:  labs/pixeldrop/secret/flag.txt  (still inside the lab root).
//
// Containment check below keeps the traversal from ever escaping the lab
// directory, as required by the lab contract.
// ---------------------------------------------------------------------------

async function handleDownload(req, res, user) {
  const rawFile = rawQueryParam(req.url, 'file');
  if (rawFile === null || rawFile === '') {
    sendErrorPage(res, 400, 'Missing required query parameter: file', user);
    return;
  }

  // First pass: decode once.
  let firstPass;
  try {
    firstPass = decodeURIComponent(rawFile);
  } catch {
    sendErrorPage(res, 400, 'file parameter is not valid percent-encoding', user);
    return;
  }

  // Naive guard on the first pass. Blocks classic "../" and ..%2F payloads.
  if (/(^|[\\/])\.\.([\\/]|$)/.test(firstPass)) {
    sendErrorPage(res, 400, 'Illegal file path: ".." segments are not allowed.', user);
    return;
  }

  // Intentional vulnerability: decode a second time.
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(firstPass);
  } catch {
    sendErrorPage(res, 400, 'file parameter is not valid percent-encoding', user);
    return;
  }

  const normalizedLabel = decodedPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const restrictedReason = restrictedFiles.get(normalizedLabel);
  if (restrictedReason) {
    sendErrorPage(res, 403, `Access to ${normalizedLabel} is denied: ${restrictedReason}.`, user);
    return;
  }

  let resolvedPath;
  try {
    resolvedPath = path.resolve(UPLOADS_DIR, decodedPath);
  } catch {
    sendErrorPage(res, 400, 'Could not resolve file path', user);
    return;
  }

  // Safety rail for the lab: traversal is allowed for demonstration, but the
  // final path must stay inside labs/pixeldrop/.
  if (!isPathInside(LAB_ROOT, resolvedPath)) {
    sendErrorPage(res, 403, 'Resolved path escapes the lab root; request denied.', user);
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(resolvedPath);
  } catch {
    sendErrorPage(res, 404, `File not found: ${normalizedLabel}`, user);
    return;
  }
  if (!stat.isFile()) {
    sendErrorPage(res, 404, `Not a file: ${normalizedLabel}`, user);
    return;
  }
  if (stat.size > MAX_DOWNLOAD_BYTES) {
    sendErrorPage(res, 413, `File is too large to download in this lab (limit ${MAX_DOWNLOAD_BYTES} bytes).`, user);
    return;
  }

  let data;
  try {
    data = await fsp.readFile(resolvedPath);
  } catch {
    sendErrorPage(res, 404, `File not found: ${normalizedLabel}`, user);
    return;
  }

  const fileName = path.basename(resolvedPath);
  res.writeHead(
    200,
    baseHeaders({
      'Content-Type': mimeForFile(fileName),
      'Content-Length': data.length,
      'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
    }),
  );
  res.end(data);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function publicFileMetadata(file) {
  return {
    name: file.name,
    label: file.label,
    size: fileSize(file.name),
    mime: mimeForFile(file.name),
    uploaded: file.uploaded,
    visibility: 'public',
    download: `/download?file=${encodeURIComponent(file.name)}`,
  };
}

function handlePublicFiles(res) {
  sendJson(res, 200, {
    service: 'pixeldrop',
    visibility: 'public',
    files: publicFiles.map(publicFileMetadata),
    restricted: [...restrictedFiles.keys()],
  });
}

// ---------------------------------------------------------------------------
// VULNERABILITY 2: IDOR in GET /api/files/:id
// ---------------------------------------------------------------------------
//
// Authentication IS enforced (a valid session is required), but ownership is
// NOT: any signed-in user can fetch any private drop by its predictable
// numeric id (1001-1005). GET /api/files lists only the caller's drops, so the
// list is filtered correctly and the flag only appears on the direct id
// lookup for a drop owned by another user.
// ---------------------------------------------------------------------------

function privateFileMetadata(file) {
  return {
    id: file.id,
    name: file.name,
    ownerId: file.ownerId,
    mime: file.mime,
    size: Buffer.byteLength(file.content),
    uploaded: file.uploaded,
    visibility: 'private',
    api: `/api/files/${file.id}`,
  };
}

function handleListPrivateFiles(res, user) {
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'authentication required', hint: 'POST /login with the demo account' });
    return;
  }
  const ownFiles = privateFiles.filter((file) => file.ownerId === user.id);
  sendJson(res, 200, {
    owner: publicUser(user),
    files: ownFiles.map(privateFileMetadata),
  });
}

function handleGetPrivateFile(res, user, rawId) {
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'authentication required', hint: 'POST /login with the demo account' });
    return;
  }

  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || String(id) !== String(rawId)) {
    sendJson(res, 404, { ok: false, error: 'private drop not found', id: rawId });
    return;
  }

  const file = privateFiles.find((candidate) => candidate.id === id);
  if (!file) {
    sendJson(res, 404, { ok: false, error: 'private drop not found', id: rawId });
    return;
  }

  // INTENTIONAL BUG: the prototype checks the session but never compares
  // file.ownerId with user.id.
  const owner = userById(file.ownerId);
  sendJson(res, 200, {
    id: file.id,
    name: file.name,
    ownerId: file.ownerId,
    owner: owner ? publicUser(owner) : null,
    visibility: 'private',
    mime: file.mime,
    size: Buffer.byteLength(file.content),
    uploaded: file.uploaded,
    content: file.content,
  });
}

// ---------------------------------------------------------------------------
// Metadata upload (small text metadata only)
// ---------------------------------------------------------------------------

const UPLOAD_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,59}$/;

async function handleUploadMetadata(req, res, user) {
  const wantsJson = String(req.headers['content-type'] || '').toLowerCase().includes('application/json');

  if (!user) {
    if (wantsJson) {
      sendJson(res, 401, { ok: false, error: 'authentication required to submit metadata' });
      return;
    }
    redirect(res, '/login');
    return;
  }

  const rawBody = await readBody(req, MAX_METADATA_BODY_BYTES);
  const body = parseBody(req, rawBody);
  const data = body.data || {};
  const name = String(data.name || '').trim();
  const visibility = String(data.visibility || 'public').trim().toLowerCase();
  const description = typeof data.description === 'string' ? data.description : '';

  const reject = (status, message) => {
    if (wantsJson) {
      sendJson(res, status, { ok: false, error: message });
      return true;
    }
    sendFilesPage(res, { status, user, error: message });
    return true;
  };

  if (!UPLOAD_NAME_PATTERN.test(name)) {
    reject(400, 'Invalid file name: use 2-60 lowercase characters (a-z, 0-9, dot, underscore, dash).');
    return;
  }
  if (visibility !== 'public' && visibility !== 'private') {
    reject(400, 'Invalid visibility: use "public" or "private".');
    return;
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    reject(413, `Description too large: keep it under ${MAX_DESCRIPTION_CHARS} characters.`);
    return;
  }

  const submission = {
    id: submissions.length + 1,
    ownerId: user.id,
    name,
    visibility,
    description,
    submittedAt: new Date().toISOString(),
    status: 'pending review',
    note: 'metadata only; no file is stored by this lab',
  };
  submissions.push(submission);

  if (wantsJson) {
    sendJson(res, 201, { ok: true, submission });
    return;
  }
  res.writeHead(303, baseHeaders({ Location: '/files?uploaded=1' }));
  res.end();
}

// ---------------------------------------------------------------------------
// Correctly rejected admin route (demonstrates that not every route is broken)
// ---------------------------------------------------------------------------

function handleAdminAudit(res, user) {
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'authentication required' });
    return;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, {
      ok: false,
      error: 'forbidden',
      detail: 'admin role required for /api/admin/audit',
      yourRole: user.role,
    });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    audit: [
      { at: '2024-11-08T09:12:00Z', actor: 'usr_1000', action: 'login', target: 'admin console' },
      { at: '2024-11-08T09:14:00Z', actor: 'usr_1001', action: 'download', target: 'welcome.txt' },
    ],
  });
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

async function serveStatic(res, route) {
  let data;
  try {
    data = await fsp.readFile(route.file);
  } catch {
    sendText(res, 404, 'Not found\n');
    return;
  }
  res.writeHead(
    200,
    baseHeaders({
      'Content-Type': route.type,
      'Content-Length': data.length,
    }),
  );
  res.end(data);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  res.on('finish', () => {
    console.log(`[pixeldrop] ${req.method} ${req.url} -> ${res.statusCode}`);
  });

  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    sendErrorPage(res, 400, 'Malformed request URL');
    return;
  }

  const pathname = url.pathname;
  const method = req.method || 'GET';
  const user = currentUser(req);

  // Static assets and lab metadata.
  if (method === 'GET' && staticRoutes.has(pathname)) {
    await serveStatic(res, staticRoutes.get(pathname));
    return;
  }
  if (method === 'GET' && pathname === '/favicon.ico') {
    res.writeHead(204, baseHeaders());
    res.end();
    return;
  }
  if (method === 'GET' && pathname === '/healthz') {
    sendJson(res, 200, { ok: true, service: 'pixeldrop', mode: 'local-lab', host: HOST, port: PORT });
    return;
  }

  // VULNERABLE download endpoint.
  if (method === 'GET' && pathname === '/download') {
    await handleDownload(req, res, user);
    return;
  }

  // Auth pages.
  if (method === 'GET' && (pathname === '/' || pathname === '/login')) {
    if (user) {
      redirect(res, '/files');
      return;
    }
    const loginError = url.searchParams.get('error') === 'invalid' ? 'Invalid email or password.' : null;
    sendLoginPage(res, { status: 200, error: loginError });
    return;
  }
  if (method === 'POST' && pathname === '/login') {
    await handleLoginPost(req, res);
    return;
  }
  if (method === 'GET' && pathname === '/logout') {
    handleLogout(req, res);
    return;
  }

  // File list page (public drops visible to everyone; private section when
  // signed in).
  if (method === 'GET' && pathname === '/files') {
    const flash =
      url.searchParams.get('uploaded') === '1'
        ? { type: 'success', message: 'Metadata submitted. It is pending review and listed under your submissions.' }
        : null;
    sendFilesPage(res, { user, flash });
    return;
  }

  // JSON API.
  if (method === 'GET' && pathname === '/api/public/files') {
    handlePublicFiles(res);
    return;
  }
  if (method === 'GET' && pathname === '/api/files') {
    handleListPrivateFiles(res, user);
    return;
  }
  const privateFileMatch = /^\/api\/files\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && privateFileMatch) {
    handleGetPrivateFile(res, user, privateFileMatch[1]);
    return;
  }
  if (method === 'POST' && (pathname === '/api/upload' || pathname === '/upload')) {
    await handleUploadMetadata(req, res, user);
    return;
  }
  if (method === 'GET' && pathname === '/api/admin/audit') {
    handleAdminAudit(res, user);
    return;
  }

  // Everything else.
  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: 'API route not found', path: pathname });
    return;
  }
  sendHtml(res, 404, renderNotFoundPage({ user, pathname }));
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    const status = Number.isInteger(error && error.statusCode) ? error.statusCode : 500;
    const message = status === 500 ? 'internal server error' : String(error.message || 'request failed');
    if (status === 500) {
      console.error('[pixeldrop] unhandled error:', error);
    }
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (String(req.url || '').startsWith('/api/')) {
      sendJson(res, status, { ok: false, error: message });
      return;
    }
    sendErrorPage(res, status, message);
  });
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`[pixeldrop] ${HOST}:${PORT} is already in use. Set PIXELDROP_PORT to another localhost port.`);
  } else {
    console.error('[pixeldrop] server error:', error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`[pixeldrop] PixelDrop lab listening on http://${HOST}:${PORT}`);
  console.log('[pixeldrop] local-only synthetic lab - do not expose beyond 127.0.0.1');
  console.log('[pixeldrop] demo login: demo@pixeldrop.test / demo1234');
});

function shutdown(signal) {
  console.log(`[pixeldrop] received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
