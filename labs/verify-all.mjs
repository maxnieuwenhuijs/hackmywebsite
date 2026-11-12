import { spawn } from "node:child_process";
import path from "node:path";

const HERE = import.meta.dirname;
const PYTHON = process.env.PYTHON || "python";

const checks = [
  { name: "Northwind CRM", dir: "northwind", command: process.execPath, args: ["verify.mjs"] },
  { name: "PixelDrop", dir: "pixeldrop", command: process.execPath, args: ["verify.mjs"] },
  { name: "OrbitDesk", dir: "orbitdesk", command: PYTHON, args: ["verify.py"] },
];

function run(check) {
  return new Promise((resolve) => {
    console.log(`\n=== ${check.name} ===`);
    const child = spawn(check.command, check.args, {
      cwd: path.join(HERE, check.dir),
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", (error) => {
      console.error(`[${check.name}] failed to start: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const results = [];
for (const check of checks) {
  results.push({ name: check.name, code: await run(check) });
}

console.log("\n=== Summary ===");
let failed = false;
for (const result of results) {
  const ok = result.code === 0;
  failed = failed || !ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${result.name}${ok ? "" : ` (exit ${result.code})`}`);
}
process.exit(failed ? 1 : 0);
