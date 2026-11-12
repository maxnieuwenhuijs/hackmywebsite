// Linux/cross-platform DSH smoke: verify dsh-runtime.mjs can spawn headless --json and parse the final event.
import { spawn } from "node:child_process";
import { dshLaunch } from "../dsh-runtime.mjs";

const launch = dshLaunch();
const child = spawn(launch.command, launch.args, {
  cwd: process.cwd(),
  env: { ...process.env, ...launch.env },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let buffer = "";
let finalText = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "final" && event.text) finalText = event.text;
    } catch {}
  }
});

child.stdin.on("error", () => {});
child.stdin.end("Use tools to report the full path of the current workspace. Do not create, edit or delete any files. Reply in one short sentence.");

const timeout = setTimeout(() => child.kill("SIGTERM"), 180_000);
child.on("close", (code) => {
  clearTimeout(timeout);
  if (code !== 0 || !finalText) {
    console.error(stderr.slice(0, 1000));
    process.exit(1);
  }
  console.log(JSON.stringify({ provider: launch.provider, final: finalText.slice(0, 240) }, null, 2));
});
