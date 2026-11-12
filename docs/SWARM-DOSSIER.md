# Swarm dossier and aggressive settings, 2026-11-10

## What the swarm is

The swarm is the authorised red-team engine inside the portal. It is deliberately
aggressive in coverage, not reckless in action. The safety rail is unchanged:

- no denial of service
- at most 50 requests per minute
- no destructive writes
- the exploiter only touches its own test objects and reverts them
- every bypass stays inside the authorised target

## Aggressive settings

| Setting | Value |
|---|---|
| rounds | 8 |
| retries per role | 5 |
| retry slice | 0.65 of the role slice |
| agent cap | 32, scaled as `max(12, ceil(budget * 3))` |
| concurrency | 6, scaled as `min(6, max(4, ceil(budget / 2)))` |
| budget stop | 99.5% |
| stall timeout | 12 minutes |
| angles per role | 5 |
| roles | mapper, authz, injector, exploiter, chain |

The `chain` role is new. It reads the board, takes two or three confirmed findings
and turns them into the shortest end-to-end story: enter, escalate, read, pivot,
and state what a real attacker would take.

`capacityFor(budget)` is exported and returns the exact settings for a budget.
For a $5 run: concurrency 4, agent cap 15, 8 rounds, 5 retries, 99.5% stop.

## Real-goal prompt

Every agent is told not to stop at a checklist. It must form two or three concrete
hypotheses about how the owner's business could be hurt, then test the one that
would hurt most. A clean route is information about where to look next.

## Dossier

`dossier.mjs` stores short human thoughts in `dossier.jsonl` at the scan root.
Agents post one to three sentences with:

```powershell
node dossier.mjs post --from authz --text "De login leek saai. Dat maakte me juist nieuwsgierig."
```

They also put the same lines in `thoughts` in the final JSON. The runner appends
those to the dossier automatically. The rules are:

- normal language, no jargon
- one to three sentences per thought
- no flags, tokens or secrets
- what they tried, what surprised them, what they want next

The report renders a separate **Dossier** section with a short narrative intro and
the thoughts. Older scans without a dossier get a short summary from the mission
log, labelled as a summary. The report never invents agent quotes.

## Report narrative

The report uses a light narrative frame:

- a red "Bewezen aanval" banner in the overview
- an attack-chain section with measured impact and exact steps
- a dossier with the human notes
- a short narrative intro: "Het begon bij een login. Daarna bleef de zwerm trekken..."

This is enough to feel like a real team without turning the report into fiction.
The technical evidence remains in the finding cards and the Testbewijs section.

## Verification

- `node --check swarm.mjs`, `dossier.mjs` and `report_kit_build.mjs` pass.
- `capacityFor(5)` returns concurrency 4, agent cap 15, 8 rounds, 5 retries, 0.65 retry slice, 0.995 stop.
- `dossier.mjs post` and `read` work.
- `mergeReport` test appended two thoughts with role, agent, round and retry metadata.
- Report test with three dossier entries rendered three quotes and no fallback text.
- Current reports without dossier entries render the fallback narrative.
- Report URLs still return 200 and the dossier section has no horizontal overflow.

## Open

- The running 7777/7778 portal processes predate the new swarm and dossier code. Restart the portal before the next scan.
- A test scan from this sandbox failed with `spawn EPERM` before any agent could run. That is a sandbox child-process limit, not a swarm failure. The user's portal process has the required spawn permissions.
