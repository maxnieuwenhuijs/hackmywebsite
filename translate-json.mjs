// translate-json.mjs - translate human-readable values in report/content JSON.
import { langByCode } from "./i18n.mjs";

const API_BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");

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
function costOf(usage, model) {
  const rates = RATES[model] || RATES["deepseek-flash"];
  const window = isPeak() ? "peak" : "offPeak";
  const hit = Number(usage?.prompt_cache_hit_tokens || 0);
  const miss = Number(usage?.prompt_cache_miss_tokens || Math.max(0, Number(usage?.prompt_tokens || 0) - hit));
  const output = Number(usage?.completion_tokens || 0);
  return (hit * rates.hit[window] + miss * rates.input[window] + output * rates.output[window]) / 1e6;
}

export async function translateJson(value, { language, model = "deepseek-flash", apiKey }) {
  const info = langByCode(language);
  if (!apiKey) throw new Error("missing DeepSeek API key");
  const source = JSON.stringify(value);
  const prompt = `Translate the human-readable strings in this security report JSON from Dutch into ${info.ai}.
Keep every key, array, number, URL, request, response, evidence, model name and identifier unchanged.
Do not translate schema values: sev must stay kritiek|hoog|middel|laag|info, status must stay bevestigd|vermoedelijk|deels_bevestigd, effort must stay klein|middel|groot.
Translate: verdict_title, verdict_lede, alert_title, alert_text, findings[].title, findings[].where, findings[].lede, findings[].risk, findings[].fix, findings[].cause, findings[].solution, findings[].note, findings[].status_note, plan titles/text, good, limits, glossary term/def, next_title, next_text.
Return ONLY the same JSON object, no markdown, no prose.

${source}`;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are a professional Dutch-to-${info.ai} translator. Return only valid JSON with the same structure. Never add or remove keys.` },
          { role: "user", content: prompt + (attempt ? "\n\nIMPORTANT: Return the complete JSON object. Escape all quotes inside strings. No markdown." : "") },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0,
        max_tokens: attempt ? 32000 : Math.min(64000, Math.max(12000, Math.ceil(source.length / 2))),
        stream: false,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`translation API ${response.status}: ${raw.slice(0, 200)}`);
    const body = JSON.parse(raw);
    const text = body.choices?.[0]?.message?.content || "";
    try {
      const block = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]).pop();
      const translated = JSON.parse(block || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (!translated || typeof translated !== "object") throw new Error("translation returned no object");
      return {
        value: translated,
        costUsd: Number(costOf(body.usage || {}, body.model || model).toFixed(6)),
        usage: body.usage || null,
        model: body.model || model,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`translation returned invalid JSON: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
