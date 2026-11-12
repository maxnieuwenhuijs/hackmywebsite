// evidence_build.mjs - build a deterministic evidence index from agent event logs.
// Usage: node evidence_build.mjs <scan-dir>
//
// The agent report is prose. The event logs contain the actual tool calls and the
// server responses. This script pairs each finding with the tool call/result that
// contains its flag or endpoint, so the report can show reproducible evidence.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: node evidence_build.mjs <scan-dir>"); process.exit(2); }

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const text = (value) => {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value ?? ""); }
};
const clip = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max)}\n... [${s.length - max} tekens ingekort]` : s;
};
const focus = (value, flag, max = 6000) => {
  const s = String(value ?? "");
  if (!flag || !s.includes(flag)) return clip(s, max);
  const at = s.indexOf(flag);
  const start = Math.max(0, at - 1200);
  const end = Math.min(s.length, at + flag.length + 1800);
  return `${start > 0 ? "... " : ""}${s.slice(start, end)}${end < s.length ? " ..." : ""}`;
};
const unique = (list) => [...new Set(list)];
// File reads and writes are not proof that a network request happened. Including them
// makes a finding look confirmed while showing unrelated file contents.
const NON_NETWORK_TOOLS = new Set(["read", "write", "edit", "glob", "grep"]);
const isNetworkCall = (call) =>
  !NON_NETWORK_TOOLS.has(call.tool)
  && !/\bboard\.mjs\b/.test(call.command)
  && !/^\s*(?:Get-Content|Select-String|Write-Output|\$p\s*=\s*Get-Content)/i.test(call.command);

const scan = readJson(path.join(dir, "scan.json"), {});
const findingsFile = readJson(path.join(dir, "findings.json"), { findings: [] });
const findings = Array.isArray(findingsFile.findings) ? findingsFile.findings : [];
const attack = readJson(path.join(dir, "attack-chain.json"), null);
const attackSteps = Array.isArray(attack?.steps) ? attack.steps : [];
const agentsDir = path.join(dir, "agents");
const agentNames = fs.existsSync(agentsDir)
  ? fs.readdirSync(agentsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const calls = [];
for (const agent of agentNames) {
  const eventsFile = path.join(agentsDir, agent, "events.jsonl");
  if (!fs.existsSync(eventsFile)) continue;
  const lines = fs.readFileSync(eventsFile, "utf8").split("\n").filter(Boolean);
  const callById = new Map();
  lines.forEach((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === "tool_call") {
      const input = event.input || {};
      callById.set(event.callId, {
        agent,
        callId: event.callId,
        tool: event.tool || "",
        command: input.command || input.script || text(input),
        index,
      });
    } else if (event.type === "tool_result") {
      const call = callById.get(event.callId) || { agent, callId: event.callId, tool: "", command: "", index };
      calls.push({
        ...call,
        status: event.status || "",
        result: text(event.result || event.output || ""),
        index,
      });
    }
  });
}

const endpointPaths = (finding) => {
  const raw = [finding.endpoint, finding.vector, finding.evidence, finding.proof].map(text).join(" ");
  return unique((raw.match(/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{2,}/g) || [])
    .map((p) => p.replace(/[.,;:)]+$/, ""))
    .filter((p) => !p.startsWith("//") && p.length >= 3)
    // HTTP/1.1 and bare content types are not API paths. Without this filter every
    // response on the target matches every finding.
    .filter((p) => !/^\/1\.[01]$/.test(p) && !/^\/(?:json|html|xml|plain|javascript|css)$/i.test(p))
    .slice(0, 8));
};
const flagsOf = (finding) => {
  const raw = text(finding);
  return unique([...(raw.match(/HMW\{[^}]+\}/g) || []), finding.flag].filter(Boolean));
};
const markersOf = (finding) => {
  const raw = [finding.endpoint, finding.title, finding.evidence, finding.observed].map(text).join(" ");
  const primaryPath = (String(finding.endpoint || "").match(/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{2,}/) || [])[0] || "";
  return unique([
    ...(raw.match(/\bNO_[A-Z_]+\b/g) || []),
    primaryPath,
    ...(/\bX-Forwarded-For\b/i.test(raw) ? ["X-Forwarded-For"] : []),
  ].filter(Boolean));
};

const evidence = findings.map((finding, index) => {
  const flags = flagsOf(finding);
  const paths = endpointPaths(finding);
  const markers = markersOf(finding);
  const markerScore = (call) => markers.reduce((score, marker) =>
    score + (call.command.includes(marker) ? 2 : 0) + (call.result.includes(marker) ? 1 : 0), 0);
  let candidates = calls
    .filter((call) => isNetworkCall(call) && markers.some((marker) =>
      call.command.includes(marker) || call.result.includes(marker)))
    .sort((a, b) => markerScore(b) - markerScore(a));
  if (!candidates.length) {
    candidates = calls.filter((call) =>
      isNetworkCall(call)
      && flags.some((flag) => call.result.includes(flag)));
  }
  if (!candidates.length && paths.length) {
    // Require the request path in the command itself. Matching paths anywhere in a
    // result pulled in board logs, file listings and unrelated endpoints.
    candidates = calls.filter((call) =>
      isNetworkCall(call)
      && paths.some((p) => call.command.includes(p)));
  }
  if (!candidates.length && flags.length) {
    candidates = calls.filter((call) =>
      isNetworkCall(call)
      && flags.some((flag) => call.command.includes(flag)));
  }
  const seen = new Set();
  const items = [];
  for (const call of candidates) {
    if (seen.has(call.callId)) continue;
    seen.add(call.callId);
    if (!call.command && !call.result) continue;
    const matchedFlag = flags.find((flag) => call.result.includes(flag) || call.command.includes(flag)) || "";
    items.push({
      agent: call.agent,
      tool: call.tool,
      status: call.status,
      matchedFlag,
      command: clip(call.command, 3000),
      result: focus(call.result, matchedFlag, 6000),
    });
    if (items.length >= 6) break;
  }
  if (!items.some((item) => item.matchedFlag) && flags.length) {
    const chainStep = attackSteps.find((step) =>
      flags.some((flag) => step.proof?.flag === flag || String(step.response?.body || "").includes(flag)));
    if (chainStep) {
      items.push({
        agent: "threat-demo",
        tool: "fetch",
        status: "completed",
        matchedFlag: flags.find((flag) => chainStep.proof?.flag === flag || String(chainStep.response?.body || "").includes(flag)) || flags[0],
        command: `${chainStep.request?.method || "GET"} ${chainStep.request?.url || ""}`,
        result: focus(chainStep.response?.body || "", flags[0], 6000),
      });
    }
  }
  if (!items.length) {
    const observed = text(finding.evidence || finding.proof || finding.impact || "");
    if (observed) items.push({ agent: "agent-report", tool: "report", status: "reported", matchedFlag: flags[0] || "", command: "", result: observed });
  }
  return {
    index: index + 1,
    id: finding.id || "",
    title: finding.title || "",
    severity: finding.severity || "",
    endpoint: finding.endpoint || "",
    flag: flags[0] || finding.flag || "",
    flags,
    items,
  };
});

const out = {
  scanId: scan.id || path.basename(path.resolve(dir)),
  target: scan.url || "",
  builtAt: new Date().toISOString(),
  eventCount: calls.length,
  findings: evidence,
};
fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(out, null, 2));

const withItems = evidence.filter((e) => e.items.length).length;
const withFlag = evidence.filter((e) => e.flags.length).length;
console.log(JSON.stringify({ out: path.join(dir, "evidence.json"), findings: evidence.length, withItems, withFlag, events: calls.length }, null, 2));
