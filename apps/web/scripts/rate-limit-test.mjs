import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimits } from "../src/lib/rate-limit.ts";

resetRateLimits();
const options = { key: "test:route", limit: 3, windowMs: 60_000 };
assert.equal(checkRateLimit(options).allowed, true);
assert.equal(checkRateLimit(options).allowed, true);
assert.equal(checkRateLimit(options).allowed, true);
const blocked = checkRateLimit(options);
assert.equal(blocked.allowed, false);
assert.equal(blocked.remaining, 0);
assert.ok(blocked.retryAfterSeconds >= 1);

resetRateLimits();
const short = { key: "test:short", limit: 1, windowMs: 20 };
assert.equal(checkRateLimit(short).allowed, true);
assert.equal(checkRateLimit(short).allowed, false);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(checkRateLimit(short).allowed, true);

resetRateLimits();
const separate = { limit: 1, windowMs: 60_000 };
assert.equal(checkRateLimit({ ...separate, key: "ip:a" }).allowed, true);
assert.equal(checkRateLimit({ ...separate, key: "ip:b" }).allowed, true);

console.log("rate limit tests passed");
