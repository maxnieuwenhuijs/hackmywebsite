// probe.mjs â€” HTTP client for hackmywebsite.ai agents.
// The host's curl.exe (schannel) and Invoke-WebRequest both fail on HTTPS here;
// node's fetch works. Every scan step should probe through this instead.
//
//   node probe.mjs GET https://example.com/
//   node probe.mjs GET https://example.com/api/users --header "authorization: Bearer x"
//   node probe.mjs POST https://example.com/api/login --body '{"u":"a"}'
//   node probe.mjs GET https://example.com/ --head
//   node probe.mjs GET https://example.com/ --max 200    (body chars to print)
//
// Prints JSON: {status, finalUrl, redirects, ms, headers, body}

const argv = process.argv.slice(2);
const [methodArg, url] = argv;
if (!url) {
  console.error('usage: node probe.mjs <METHOD> <URL> [--header "k: v"] [--body JSON] [--head] [--max N]');
  process.exit(2);
}
const method = (methodArg || 'GET').toUpperCase();

const flags = { head: false, max: 4000, headers: {}, body: undefined };
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--head') flags.head = true;
  else if (a === '--max') flags.max = Number(argv[++i]);
  else if (a === '--body') flags.body = argv[++i];
  else if (a === '--header') {
    const h = argv[++i] || '';
    const k = h.indexOf(':');
    if (k > 0) flags.headers[h.slice(0, k).trim()] = h.slice(k + 1).trim();
  }
}

const started = Date.now();
try {
  const res = await fetch(url, {
    method: flags.head ? 'GET' : method,
    headers: flags.headers,
    body: flags.body,
    redirect: 'follow',
  });
  const text = flags.head ? '' : await res.text();
  const out = {
    status: res.status,
    finalUrl: res.url,
    ms: Date.now() - started,
    headers: Object.fromEntries(res.headers.entries()),
    body: text.slice(0, flags.max),
    bodyLength: text.length,
  };
  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err && err.message || err), ms: Date.now() - started }, null, 2));
  process.exit(1);
}
