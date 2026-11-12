// swarm.mjs - multi-agent engagement.
// Several specialised agents run concurrently on one target. Each has its own budget
// slice, its own event log, and a success test. An agent that fails its test is killed;
// survivors are re-briefed for another round, and non-survivors get up to MAX_RETRIES
// fresh-angle retries while budget remains.
// Agents talk through board.jsonl (append-only) using board.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { costOf, bus } from './runner.mjs';
import { dshLaunch } from './dsh-runtime.mjs';
import { priorContext, priorPayload } from './handoff.mjs';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const SCANS = path.join(HERE, 'scans');
const DSH_EXE = 'C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe';
const DSH_CLI = 'C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js';
const DSH_HOME = path.join(ROOT, '.dsh-home');

const MAX_CONCURRENT = 6;
const MAX_ROUNDS = 8;
// Persistence: a clean area, a failed success test or a missing report gets another
// look from a different angle before we accept the area as quiet.
const MAX_RETRIES = 5;
const RETRY_SLICE_FACTOR = 0.65;
const MAX_AGENTS = 32;
const BUDGET_STOP_FRACTION = 0.995;
const STALL_MS = 12 * 60 * 1000;

export function capacityFor(budgetUsd) {
  return {
    maxConcurrent: Math.min(MAX_CONCURRENT, Math.max(4, Math.ceil(budgetUsd / 2))),
    agentCap: Math.min(MAX_AGENTS, Math.max(12, Math.ceil(budgetUsd * 3))),
    maxRounds: MAX_ROUNDS,
    maxRetries: MAX_RETRIES,
    retrySliceFactor: RETRY_SLICE_FACTOR,
    budgetStopFraction: BUDGET_STOP_FRACTION,
    stallMs: STALL_MS,
  };
}

/** Roles: brief + what counts as success. Slice is a share of the total budget. */
const ROLES = [
  {
    id: 'mapper',
    title: 'Surface mapper',
    slice: 0.17,
    brief: `Map the attack surface and publish it for the others.
- Enumerate routes from robots.txt, sitemap.xml, JS chunks, RSC payloads and forced browsing.
- Record every route with its status in coverage.routes.
- Post the endpoint list and anything interesting (auth boundaries, admin pages, params) to the board.
You succeed when coverage.routesProbed >= 40 and the board has your endpoint list.`,
    success: (j) => (j?.coverage?.routesProbed || 0) >= 25 || (j?.coverage?.routes || []).length >= 25,
    angles: [
      'query parameters on every page, and the internals of RSC payloads',
      'deep parse of JS chunks for hidden routes, plus a sitemap driven sweep of every URL',
      'error pages, OPTIONS/TRACE behaviour, cache variants and every sitemap entry',
      'backup, debug and config files; source maps; API version prefixes; GraphQL introspection',
      'take the shortest route to impact: find the one page a real attacker would open first, then map every door around it',
    ],
  },
  {
    id: 'authz',
    title: 'Access-control breaker',
    slice: 0.28,
    brief: `Break access control. This is the highest-value role.
- Read the board first for endpoints and admin pages the mapper found.
- Attack: unauthenticated admin pages and their RSC payloads, IDOR on object ids,
  forced browsing, method override, header spoofing, forged sessions, cross-account reads.
- Report every confirmed read of data that should need a login.
You succeed when you report at least one CONFIRMED finding.`,
    // any confirmed finding counts: category naming varies between runs
    // volume counts too: five findings terminated as 'failed' reads as a bug, not discipline
    success: (j) => (j?.findings || []).some((f) => /CONFIRMED/i.test(String(f.status || ''))) || (j?.findings || []).length >= 3,
    angles: [
      'forged and replayed sessions, method override headers, and path prefix or suffix tricks',
      'IDOR on numeric ids and cross-account reads with a second test account, including RSC data streams',
      'header spoofing, cache deception and every admin or API route variant you have not tried',
      'business logic: change price, role, owner, tenant or quantity fields in multi-step flows; race the final confirmation',
      'password reset, invite, OAuth redirect and session-fixation paths; then try to turn a low role into a high one without touching data',
    ],
  },
  {
    id: 'injector',
    title: 'Injection specialist',
    slice: 0.20,
    brief: `Hunt injection and input handling flaws.
- Read the board for parameters the mapper found.
- SQLi (boolean and time-based), XSS in HTML and RSC payloads, path traversal, template
  injection, prototype pollution, SSRF through image/url parameters.
- Record payload counts in coverage.injectionTests.
You succeed when coverage.injectionTests >= 25, or you confirm a real injection finding.`,
    success: (j) => (j?.coverage?.injectionTests || 0) >= 25 || (j?.findings || []).some((f) => /CONFIRMED/i.test(String(f.status || ''))),
    angles: [
      'time based blind injection, JSON body fuzzing and header injection',
      'unicode and double encoding, template syntax, and second order payloads through stored fields',
      'SSRF through URL and image parameters, prototype pollution and RSC payload injection',
      'client-side execution: DOM XSS, dangerous sinks, postMessage, open redirects and JSONP',
      'deserialization, file upload and path handling, NoSQL operators, CRLF and request smuggling style parsing gaps',
    ],
  },
  {
    id: 'exploiter',
    title: 'Impact prover',
    slice: 0.25,
    brief: `Prove blast radius, not just presence of bugs. You are the only role allowed to write.
- Read the board for confirmed weaknesses.
- Create your own hackmywebsite-test-* objects, then use the weaknesses to modify, delete or
  escalate THOSE objects only. Revert each change and prove the revert.
- Every state change goes in writeActions with reverted:true and a revertProof.
You succeed when at least one writeAction is reverted with proof, or you record impactProof.`,
    success: (j) => (j?.writeActions || []).some((w) => w.reverted) || (j?.impactProof || []).length > 0,
    angles: [
      'token replay against other objects, and cloned test objects to prove reach',
      'privilege fields on self created records, and proving the revert with a second request',
      'a cross-account proof with a second test account, plus a full revert chain',
      'chain small bugs into one story: read, escalate, pivot, and show what a real attacker could take',
      'prove the worst realistic outcome with the minimum number of steps; document what stopped a full takeover',
    ],
  },
  {
    id: 'chain',
    title: 'Chain builder',
    slice: 0.10,
    brief: `Turn separate findings into one believable story.
- Read the board and pick two or three confirmed weaknesses.
- Build the shortest end-to-end path: enter, escalate, read, pivot, and say what a real
  attacker would take. Prove each step with a request and a response.
- Do not write. Hand the write proof to the exploiter. Post the chain as leads and findings.
You succeed when you report at least one confirmed chain step, or an impactProof.`,
    success: (j) => (j?.findings || []).length > 0 || (j?.impactProof || []).length > 0,
    angles: [
      'join a read-only bug to an auth bug and show the data a real attacker would reach',
      'take the least severe finding and walk it forward until it becomes a business impact',
      'look for the one step everyone else skipped: role change, tenant change, or a second app',
      'test whether the chain still works after a fresh login and a normal user session',
    ],
  },
];

const live = new Map();
export const swarmBus = new Map(); // id -> EventEmitter-like via callback list

function save(dir, state) {
  fs.writeFileSync(path.join(dir, 'scan.json'), JSON.stringify(state, null, 2));
}
function readFindings(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8')); } catch { return { findings: [] }; }
}
function readDossier(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'dossier.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}
function appendDossier(dir, texts, meta = {}) {
  const list = Array.isArray(texts) ? texts : (texts ? [texts] : []);
  const clean = list
    .map((text) => {
      const flat = String(text || '').replace(/\s+/g, ' ').trim();
      const sentences = flat.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [flat];
      return sentences.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim().slice(0, 600);
    })
    .filter(Boolean)
    .slice(0, 3);
  if (!clean.length) return readDossier(dir).length;
  const existing = readDossier(dir);
  const seen = new Set(existing.map((entry) => String(entry.text || '').trim()));
  const rows = [];
  for (const text of clean) {
    if (seen.has(text)) continue;
    seen.add(text);
    rows.push({
      ts: new Date().toISOString(),
      from: meta.role || 'agent',
      agent: meta.agent || '',
      round: meta.round || 0,
      retry: meta.retry || 0,
      type: 'thought',
      text,
      source: 'final',
    });
  }
  if (rows.length) fs.appendFileSync(path.join(dir, 'dossier.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return readDossier(dir).length;
}
function parseJson(text) {
  const blocks = [...String(text || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks.reverse()) {
    try { const o = JSON.parse(b); if (o && Array.isArray(o.findings)) return o; } catch {}
  }
  return null;
}
function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  } catch {}
}

function rolePrompt(role, ctx) {
  return `You are ONE agent in a multi-agent engagement against ${ctx.url} (${ctx.host}).
MODE: ${ctx.mode === 'recon'
  ? 'RECON. Read-only by design: map and observe, never change data.'
  : (ctx.aggressive ? 'ACTIVE PENTEST with exploitation: state changes allowed on objects YOU create.' : 'ACTIVE PENTEST, read-only on state.')}
Your role: ${role.title} (id: ${role.id})
${ctx.history ? `## Previous engagement on this target
${ctx.history}

` : ''}${ctx.retry ? `ATTEMPT ${ctx.retry + 1}. A previous pass by this role found nothing. Do not repeat
the same checks. Use this angle instead: ${ctx.angle}` : ''}

${role.brief}

## Shared board
Other agents are working the same target right now. Read the board before you start and
post what you learn:
  node board.mjs read
  node board.mjs post --from ${role.id} --type finding|lead|endpoint --text "..."

## Real goal
Do not stop at a checklist. Your real goal is the shortest path from the outside to
data, money, admin or trust. Form two or three concrete hypotheses about how this
business could be hurt, then test the one that would hurt most. A clean route is not
a reason to stop; it is information about where to look next.

## Dossier
The owner reads this. Post one to three short thoughts in normal language, max three
sentences each. No jargon, no flags, tokens or secrets. Say what you tried, what
surprised you, what you want to try next. Add the same lines as "thoughts" in the
final JSON.
  node dossier.mjs post --from ${role.id} --text "..."

## Rules
- No denial of service, <=50 requests/minute, never touch real customer/staff/admin records.
${ctx.mode === 'recon'
  ? '- RECON: do not send any state-changing request. GET/HEAD/OPTIONS only.'
  : (role.id === 'exploiter'
    ? '- You are the ONLY agent allowed to change data. Only objects you created, and always revert.'
    : '- Do NOT send state-changing requests (POST/PUT/PATCH/DELETE that persist). Read and probe only.')}
- Stay in your lane: another agent owns that area. Post a lead instead.
- Budget slice: $${ctx.sliceUsd.toFixed(2)}. The portal kills you when it is spent.

## Persistence
- Use your full slice. A clean first pass is not a stop signal.
- Keep a short checklist of untested routes, parameters, methods and roles, and work it down.
- If one vector fails, pivot to the next. Read the board before each major move.
- When you confirm something, post it, prove it, then look next door.
- Be aggressive in coverage, never destructive. The rules above still apply.
- Leave one to three short dossier lines even when you are out of luck. Silence is a bad story.
- Finish with the JSON block even if you are nearly out of budget. A missing report is a failed agent.

## Output contract
End with ONE fenced json block:
{"findings":[{"title":"...","severity":"critical|high|medium|low|info","status":"CONFIRMED|SUSPECTED",
"endpoint":"METHOD /path","vector":"short class","evidence":{"request":"exact request line, headers and body",
"response":"exact status and body excerpt that proves it","observed":"what this proves","flag":"HMW{...}"},
"flag":"HMW{...}","confirmed":true}],"coverage":{"routesProbed":0,"routes":[],"methodsTried":0,"injectionTests":0,
"adminPagesChecked":[],"nucleiRun":false},"writeActions":[],"impactProof":[],
"thoughts":["short human thought","second thought"],
"summary":"","blocked":"","tested":[]}

Every CONFIRMED finding must include evidence.request, evidence.response and evidence.observed.
A finding without those fields is treated as SUSPECTED and does not prove impact.`;
}

/** Run one agent round. Resolves with its parsed report. */
function runAgent({ id, dir, state, role, round, sliceUsd, env, emit, retry = 0, angle = null, history = '' }) {
  const agentId = retry ? `${role.id}-r${round}-retry${retry}` : `${role.id}-r${round}`;
  const agentDir = path.join(dir, 'agents', agentId);
  fs.mkdirSync(agentDir, { recursive: true });
  const events = fs.createWriteStream(path.join(agentDir, 'events.jsonl'), { flags: 'a' });

  const rec = {
    id: agentId, role: role.id, title: role.title, round, retry, angle,
    objective: retry ? `retry with a new angle: ${angle}` : role.brief.split('\n')[0],
    sliceUsd, spentUsd: 0, steps: 0, status: 'running',
    findings: 0, survived: null, startedAt: Date.now(), endedAt: null, error: null,
  };
  state.agents[agentId] = rec;
  save(dir, state);
  emit({ type: 'agent', state, agent: rec });

  const prompt = rolePrompt(role, { url: state.url, host: state.host, aggressive: state.aggressive, mode: state.mode, sliceUsd, retry, angle, history });

  let child;
  try {
    const launch = dshLaunch();
    child = spawn(launch.command, launch.args, {
      cwd: HERE, env: { ...env, ...launch.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    rec.status = 'failed'; rec.error = String(err.message || err);
    return Promise.resolve({ rec, report: null });
  }
  child.stdin.on('error', () => {});
  child.stdin.end(prompt, 'utf8');
  live.set(agentId, { child, rec, scanId: id });

  let buf = '';
  let text = '';
  let lastEvent = Date.now();
  const hardStop = setTimeout(() => killTree(child), 45 * 60 * 1000);
  const wd = setInterval(() => {
    if (rec.status !== 'running') return;
    if (Date.now() - lastEvent > STALL_MS) {
      rec.error = 'stalled - killed';
      killTree(child);
    }
  }, 30000);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      events.write(line + '\n');
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      lastEvent = Date.now();
      if (evt.type === 'status' && evt.phase === 'step_end') {
        const c = costOf(evt.usage || {});
        rec.spentUsd += c;
        rec.steps = evt.step || rec.steps + 1;
        state.spentUsd = (state.spentUsd || 0) + c;
        state.steps = (state.steps || 0) + 1;
        save(dir, state);
        emit({ type: 'cost', state, agent: rec });
        if (rec.spentUsd >= sliceUsd) {
          rec.error = 'budget slice exhausted';
          killTree(child);
        }
        if (state.spentUsd >= state.budgetUsd) {
          state.status = 'BUDGET_EXHAUSTED';
          killTree(child);
        }
      }
      if (evt.type === 'final' && evt.text) text = evt.text;
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { if (rec.stderr) rec.stderr += c; else rec.stderr = c; });

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(hardStop);
      clearInterval(wd);
      events.end();
      live.delete(agentId);
      const report = parseJson(text);
      rec.endedAt = Date.now();
      rec.findings = report?.findings?.length || 0;
      rec.steps = rec.steps || 0;
      rec.status = report ? 'completed' : (rec.error ? 'failed' : 'completed-no-report');

      // survival rule: an agent that cannot show its evidence does not continue.
      // A clean area is not a failure: an agent that did the work and found nothing is
      // recorded as "terminated without findings - area may be clean".
      let survived = false;
      try { survived = !!report && role.success(report) && rec.spentUsd > 0; } catch { survived = false; }
      rec.survived = survived;
      rec.tested = Array.isArray(report?.tested) ? report.tested.length : 0;
      rec.findings = report?.findings?.length || 0;

      if (survived) {
        rec.outcome = 'survived';
      } else if (!report) {
        rec.outcome = 'no-report';
        if (!rec.error) rec.error = 'terminated: no report produced';
      } else if (rec.findings === 0) {
        rec.outcome = 'clean';
        rec.error = 'terminated without findings - area may be clean';
      } else {
        rec.outcome = 'test-failed';
        if (!rec.error) rec.error = 'terminated: did not meet its success test';
      }
      save(dir, state);
      emit({ type: 'agent', state, agent: rec });
      resolve({ rec, report, text });
    };
    child.on('error', done);
    child.on('close', done);
  });
}

/** Merge one agent's report into the engagement findings file. */
export function mergeReport(dir, report, meta = {}) {
  const prev = readFindings(dir);
  const key = (f) => String(f.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizeEvidence = (f) => {
    const out = { ...f };
    const evidence = (out.evidence && typeof out.evidence === 'object' && !Array.isArray(out.evidence))
      ? { ...out.evidence }
      : (typeof out.evidence === 'string' && out.evidence.trim() ? { observed: out.evidence } : {});
    if (out.request && !evidence.request) evidence.request = out.request;
    if (out.response && !evidence.response) evidence.response = out.response;
    if (out.flag && !evidence.flag) evidence.flag = out.flag;
    out.evidence = evidence;
    return out;
  };
  const map = new Map();
  for (const f of prev.findings || []) map.set(key(f), f);
  for (const f of (report?.findings || [])) {
    if (!f || !f.title) continue;
    const old = map.get(key(f));
    const next = normalizeEvidence(f);
    map.set(key(f), {
      ...old,
      ...next,
      evidence: { ...(old?.evidence || {}), ...(next.evidence || {}) },
    });
  }
  const out = {
    ...prev,
    findings: [...map.values()].map((f, i) => ({ id: `F-${String(i + 1).padStart(2, '0')}`, ...f })),
    summary: report?.summary || prev.summary || '',
    blocked: report?.blocked || prev.blocked || '',
    tested: [...(prev.tested || []), ...(report?.tested || [])].slice(-400),
    coverage: report?.coverage || prev.coverage || null,
    writeActions: [...(prev.writeActions || []), ...(report?.writeActions || [])],
    impactProof: [...new Set([...(prev.impactProof || []), ...(report?.impactProof || [])])],
  };
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(out, null, 2));
  appendDossier(dir, report?.thoughts, meta);
  return out.findings.length;
}

export async function startSwarm({ id, url, budgetUsd, aggressive, consent, mode = 'swarm' }) {
  const dir = path.join(SCANS, id);
  fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'board.jsonl'), '');
  fs.writeFileSync(path.join(dir, 'dossier.jsonl'), '');

  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const prior = priorPayload(host, id);
  const priorHistory = priorContext(host, id);
  const state = {
    id, url, host, budgetUsd, mode, aggressive: !!aggressive, consent: consent || null,
    allowWrite: !!aggressive, status: 'running', phase: 'swarm', swarm: true,
    startedAt: Date.now(), endedAt: null, spentUsd: 0, steps: 0, rounds: 0,
    agents: {}, findings: 0, dossier: 0, previousScanId: prior?.scanId || null,
  };
  save(dir, state);

  const listeners = new Set();
  // reuse the runner's SSE bus so the portal streams swarm events with no extra plumbing
  const emit = (e) => bus.emit(id, e);
  swarmBus.set(id, { emit, listeners, state });

  const launch = dshLaunch();
  const env = {
    ...process.env,
    ...launch.env,
    APPDATA: path.join(ROOT, '.nuclei-appdata'),
    NUCLEI_ALLOWED_TARGETS: `localhost,127.0.0.1,${host}`,
    HACKMYWEBSITE_SCAN_ID: id,
    HACKMYWEBSITE_BOARD: path.join(dir, 'board.jsonl'),
    HACKMYWEBSITE_DOSSIER: path.join(dir, 'dossier.jsonl'),
  };

  // Rounds gated by outcome. Survivors go again at full slice; a clean pass earns a
  // cheaper retry from a different angle before that area is accepted as quiet.
  // swarm is the engine for every mode; the roster depends on what the mode permits
  const roleIds = mode === 'recon'
    ? ['mapper', 'authz', 'injector']
    : (aggressive ? ['mapper', 'authz', 'injector', 'exploiter', 'chain'] : ['mapper', 'authz', 'injector', 'chain']);
  const roster = ROLES.filter((r) => roleIds.includes(r.id));
  state.roster = roster.map((r) => r.id);
  save(dir, state);
  // Bigger budgets buy more parallel pressure and more total agent attempts.
  const { maxConcurrent, agentCap } = capacityFor(budgetUsd);
  let active = roster.map((r) => ({ role: r, round: 1, retry: 0, angle: null }));
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    state.rounds = round;
    const queue = active.slice();
    const survivors = [];
    const retries = [];

    const worker = async () => {
      while (queue.length) {
        if (state.spentUsd >= budgetUsd) break;
        if (Object.keys(state.agents).length >= agentCap) break;
        const job = queue.shift();
        const sliceUsd = job.retry
          ? Math.max(0.12, budgetUsd * job.role.slice * RETRY_SLICE_FACTOR)
          : Math.max(0.15, budgetUsd * job.role.slice);
        const { rec, report } = await runAgent({
          id, dir, state, role: job.role, round: round, sliceUsd, env, emit,
          retry: job.retry || 0, angle: job.angle || null, history: priorHistory,
        });
        if (report) {
          state.findings = mergeReport(dir, report, {
            role: rec.role, agent: rec.id, round: rec.round, retry: rec.retry,
          });
          state.dossier = readDossier(dir).length;
          save(dir, state);
        }
        if (rec.survived) {
          survivors.push({ role: job.role, round: round + 1, retry: 0, angle: null });
        } else if ((job.retry || 0) < MAX_RETRIES && ['clean', 'no-report', 'test-failed'].includes(rec.outcome)) {
          // Persistent: a clean pass, a missed success test or a missing report all get
          // another attempt from a different angle before we accept the area as quiet.
          const nextRetry = (job.retry || 0) + 1;
          const angles = job.role.angles || [];
          const retryAngle = rec.outcome === 'no-report'
            ? 'produce the required JSON report first, then continue with a fresh angle'
            : (angles[(nextRetry - 1) % Math.max(1, angles.length)] || 'a completely different technique');
          retries.push({
            role: job.role, round: round + 1, retry: nextRetry,
            angle: retryAngle,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(maxConcurrent, queue.length || 1) }, worker));
    save(dir, state);

    const next = survivors.concat(retries);
    if (!next.length) break;
    if (state.spentUsd >= budgetUsd * BUDGET_STOP_FRACTION) break;
    active = next;
  }

  state.status = state.status === 'running' ? 'COMPLETE' : state.status;
  state.phase = 'done';
  state.endedAt = Date.now();
  state.dossier = readDossier(dir).length;
  state.survivors = Object.values(state.agents).filter((a) => a.survived).length;
  state.terminated = Object.values(state.agents).filter((a) => a.survived === false).length;
  // of the terminated ones, these did the work and found nothing: their area looks clean
  state.cleanAreas = Object.values(state.agents).filter((a) => a.outcome === 'clean').length;
  state.retriesRun = Object.values(state.agents).filter((a) => (a.retry || 0) > 0).length;
  state.persistence = {
    maxRounds: MAX_ROUNDS,
    maxRetriesPerRole: MAX_RETRIES,
    retrySliceFactor: RETRY_SLICE_FACTOR,
    maxConcurrent,
    agentCap,
    budgetStopFraction: BUDGET_STOP_FRACTION,
    agentsRun: Object.keys(state.agents).length,
    retriesRun: state.retriesRun,
    dossierEntries: readDossier(dir).length,
    retryOutcomes: ['clean', 'no-report', 'test-failed'],
  };
  save(dir, state);
  emit({ type: 'done', state });
  swarmBus.delete(id);
  return state;
}

export function stopSwarm(id) {
  let stopped = false;
  for (const [, entry] of live) {
    if (entry.scanId !== id) continue; // only this engagement's agents
    killTree(entry.child);
    stopped = true;
  }
  return stopped;
}
