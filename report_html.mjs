// report_html.mjs - generate a self-contained HTML assessment report for one scan.
// Usage: node report_html.mjs <scan-dir>   -> writes report.html in that dir
import fs from 'node:fs';
import path from 'node:path';

const SEV_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Flatten the mixed shapes agents emit (strings, arrays, objects) into readable prose. */
function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const keys = ['claim', 'summary', 'impact', 'description', 'detail', 'text', 'evidence', 'result', 'effect', 'title', 'url', 'method'];
    const parts = [];
    for (const key of keys) {
      if (value[key] != null) parts.push(textOf(value[key]));
    }
    if (parts.length) return parts.join('. ');
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

/** Normalize status from either status or confidence. Missing evidence stays suspected. */
function statusOf(f) {
  const raw = String(f.status || f.confidence || '').toUpperCase();
  if (raw.includes('SUSPECT') || raw.includes('UNCONFIRM') || raw.includes('UNPROVEN')) return 'SUSPECTED';
  if (raw.includes('CONFIRM')) return 'CONFIRMED';
  return 'SUSPECTED';
}

/** Estimated impact 1-5 from severity. */
function impactOf(f) {
  return SEV_RANK[String(f.severity || 'info').toLowerCase()] || 1;
}

/** Estimated ease of exploitation 1-5 (5 = anyone can do it from a browser). */
function easeOf(f) {
  const cat = textOf(f.category).toLowerCase();
  const req = textOf(f.request);
  let ease = 3;

  if (/access-control|auth/.test(cat)) ease = 5;       // broken gate, no prerequisites
  else if (/pii/.test(cat)) ease = 5;                   // reading data with a GET
  else if (/injection/.test(cat)) ease = 4;             // needs a payload, still trivial
  else if (/misconfig/.test(cat)) ease = 4;
  else if (/other/.test(cat)) ease = 3;

  // a request that needed no credentials at all is easier than one that did
  const noAuth = !/authorization|cookie|bearer|token/i.test(req);
  if (noAuth) ease = Math.min(5, ease + 1);
  else ease = Math.max(1, ease - 1);

  // unproven: treat as one notch harder, and say so in the UI
  if (statusOf(f) === 'SUSPECTED') ease = Math.max(1, ease - 1);

  return ease;
}

function rationale(f, ease, impact) {
  const bits = [];
  bits.push(`Impact ${impact}/5 estimated from severity "${String(f.severity || 'info').toLowerCase()}".`);
  bits.push(`Ease ${ease}/5 estimated from category "${textOf(f.category) || 'other'}" and whether the recorded request carried any credentials.`);
  if (statusOf(f) === 'SUSPECTED') bits.push('This one is marked SUSPECTED, so its ease is lowered by one step.');
  bits.push('These are judgements from the evidence, not a CVSS base score calculation.');
  return bits.join(' ');
}

function build(scanDir) {
  const scan = JSON.parse(fs.readFileSync(path.join(scanDir, 'scan.json'), 'utf8'));
  const fp = path.join(scanDir, 'findings.json');
  const data = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : { findings: [], summary: '', tested: [] };

  const findings = (data.findings || []).map((f, i) => {
    const rawSev = String(f.severity || 'info').toLowerCase();
    const severity = rawSev === 'informational' ? 'info' : rawSev;
    const normalized = {
      ...f,
      severity,
      title: textOf(f.title),
      category: textOf(f.category),
      request: textOf(f.request),
      response: textOf(f.response),
      evidence: textOf(f.evidence),
      impactText: textOf(f.impact),
      rootCause: textOf(f.rootCause),
      fix: textOf(f.fix),
      status: statusOf(f),
    };
    const ease = easeOf(normalized);
    const impact = impactOf(normalized);
    return { ...normalized, n: i + 1, ease, impact, sevKey: severity };
  });

  // highest risk first: impact dominates, ease breaks ties
  const ranked = [...findings].sort((a, b) => (b.impact * 10 + b.ease) - (a.impact * 10 + a.ease));
  ranked.forEach((f, i) => { f.rank = i + 1; });

  const confirmed = findings.filter((f) => String(f.status || '').toUpperCase() === 'CONFIRMED');
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f) => { counts[f.sevKey] = (counts[f.sevKey] || 0) + 1; });
  const worst = ranked[0];

  // group markers per grid cell so they can be spread instead of stacked
  const cells = {};
  findings.forEach((f) => {
    const key = `${f.ease}-${f.impact}`;
    (cells[key] = cells[key] || []).push(f);
  });

  const tested = (data.tested || []).map((t) => typeof t === 'string' ? t : `${t.route || ''} - ${t.result || ''}`);
  const worked = tested.filter((t) => /\b(401|403|405|400|404)\b|reject|block|denied|unauthor|not allowed|clean/i.test(t)).slice(0, 40);

  // ---- exploitation evidence + disclaimers ----
  const writeActions = (Array.isArray(data.writeActions) ? data.writeActions : []).map((w) => {
    if (typeof w === 'string') return { method: '', url: '', effect: w, reverted: false, revertProof: '' };
    if (!w || typeof w !== 'object') return { method: '', url: '', effect: textOf(w), reverted: false, revertProof: '' };
    return {
      method: textOf(w.method),
      url: textOf(w.url || w.target),
      effect: textOf(w.effect || w.impact || w.result),
      reverted: !!w.reverted,
      revertProof: textOf(w.revertProof || w.proof),
    };
  });
  const impactProof = (Array.isArray(data.impactProof) ? data.impactProof
    : (typeof data.impactProof === 'string' && data.impactProof.trim() ? [data.impactProof] : []))
    .map((p) => textOf(p)).filter(Boolean);
  const aggressive = !!scan.aggressive;
  const consent = scan.consent || null;
  const notReverted = writeActions.filter((w) => !w.reverted);
  const reverted = writeActions.length - notReverted.length;

  // ---- swarm roster: every agent, its objective, its budget and whether it survived ----
  const agents = scan.agents && typeof scan.agents === 'object' ? Object.values(scan.agents) : [];
  let board = [];
  try {
    board = fs.readFileSync(path.join(scanDir, 'board.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {}

  const rosterSection = agents.length ? `
  <section class="card">
    <h2>Engagement roster: every agent, and whether it survived</h2>
    <p class="lede">Agents ran concurrently with their own objective and budget slice. An agent that
    could not prove its objective was terminated; survivors were re-briefed for another round.
    An agent that did the work and found nothing is marked <b>may be clean</b>, not failed.
    Each agent's raw log is kept in <code>agents/&lt;id&gt;/events.jsonl</code>.</p>
    <table class="writes">
      <thead><tr><th>Agent</th><th>Objective</th><th>Slice</th><th>Spent</th><th>Steps</th><th>Findings</th><th>Outcome</th></tr></thead>
      <tbody>${agents.map((a) => {
        const outcome = a.outcome || (a.survived ? 'survived' : 'test-failed');
        const chip = {
          survived: '<span class="ok">survived</span>',
          clean: '<span class="chip ghost">terminated, may be clean</span>',
          'no-report': '<span class="bad">terminated, no report</span>',
          'test-failed': '<span class="bad">terminated</span>',
        }[outcome] || '<span class="bad">terminated</span>';
        return `<tr>
        <td class="mono">${esc(a.id || '')}<div class="note">${esc(a.title || '')}</div></td>
        <td>${esc(String(a.objective || '').slice(0, 130))}</td>
        <td class="mono">$${Number(a.sliceUsd || 0).toFixed(2)}</td>
        <td class="mono">$${Number(a.spentUsd || 0).toFixed(2)}</td>
        <td class="mono">${a.steps || 0}</td>
        <td class="mono">${a.findings || 0}</td>
        <td>${chip}
          <div class="note">${esc(a.error || a.status || '')}${a.tested ? ` Â· ${a.tested} checks recorded` : ''}</div></td>
      </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="legend">
      <span><b>${agents.filter((a) => a.survived).length}</b> survived</span>
      <span><b>${agents.filter((a) => (a.outcome || '') === 'clean').length}</b> terminated, area may be clean</span>
      <span><b>${agents.filter((a) => a.survived === false && (a.outcome || '') !== 'clean').length}</b> terminated without evidence</span>
      <span><b>${agents.reduce((s, a) => s + (a.findings || 0), 0)}</b> findings attributed to agents</span>
    </div>
    ${board.length ? `
      <h4 style="margin-top:18px">What the agents told each other (${board.length} messages)</h4>
      <div class="board">${board.slice(-25).map((m) => `<div>
        <span class="mono">${esc(m.from || '')}</span>
        <span class="chip ghost">${esc(m.type || '')}</span>
        ${esc(String(m.text || '').slice(0, 260))}
      </div>`).join('')}</div>
      <p class="note">Full board: <code>board.jsonl</code> in the scan folder.</p>` : ''}
  </section>` : '';

  const disclaimer = `
  <section class="card disclaimer">
    <h2>Authorisation and testing disclaimer</h2>
    <p><b>This was not a passive review.</b> ${aggressive
      ? 'The tester ran an <b>active exploitation engagement</b> against a system the client declared they own, including state-changing requests used to prove what an attacker could actually do.'
      : 'The tester ran an active but read-only engagement: requests were sent, but no data was intentionally modified.'}</p>
    <table class="facts">
      <tr><th>Authorisation</th><td>Client declared ownership and authorised active testing${consent ? ` (consent recorded ${esc(consent.acceptedAt || '')}, phrase "${esc(consent.phrase || '')}")` : ''}.</td></tr>
      <tr><th>State changes</th><td>${writeActions.length
        ? `${writeActions.length} state-changing request(s): <b>${reverted} reverted</b>${notReverted.length ? `, <b class="bad">${notReverted.length} still outstanding</b>` : ', none outstanding'}${aggressive ? '. Only objects the tester created were modified.' : '.'}`
        : 'None. No records were created, modified or deleted.'}</td></tr>
      <tr><th>Test data</th><td>${writeActions.some((w) => /hackmywebsite-test/i.test(String(w.body || '')))
        ? 'Any test records were marked <code>hackmywebsite-test-</code> and listed below with their revert proof.'
        : 'No persistent test records were created.'}</td></tr>
      <tr><th>Residual risk</th><td>Exploitation was bounded by the rules of engagement: no denial of service, no mass inserts, no changes to real customer, staff or admin records, no executable uploads. Behaviour outside those bounds was not tested.</td></tr>
      <tr><th>Warranty</th><td>Findings reflect the window tested against the live system. Ratings are judgements from evidence, and an absence of findings is not proof of absence of vulnerability.</td></tr>
    </table>
  </section>`;

  const impactSection = (impactProof.length || writeActions.length) ? `
  <section class="card">
    <h2>Blast radius: what an attacker could actually do</h2>
    <p class="lede">Proof of impact, not just a list of weaknesses. Every claim below is backed by a request the tester sent.</p>
    ${impactProof.length ? `<ul class="impact">${impactProof.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="note">No impact statement recorded.</p>'}
    ${writeActions.length ? `
      <h4>State-changing requests and their reversions</h4>
      <table class="writes">
        <thead><tr><th>Method</th><th>Target</th><th>Observed effect</th><th>Reverted</th></tr></thead>
        <tbody>${writeActions.map((w) => `<tr>
          <td class="mono">${esc(w.method || '')}</td>
          <td class="mono">${esc(String(w.url || '').slice(0, 90))}</td>
          <td>${esc(String(w.effect || '').slice(0, 200))}</td>
          <td>${w.reverted ? '<span class="ok">yes</span>' : '<span class="bad">no</span>'}
            ${w.revertProof ? `<div class="note">${esc(String(w.revertProof).slice(0, 220))}</div>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}
  </section>` : '';

  const started = scan.startedAt ? new Date(scan.startedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // ---------- heat map cells ----------
  let gridHtml = '';
  for (let impact = 5; impact >= 1; impact--) {
    for (let ease = 1; ease <= 5; ease++) {
      const heat = (impact + ease) / 10; // 0.2 .. 1.0
      const hue = 140 - Math.round(heat * 140); // green -> red
      const here = cells[`${ease}-${impact}`] || [];
      const spread = here.map((f) => (
        `<button class="marker sev-${f.sevKey}" data-n="${f.n}" title="${esc(f.title)}">${f.n}</button>`
      )).join('');
      gridHtml += `<div class="cell" style="background:hsl(${hue} 64% 92%)" data-ease="${ease}" data-impact="${impact}">${spread}</div>`;
    }
  }

  const axisX = [1, 2, 3, 4, 5].map((n) => `<span>${n}</span>`).join('');
  const axisY = [5, 4, 3, 2, 1].map((n) => `<span>${n}</span>`).join('');

  const detailCards = findings.map((f) => `
    <article class="detail" id="d-${f.n}" hidden>
      <header>
        <span class="num">${f.n}</span>
        <h3>${esc(f.title)}</h3>
        <span class="chip sev-${f.sevKey}">${SEV_LABEL[f.sevKey] || f.sevKey}</span>
        <span class="chip ghost">${esc(f.status || '')}</span>
        <span class="chip ghost">Ease ${f.ease}/5 Â· Impact ${f.impact}/5</span>
      </header>
      ${(() => {
        const t = textOf(f.impactText);
        // agents sometimes emit a bare number here; only show real prose
        const usable = t.length > 3 && !/^\d+$/.test(t);
        return usable ? `<h4>What happened</h4><p>${esc(t.slice(0, 1600))}</p>` : '';
      })()}
      ${f.evidence ? `<h4>Evidence</h4><p>${esc(String(f.evidence).slice(0, 1600))}</p>` : ''}
      ${f.request ? `<h4>Evidence: request</h4><pre>${esc(f.request)}</pre>` : ''}
      ${f.response ? `<h4>Evidence: response</h4><pre>${esc(f.response)}</pre>` : ''}
      ${f.rootCause ? `<h4>Root cause</h4><p>${esc(f.rootCause)}</p>` : ''}
      ${f.fix ? `<h4>Recommended fix</h4><p>${esc(f.fix)}</p>` : ''}
      <h4>How this was rated</h4>
      <p class="note">${esc(rationale(f, f.ease, f.impact))}</p>
    </article>`).join('');

  const fixList = ranked.filter((f) => String(f.status || '').toUpperCase() === 'CONFIRMED').map((f) => `
    <li>
      <button class="jump" data-n="${f.n}">
        <span class="rank">${f.rank}</span>
        <span class="fix-title">${esc(f.title)}</span>
        <span class="chip sev-${f.sevKey}">${SEV_LABEL[f.sevKey]}</span>
      </button>
      ${f.fix ? `<p class="fix-text">${esc(f.fix)}</p>` : ''}
    </li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assessment report - ${esc(scan.host)}</title>
<style>
  :root{
    --canvas:#F8FAFC; --card:#FFFFFF; --line:#E2E8F0; --line-strong:#CBD5E1;
    --ink:#0F172A; --muted:#64748B; --blue:#1D4ED8; --blue-tint:#EFF6FF;
    --critical:#DC2626; --warning:#D97706; --success:#059669; --info:#2563EB;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--canvas);color:var(--ink);
    font:14px/20px "Hanken Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 24px 64px}
  header.top{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;margin-bottom:24px}
  h1{margin:0;font-size:30px;letter-spacing:-.02em}
  .sub{color:var(--muted);margin-top:4px}
  .meta{display:flex;gap:20px;flex-wrap:wrap;margin-left:auto;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:var(--muted)}
  .meta b{display:block;color:var(--ink);font-size:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin-bottom:20px}
  h2{margin:0 0 4px;font-size:18px;letter-spacing:-.01em}
  .lede{color:var(--muted);margin:0 0 18px}
  .verdict{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
  .big{font-size:26px;font-weight:700;letter-spacing:-.02em}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
  .stat{border:1px solid var(--line);border-radius:8px;padding:12px}
  .stat span{display:block;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}
  .stat b{font-size:22px;letter-spacing:-.01em}
  .heatmap{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;align-items:stretch}
  .yaxis{display:grid;grid-template-rows:repeat(5,1fr);align-items:center;justify-items:end;
    font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:6px;
    aspect-ratio:1/1;width:min(100%,460px)}
  .cell{position:relative;border:1px solid #ffffff;border-radius:6px;display:flex;flex-wrap:wrap;
    align-content:center;justify-content:center;gap:2px;padding:3px;min-width:0}
  .marker{position:static;flex:0 0 auto;width:20px;height:20px;border-radius:50%;border:2px solid #fff;
    font:600 10px/1 "JetBrains Mono",monospace;color:#fff;cursor:pointer;padding:0;
    box-shadow:0 1px 3px rgba(15,23,42,.3);transition:transform .12s ease}
  .marker:hover{transform:scale(1.15);z-index:5}
  .marker.active{outline:2px solid var(--ink);outline-offset:2px;z-index:6}
  .marker.sev-critical,.marker.sev-high{background:var(--critical)}
  .marker.sev-medium{background:var(--warning)}
  .marker.sev-low{background:var(--info)}
  .marker.sev-info{background:var(--muted)}
  .xaxis{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-left:38px;margin-top:8px;
    width:min(calc(100% - 38px),460px);
    font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:var(--muted);text-align:center}
  .axis-caption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:6px;
    font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;color:var(--muted)}
  .axis-label{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.06em;
    color:var(--muted);text-transform:uppercase}
  .chip{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.03em;
    padding:2px 7px;border-radius:4px;border:1px solid var(--line);white-space:nowrap}
  .chip.sev-critical,.chip.sev-high{background:#FEF2F2;color:var(--critical);border-color:#FECACA}
  .chip.sev-medium{background:#FFFBEB;color:var(--warning);border-color:#FDE68A}
  .chip.sev-low{background:var(--blue-tint);color:var(--blue);border-color:#BFDBFE}
  .chip.sev-info,.chip.ghost{background:#F1F5F9;color:var(--muted)}
  .detail{border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:12px;background:var(--card)}
  .detail header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .detail h3{margin:0;font-size:15px;flex:1;min-width:200px}
  .num{width:24px;height:24px;border-radius:50%;background:var(--ink);color:#fff;
    display:grid;place-items:center;font:600 11px/1 "JetBrains Mono",monospace}
  h4{margin:14px 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
  pre{margin:0;background:#F1F5F9;border:1px solid var(--line);border-radius:6px;padding:12px;
    font:12px/18px "JetBrains Mono",ui-monospace,monospace;color:#334155;overflow:auto;max-height:240px;white-space:pre-wrap}
  .note{color:var(--muted);font-size:12px}
  ol.fixes{list-style:none;margin:0;padding:0}
  ol.fixes li{border-bottom:1px solid #F1F5F9;padding:8px 0}
  .jump{display:flex;gap:12px;align-items:center;width:100%;background:none;border:0;padding:0;
    cursor:pointer;text-align:left;font:inherit;color:inherit}
  .jump:hover .fix-title{color:var(--blue)}
  .rank{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--muted);width:20px}
  .fix-title{flex:1;font-weight:600}
  .fix-text{margin:6px 0 0 32px;color:var(--muted);font-size:13px}
  .worked{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}
  .worked div{border:1px solid #A7F3D0;background:#ECFDF5;border-radius:6px;padding:8px 10px;
    font-family:"JetBrains Mono",monospace;font-size:11px;color:#065F46}
  .legend{display:flex;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin-top:12px}
  .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
  .disclaimer{border-left:3px solid var(--ink)}
  .disclaimer p{color:var(--ink)}
  table.facts{width:100%;border-collapse:collapse;margin-top:8px}
  table.facts th{text-align:left;width:150px;padding:8px 10px 8px 0;vertical-align:top;
    font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.04em;
    text-transform:uppercase;color:var(--muted);border-bottom:1px solid #F1F5F9}
  table.facts td{padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px}
  ul.impact{margin:0;padding-left:18px}
  ul.impact li{margin-bottom:8px}
  table.writes{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
  table.writes th{text-align:left;padding:6px 8px;font-family:"JetBrains Mono",monospace;
    font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);
    background:#F8FAFC;border-bottom:1px solid var(--line)}
  table.writes td{padding:8px;border-bottom:1px solid #F1F5F9;vertical-align:top}
  .mono{font-family:"JetBrains Mono",monospace}
  .ok{color:var(--success);font-family:"JetBrains Mono",monospace;font-size:11px}
  .bad{color:var(--critical);font-family:"JetBrains Mono",monospace;font-size:11px}
  .board{border:1px solid var(--line);border-radius:6px;max-height:320px;overflow:auto}
  .board div{padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:12px;line-height:18px}
  .board div:last-child{border-bottom:0}
  .board .mono{color:var(--blue);margin-right:6px}
  footer{color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:16px}
  @media (max-width:720px){ .grid{max-height:none} .meta{margin-left:0} }
</style></head>
<body><div class="wrap">

  <header class="top">
    <div>
      <h1>Security assessment: ${esc(scan.host)}</h1>
      <div class="sub">${scan.mode === 'pentest' ? 'Active penetration test' : 'Logged-out reconnaissance'} of ${esc(scan.url || '')}</div>
    </div>
    <div class="meta">
      <div><span>Taken</span><b>${esc(started)}</b></div>
      <div><span>Findings</span><b>${findings.length}</b></div>
      <div><span>Cost</span><b>$${(scan.spentUsd || 0).toFixed(2)}</b></div>
      <div><span>Steps</span><b>${scan.steps || 0}</b></div>
    </div>
  </header>

  <section class="card">
    <div class="verdict">
      <div class="big">${findings.length ? (worst ? 'Most serious: ' + (SEV_LABEL[worst.sevKey] || '') : '') : 'No exploitable weakness confirmed'}</div>
      ${findings.length ? `<span class="chip sev-${worst.sevKey}">${esc(worst.title)}</span>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><span>Confirmed</span><b>${confirmed.length}</b></div>
      <div class="stat"><span>Critical + High</span><b>${(counts.critical || 0) + (counts.high || 0)}</b></div>
      <div class="stat"><span>Reachable without login</span><b>${findings.filter((f) => f.ease >= 4).length}</b></div>
      <div class="stat"><span>Medium</span><b>${counts.medium || 0}</b></div>
      <div class="stat"><span>Low / Info</span><b>${(counts.low || 0) + (counts.info || 0)}</b></div>
    </div>
  </section>

  ${disclaimer}

  ${rosterSection}

  <section class="card">
    <h2>1. Risk heat map</h2>
    <p class="lede">How easy each issue would be to exploit (left to right) against how bad the consequences would be (bottom to top). The worst combination is the top-right corner. Click any number to see what happened, the evidence, and the fix.</p>

    <div class="heatmap">
      <div class="yaxis">${axisY}</div>
      <div class="grid">${gridHtml}</div>
    </div>
    <div class="xaxis">${axisX}</div>
    <div class="axis-caption">
      <span>Consequences: 5 at top, 1 at bottom</span>
      <span>Ease of exploitation: 1 at left, 5 at right</span>
    </div>

    <div class="legend">
      <span><i style="background:#DC2626"></i>Critical / High</span>
      <span><i style="background:#D97706"></i>Medium</span>
      <span><i style="background:#2563EB"></i>Low</span>
      <span><i style="background:#64748B"></i>Info</span>
      <span>Markers in the same cell are spread so each stays clickable.</span>
    </div>

    <h4 style="margin-top:22px">Ratings explained</h4>
    <p class="note">Ease and consequences are estimated from each finding's severity, its category, and whether the recorded request needed any credentials. They are judgements from the evidence, not a computed CVSS base score. Anything marked SUSPECTED is rated one step harder to exploit and is labelled as unproven where it appears.</p>
  </section>

  <section class="card">
    <h2>2. Fix these first</h2>
    <p class="lede">Confirmed issues only, ordered by consequence and then by how easy they are to exploit. Click a row to jump to its evidence.</p>
    ${fixList ? `<ol class="fixes">${fixList}</ol>` : '<p class="note">No confirmed issues in this run.</p>'}
  </section>

  ${impactSection}

  <section class="card">
    <h2>3. Protections that worked</h2>
    <p class="lede">Checks where the app correctly refused an anonymous visitor. This is the part that says the basics are holding.</p>
    ${worked.length ? `<div class="worked">${worked.map((w) => `<div>${esc(w)}</div>`).join('')}</div>`
      : '<p class="note">The run did not record a route-by-route pass list, so this section is empty rather than claiming anything.</p>'}
  </section>

  <section>
    <h2 style="font-size:16px">Evidence for each finding</h2>
    <p class="lede">Pick a numbered marker in the heat map, or a row in "Fix these first". The highest-risk finding is open below.</p>
    ${detailCards || '<p class="note">No findings recorded.</p>'}
  </section>

  ${data.blocked ? `<section class="card"><h2>What could not be tested</h2><p class="note">${esc(data.blocked)}</p></section>` : ''}

  <footer>Generated by hackmywebsite.ai for run ${esc(scan.id)}. Ratings are estimates from evidence; verify before acting.</footer>
</div>

<script>
  const FIRST = ${ranked.length ? ranked[0].n : 0};
  const details = [...document.querySelectorAll('.detail')];
  const markers = [...document.querySelectorAll('.marker')];
  function open(n) {
    details.forEach(d => d.hidden = d.id !== 'd-' + n);
    markers.forEach(m => m.classList.toggle('active', m.dataset.n === String(n)));
    const el = document.getElementById('d-' + n);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  markers.forEach(m => m.addEventListener('click', () => open(m.dataset.n)));
  document.querySelectorAll('.jump').forEach(b => b.addEventListener('click', () => open(b.dataset.n)));
  // show the worst finding immediately so the page is never blank below the fold
  if (FIRST) { details.forEach(d => d.hidden = d.id !== 'd-' + FIRST); }
</script>
</body></html>`;
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node report_html.mjs <scan-dir>'); process.exit(2); }
const html = build(dir);
const out = path.join(dir, 'report.html');
fs.writeFileSync(out, html, 'utf8');
console.log(out);
