// server.mjs â€” hackmywebsite.ai portal. Zero dependencies. Binds 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { bus, startScan, stopScan, readScan, readFindings, listScans, isLocalTarget } from './runner.mjs';
import { startSwarm, stopSwarm } from './swarm.mjs';

const HERE = import.meta.dirname;
const PUBLIC = path.join(HERE, 'public');
const SCANS = path.join(HERE, 'scans');
fs.mkdirSync(SCANS, { recursive: true });

// report generation: python-docx builds the DOCX, LibreOffice converts it to PDF
const PYTHON = 'C:\\Users\\maxni\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const LO_NODE = 'C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LO_CLI = 'C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar.unpacked\\dsh\\node_modules\\@deepseek-ai\\libreoffice-kit\\lib\\cli.js';

const PORT = Number(process.env.PORT || 7777);
const HOST = '127.0.0.1';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) reject(new Error('body too large')); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || HOST}`);
  const p = u.pathname;

  // ---- API ----
  if (p === '/api/scans' && req.method === 'GET') return json(res, 200, listScans());

  if (p === '/api/scans' && req.method === 'POST') {
    let body = {};
    try { body = JSON.parse(await readBody(req) || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
    const url = String(body.url || '').trim();
    const budgetUsd = Number(body.budgetUsd);
    const authorized = body.authorized === true;
    // mode = what the engagement is allowed to do; engine = how it is executed
    const mode = body.mode === 'pentest' ? 'pentest' : 'recon';
    const engine = body.engine === 'single' ? 'single' : 'swarm';
    // writes are only ever allowed in an active pentest with explicit consent
    const aggressive = mode === 'pentest' && body.aggressive === true;
    const CONSENT = 'I authorize state-changing tests on this target';
    if (aggressive && String(body.consent || '').trim() !== CONSENT) {
      return json(res, 400, { error: `Aggressive runs require consent: "${CONSENT}"`, consentPhrase: CONSENT });
    }

    let parsed;
    try { parsed = new URL(url); } catch { return json(res, 400, { error: 'URL must be absolute, e.g. https://example.com' }); }
    if (!/^https?:$/.test(parsed.protocol)) return json(res, 400, { error: 'Only http(s) targets' });
    if (!authorized) return json(res, 400, { error: 'Authorization checkbox is required' });
    if (!Number.isFinite(budgetUsd) || budgetUsd < 0.05 || budgetUsd > 50) return json(res, 400, { error: 'Budget must be between $0.05 and $50' });

    const id = `scan-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const consent = aggressive
      ? { phrase: CONSENT, acceptedAt: new Date().toISOString(), authorized: true }
      : null;

    if (engine === 'swarm') {
      // swarm is the default engine for both modes; it writes scan.json before its first await
      startSwarm({ id, url: parsed.toString(), budgetUsd, aggressive, consent, mode }).catch((err) => {
        console.error('[swarm]', err && err.stack || err);
      });
      const initial = readScan(id) || { id, url: parsed.toString(), budgetUsd, mode, engine, status: 'running' };
      return json(res, 201, initial);
    }

    const state = startScan({ id, url: parsed.toString(), budgetUsd, mode, aggressive });
    if (aggressive) {
      state.consent = consent;
      try {
        const f = path.join(SCANS, id, 'scan.json');
        fs.writeFileSync(f, JSON.stringify(state, null, 2));
      } catch {}
    }
    return json(res, 201, state);
  }

  const m = p.match(/^\/api\/scans\/([^/]+)(\/stream|\/stop|\/result|\/evidence|\/attack-chain|\/report\.pdf|\/report\.html|\/rapport\.html|\/rapport\.pdf)?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const sub = m[2];

    // client-facing report in the chosen language: write content, build the kit page, bundle it
    // PDF printed from the SAME html, so both artefacts share one design
    if (sub === '/rapport.pdf') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      if (scan.status === 'running') return json(res, 409, { error: 'scan still running' });
      const lang = (u.searchParams.get('lang') || 'nl').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5) || 'nl';
      try {
        const dir = path.join(SCANS, id);
        const html = path.join(dir, 'rapport.' + lang + '.html');
        const pdf = path.join(dir, 'rapport.' + lang + '.pdf');
        if (!fs.existsSync(html)) {
          const run = (args, timeout) => {
            const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout, cwd: HERE });
            if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(-300));
          };
          run([path.join(HERE, 'evidence_build.mjs'), dir], 60000);
          run([path.join(HERE, 'report_ai.mjs'), dir, '--lang', lang], 300000);
          run([path.join(HERE, 'advisor.mjs'), dir, '--lang', lang], 120000);
          run([path.join(HERE, 'report_kit_build.mjs'), dir, '--lang', lang], 60000);
          run([path.join(HERE, 'report-kit', 'bundle.mjs'), path.join(dir, 'rapport.' + lang + '.src.html'), html], 60000);
        }
        if (!fs.existsSync(pdf) || fs.statSync(pdf).mtimeMs < fs.statSync(html).mtimeMs) {
          if (fs.existsSync(pdf)) fs.rmSync(pdf, { force: true });
          const r = spawnSync(CHROME_EXE, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
            '--virtual-time-budget=8000',
            '--print-to-pdf=' + pdf,
            'file:///' + html.replace(/\\/g, '/'),
          ], { encoding: 'utf8', timeout: 180000 });
          if (!fs.existsSync(pdf)) throw new Error('chrome print failed: ' + (r.stderr || '').slice(-300));
        }
        const name = 'hackmywebsite-' + (scan.host || 'report').replace(/\./g, '-') + '-' + lang + '.pdf';
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': fs.statSync(pdf).size,
          'content-disposition': 'attachment; filename="' + name + '"',
          'cache-control': 'no-store',
        });
        return fs.createReadStream(pdf).pipe(res);
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/rapport.html') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      if (scan.status === 'running') return json(res, 409, { error: 'scan still running' });
      const lang = (u.searchParams.get('lang') || 'nl').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5) || 'nl';
      try {
        const dir = path.join(SCANS, id);
        const out = path.join(dir, `rapport.${lang}.html`);
        const src = path.join(dir, `rapport.${lang}.src.html`);
        const stamp = Math.max(
          (() => { try { return fs.statSync(path.join(dir, 'findings.json')).mtimeMs; } catch { return 0; } })(),
          (() => { try { return fs.statSync(path.join(dir, 'scan.json')).mtimeMs; } catch { return 0; } })(),
          (() => { try { return fs.statSync(path.join(dir, 'evidence.json')).mtimeMs; } catch { return 0; } })(),
          (() => { try { return fs.statSync(path.join(dir, `advice.${lang}.json`)).mtimeMs; } catch { return 0; } })(),
          (() => { try { return fs.statSync(path.join(dir, 'advice.json')).mtimeMs; } catch { return 0; } })(),
        );
        const fresh = fs.existsSync(out) && fs.statSync(out).mtimeMs >= stamp;
        if (!fresh) {
          const run = (args, timeout) => {
            const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout, cwd: HERE });
            if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(-300));
          };
          run([path.join(HERE, 'evidence_build.mjs'), dir], 60000);
          run([path.join(HERE, 'report_ai.mjs'), dir, '--lang', lang], 300000);
          run([path.join(HERE, 'advisor.mjs'), dir, '--lang', lang], 120000);
          run([path.join(HERE, 'report_kit_build.mjs'), dir, '--lang', lang], 60000);
          run([path.join(HERE, 'report-kit', 'bundle.mjs'), src, out], 60000);
        }
        const body = fs.readFileSync(out);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
        return res.end(body);
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/report.html') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      try {
        const file = path.join(SCANS, id, 'report.html');
        const src = Math.max(
          (() => { try { return fs.statSync(path.join(SCANS, id, 'findings.json')).mtimeMs; } catch { return 0; } })(),
          (() => { try { return fs.statSync(path.join(SCANS, id, 'scan.json')).mtimeMs; } catch { return 0; } })(),
        );
        const fresh = fs.existsSync(file) && fs.statSync(file).mtimeMs >= src;
        if (!fresh) {
          const r = spawnSync(process.execPath, [path.join(HERE, 'report_html.mjs'), path.join(SCANS, id)], { encoding: 'utf8', timeout: 60000 });
          if (r.status !== 0) throw new Error((r.stderr || 'generator failed').slice(-300));
        }
        const body = fs.readFileSync(file);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
        return res.end(body);
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/report.pdf') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      if (scan.status === 'running') return json(res, 409, { error: 'scan still running â€” stop it or wait for it to finish' });
      try {
        const pdf = buildReportPdf(id);
        const name = `hackmywebsite-${(scan.host || 'report').replace(/\./g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': fs.statSync(pdf).size,
          'content-disposition': `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
          'cache-control': 'no-store',
        });
        return fs.createReadStream(pdf).pipe(res);
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/stop' && req.method === 'POST') {
      const a = stopScan(id);
      const b = stopSwarm(id);
      return json(res, 200, { stopped: a || b });
    }
    if (sub === '/result') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      return json(res, 200, { scan, ...readFindings(id) });
    }

    if (sub === '/evidence') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      if (scan.status === 'running') return json(res, 409, { error: 'scan still running' });
      const dir = path.join(SCANS, id);
      const file = path.join(dir, 'evidence.json');
      if (!fs.existsSync(file)) {
        const r = spawnSync(process.execPath, [path.join(HERE, 'evidence_build.mjs'), dir], {
          encoding: 'utf8', timeout: 60000, cwd: HERE,
        });
        if (r.status !== 0) return json(res, 500, { error: (r.stderr || r.stdout || 'evidence build failed').slice(-400) });
      }
      try {
        return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/attack-chain') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      const file = path.join(SCANS, id, 'attack-chain.json');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'no proven attack chain for this scan' });
      try {
        return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch (err) {
        return json(res, 500, { error: String(err && err.message || err) });
      }
    }

    if (sub === '/stream') {
      const scan = readScan(id);
      if (!scan) return json(res, 404, { error: 'unknown scan' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: 'hello', scan });

      // replay everything already recorded, then go live
      try {
        const lines = fs.readFileSync(path.join(SCANS, id, 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
        for (const line of lines) { try { send({ type: 'event', line: JSON.parse(line), replay: true }); } catch {} }
      } catch {}

      const onEvt = (payload) => { try { send(payload); } catch {} };
      bus.on(id, onEvt);
      const done = readScan(id);
      if (done && done.status !== 'running') send({ type: 'done', state: done, findings: readFindings(id).findings.length });
      const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 15000);
      req.on('close', () => { clearInterval(hb); bus.off(id, onEvt); });
      return;
    }
    return json(res, 404, { error: 'not found' });
  }

  if (p === '/pricing.json') {
    try {
      const body = fs.readFileSync(path.join(HERE, 'pricing.json'), 'utf8');
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(body);
    } catch { return json(res, 404, { error: 'no pricing' }); }
  }

  // ---- static ----
  let file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!path.resolve(file).startsWith(path.resolve(PUBLIC))) return json(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

/** Build (or reuse) the PDF for a finished scan. Throws on failure. */
function buildReportPdf(id) {
  const dir = path.join(SCANS, id);
  const docx = path.join(dir, 'report.docx');
  const pdf = path.join(dir, 'report.pdf');
  const findings = path.join(dir, 'findings.json');
  const scanJson = path.join(dir, 'scan.json');

  const newest = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  const srcStamp = Math.max(newest(findings), newest(scanJson));
  if (fs.existsSync(pdf) && newest(pdf) >= srcStamp) return pdf;

  const py = spawnSync(PYTHON, [path.join(HERE, 'report_pdf.py'), dir], { encoding: 'utf8', timeout: 120000 });
  if (py.status !== 0 || !fs.existsSync(docx)) {
    throw new Error(`report build failed: ${(py.stderr || py.stdout || '').slice(-400)}`);
  }
  if (fs.existsSync(pdf)) fs.rmSync(pdf, { force: true }); // LibreOffice refuses to overwrite
  const lo = spawnSync(LO_NODE, [LO_CLI, 'convert', '--input', docx, '--output', pdf], { encoding: 'utf8', timeout: 180000 });
  if (!fs.existsSync(pdf)) {
    throw new Error(`pdf conversion failed: ${(lo.stderr || lo.stdout || '').slice(-400)}`);
  }
  return pdf;
}

// a single broken scan must never take the portal down
process.on('uncaughtException', (err) => { console.error('[uncaught]', err && err.stack || err); });
process.on('unhandledRejection', (err) => { console.error('[unhandled]', err); });

server.listen(PORT, HOST, () => {
  console.log(`HACKMYWEBSITE.AI online -> http://${HOST}:${PORT}`);
  console.log(`targets entered in the UI; write tests auto-enable only for local/private hosts`);
});
