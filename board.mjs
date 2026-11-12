// board.mjs - the swarm's shared message board.
// Agents talk to each other through an append-only JSONL file so one agent's discovery
// becomes every agent's starting point.
//
//   node board.mjs read [--since N] [--type finding|lead|endpoint]
//   node board.mjs post --from authz --type finding --text "admin/alerts leaks subscriber emails"
//
// The board path comes from HACKMYWEBSITE_BOARD (set by the portal).
import fs from 'node:fs';
import path from 'node:path';

const board = process.env.HACKMYWEBSITE_BOARD || path.join(process.cwd(), 'board.jsonl');
const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function readAll() {
  try {
    return fs.readFileSync(board, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

if (cmd === 'post') {
  const entry = {
    ts: new Date().toISOString(),
    from: flag('from') || 'unknown',
    type: flag('type') || 'note',
    text: String(flag('text') || '').slice(0, 2000),
  };
  if (!entry.text) { console.error('post needs --text'); process.exit(2); }
  fs.appendFileSync(board, JSON.stringify(entry) + '\n', 'utf8');
  console.log('posted');
} else if (cmd === 'read') {
  const since = Number(flag('since') || 0);
  const type = flag('type');
  const rows = readAll().slice(since).filter((r) => !type || r.type === type);
  if (!rows.length) { console.log('(board is empty)'); }
  for (const r of rows) console.log(`[${r.ts}] ${r.from} (${r.type}): ${r.text}`);
  console.log(`\n${readAll().length} total messages on the board`);
} else {
  console.error('usage: node board.mjs read|post [options]');
  process.exit(2);
}
