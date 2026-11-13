// advisor.mjs - a senior pentest lead reads one finished scan and writes a
// budget advice block for the top of the report.
// Usage: node advisor.mjs <scan-dir> [--budget 0.05] [--lang nl]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { priorPayload } from "./handoff.mjs";
import { langByCode } from "./i18n.mjs";
import { translateJson } from "./translate-json.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node advisor.mjs <scan-dir>"); process.exit(2); }
const getFlag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const LANG = getFlag("lang", "nl");
const LANG_INFO = langByCode(LANG);
const BUDGET = Number(getFlag("budget", "0.05"));
const MODEL = getFlag("model", process.env.DEEPSEEK_REPORT_MODEL || "deepseek-flash");
const API_BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const API_URL = `${API_BASE}/chat/completions`;
const MAX_TOKENS = 1800;

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const mask = (value) => String(value || "")
  .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2")
  .replace(/\b(sk|pk|api|tok)[-_][A-Za-z0-9_-]{6,}/gi, "***")
  .replace(/\b[A-Fa-f0-9]{32,}\b/g, "***");
const short = (value, max) => {
  const text = mask(typeof value === "string" ? value : JSON.stringify(value ?? ""));
  return text.length > max ? `${text.slice(0, max)}...` : text;
};
const clean = (value, max) => short(String(value ?? "").replace(/[—–]/g, "-").replace(/\p{Extended_Pictographic}/gu, ""), max);

function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const yaml = fs.readFileSync(path.join(os.homedir(), ".dsh", ".credentials.yaml"), "utf8");
    const match = yaml.match(/DEEPSEEK_API_KEY:\s*([^\s"']+)/);
    if (match) return match[1];
  } catch {}
  return "";
}

const scan = readJson(path.join(dir, "scan.json"), null);
const data = readJson(path.join(dir, "findings.json"), { findings: [] });
if (!scan) { console.error("scan.json is missing"); process.exit(2); }

function fallbackAdvice(reason) {
  const budget = Number(scan.budgetUsd || 0);
  const extra = Math.max(25, Math.round(budget * 0.5));
  if (LANG !== "nl") {
    return {
      generatedBy: "advice-agent",
      model: "heuristic",
      generatedAt: new Date().toISOString(),
      reason,
      headline: `About $${extra} extra would cover the largest blind spots`,
      summary: "This run stopped at the budget limit. More budget buys coverage and verification, not a guarantee of new findings.",
      confidence: "medium",
      items: [
        { title: "Test authentication and roles systematically", extraBudgetUsd: extra, what: "Test every role and object with two accounts, including vertical privileges.", why: "The current run stopped before every role and object was tested.", expected: "More confidence in access-control findings." },
        { title: "Verify the impact of the findings", extraBudgetUsd: Math.round(extra * 0.8), what: "Try to prove the reported access problems with your own test data and restore it.", why: "Access without login is not yet proven data exposure.", expected: "Evidence of real impact instead of a suspicion." },
        { title: "Finish browser and chain tests", extraBudgetUsd: Math.round(extra * 0.6), what: "Test the full browser flow, rate limiting and combinations between findings.", why: "Single endpoints say little about an exploitable chain.", expected: "Better prioritisation and less manual work." },
      ],
      limits: "More budget increases coverage, but not automatically the number of findings. A clean run remains a valid result.",
    };
  }
  return {
    generatedBy: "advice-agent",
    model: "heuristic",
    generatedAt: new Date().toISOString(),
    reason,
    headline: `Met ongeveer $${extra} extra kunnen we de grootste blinde vlekken afdekken`,
    summary: "Deze run is gestopt door het budget. Meer budget koopt extra dekking en verificatie, geen garantie op nieuwe kwetsbaarheden.",
    confidence: "middel",
    items: [
      { title: "Authenticatie en rollen systematisch testen", extraBudgetUsd: extra, what: "Test elke rol en elk object met twee accounts, inclusief verticale rechten.", why: "De huidige run stopte voordat alle rollen en objecten waren getest.", expected: "Meer zekerheid over access-control fouten." },
      { title: "Bevindingen exploitationeel verifiëren", extraBudgetUsd: Math.round(extra * 0.8), what: "Probeer de gemelde toegangsproblemen met eigen testdata aantoonbaar te maken en weer te herstellen.", why: "Toegang zonder login is nog geen bewezen datalek.", expected: "Bewijs of de impact echt is, in plaats van vermoedelijk." },
      { title: "Browser- en ketentests afmaken", extraBudgetUsd: Math.round(extra * 0.6), what: "Test de volledige browserflow, rate limiting en combinaties tussen bevindingen.", why: "Losse endpoints zeggen weinig over een exploiteerbare keten.", expected: "Betere prioritering en minder handmatig werk." },
    ],
    limits: "Meer budget verhoogt de dekking, maar niet automatisch het aantal kwetsbaarheden. Een schone run blijft een geldig resultaat.",
  };
}

function isPeak(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}
const RATES = {
  "deepseek-flash": { hit: { peak: 0.006, offPeak: 0.003 }, input: { peak: 0.3, offPeak: 0.15 }, output: { peak: 1.2, offPeak: 0.6 } },
  "deepseek-v4-pro": { hit: { peak: 0.044, offPeak: 0.022 }, input: { peak: 1.32, offPeak: 0.66 }, output: { peak: 3.96, offPeak: 1.98 } },
};
function costOf(usage, model, at = new Date()) {
  const rates = RATES[model] || RATES["deepseek-flash"];
  const window = isPeak(at) ? "peak" : "offPeak";
  const hit = Number(usage?.prompt_cache_hit_tokens || 0);
  const miss = Number(usage?.prompt_cache_miss_tokens || Math.max(0, Number(usage?.prompt_tokens || 0) - hit));
  const output = Number(usage?.completion_tokens || 0);
  return (hit * rates.hit[window] + miss * rates.input[window] + output * rates.output[window]) / 1e6;
}

const findings = (data.findings || []).map((finding, index) => ({
  n: index + 1,
  title: short(finding.title, 180),
  severity: finding.severity,
  status: finding.status,
  endpoint: short(finding.endpoint, 120),
  impact: short(finding.evidence?.observed || finding.impact || "", 360),
}));
const tested = Array.isArray(data.tested) ? data.tested.slice(0, 30).map((item) => short(item, 300)) : [];
const prior = priorPayload(scan.host, scan.id);
const priorText = prior ? JSON.stringify({
  scanId: prior.scanId,
  budgetUsd: prior.budgetUsd,
  status: prior.status,
  findings: prior.findings.map((finding) => ({ title: finding.title, severity: finding.severity, status: finding.status })),
  advice: prior.advice,
}, null, 1) : "none";

const prompt = `Je bent een senior penetration test lead. Je schrijft een kort advies voor de eigenaar van ${scan.url} boven aan het rapport.
${LANG === "nl" ? "" : `CRITICAL LANGUAGE RULE: write every JSON string value in ${LANG_INFO.ai}. Do not write Dutch in the headline, summary, items, why, expected or limits.`}
De eigenaar is geen beveiligingsexpert. Schrijf in het ${LANG_INFO.ai.toUpperCase()} op B1-niveau, korte zinnen, je-vorm, actief. Nooit een em dash, nooit emoji's.

Deze run:
- scan: ${scan.id}
- modus: ${scan.mode || "pentest"}
- budget: $${Number(scan.budgetUsd || 0).toFixed(2)}
- uitgegeven: $${Number(scan.spentUsd || 0).toFixed(2)}
- status: ${scan.status}
- stappen: ${scan.steps || 0}
- doel/dekking: ${JSON.stringify(scan.goal || {})}

Bevindingen:
${JSON.stringify(findings, null, 1)}

Getest:
${JSON.stringify(tested, null, 1)}

Vorige run op hetzelfde doel:
${priorText}

Schrijf alleen geldige JSON in deze vorm:
{
  "headline": "max 12 woorden, concreet",
  "summary": "2 tot 3 korte zinnen",
  "confidence": "hoog|middel|laag",
  "items": [
    {
      "title": "korte titel",
      "extraBudgetUsd": 50,
      "what": "wat gaan we extra doen, 1 of 2 zinnen",
      "why": "waarom dit nu ontbreekt, 1 zin",
      "expected": "wat de klant mag verwachten, 1 zin"
    }
  ],
  "limits": "1 zin over wat meer budget niet garandeert"
}

Regels:
- Baseer je alleen op deze run en de vorige run. Verzin geen kwetsbaarheden of coverage.
- Meer budget koopt tijd, dekking, verificatie en diepgang. Het garandeert geen nieuwe kwetsbaarheden.
- Geef 2 tot 4 items, gesorteerd op prioriteit.
- Noem geen tokens, wachtwoorden, persoonsgegevens of klantgegevens.
- Als een punt al bevestigd is, stel dan verificatie of impactmeting voor, niet opnieuw zoeken.
- Als de vorige run iets al heeft getest, stel dan iets anders voor.
- extraBudgetUsd is een realistische extra opdracht, geen exacte prijs.
- Geen markdown, geen codeblokken, alleen JSON.`;

async function runModel() {
  const key = deepseekKey();
  if (!key) return null;
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: `You are a senior penetration-test lead. Write every user-facing string in ${LANG_INFO.ai}. Return only valid JSON. Never invent findings. Never include secrets or personal data.` },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error(`DeepSeek returned ${response.status}: ${raw.slice(0, 300)}`);
    return null;
  }
  const body = JSON.parse(raw);
  const text = body.choices?.[0]?.message?.content || "";
  let advice = null;
  try {
    const block = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]).pop();
    advice = JSON.parse(block || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (!advice || !Array.isArray(advice.items) || !advice.items.length) return null;
  advice.generatedBy = "advice-agent";
  advice.model = body.model || MODEL;
  advice.generatedAt = new Date().toISOString();
  advice.costUsd = Number(costOf(body.usage || {}, advice.model).toFixed(6));
  advice.usage = body.usage || undefined;
  advice.scanId = scan.id;
  advice.previousScanId = prior?.scanId || null;
  return advice;
}

let advice = null;
try { advice = await runModel(); } catch (error) {
  console.error(`advisor model failed: ${error instanceof Error ? error.message : String(error)}`);
}
if (!advice) advice = fallbackAdvice("model unavailable, heuristic fallback");
if (!advice.scanId) advice.scanId = scan.id;
if (!advice.previousScanId) advice.previousScanId = prior?.scanId || null;
advice.budgetUsd = Number(scan.budgetUsd || 0);
advice.spentUsd = Number(scan.spentUsd || 0);
advice.items = advice.items.slice(0, 4).map((item, index) => ({
  title: clean(item.title || `Extra stap ${index + 1}`, 140),
  extraBudgetUsd: Math.max(1, Math.round(Number(item.extraBudgetUsd || 0))),
  what: clean(item.what || "", 260),
  why: clean(item.why || "", 220),
  expected: clean(item.expected || "", 220),
}));
advice.headline = clean(advice.headline || "Meer budget geeft meer dekking", 160);
advice.summary = clean(advice.summary || "", 500);
advice.limits = clean(advice.limits || "Meer budget geeft meer dekking, geen garantie op nieuwe kwetsbaarheden.", 260);

if (LANG !== "nl" && LANG !== "en") {
  const key = deepseekKey();
  if (key) {
    try {
      const translated = await translateJson({
        headline: advice.headline,
        summary: advice.summary,
        items: advice.items,
        limits: advice.limits,
      }, { language: LANG, model: MODEL, apiKey: key });
      if (translated.value?.items?.length === advice.items.length) {
        advice.headline = clean(translated.value.headline, 160);
        advice.summary = clean(translated.value.summary, 500);
        advice.limits = clean(translated.value.limits, 260);
        advice.items = advice.items.map((item, index) => ({
          ...item,
          title: clean(translated.value.items[index]?.title || item.title, 140),
          what: clean(translated.value.items[index]?.what || item.what, 260),
          why: clean(translated.value.items[index]?.why || item.why, 220),
          expected: clean(translated.value.items[index]?.expected || item.expected, 220),
        }));
        advice.costUsd = Number((Number(advice.costUsd || 0) + translated.costUsd).toFixed(6));
      }
    } catch (error) {
      console.error(`advisor translation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const adviceFile = path.join(dir, `advice.${LANG}.json`);
fs.writeFileSync(adviceFile, JSON.stringify(advice, null, 2));
if (LANG === "nl") {
  // Keep the legacy file for existing reports and scripts.
  fs.writeFileSync(path.join(dir, "advice.json"), JSON.stringify(advice, null, 2));
}
console.log(JSON.stringify({
  out: adviceFile,
  generatedBy: advice.generatedBy,
  model: advice.model,
  items: advice.items.length,
  previousScanId: advice.previousScanId,
  costUsd: advice.costUsd || 0,
}, null, 2));
