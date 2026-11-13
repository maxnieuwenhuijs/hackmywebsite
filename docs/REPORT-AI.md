# Report AI

Status: `report_ai.mjs` calls the DeepSeek API directly. Scan-agent inference remains on OrcaRouter.

## Why direct DeepSeek

The report writer is a bounded JSON generation task: it receives compact, masked findings and returns one JSON object that `report_kit_build.mjs` renders. It does not need the DSH agent runtime, a tool loop or the OrcaRouter wrapper. Calling DeepSeek directly is cheaper, simpler to run on the Windows worker and easier to meter.

This is not a change to the scan swarm. The mapper, authz, injector, chain and exploiter agents still run through DSH and OrcaRouter. Only the report copy step is direct.

## Endpoint and model

- Base URL: `https://api.deepseek.com`
- Chat endpoint: `/chat/completions`
- Default model: `deepseek-flash`
- Stronger option: `deepseek-v4-pro`
- Thinking mode: disabled for this task
- JSON mode: enabled

DeepSeek's OpenAI-format endpoint supports both models. Current model and pricing details are in the official documentation: [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## Environment

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_REPORT_MODEL=deepseek-flash
DEEPSEEK_MAX_TOKENS=16000
# DEEPSEEK_BASE_URL=https://api.deepseek.com
```

`DEEPSEEK_API_KEY` is read from the environment first, then from `~/.dsh/.credentials.yaml`. The key is never written to the report, logs or content JSON.

## Command

```powershell
node report_ai.mjs scans/<scan-id> --lang nl --budget 0.30 --model deepseek-flash
node report_ai.mjs scans/<scan-id> --lang en --budget 0.30 --model deepseek-v4-pro
```

Output: `content.<lang>.json`, next to `findings.json`.

The file records:

- `generatedBy`: `deepseek-api`
- `provider`: `deepseek`
- `model`: the model returned by the API
- `usage`: prompt, completion and cache token counts
- `costUsd`: calculated from the DeepSeek rate card
- `reportBudgetUsd`: the requested budget

## Cost

The script uses the published DeepSeek rates and applies the peak/off-peak window:

- Peak: 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
- Off-peak: all other hours, including weekends.
- Cache hits, cache misses and output tokens are priced separately.
- `deepseek-v4-pro` is roughly 3.3x the flash price. Use it only when the report needs the extra reasoning.

A real generated report from the local scan produced 4,598 input and 4,533 output tokens at a calculated cost of **$0.0034** on `deepseek-flash` off-peak. This is far below the previous Orca report estimate.

## Budget and retries

`--budget` is used for reporting and comparison. The request is capped by `DEEPSEEK_MAX_TOKENS`. If the calculated cost exceeds the budget, the script logs a warning after the response. It does not retry with a larger model automatically.

If the response is not valid JSON, the script retries once with a stricter instruction. A second failure exits non-zero and leaves the existing content file untouched.

## Security boundary

- The report prompt contains compact findings with emails, tokens and long secrets masked.
- The API receives only the masked evidence needed for the report copy.
- The script does not send report bundles, private keys or the raw scan transcript.
- Final report encryption and the 48-hour delivery flow are unchanged and happen later in the worker.
- API errors are truncated before logging and never include the key.

## Translation

`report_ai.mjs --lang <code>` writes `content.<code>.json`.

For every language other than Dutch, the generated JSON goes through `translate-json.mjs`. That pass translates human-readable fields and leaves technical evidence, request/response bodies, identifiers and schema values unchanged.

`advisor.mjs --lang <code>` writes `advice.<code>.json`. `report_kit_build.mjs --lang <code>` renders localized labels and advice.

Supported codes:

```text
nl, en, de, fr, es, pt, it, zh
```

English and German have been generated and checked. The remaining languages need a native review pass.

## Related docs

- `docs/REPORT-DELIVERY.md`
- `docs/WINDOWS-VM.md`
- `docs/COMPUTE-DECISION.md`
- `docs/SAAS-PORTAL.md`
- `INSTRUCTIONS.md`
