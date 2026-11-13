// hackmywebsite.ai portal client. No frameworks, no build step.
const $ = (id) => document.getElementById(id);
const RATES = { input: 0.8, output: 1.6, cacheRead: 0.15 }; // USD per 1M tokens
const USD_PER_STEP = 0.0113;

const SEGS = 40;
let es = null;
let current = null;
let mode = 'recon';
let engine = 'swarm';
let lastSpent = 0;

/* ---------- LED bars ---------- */
function buildLed(el) {
  el.innerHTML = '';
  for (let i = 0; i < SEGS; i++) el.appendChild(document.createElement('i'));
}
function paintLed(el, frac) {
  const segs = Array.from(el.children);
  const lit = Math.round(Math.min(1, Math.max(0, frac)) * SEGS);
  segs.forEach((s, i) => {
    s.className = '';
    if (i < lit) s.classList.add(frac >= 0.95 ? 'hot' : frac >= 0.8 ? 'warn' : 'on');
  });
}

/* ---------- switches ---------- */
function setEngine(next) {
  engine = next;
  document.querySelectorAll('#engines .mode').forEach((b) => {
    b.classList.toggle('active', b.dataset.engine === engine);
  });
  updateScopeHint();
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('#modes .mode').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  updateScopeHint();
}

function updateScopeHint() {
  const raw = $('url').value.trim();
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch (e) { host = ''; }
  const local = !host ? null
    : host === 'localhost' || host.endsWith('.local') || /^127\./.test(host) || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || (function () { const m = host.match(/^172\.(\d+)\./); const n = m ? Number(m[1]) : 0; return n >= 16 && n <= 31; })();

  const modeLine = mode === 'pentest'
    ? 'MODE: ACTIVE PENTEST, injection, auth bypass, IDOR and SSRF attempts.'
    : 'MODE: RECON, maps what a logged-out stranger can reach, read-only.';
  const engineLine = engine === 'swarm'
    ? (mode === 'pentest'
      ? ' ENGINE: SWARM, mapper plus access control, injection and impact agents.'
      : ' ENGINE: SWARM, mapper plus access control and injection agents, read-only.')
    : ' ENGINE: single agent, sequential. Cheaper, less breadth.';
  const writes = local === null
    ? ' Writes: decided by the host once you type a URL.'
    : (local ? ' LOCAL target, writes allowed with exploitation on.' : ' PUBLIC target, read-only unless exploitation is enabled.');

  const hint = $('scopeHint');
  hint.textContent = modeLine + engineLine + writes;
  hint.style.color = local ? 'var(--lime)' : (mode === 'pentest' ? 'var(--mag)' : 'var(--dim)');
}

/* ---------- budget ---------- */
function fmtUsd(n) { return '$' + (Math.round(n * 10000) / 10000).toFixed(4); }

function updateBudgetUi() {
  const b = Number($('budget').value);
  $('budgetOut').textContent = '$' + b.toFixed(2);
  $('stepsLeft').textContent = '~' + Math.round(b / USD_PER_STEP) + ' steps';
  const tok = Math.round((b / ((RATES.input + RATES.output) / 2)) * 1e6);
  $('tokEq').textContent = '~' + tok.toLocaleString() + ' tokens';
  paintLed($('led'), 0.02 + (b / 20) * 0.18);
}

/* ---------- helpers ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function sevClass(s) { return String(s || 'info').toLowerCase(); }

function logLine(text, cls) {
  const box = $('log');
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function reasonLabel(r) {
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') return r.kind || r.reason || r.type || 'completed';
  return 'completed';
}

/* ---------- findings ---------- */
function renderFindings(data) {
  $('results').hidden = false;
  const list = data.findings || [];
  $('count').textContent = String(list.length);
  $('count').className = 'badge' + (list.length ? ' warn' : '');
  $('summary').textContent = data.summary || (data.scan && data.scan.summary) || '';
  $('blocked').textContent = data.blocked ? 'BLOCKED: ' + data.blocked : '';

  const scanId = (data.scan && data.scan.id) || current;
  const running = data.scan && data.scan.status === 'running';

  const wr = $('webReport');
  const lang = $('lang') ? $('lang').value : 'nl';
  if (!running && scanId) {
    wr.href = '/api/scans/' + scanId + '/rapport.html?lang=' + encodeURIComponent(lang);
    wr.textContent = 'RAPPORT (' + lang.toUpperCase() + ')';
    wr.classList.remove('is-disabled');
    wr.setAttribute('aria-disabled', 'false');
  } else {
    wr.href = '#';
    wr.classList.add('is-disabled');
    wr.setAttribute('aria-disabled', 'true');
  }

  const dh = $('downloadHtml');
  if (!running && scanId) {
    dh.href = '/api/scans/' + scanId + '/rapport.html?lang=' + encodeURIComponent(lang) + '&download=1';
    const hostPart = String((data.scan && data.scan.host) || 'report').replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\./g, '-');
    const day = new Date().toISOString().slice(0, 10);
    dh.setAttribute('download', 'hackmywebsite-' + hostPart + '-' + day + '-' + lang + '.html');
    dh.classList.remove('is-disabled');
    dh.setAttribute('aria-disabled', 'false');
  } else {
    dh.href = '#';
    dh.classList.add('is-disabled');
    dh.setAttribute('aria-disabled', 'true');
  }

  const dl = $('download');
  if (!running && scanId) {
    dl.href = '/api/scans/' + scanId + '/rapport.pdf?lang=' + encodeURIComponent(lang);
    const hostPart = String((data.scan && data.scan.host) || 'report').replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\./g, '-');
    const day = new Date().toISOString().slice(0, 10);
    dl.setAttribute('download', 'hackmywebsite-' + hostPart + '-' + day + '.pdf');
    dl.classList.remove('is-disabled');
    dl.setAttribute('aria-disabled', 'false');
  } else {
    dl.href = '#';
    dl.classList.add('is-disabled');
    dl.setAttribute('aria-disabled', 'true');
  }

  $('dlHint').textContent = running
    ? 'Report, HTML and PDF become available when the run finishes.'
    : 'HTML and PDF build on first click and can take a few seconds.';

  const box = $('findings');
  box.innerHTML = '';
  list.forEach(function (f) {
    const d = document.createElement('div');
    d.className = 'finding ' + sevClass(f.severity);
    const rows = f.evidence && Array.isArray(f.evidence.rows)
      ? (f.evidence.count || f.evidence.rows.length) + ' rows' : '';
    let html = '';
    html += '<div class="f-head">';
    html += '<span class="f-id">' + esc(f.id) + '</span>';
    html += '<span class="f-title">' + esc(f.title || 'untitled') + '</span>';
    html += '<span class="sev ' + sevClass(f.severity) + '">' + esc(String(f.severity || '').toUpperCase()) + '</span>';
    html += '<span class="sev ' + (String(f.status || '').toUpperCase() === 'CONFIRMED' ? 'medium' : 'low') + '">' + esc(f.status || '') + '</span>';
    html += '<button class="copy">COPY CURL</button>';
    html += '</div><div class="f-body">';
    html += '<div class="f-meta">' + esc(f.category || '') + (f.cvss ? ' - ' + esc(f.cvss) : '') + (rows ? ' - ' + rows : '') + '</div>';
    if (f.request) html += '<div class="f-block"><span>REQUEST</span><pre class="req">' + esc(f.request) + '</pre></div>';
    if (f.response) html += '<div class="f-block"><span>RESPONSE</span><pre>' + esc(f.response) + '</pre></div>';
    if (f.rootCause) html += '<div class="f-block"><span>ROOT CAUSE</span><pre>' + esc(f.rootCause) + '</pre></div>';
    if (f.fix) html += '<div class="f-block"><span>FIX</span><pre>' + esc(f.fix) + '</pre></div>';
    html += '</div>';
    d.innerHTML = html;
    d.querySelector('.copy').onclick = function () {
      navigator.clipboard.writeText(f.request || '');
      const b = d.querySelector('.copy');
      b.textContent = 'COPIED';
      setTimeout(function () { b.textContent = 'COPY CURL'; }, 1200);
    };
    box.appendChild(d);
  });
}

/* ---------- live cost ---------- */
function updateCostUi(state) {
  if (!state) return;
  const budget = Number(state.budgetUsd || 0);
  const spent = Number(state.spentUsd || 0);
  const frac = budget ? spent / budget : 0;

  $('spent').textContent = fmtUsd(spent);
  $('spentSub').textContent = 'of $' + budget.toFixed(2);
  $('remaining').textContent = fmtUsd(Math.max(0, budget - spent));
  const goal = state.goalProgress ? ' - goal ' + state.goalProgress.routes + '/30 routes' : '';
  $('steps').textContent = (state.steps || 0) + ' steps' + goal;
  const t = state.tokens || {};
  $('tokens').textContent = (t.input || 0).toLocaleString() + ' / ' + (t.output || 0).toLocaleString();
  $('cache').textContent = 'cache ' + (t.cacheRead || 0).toLocaleString();
  paintLed($('led2'), frac);

  const running = state.status === 'running' || state.status === 'RUNNING';
  const st = $('status');
  const phase = state.phase && state.phase !== 'scan' ? state.phase.toUpperCase() + ' - ' : '';
  st.textContent = phase + (state.status || 'RUNNING');
  st.className = 'badge' + (running ? ' live' : (state.status === 'COMPLETE' ? '' : ' warn'));
  if (state.status === 'BUDGET_EXHAUSTED' || state.status === 'ERROR' || state.status === 'GOAL_NOT_MET') {
    st.classList.add('dead');
  }
  $('led2').classList.toggle('sweeping', running);

  if (spent !== lastSpent) {
    lastSpent = spent;
    const g = $('spent');
    g.classList.remove('flash');
    void g.offsetWidth;
    g.classList.add('flash');
  }
}

/* ---------- transport ---------- */
async function connect(id) {
  current = id;
  $('live').hidden = false;
  $('log').innerHTML = '';
  logLine('>> connecting to ' + id, 'sys');

  const res = await fetch('/api/scans/' + id + '/result');
  const data = await res.json();
  updateCostUi(data.scan);
  if (data.scan && data.scan.status !== 'running') renderFindings(data);

  if (es) es.close();
  es = new EventSource('/api/scans/' + id + '/stream');

  es.onmessage = function (m) {
    let p;
    try { p = JSON.parse(m.data); } catch (e) { return; }
    if (p.type === 'hello') { updateCostUi(p.scan); return; }
    if (p.type === 'cost') { updateCostUi(p.state); return; }
    if (p.type === 'text') { updateCostUi(p.state); return; }
    if (p.type === 'phase') { logLine('>> phase: ' + (p.state && p.state.phase), 'sys'); updateCostUi(p.state); return; }
    if (p.type === 'agent') {
      const a = p.agent || {};
      logLine('>> agent ' + (a.id || '') + ' ' + (a.outcome || a.status || '') + (a.error ? ': ' + a.error : ''), 'sys');
      updateCostUi(p.state);
      return;
    }
    if (p.type === 'findings') { logLine('>> findings so far: ' + p.count, 'sys'); return; }
    if (p.type === 'turn_end') { logLine('>> turn ended: ' + reasonLabel(p.reason), 'sys'); return; }
    if (p.type === 'event') { handleEvent(p.line); return; }
    if (p.type === 'done') {
      updateCostUi(p.state);
      logLine('>> run finished: ' + p.state.status + ' - ' + fmtUsd(p.state.spentUsd), 'sys');
      $('stop').disabled = true;
      fetch('/api/scans/' + id + '/result').then(function (r) { return r.json(); }).then(renderFindings);
      loadArchive();
      if (es) es.close();
    }
  };
  es.onerror = function () { logLine('>> stream error, will retry', 'sys'); };
}

function handleEvent(e) {
  if (!e) return;
  if (e.type === 'text' && e.text && String(e.text).trim()) {
    logLine(String(e.text).trim());
  } else if (e.type === 'thinking' && e.text && String(e.text).trim()) {
    logLine('. ' + String(e.text).trim().replace(/\s+/g, ' ').slice(0, 300), 'tool');
  } else if (e.type === 'tool_call') {
    const raw = (e.input && (e.input.command || e.input.file_path)) || JSON.stringify(e.input || {});
    logLine('>> ' + (e.tool || 'tool') + ': ' + String(raw).replace(/\s+/g, ' ').slice(0, 150), 'tool');
  } else if (e.type === 'tool_result') {
    logLine('   <- ' + String(e.result == null ? '' : e.result).replace(/\s+/g, ' ').slice(0, 180));
  }
}

/* ---------- archive ---------- */
function loadArchive() {
  fetch('/api/scans').then(function (r) { return r.json(); }).then(function (scans) {
    const box = $('scans');
    if (!scans.length) { box.textContent = 'no scans yet'; return; }
    box.innerHTML = '';
    scans.forEach(function (s) {
      const row = document.createElement('div');
      row.className = 'arow';
      row.innerHTML = '<span class="a-st">' + esc(s.status) + '</span>'
        + '<span class="a-url">' + esc(s.url) + '</span>'
        + '<span class="a-cost">' + fmtUsd(s.spentUsd || 0) + '</span>'
        + '<span class="a-st">' + (s.steps || 0) + ' steps</span>';
      row.onclick = function () { connect(s.id); };
      box.appendChild(row);
    });
  });
}

/* ---------- boot ---------- */
buildLed($('led'));
buildLed($('led2'));
$('budget').value = '2.00';
updateBudgetUi();
setMode('recon');
setEngine('swarm');
loadArchive();

$('budget').addEventListener('input', updateBudgetUi);
$('url').addEventListener('input', updateScopeHint);

try {
  const savedLang = localStorage.getItem('hmw-lang');
  if (savedLang && $('lang')) $('lang').value = savedLang;
} catch (e) {}

if ($('lang')) {
  $('lang').addEventListener('change', function (e) {
    try { localStorage.setItem('hmw-lang', e.target.value); } catch (err) {}
    if (current) {
      fetch('/api/scans/' + current + '/result')
        .then(function (r) { return r.json(); })
        .then(renderFindings)
        .catch(function () {});
    }
  });
}

document.querySelectorAll('#modes .mode').forEach(function (b) {
  b.addEventListener('click', function () {
    setMode(b.dataset.mode);
    $('budget').value = (mode === 'pentest' ? '5.00' : '1.00');
    updateBudgetUi();
  });
});

document.querySelectorAll('#engines .mode').forEach(function (b) {
  b.addEventListener('click', function () {
    setEngine(b.dataset.engine);
    $('budget').value = (engine === 'single' ? '0.50' : (mode === 'pentest' ? '5.00' : '1.00'));
    updateBudgetUi();
  });
});

fetch('/pricing.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
  if (!p) return;
  const box = $('presets');
  box.innerHTML = '';
  (p.presets || []).forEach(function (pre) {
    const b = document.createElement('button');
    b.textContent = pre.label + ' $' + Number(pre.usd).toFixed(2) + ' ~' + pre.steps + ' st';
    b.onclick = function () { $('budget').value = pre.usd; updateBudgetUi(); };
    box.appendChild(b);
  });
}).catch(function () {});

$('start').onclick = async function () {
  const url = $('url').value.trim();
  const budgetUsd = Number($('budget').value);
  const authorized = $('auth').checked;
  const aggressive = $('aggressive').checked && mode === 'pentest';
  if (!url) { alert('Enter a target URL'); return; }
  if (!authorized) { alert('Confirm you own the target'); return; }

  let consent;
  if (aggressive) {
    consent = 'I authorize state-changing tests on this target';
    const ok = confirm('EXPLOITATION MODE\n\nThe agents may CREATE, MODIFY and DELETE their own test objects on '
      + url + ' to prove impact, then revert them.\n\nReal customer, staff and admin records are never touched.\n\nContinue?');
    if (!ok) return;
  }

  $('start').disabled = true;
  try {
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: url, budgetUsd: budgetUsd, authorized: authorized,
        mode: mode, engine: engine, aggressive: aggressive, consent: consent,
      }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'failed'); return; }
    $('stop').disabled = false;
    $('results').hidden = true;
    lastSpent = 0;
    await connect(data.id);
  } catch (e) {
    alert('request failed: ' + e.message);
  } finally {
    $('start').disabled = false;
  }
};

$('stop').onclick = async function () {
  if (!current) return;
  await fetch('/api/scans/' + current + '/stop', { method: 'POST' });
  logLine('>> stop requested', 'sys');
  $('stop').disabled = true;
};

setInterval(function () {
  $('clock').textContent = new Date().toLocaleTimeString('en-GB');
}, 1000);
