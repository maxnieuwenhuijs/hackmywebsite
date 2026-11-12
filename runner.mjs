// runner.mjs â€” spawns `dsh headless --json`, meters real token usage, enforces budget.
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { dshLaunch, dshPricingFile } from './dsh-runtime.mjs';
import { priorContext, priorPayload } from './handoff.mjs';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const DSH_HOME = path.join(ROOT, '.dsh-home');
const SCANS = path.join(HERE, 'scans');

const PRICING = JSON.parse(fs.readFileSync(dshPricingFile(), 'utf8'));
const R = PRICING.ratesPerMillion;
// extra allowance for the post-budget debrief pass (it makes no new probes)
const DEBRIEF_USD = 0.08;
// A run that finishes on its own keeps going while budget remains, up to this many phases.
// Budget alone never made an agent work longer: it decides when it is done, so we chain phases.
const MAX_PHASES = 4;
const CONTINUE_BUDGET_FRACTION = 0.85; // stop chaining once 85% of the cap is spent
// A tool call that never returns otherwise burns the whole cap doing nothing.
const STALL_MS = 10 * 60 * 1000;

/** Merge findings across phases, keyed by title, never losing a confirmed one. */
function mergeFindings(prev, incoming) {
  const key = (f) => String(f.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const map = new Map();
  for (const f of prev || []) if (f && f.title) map.set(key(f), f);
  for (const f of incoming || []) {
    if (!f || !f.title) continue;
    const k = key(f);
    const old = map.get(k);
    const oldConfirmed = old && String(old.status || '').toUpperCase() === 'CONFIRMED';
    const newConfirmed = String(f.status || '').toUpperCase() === 'CONFIRMED';
    if (oldConfirmed && !newConfirmed) {
      map.set(k, { ...f, status: 'CONFIRMED', request: f.request || old.request, response: f.response || old.response });
    } else {
      map.set(k, { ...old, ...f });
    }
  }
  return [...map.values()];
}

// Hard goal: completion is machine-checked from the agent's own coverage report.
// Unmet items are fed back as the next phase's brief, so "I think I'm done" is not enough.
const DEFAULT_GOAL = {
  routes: 30,        // distinct routes/endpoints probed
  injection: 10,     // injection payloads sent across parameters
  methodsPerRoute: 3,// methods tried per API route
  nuclei: true,      // nuclei template run completed
  adminPages: true,  // every discovered admin page fetched anonymously
};

function goalStatus(goal, coverage) {
  const g = { ...DEFAULT_GOAL, ...(goal || {}) };
  const unmet = [];
  const routes = Number(coverage?.routesProbed ?? (Array.isArray(coverage?.routes) ? coverage.routes.length : 0));
  const injections = Number(coverage?.injectionTests || 0);
  const adminPages = Array.isArray(coverage?.adminPagesChecked) ? coverage.adminPagesChecked.length : 0;
  const methods = Number(coverage?.methodsTried || 0);

  if (routes < g.routes) unmet.push(`probe ${g.routes - routes} more distinct routes/endpoints (you reported ${routes}/${g.routes})`);
  if (injections < g.injection) unmet.push(`send ${g.injection - injections} more injection payloads across parameters (you reported ${injections}/${g.injection})`);
  if (g.nuclei && !coverage?.nucleiRun) unmet.push('run nuclei against the host and report whether it completed');
  if (g.adminPages && adminPages === 0) unmet.push('fetch every admin page you discovered anonymously and inspect its RSC payload for embedded data');
  if (methods < g.methodsPerRoute) unmet.push(`for your main API routes, try at least ${g.methodsPerRoute} HTTP methods each and record the statuses`);

  return { required: g, routes, injections, adminPages, methods, unmet, met: unmet.length === 0 };
}

function buildGoalPrompt(unmet) {
  return `Continue the SAME authorized engagement. You are NOT done: the coverage goal is unmet.

Still missing:
${unmet.map((u) => '- ' + u).join('\n')}

Do that work now, against the target only. Keep the earlier rules: no destructive writes,
no DoS, <=50 requests/minute, prove and move on.

When finished, end with ONE fenced json block containing:
- "findings": EVERY finding confirmed across the whole engagement (not just this phase)
- "tested": one "route - outcome" line per check, including the clean ones
- "coverage": {"routesProbed":N,"routes":["GET /api/x - 401",...],"methodsTried":N,
  "injectionTests":N,"adminPagesChecked":["/admin/alerts",...],"nucleiRun":true}
- "summary", "blocked"`;
}

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const live = new Map(); // id -> { child, state }
const watchdogs = new Map(); // id -> interval

/** USD for one step_end usage record. All three buckets cost real money. */
export function costOf(u) {
  if (!u) return 0;
  const i = Number(u.inputTokens || 0);
  const o = Number(u.outputTokens || 0);
  const c = Number(u.cacheReadTokens || 0);
  return (i * R.input + o * R.output + c * R.cacheRead) / 1e6;
}

export function apiKey() {
  if (process.env.ORCAROUTER_API_KEY) return process.env.ORCAROUTER_API_KEY;
  try {
    const y = fs.readFileSync('C:\\Users\\maxni\\.dsh\\.credentials.yaml', 'utf8');
    const m = y.match(/ORCAROUTER_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  } catch {}
  return '';
}

/** Local/private targets may receive write tests; public hosts stay read-only. */
export function isLocalTarget(urlStr) {
  let h = '';
  try { h = new URL(urlStr).hostname.toLowerCase(); } catch { return false; }
  if (h === 'localhost' || h.endsWith('.local') || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) { const n = Number(m[1]); if (n >= 16 && n <= 31) return true; }
  return false;
}

function scanDir(id) { return path.join(SCANS, id); }
export function readScan(id) {
  try { return JSON.parse(fs.readFileSync(path.join(scanDir(id), 'scan.json'), 'utf8')); }
  catch { return null; }
}
export function readFindings(id) {
  try { return JSON.parse(fs.readFileSync(path.join(scanDir(id), 'findings.json'), 'utf8')); }
  catch { return { findings: [], summary: '', blocked: '' }; }
}
export function listScans() {
  try {
    return fs.readdirSync(SCANS)
      .map((id) => readScan(id))
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  } catch { return []; }
}

function save(id, state) {
  fs.writeFileSync(path.join(scanDir(id), 'scan.json'), JSON.stringify(state, null, 2));
}

function emit(id, payload) {
  bus.emit(id, payload);
}

/** Extract the findings JSON block from the agent's final message. */
function parseFindings(text) {
  if (!text) return null;
  const blocks = [...String(text).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks.reverse()) {
    try {
      const o = JSON.parse(b);
      if (o && Array.isArray(o.findings)) return o;
      if (Array.isArray(o)) return { findings: o, summary: '', blocked: '' };
    } catch {}
  }
  const start = String(text).lastIndexOf('{"findings"');
  if (start >= 0) {
    try { return JSON.parse(String(text).slice(start)); } catch {}
  }
  return null;
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {}
}

export function stopScan(id) {
  const rec = live.get(id);
  if (!rec) return false;
  rec.state.stopRequested = true;
  killTree(rec.child);
  return true;
}

/**
 * Start one scan: spawn the agent, stream NDJSON, meter cost, kill at budget.
 */
export function startScan({ id, url, budgetUsd, mode = 'recon', aggressive = false }) {
  const dir = scanDir(id);
  fs.mkdirSync(dir, { recursive: true });

  // aggressive runs are allowed to change the target, but only objects they create
  const allowWrite = aggressive ? true : isLocalTarget(url);
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const state = {
    id, url, host, budgetUsd, allowWrite, mode, aggressive,
    status: 'running', phase: 'scan',
    startedAt: Date.now(), endedAt: null,
    spentUsd: 0, steps: 0,
    tokens: { input: 0, output: 0, cacheRead: 0 },
    chars: 0, lastText: '', exitCode: null, error: null,
  };
  save(id, state);

  const wantPentest = mode === 'pentest' && fs.existsSync(path.join(HERE, 'prompts', 'pentest.md'));
  const promptFile = wantPentest
    ? path.join(HERE, 'prompts', 'pentest.md')
    : path.join(HERE, 'prompts', 'scan.md');
  const prior = priorPayload(host, id);
  const prompt = fs.readFileSync(promptFile, 'utf8')
    .replaceAll('{{URL}}', url)
    .replaceAll('{{HOST}}', host)
    .replaceAll('{{ALLOW_WRITE}}', aggressive
      ? 'ON - the owner authorized state-changing tests on their own system. Follow Phase 6: create your own test objects, prove impact on those only, revert and prove the revert.'
      : (allowWrite ? 'ON (this is a local/private target)' : 'OFF (public host: read-only)'))
    .replaceAll('{{BUDGET_USD}}', budgetUsd.toFixed(2));

  const history = priorContext(host, id);
  const promptWithHistory = history
    ? `${prompt}\n\n${history}`
    : prompt;
  state.previousScanId = prior?.scanId || null;
  save(id, state);

  // an aggressive engagement is held to a higher coverage bar
  state.goal = aggressive
    ? { routes: 60, injection: 25, methodsPerRoute: 5, nuclei: true, adminPages: true }
    : DEFAULT_GOAL;

  const eventsFile = fs.createWriteStream(path.join(dir, 'events.jsonl'), { flags: 'a' });

  const launch = dshLaunch();
  const env = {
    ...process.env,
    ...launch.env,
    // nuclei cannot write its config under the real %APPDATA%; redirect it into the workspace
    APPDATA: path.join(ROOT, '.nuclei-appdata'),
    // per-scan nuclei scope; harmless when nuclei is not wired up
    NUCLEI_ALLOWED_TARGETS: `localhost,127.0.0.1,${host}`,
  };

  let child;
  try {
    // cwd is the hackmywebsite folder so the agent's `node probe.mjs ...` resolves to OUR
    // helper, instead of the agent inventing its own copy in the workspace root
    child = spawn(launch.command, launch.args, {
      cwd: HERE, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    state.status = 'ERROR';
    state.error = `spawn failed: ${err && err.message || err}`;
    state.endedAt = Date.now();
    save(id, state);
    return state;
  }
  // the prompt goes in over stdin: no shell quoting, newlines and quotes survive intact
  child.stdin.on('error', () => {});
  child.stdin.end(promptWithHistory, 'utf8');
  live.set(id, { child, state });

  // stall watchdog: a tool call that never returns must not silently eat the cap
  const wd = setInterval(() => {
    const rec = live.get(id);
    if (!rec) { clearInterval(wd); watchdogs.delete(id); return; }
    const st = rec.state;
    if (st.status !== 'running' && st.status !== 'BUDGET_EXHAUSTED') return;
    const idle = Date.now() - (st.lastEventAt || st.startedAt || Date.now());
    if (idle > STALL_MS) {
      st.stalled = true;
      st.error = `no output for ${Math.round(idle / 1000)}s at step ${st.steps} - killed the stuck call`;
      save(id, st);
      emit(id, { type: 'stall', state: st });
      killTree(rec.child);
    }
  }, 30000);
  watchdogs.set(id, wd);

  let buf = '';
  let stderr = '';
  let finalText = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      eventsFile.write(line + '\n');
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      state.lastEventAt = Date.now();
      if (evt.type === 'session' && evt.sessionId) state.sessionId = evt.sessionId;
      handleEvent(id, state, evt, (acc, txt) => {
        if (evt.type === 'text' && txt) { state.lastText = txt.slice(-4000); }
        if (evt.type === 'final' && txt) { finalText = txt; }
      });
      emit(id, { type: 'event', line: evt });
      // the CLI sometimes lingers after emitting its report; force the close so the
      // results are collected instead of waiting forever on a finished run
      if (evt.type === 'final') {
        setTimeout(() => {
          const rec = live.get(id);
          if (rec && rec.child === child) killTree(child);
        }, 20000);
      }
      if (state.spentUsd >= state.budgetUsd && state.status === 'running') {
        state.status = 'BUDGET_EXHAUSTED';
        state.error = `Budget of $${state.budgetUsd.toFixed(2)} reached after ${state.steps} steps`;
        killTree(child);
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { stderr += c; if (stderr.length > 8000) stderr = stderr.slice(-8000); });

  child.on('error', (err) => {
    state.status = 'ERROR'; state.error = String(err && err.message || err);
    state.endedAt = Date.now();
    save(id, state);
    eventsFile.end();
    live.delete(id);
    emit(id, { type: 'done', state });
  });

  const finish = (text, errText) => {
    const wd = watchdogs.get(id);
    if (wd) { clearInterval(wd); watchdogs.delete(id); }
    state.endedAt = Date.now();
    const parsed = parseFindings(text);
    const findings = parsed && parsed.findings ? parsed.findings : [];
    const out = {
      findings: findings.map((f, i) => ({ id: `F-${String(i + 1).padStart(2, '0')}`, ...f })),
      summary: (parsed && parsed.summary) || '',
      blocked: (parsed && parsed.blocked) || '',
      tested: (parsed && parsed.tested) || [],
      coverage: (parsed && parsed.coverage) || null,
      writeActions: (parsed && parsed.writeActions) || [],
      impactProof: (parsed && parsed.impactProof) || [],
      finalText: text ? text.slice(0, 20000) : '',
      stderr: (errText || '').slice(-4000),
    };
    fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(out, null, 2));
    save(id, state);
    eventsFile.end();
    live.delete(id);
    emit(id, { type: 'done', state, findings: out.findings.length });
  };

  child.on('close', (code) => {
    state.exitCode = code;
    // a stalled call was killed by the watchdog: keep the engagement moving
    if (state.stalled && state.status === 'running') state.status = 'COMPLETE';
    if (state.status === 'running') {
      state.status = code === 0 ? 'COMPLETE' : 'ERROR';
      state.endedAt = Date.now();
      if (code !== 0 && !state.error) state.error = (stderr.trim() || `exit code ${code}`).slice(-1500);
    }
    proceed(finalText, stderr);
  });

  /** Persist what we have, then either chain another phase or finish.
   *  Declared as a hoisted function so an immediate child error cannot hit the TDZ. */
  function proceed(text, errText) {
    const parsed = parseFindings(text);
    // read what previous phases already recorded: an empty phase must never erase them
    let prev = { findings: [] };
    try { prev = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8')); } catch {}
    const merged = mergeFindings(prev.findings || [], (parsed && parsed.findings) || []);
    if (merged.length || !(prev.findings || []).length) {
      const out = {
        findings: merged.map((f, i) => ({ id: `F-${String(i + 1).padStart(2, '0')}`, ...f })),
        summary: (parsed && parsed.summary) || prev.summary || '',
        blocked: (parsed && parsed.blocked) || prev.blocked || '',
        tested: (parsed && parsed.tested) || prev.tested || [],
        coverage: (parsed && parsed.coverage) || prev.coverage || null,
        writeActions: (parsed && parsed.writeActions) || prev.writeActions || [],
        impactProof: (parsed && parsed.impactProof) || prev.impactProof || [],
        finalText: text ? text.slice(0, 20000) : (prev.finalText || ''),
        stderr: (errText || '').slice(-4000),
      };
      try { fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(out, null, 2)); } catch {}
      emit(id, { type: 'findings', state, count: out.findings.length });
    }

    const phases = state.phases || 1;
    const hasRoom = state.spentUsd < state.budgetUsd * CONTINUE_BUDGET_FRACTION;
    state.goal = state.goal || DEFAULT_GOAL;
    const g = goalStatus(state.goal, parsed && parsed.coverage);
    state.goalProgress = {
      routes: g.routes, injections: g.injections, adminPages: g.adminPages,
      methods: g.methods, met: g.met, unmet: g.unmet.length,
    };
    save(id, state);
    emit(id, { type: 'goal', state });

    if (state.status === 'COMPLETE' && state.sessionId && phases < MAX_PHASES && hasRoom) {
      state.phases = phases + 1;
      state.phase = 'continue-' + state.phases;
      state.status = 'running';
      state.endedAt = null;
      save(id, state);
      emit(id, { type: 'phase', state });
      const brief = g.met ? CONTINUE_PROMPT : buildGoalPrompt(g.unmet);
      runContinuation({ id, state, env, sessionId: state.sessionId, eventsFile, promptText: brief, onDone: proceed });
      return;
    }

    // out of phases or budget with the goal still unmet: say so instead of claiming success
    if (state.status === 'COMPLETE' && !g.met) {
      state.status = 'GOAL_NOT_MET';
      state.error = 'Coverage goal unmet: ' + g.unmet.join('; ');
      save(id, state);
    }

    if (state.status === 'BUDGET_EXHAUSTED' && state.sessionId && !state.debriefed) {
      state.debriefed = true;
      state.phase = 'debrief';
      save(id, state);
      emit(id, { type: 'debrief', state });
      runDebrief({ id, state, env, sessionId: state.sessionId, eventsFile, finish });
      return;
    }

    finish(text, errText);
  }

  return state;
}

const DEBRIEF_PROMPT = `Stop probing. You are out of budget.

Do not run any commands and do not make any further requests to the target.

From what you ALREADY observed in this session, produce your final message now:
a short plain-text summary, then exactly ONE fenced json block in the required shape
{"findings":[...],"summary":"...","blocked":"..."}.

Rules:
- Only include what you actually observed. Mark anything unconfirmed as SUSPECTED.
- Include the exact request you ran and the response you saw, for each finding.
- If you confirmed nothing, return an empty findings array and say which requests were
  correctly rejected.`;

/** Post-budget pass: same session, no new probing, produce the report. */
function runDebrief({ id, state, env, sessionId, eventsFile, finish }) {
  const launch = dshLaunch(sessionId);
  let child;
  try {
    child = spawn(launch.command, launch.args, {
      cwd: ROOT, env: { ...env, ...launch.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    return finish('', `debrief spawn failed: ${err && err.message || err}`);
  }
  child.stdin.on('error', () => {});
  child.stdin.end(DEBRIEF_PROMPT, 'utf8');
  live.set(id, { child, state });

  let buf = '';
  let dbText = '';
  let dbErr = '';
  let dbSpent = 0;
  const hardStop = setTimeout(() => killTree(child), 150000);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      eventsFile.write(line + '\n');
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      state.lastEventAt = Date.now();
      if (evt.type === 'status' && evt.phase === 'step_end') {
        const c = costOf(evt.usage);
        dbSpent += c;
        state.debriefUsd = (state.debriefUsd || 0) + c;
        state.spentUsd += c;
        state.steps += 1;
        save(id, state);
        emit(id, { type: 'cost', state });
        if (dbSpent >= DEBRIEF_USD) killTree(child);
      }
      if (evt.type === 'final' && evt.text) dbText = evt.text;
      emit(id, { type: 'event', line: evt });
      // the CLI sometimes lingers after emitting its report; force the close so the
      // results are collected instead of waiting forever on a finished run
      if (evt.type === 'final') {
        setTimeout(() => {
          const rec = live.get(id);
          if (rec && rec.child === child) killTree(child);
        }, 20000);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { dbErr += c; });

  const done = () => { clearTimeout(hardStop); state.phase = 'done'; finish(dbText, dbErr); };
  child.on('error', done);
  child.on('close', done);
}

const CONTINUE_PROMPT = `Continue the SAME authorized engagement. Do not summarise and do not stop yet.

Budget remains. Your job now is coverage, not a verdict.

Keep attacking, and work through whatever you have NOT yet cleared:
1. Every endpoint you discovered: test GET, POST, PUT, PATCH, DELETE and OPTIONS. Note the
   status for each, including the ones that correctly reject you.
2. Every admin page you found: fetch it anonymously and inspect the RSC flight payload for
   embedded data (customer rows, tokens, internal IDs, config).
3. Every parameter you have seen: send injection payloads (SQLi boolean and time-based,
   XSS, path traversal, template injection), and note validation behaviour.
4. Access control: adjacent object IDs, forced browsing into /api and /admin variants,
   method override headers, CORS with credentials, cache deception.
5. Re-run nuclei with more template classes if you have not: exposures, misconfiguration,
   default-logins, takeovers, cves.
6. Any area from the original brief you skipped.

Rules unchanged: no destructive writes, no DoS, <=50 requests/minute, prove and move on,
mark CONFIRMED only with the response in hand.

Your final message must again end with ONE fenced json block containing **every finding you
have confirmed across this whole engagement** (not only this phase), plus "summary",
"blocked" and "tested" (route - outcome for each check, including clean ones).`;

/** Extra coverage phase: same session, probing allowed, budget still enforced. */
function runContinuation({ id, state, env, sessionId, eventsFile, promptText, onDone }) {
  const launch = dshLaunch(sessionId);
  let child;
  try {
    child = spawn(launch.command, launch.args, {
      cwd: HERE, env: { ...env, ...launch.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    return onDone('', `continuation spawn failed: ${err && err.message || err}`);
  }
  child.stdin.on('error', () => {});
  child.stdin.end(promptText || CONTINUE_PROMPT, 'utf8');
  live.set(id, { child, state });

  let buf = '';
  let text = '';
  let err = '';
  const hardStop = setTimeout(() => killTree(child), 900000);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      eventsFile.write(line + '\n');
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      state.lastEventAt = Date.now();
      if (evt.type === 'session' && evt.sessionId) state.sessionId = evt.sessionId;
      if (evt.type === 'status' && evt.phase === 'step_end') {
        const u = evt.usage || {};
        state.steps = evt.step || state.steps + 1;
        state.tokens.input += Number(u.inputTokens || 0);
        state.tokens.output += Number(u.outputTokens || 0);
        state.tokens.cacheRead += Number(u.cacheReadTokens || 0);
        state.spentUsd += costOf(u);
        save(id, state);
        emit(id, { type: 'cost', state });
        if (state.spentUsd >= state.budgetUsd && state.status !== 'BUDGET_EXHAUSTED') {
          state.status = 'BUDGET_EXHAUSTED';
          state.error = `Budget of $${state.budgetUsd.toFixed(2)} reached after ${state.steps} steps`;
          save(id, state);
          killTree(child);
        }
      }
      if (evt.type === 'text' && evt.text) {
        state.chars += evt.text.length;
        save(id, state);
      }
      if (evt.type === 'final' && evt.text) text = evt.text;
      emit(id, { type: 'event', line: evt });
      // the CLI sometimes lingers after emitting its report; force the close so the
      // results are collected instead of waiting forever on a finished run
      if (evt.type === 'final') {
        setTimeout(() => {
          const rec = live.get(id);
          if (rec && rec.child === child) killTree(child);
        }, 20000);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { err += c; if (err.length > 8000) err = err.slice(-8000); });

  const done = () => { clearTimeout(hardStop); onDone(text, err); };
  child.on('error', done);
  child.on('close', done);
}

function handleEvent(id, state, evt, note) {
  if (evt.type === 'status' && evt.phase === 'step_end') {
    state.steps = evt.step || state.steps + 1;
    const u = evt.usage || {};
    state.tokens.input += Number(u.inputTokens || 0);
    state.tokens.output += Number(u.outputTokens || 0);
    state.tokens.cacheRead += Number(u.cacheReadTokens || 0);
    state.spentUsd += costOf(u);
    save(id, state);
    emit(id, { type: 'cost', state });
  } else if (evt.type === 'text' && evt.text) {
    state.chars += evt.text.length;
    save(id, state);
    emit(id, { type: 'text', state, text: evt.text });
  } else if (evt.type === 'final' && evt.text) {
    save(id, state);
  } else if (evt.type === 'status' && evt.phase === 'turn_end') {
    emit(id, { type: 'turn_end', reason: evt.reason });
  }
  if (note) note(state, evt.text);
}
