# LineReady — Line Engineer Agent (Round 1)

The night-shift brief, ready before the engineer arrives. For each engineer: their aircraft and times,
open defects, deferred/MEL items with deadlines, aircraft-reported faults, predictive (PHA) cases,
the TSM task to start from, parts and tools readiness, and last shift's handover — every line linked
to its source record.

**Guardrails:** LineReady prepares and checks. It never signs, defers or releases. There is no write path
to AMOS. Every flag names its rule, every reference shows the manual revision (TSM TSN 86, 01-Nov-2026),
every review action is written to a hash-chained audit log.

## Run it (laptop / build machine)

Needs Docker only (no Python on the host). The data pack folders `01 Core` and `02 Supplementary` must sit
next to this folder (`../01 Core`), or set `DATA_CORE_DIR` / `DATA_SUPP_DIR` in `.env`.

```bash
cp .env.example .env                 # optional: add ANTHROPIC_API_KEY to switch on AI summaries + verifier
./scripts/build_kb.sh                # parses the pack, embeddings, demo shift; writes kb/lineready-kb-<date>.dump
docker compose up -d app web         # API on 127.0.0.1:8000, UI on http://localhost:3000
```

For UI work without Docker (Node 18.18+):

```bash
cd web
cp .env.local.example .env.local     # LINEREADY_API_URL=http://localhost:8000 (leave unset for sample data)
npm install && npm run dev           # http://localhost:3000
```

The browser reaches the API through the UI's `/backend/*` route, which reads `LINEREADY_API_URL` at request time.
`http://localhost:8000` still serves the simple built-in UI for quick checks.

## Deploy on the demo server (plain Docker: web on 8080, API on 8888, Postgres on 5432)

`docker-compose.server.yml` runs the slim images (Alpine Postgres + pgvector, API runtime image, UI, pack builder),
all with `restart: unless-stopped`. The raw data pack never goes to the server: it gets the knowledge-base file
from `scripts/build_kb.sh`.

On the server, once:

```bash
sudo systemctl enable --now docker
git clone https://github.com/chamithsathira-ai/lineready.git && cd lineready     # or: git pull
cp .env.example .env
cat >> .env <<'ENV'
COMPOSE_FILE=docker-compose.server.yml
WEB_PORT=8080
API_PORT=8888
DB_PORT=5432
ENV
# optional: ANTHROPIC_API_KEY=... in .env
docker compose build
docker compose up -d db
```

Load the knowledge base (copy the `.dump` and `.dump.sha256` to the server, then):

```bash
./scripts/restore_kb.sh ~/lineready-kb-<date>.dump      # ~1 min; keeps reviews/audit on later updates
rm ~/lineready-kb-<date>.dump                            # free the disk
docker compose up -d                                     # db + API + web + packs
curl localhost:8888/api/readyz
```

Open http://92.5.94.202:8080. After each `git pull`: `docker compose up -d --build`.
Postgres and the API bind to 127.0.0.1; only the UI port is public. For Kubernetes, see `deploy/README.md`.

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

## Built since Round 1

* **Effectivity by serial number:** the TSM's own fleet table (registration -> MSN -> CEC, 92 aircraft) filters out
  tasks that do not apply to the aircraft, and dossiers state "applies to A6-AOJ (MSN 06665, CEC 335)".
* **AMM and IPC parsed:** 11,594 AMM tasks (tools, consumables, expendable parts) and 332,547 IPC items. Readiness
  follows TSM -> AMM -> IPC part numbers (with alternatives) -> station stock and tool store.
* **Meaning-based search:** BGE-small embeddings (local, free) added to keyword + trigram + fleet memory with RRF.
  Backtest recall@3 40.9% -> 45.0%. Built on the laptop; the server uses precomputed vectors and needs no model.
* **Aircraft pack before landing:** built automatically 90 min before arrival (CronJob), rebuilt on new faults:
  items, things to clear while on the ground, parts, tools, manual pages, last 7 days.
* **End-of-shift handover:** drafted from the shift's reviews, logbook checks, open items and parts gaps; Claude
  writes the "next shift first" lines with record citations; the engineer edits and saves.
* **Voice questions:** browser speech recognition in Ask, plus read-aloud answers (on-premise speech is the
  production option).

## Small-server deployment

Build the knowledge base on a laptop (`scripts/build_kb.sh`, one 185 MB file) and stream it into the server
(`scripts/restore_kb.sh`). Server footprint ~1.75 GB including images. See `deploy/README.md`.

## Known limits / next steps

* Login: put the Ingress behind corporate SSO.
* REP-01/REP-02 thresholds must be confirmed against the company MOE/TPM.
* Free-text Ask questions use keyword + fleet search on the server (no embedding model there).
* Voice uses the browser's speech service; switch to on-premise speech for production.
