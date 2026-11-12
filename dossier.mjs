// dossier.mjs - the swarm's human-readable mission dossier.
//
// Agents add short thoughts in normal language. This is deliberately separate from
// board.jsonl (technical findings) and from the event logs. The report renders the
// dossier as a small narrative for non-technical readers.
//
//   node dossier.mjs post --from authz --text "De login leek saai. Dat maakte me juist nieuwsgierig."
//   node dossier.mjs read
//
// The path comes from HACKMYWEBSITE_DOSSIER (set by the swarm runner).
import fs from "node:fs";
import path from "node:path";

const file = process.env.HACKMYWEBSITE_DOSSIER || path.join(process.cwd(), "dossier.jsonl");
const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : undefined;
}
function rows() {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function trimThought(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.slice(0, 3).join(" ").replace(/\s+/g, " ").trim().slice(0, 600);
}

if (cmd === "post") {
  const text = trimThought(flag("text"));
  if (!text) { console.error("post needs --text"); process.exit(2); }
  const entry = {
    ts: new Date().toISOString(),
    from: String(flag("from") || "unknown").slice(0, 40),
    type: "thought",
    text,
  };
  fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
  console.log("dossier updated");
} else if (cmd === "read") {
  const entries = rows();
  for (const entry of entries) console.log(`[${entry.ts}] ${entry.from}: ${entry.text}`);
  console.log(`\n${entries.length} dossier entries`);
} else {
  console.error("usage: node dossier.mjs post --from <role> --text \"...\" | read");
  process.exit(2);
}
