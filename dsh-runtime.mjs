// dsh-runtime.mjs - choose the Windows desktop host or the cross-platform DSH CLI.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const WINDOWS_EXE = process.env.DSH_EXE || "C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe";
const WINDOWS_CLI = process.env.DSH_CLI || "C:\\Users\\maxni\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js";

function credentialFiles() {
  const files = [
    process.env.DSH_CREDENTIALS_FILE,
    process.env.DSH_HOME ? path.join(process.env.DSH_HOME, ".credentials.yaml") : null,
    path.join(os.homedir(), ".dsh", ".credentials.yaml"),
  ].filter(Boolean);
  return [...new Set(files)];
}

function readCredential(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const file of credentialFiles()) {
    try {
      const yaml = fs.readFileSync(file, "utf8");
      const match = yaml.match(new RegExp(`${name}:\\s*([^\\s"']+)`));
      if (match) return match[1];
    } catch {}
  }
  return "";
}

export function deepseekApiKey() {
  return readCredential("DEEPSEEK_API_KEY");
}

export function orcaApiKey() {
  return readCredential("ORCAROUTER_API_KEY");
}

export function isWindowsDesktop() {
  return process.platform === "win32" && process.env.DSH_FORCE_CLI !== "1";
}

export function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  return isWindowsDesktop() ? path.join(ROOT, ".dsh-home") : path.join(os.homedir(), ".dsh");
}

export function dshLaunch(sessionId) {
  if (isWindowsDesktop()) {
    const args = ["--expose-internals", WINDOWS_CLI, "headless", "--json"];
    if (sessionId) args.push("--session-id", sessionId);
    args.push("-");
    return {
      provider: "orca",
      command: WINDOWS_EXE,
      args,
      env: {
        DSH_HOME: dshHome(),
        ELECTRON_RUN_AS_NODE: "1",
        ORCAROUTER_API_KEY: orcaApiKey(),
        DEEPSEEK_API_KEY: deepseekApiKey(),
      },
    };
  }

  const args = ["--profile", "headless", "--json"];
  if (sessionId) args.push("--session-id", sessionId);
  args.push("-");
  return {
    provider: "deepseek",
    command: process.env.DSH_BIN || "dsh",
    args,
    env: {
      DSH_HOME: dshHome(),
      DEEPSEEK_API_KEY: deepseekApiKey(),
    },
  };
}

export function dshPricingFile() {
  if (process.env.DSH_PRICING_FILE) return path.resolve(process.env.DSH_PRICING_FILE);
  return isWindowsDesktop() ? path.join(HERE, "pricing.json") : path.join(HERE, "pricing.deepseek.json");
}
