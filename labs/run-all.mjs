import { spawn } from "node:child_process";
import path from "node:path";

const HERE = import.meta.dirname;
const PYTHON = process.env.PYTHON || "python";

const labs = [
  {
    name: "Northwind CRM",
    dir: "northwind",
    command: process.execPath,
    args: ["server.mjs"],
    url: "http://127.0.0.1:4101",
    login: "analyst@northwind.test / analyst123",
  },
  {
    name: "PixelDrop",
    dir: "pixeldrop",
    command: process.execPath,
    args: ["server.mjs"],
    url: "http://127.0.0.1:4102",
    login: "demo@pixeldrop.test / demo1234",
  },
  {
    name: "OrbitDesk",
    dir: "orbitdesk",
    command: PYTHON,
    args: ["server.py"],
    url: "http://127.0.0.1:4103",
    login: "agent@orbitdesk.test / orbit123",
  },
];

const children = [];
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping labs...");
  for (const { child } of children) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(0), 800);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("Starting three intentionally vulnerable local labs.\n");
for (const lab of labs) {
  const child = spawn(lab.command, lab.args, {
    cwd: path.join(HERE, lab.dir),
    stdio: "inherit",
    env: process.env,
  });
  children.push({ child, lab });
  child.on("error", (error) => {
    console.error(`[${lab.name}] failed to start: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) console.log(`[${lab.name}] exited (code=${code}, signal=${signal})`);
  });
  console.log(`${lab.name.padEnd(14)} ${lab.url}   login: ${lab.login}`);
}
console.log("\nAll labs are starting. Press Ctrl+C to stop all three.");
