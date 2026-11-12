// handoff.mjs - compact history for a target, used by advisor and by a rerun.
import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const SCANS = path.join(HERE, "scans");

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};

const short = (value, max = 280) => {
  const text = (typeof value === "string" ? value : JSON.stringify(value ?? ""))
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2")
    .replace(/\b(sk|pk|api|tok)[-_][A-Za-z0-9_-]{6,}/gi, "***")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "***");
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

export function previousScan(host, excludeId) {
  let entries = [];
  try {
    entries = fs.readdirSync(SCANS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const dir = path.join(SCANS, entry.name);
        const scan = readJson(path.join(dir, "scan.json"), null);
        return scan ? { dir, scan } : null;
      })
      .filter(Boolean);
  } catch { return null; }

  const candidates = entries
    .filter(({ scan }) => scan.id !== excludeId
      && String(scan.host || "").toLowerCase() === String(host || "").toLowerCase()
      && !["running", "queued"].includes(String(scan.status || "").toLowerCase()))
    .sort((a, b) => (b.scan.endedAt || b.scan.startedAt || 0) - (a.scan.endedAt || a.scan.startedAt || 0));
  return candidates[0] || null;
}

export function priorPayload(host, excludeId) {
  const found = previousScan(host, excludeId);
  if (!found) return null;
  const { dir, scan } = found;
  const data = readJson(path.join(dir, "findings.json"), { findings: [] });
  const advice = readJson(path.join(dir, "advice.json"), null);
  const findings = Array.isArray(data.findings) ? data.findings : [];
  return {
    scanId: scan.id,
    url: scan.url,
    host: scan.host,
    budgetUsd: scan.budgetUsd,
    spentUsd: scan.spentUsd,
    status: scan.status,
    endedAt: scan.endedAt,
    findings: findings.slice(0, 12).map((f, index) => ({
      n: index + 1,
      title: short(f.title, 180),
      severity: f.severity,
      status: f.status,
      endpoint: short(f.endpoint, 120),
      observed: short(f.evidence?.observed || f.impact || "", 320),
    })),
    advice: advice ? {
      headline: short(advice.headline, 220),
      summary: short(advice.summary, 500),
      items: Array.isArray(advice.items)
        ? advice.items.slice(0, 4).map((item) => ({
          title: short(item.title, 140),
          extraBudgetUsd: item.extraBudgetUsd,
          what: short(item.what, 220),
        }))
        : [],
    } : null,
    tested: Array.isArray(data.tested) ? data.tested.slice(0, 20) : [],
  };
}

export function priorContext(host, excludeId, maxChars = 5000) {
  const prior = priorPayload(host, excludeId);
  if (!prior) return "";
  const lines = [
    "## Previous engagement on this same target",
    `A previous authorized run exists: scan ${prior.scanId} on ${prior.host}, budget $${Number(prior.budgetUsd || 0).toFixed(0)}, status ${prior.status}.`,
    "Use this context to avoid repeating work. Re-test only where the evidence is weak or the previous run stopped early.",
    "Known findings from the previous run:",
    ...prior.findings.map((f) => `- ${f.severity || "info"} / ${f.status || "unknown"}: ${f.title} (${f.endpoint || "no endpoint"})`),
  ];
  if (prior.tested.length) {
    lines.push("Previous tested areas:");
    lines.push(...prior.tested.slice(0, 12).map((item) => `- ${short(item, 180)}`));
  }
  if (prior.advice) {
    lines.push(`Previous advisor conclusion: ${prior.advice.headline || ""}`);
    for (const item of prior.advice.items || []) {
      lines.push(`- ${item.title || "next step"}${item.extraBudgetUsd ? ` (+$${item.extraBudgetUsd})` : ""}: ${item.what || ""}`);
    }
  }
  lines.push("Do not claim a previous finding is fixed unless you verify it. Do not repeat a dead end unless the new budget enables a materially different test.");
  return lines.join("\n").slice(0, maxChars);
}
