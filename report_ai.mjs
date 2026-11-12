// report_ai.mjs - write the report content with the DeepSeek API.
// Usage: node report_ai.mjs <scan-dir> [--budget 0.30] [--model deepseek-flash|deepseek-v4-pro]
// Writes content.<lang>.json next to findings.json. The HTML builder consumes it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { langByCode } from './i18n.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node report_ai.mjs <scan-dir>'); process.exit(2); }
const getFlag = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const BUDGET = Number(getFlag('budget', '0.30'));
const LANG = getFlag('lang', 'nl');
const MODEL = getFlag('model', process.env.DEEPSEEK_REPORT_MODEL || 'deepseek-flash');
const API_BASE = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const API_URL = `${API_BASE}/chat/completions`;
const MAX_TOKENS = Math.min(64000, Math.max(2000, Number(process.env.DEEPSEEK_MAX_TOKENS || 16000)));
const LANG_INFO = langByCode(LANG);

function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const yaml = fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
    const match = yaml.match(/DEEPSEEK_API_KEY:\s*([^\s"']+)/);
    if (match) return match[1];
  } catch {}
  return '';
}

const KEY = deepseekKey();
if (!KEY) {
  console.error('DEEPSEEK_API_KEY is not set. Add it to the environment or ~/.dsh/.credentials.yaml.');
  process.exit(2);
}

// DeepSeek list prices per 1M tokens. Peak is 01:00-04:00 and 06:00-10:00 UTC on weekdays.
const DEEPSEEK_RATES = {
  'deepseek-flash': {
    cacheHit: { peak: 0.006, offPeak: 0.003 },
    input: { peak: 0.3, offPeak: 0.15 },
    output: { peak: 1.2, offPeak: 0.6 },
  },
  'deepseek-v4-pro': {
    cacheHit: { peak: 0.044, offPeak: 0.022 },
    input: { peak: 1.32, offPeak: 0.66 },
    output: { peak: 3.96, offPeak: 1.98 },
  },
};

function isPeak(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function costOfUsage(usage, model = MODEL, at = new Date()) {
  const rates = DEEPSEEK_RATES[model] || DEEPSEEK_RATES['deepseek-flash'];
  const window = isPeak(at) ? 'peak' : 'offPeak';
  const hit = Number(usage?.prompt_cache_hit_tokens || 0);
  const miss = Number(usage?.prompt_cache_miss_tokens || Math.max(0, Number(usage?.prompt_tokens || 0) - hit));
  const output = Number(usage?.completion_tokens || 0);
  return (hit * rates.cacheHit[window] + miss * rates.input[window] + output * rates.output[window]) / 1e6;
}

const scan = JSON.parse(fs.readFileSync(path.join(dir, 'scan.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));

function mask(s) {
  return String(s || '')
    .replace(/([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (m, a, b, d) => a + '***@' + d)
    .replace(/\b(sk|pk|api|tok)[-_][A-Za-z0-9_-]{6,}/gi, '***')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '***');
}

// compact evidence for the model: no tokens, masked addresses, trimmed bodies
const evidence = (data.findings || []).map((f, i) => ({
  n: i + 1,
  title: f.title,
  severity: f.severity,
  status: f.status,
  category: f.category,
  impact: mask(f.impact).slice(0, 400),
  request: mask(f.request).slice(0, 400),
  response: mask(f.response).slice(0, 700),
  rootCause: mask(f.rootCause).slice(0, 400),
  fix: mask(f.fix).slice(0, 400),
}));

const tested = (data.tested || []).slice(0, 60);
const writes = (data.writeActions || []).map((w) => ({ method: w.method, url: w.url, effect: w.effect, reverted: w.reverted }));

const prompt = `Je schrijft een beveiligingsrapport in het ${LANG_INFO.ai.toUpperCase()} voor de eigenaar van een website.
De eigenaar is geen beveiligingsexpert. Schrijf op taalniveau B1: korte zinnen (maximaal 20 woorden),
je-vorm, actief, concreet. Nooit een em dash, nooit emoji's.

Doel: ${scan.url}
Scan: ${scan.id}, ${scan.steps} stappen, modus ${scan.mode || 'pentest'}.

BEVINDINGEN (bron, gebruik alleen wat hier staat):
${JSON.stringify(evidence, null, 1)}

GETEST EN GOED AFGESLAGEN (voor sectie "Wat goed gaat"):
${JSON.stringify(tested.slice(0, 30))}

${writes.length ? 'GEWIJZIGDE TESTOBJECTEN (alleen jouw eigen testdata):\n' + JSON.stringify(writes) : ''}

Lever ALLEEN geldige JSON, geen uitleg eromheen, in exact deze vorm:
{
 "verdict_title": "max 8 woorden, het eindoordeel",
 "verdict_lede": "3 korte zinnen uitleg",
 "alert_title": "kort, alleen bij kritiek of hoog, anders leeg",
 "alert_text": "1 of 2 zinnen",
 "findings": [{
   "src_n": [1],
   "title": "uitkomst in gewone taal, geen techniek, max 10 woorden",
   "where": "de plek, bijvoorbeeld /admin/alerts",
   "sev": "kritiek|hoog|middel|laag|info",
   "status": "bevestigd|vermoedelijk|deels_bevestigd",
   "status_note": "alleen bij deels_bevestigd: wat is bevestigd en wat is vermoedelijk?",
   "ease": 1,
   "impact": 1,
   "lede": "Wat is er aan de hand? 1 tot 3 zinnen",
   "risk": "Wat kan er misgaan? 1 tot 3 zinnen, noem de AVG bij persoonsgegevens",
   "fix": "Wat moet er gebeuren? 1 tot 3 zinnen, met hoe je het test",
   "cause": "technische oorzaak, 1 zin",
   "solution": "technische oplossing, 1 zin",
   "note": "beoordelingszin: waarom deze schade en dit gemak"
 }],
 "plan": {
   "vandaag": [{"title": "werkwoord vooraan", "text": "max 2 zinnen", "refs": [1], "effort": "klein|middel|groot"}],
   "week": [],
   "maand": []
 },
 "good": [{"title": "wat goed ging", "text": "1 zin", "proof": "kort bewijs in mono"}],
 "limits": [{"title": "grens", "text": "1 zin"}],
 "glossary": [{"id": "term", "term": "Term", "def": "uitleg in gewone taal"}],
 "next_title": "de eerste klus",
 "next_text": "1 of 2 zinnen"
}

Regels:
- "src_n" is het nummer (of de nummers) van de bronbevinding(en) die je samenvat. Verzin geen
  nummers en sla geen bevinding over: elke bronbevinding moet in precies één item voorkomen.
  Voeg je twee punten samen, zet dan beide nummers in src_n.
- Status: gebruik "deels_bevestigd" als de technische toegang of het gedrag is bevestigd,
  maar de impact of data-exposure niet. Zet in "status_note" precies wat bevestigd is en
  wat niet. Gebruik "bevestigd" alleen als het hele punt is aangetoond, inclusief impact.
  Gebruik "vermoedelijk" als ook de technische observatie niet is herhaald.
- Als de bron zegt dat er geen echte klantdata is opgehaald, noem dat in risk en status_note.
- Rate limiting: als de bron een 429-reeks laat zien, zeg niet dat er geen limiter is.
  Benoem een omzeiling alleen als de bron die laat zien.
- Schade (impact): kritiek=5, hoog=4, middel=3, laag=2, info=1.
- Gemak (ease): begin 5 bij access-control/auth/pii, 4 bij injection/misconfig, 3 anders.
  Geen inlog nodig: +1 (max 5). Wel inlog nodig: -1. Vermoedelijk: -1.
- Voeg punten met dezelfde oorzaak samen tot een klus in het stappenplan.
- vandaag = kritiek en hoog, week = middel en klein werk, maand = de rest.
- Elke vakterm die je in lopende tekst gebruikt, krijgt een item in glossary met hetzelfde id.
- Verzin niets. Staat het niet in de bron, laat het weg.
- Masker persoonsgegevens al in je tekst: es***@live.nl. Nooit tokens of wachtwoorden.`;

let attempts = 0;

function parseReport(text) {
  const block = [...String(text).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]).pop();
  try { return JSON.parse(block || String(text).slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
}

function save(json, spent, usage, model) {
  json.generatedBy = 'deepseek-api';
  json.provider = 'deepseek';
  json.model = model || MODEL;
  json.costUsd = Number(spent.toFixed(6));
  json.usage = usage || undefined;
  json.reportBudgetUsd = BUDGET;
  fs.writeFileSync(path.join(dir, "content." + LANG + ".json"), JSON.stringify(json, null, 2));
  console.log(`content.` + LANG + `.json written: ${json.findings?.length || 0} findings, ${json.model}, ${usage?.prompt_tokens || 0} in / ${usage?.completion_tokens || 0} out, cost $${spent.toFixed(4)}, attempts ${attempts}`);
}

async function runModel(text, extra = '') {
  attempts += 1;
  const payload = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a security report writer. Return only a valid JSON object matching the requested schema. No markdown, no prose and no code fences. Never invent findings, tokens or personal data.',
      },
      { role: 'user', content: text + extra },
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    stream: false,
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(240000),
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error(`DeepSeek API returned ${response.status}: ${raw.slice(0, 400)}`);
      return { json: null, spent: 0, usage: null, model: MODEL, text: '' };
    }
    const body = JSON.parse(raw);
    const content = body.choices?.[0]?.message?.content;
    const usage = body.usage || {};
    const spent = costOfUsage(usage, body.model || MODEL);
    const outputText = typeof content === 'string' ? content : '';
    if (spent > BUDGET) console.warn(`report cost $${spent.toFixed(4)} exceeded budget $${BUDGET.toFixed(2)}`);
    return { json: parseReport(outputText), spent, usage, model: body.model || MODEL, text: outputText };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`DeepSeek request failed: ${message}`);
    return { json: null, spent: 0, usage: null, model: MODEL, text: '' };
  }
}

(async () => {
  let result = await runModel(prompt);
  if (!result.json) {
    // one retry: a truncated or chatty reply should not cost the whole language
    console.error('first attempt returned no JSON, retrying once');
    result = await runModel(prompt, '\n\nIMPORTANT: return ONLY the JSON object. No prose, no markdown fence.');
  }
  if (!result.json) {
    console.error('DeepSeek did not return valid report JSON after 2 attempts');
    process.exit(1);
  }
  save(result.json, result.spent, result.usage, result.model);
})();

