# LineReady — Line Engineer Agent (Round 1)

The night-shift brief, ready before the engineer arrives. For each engineer: their aircraft and times,
open defects, deferred/MEL items with deadlines, aircraft-reported faults, predictive (PHA) cases,
the TSM task to start from, parts and tools readiness, and last shift's handover — every line linked
to its source record.

**Guardrails:** LineReady prepares and checks. It never signs, defers or releases. There is no write path
to AMOS. Every flag names its rule, every reference shows the manual revision (TSM TSN 86, 01-Nov-2026),
every review action is written to a hash-chained audit log.

## Run it

Needs Docker only (no Python on the host). The data pack folders `01 Core` and `02 Supplementary` must sit
next to this folder (`../01 Core`).

```bash
cp .env.example .env                 # optional: add ANTHROPIC_API_KEY to switch on AI summaries + verifier
docker compose build
docker compose up -d db
docker compose run --rm app python -m lineready.interfaces.cli ingest        # ~8 min, TSM parse is most of it
docker compose run --rm app python -m lineready.interfaces.cli ingest cases  # fleet case memory
docker compose run --rm app python -m lineready.interfaces.cli seed-shift    # synthetic SHJ night (see below)
docker compose up -d app
open http://localhost:8000
```

Then the tablet UI (Next.js, in `web/`, Node 18.18+). Set `LINEREADY_API_URL` **before** `npm run build`: the browser proxy
(`/backend/*` → FastAPI) is fixed at build time.

```bash
cd web
cp .env.local.example .env.local     # LINEREADY_API_URL=http://localhost:8000
npm install
npm run build && npm start           # or: npm run dev
open http://localhost:3000            # Tonight, Dossier, Manuals, Ask, Readiness, Coach, Logbook, Aircraft
```

Without `LINEREADY_API_URL` the UI runs on its built-in sample data (good for design work, no backend needed).

`http://localhost:8000` still serves the simple built-in UI for quick checks.

## Deploy on the demo server (web on 8080, API on 8888, Postgres on 5432)

Everything runs in Docker with `restart: unless-stopped`, so it comes back after a reboot. Needs Docker with the
compose plugin and the data pack folders `01 Core` and `02 Supplementary` on the server.

```bash
sudo systemctl enable --now docker
cp .env.example .env
cat >> .env <<'ENV'
WEB_PORT=8080
API_PORT=8888
DB_PORT=5432
DATA_CORE_DIR=/path/to/01 Core
DATA_SUPP_DIR=/path/to/02 Supplementary
ENV
# optional: ANTHROPIC_API_KEY=... in .env for AI summaries, Ask and Coach feedback

docker compose build
docker compose up -d db
docker compose run --rm app python -m lineready.interfaces.cli ingest        # ~8 min, one time
docker compose run --rm app python -m lineready.interfaces.cli ingest cases
docker compose run --rm app python -m lineready.interfaces.cli seed-shift
docker compose up -d                                                          # db + API + web
curl localhost:8888/api/health
```

The web container is built with `LINEREADY_API_URL=http://app:8000` and reaches the API over the compose network.
Postgres and the API bind to 127.0.0.1 only. After each `git pull`: `docker compose up -d --build`.
Re-run `ingest` only when the data pack changes.

Useful commands:

```bash
docker compose exec app python -m lineready.interfaces.cli brief E1   # build a brief from the CLI
docker compose exec app python -m pytest -q tests                      # rule unit tests
docker compose exec app python -m evals.backtest_tsm 600               # retrieval accuracy backtest
curl localhost:8000/api/audit                                          # audit chain check
```

Without `ANTHROPIC_API_KEY` the system runs in **template mode**: everything works, summaries are built
from the facts by code. With a key, Claude (`claude-opus-5-5`) writes the summary line and an independent
Claude verifier checks each sentence against its evidence (review gates R1–R3); unsupported sentences are
removed and listed under "Removed by review".

## Features

| View | What it does | Claude usage |
|---|---|---|
| **Brief** | Ranked dossiers per engineer, pinned attention item, evidence drawer with TSM task at revision, accept/edit/dismiss | Top 5 items per brief get an AI summary + independent critic (`LLM_NARRATE_TOP`) |
| **Ask** | Questions answered with tools over the controlled data; every citation must come from a tool result | Tool-use loop, max 4 rounds, last 3 Q/A kept as short-term memory |
| **Coach** | Trainee prepares a defect (TSM task, history, parts); graded against the hidden dossier; Socratic feedback; answer key unlocks when the task is right | 1 low-effort call per submission |
| **Logbook check** | Rules LOG-01..07 on a draft entry (task cited and verified in TSM, revision, P/N+S/N, torque tool cal, test result); optional AI deep check vs the TSM outline | None by default; 1 call if "deep check" ticked |

### Token controls

* Response cache (`llm_cache` table): identical prompts are never paid twice, so rebuilding a brief is free unless data changed.
* `LLM_NARRATE_TOP=5`: only the top items of a brief are narrated; the rest use code templates.
* Compact evidence packs (ids + short excerpts), never raw documents; Claude prompt caching on frozen system prompts.
* Measured: one brief = 10 calls (5 narrator + 5 critic) ≈ 4k output tokens; one Ask ≈ 1.2k output tokens.

## What is real and what is synthetic

| Real (data pack) | Synthetic (not in the pack) |
|---|---|
| 209,421 AMOS work orders, 62k stock lines, 12k tools | Flight schedule, stands, outbound flights |
| 375,894 AVIATAR fault events, 199 PHA cases | Engineer roster (Engineer A/B/C) |
| TSM SGML: 9,125 tasks, 55,680 fault-index rows | Handover notes (derived from real WOs, labelled) |

The demo clock is `DEMO_NOW=2026-11-20T21:00` (the pack ends 20-Nov 06:10).

## Architecture (as built)

```
lineready/
  domain/           pure model + rules (deadline, repetitive, policy linter, rule registry)
  application/      orchestrator (supervisor DAG), agents: triage, specialists
                    (historian, manuals, logistics, compliance), review (narrator + critic)
  retrieval/        cascade: exact fault index -> fleet case memory -> guarded text search, fused by RRF
  infrastructure/   sources (AMOS xlsx, AVIATAR csv, TSM SGML), Postgres, audit chain, Claude adapter
  interfaces/       FastAPI (+ simple built-in UI), CLI
web/                Next.js tablet UI (see web/README.md): adapter in src/lib/backend.ts, data access in src/lib/api.ts
docs/               architecture document
evals/              TSM retrieval backtest
tests/              rule unit tests on real AMOS texts
```

Agents per aircraft (parallel): **Compliance** (deferral/MEL deadlines from AMOS free text) →
**Triage** (AVIATAR messages → episodes, REP-01, fleet-wide baseline) → **Manuals** (fault index, fleet
memory, TSM possible causes, referenced AMM tasks) → **Historian** (tail history, fleet cases, telemetry
outcome: did the fault come back after the fix?) → **Logistics** (part/tool numbers from past fixes →
stores) → **Review** (R1 schema, R2 evidence IDs, R3 policy linter + Claude critic) → rank, pin, notify lead.

## Measured results (backtest, 587 historical defects whose actions cite a TSM task, no look-ahead)

| | recall@1 | recall@3 | precision@3 (answered) | coverage |
|---|---|---|---|---|
| fault index + text search only | 7.7% | 14.5% | 25.1% | 58% |
| + fleet case memory (current) | **28.3%** | **40.4%** | **47.6%** | 85% |

Coverage is deliberately below 100%: when no confident match exists the brief says
"No TSM fault-isolation task matched" instead of guessing.

## Findings from the data worth showing the judges

* Fleet-wide messages: `MMR1 2(40RT1 2)/ATC1`, `NAV ADS-B RPTG 1/2 FAULT`, `NAV GPS1/2 FAULT` appear on
  79–84 of 97 active tails in 72 h. Triage reports them once as a fleet pattern instead of flagging every tail.
* WO 6185232 (A6-AQL) was extended for 120 days on 31-Oct-2026: the latest action wins. An earlier reading
  of only the first extension would have flagged it as expired by mistake.
* A6-AQP MAREP 6204647: deferral limit from the action text passed on 20-Oct-2026 and the WO is still open.
* A6-ARE MAREP 6337181: MEL 33-20-01-A Cat C, due 22-Nov-2026; the LED unit used on past fixes is in SHJMAIN.

## Known limits / next steps

* Effectivity: TSM effectivity ranges are shown, but a tail→MSN map is needed to filter them.
* AMM/IPC SGML not yet parsed (TSM→AMM links come from the TSM itself).
* Dense embeddings (BGE-M3 + pgvector) are the next retrieval step; current hybrid is lexical + trigram + RRF.
* Voice input for Ask, aircraft pack before landing, handover draft (final round).
* REP-01/REP-02 thresholds must be confirmed against the company MOE/TPM.
