# Deploying LineReady on a small Kubernetes server (2 GB disk)

The server only **serves**. All heavy work (parsing the 1.9 GB data pack, the Airbus manuals, computing
embeddings) happens once on a laptop and produces **one knowledge-base file** that is streamed into the
server's database. The raw data pack and manual archives never go to the server.

```
 LAPTOP (build)                                      SERVER (serve, 2 GB disk)
 ─────────────────────────────────────────           ─────────────────────────────────────────────
 data pack 1.9 GB ──► scripts/build_kb.sh            Ingress ─► lineready-web   (Next.js)
   AMOS, AVIATAR, TSM, AMM, IPC                                      │ /backend proxy
   + local embedding model (BGE-small)                               ▼
   = kb/lineready-kb-<date>.dump  (185 MB) ──stream──► lineready-api (FastAPI, no model)
                                       restore_kb.sh                 │            ──► api.anthropic.com
                                                                     ▼
                                                      lineready-db (Postgres+pgvector, ~460 MB data)
                                                      CronJob: build aircraft packs every 5 min
```

## Disk budget (measured)

| What | Size | Notes |
|---|---|---|
| API image (`--target runtime`) | 296 MB | no parsers, no embedding model |
| UI image | 307 MB | Next.js standalone, fonts bundled |
| Postgres + pgvector image (`deploy/postgres`) | 396 MB | Alpine, pgvector compiled in |
| Database volume after restore | ~740 MB | 459 MB data + WAL (capped at 256 MB, shrinks after checkpoints) |
| Knowledge-base file on the server | **0** | streamed from the laptop, never stored |
| **Total** | **~1.75 GB** | leaves ~250 MB; set log rotation and keep only one image tag on the node |

Image sizes are uncompressed on-node sizes. If the 2 GB must also hold the OS and Kubernetes itself, it will
not fit; the 2 GB has to be the space available to the workload.

## 1. On the laptop: build the knowledge base

Needs Docker and the data pack folders `01 Core` and `02 Supplementary` next to the repo.

```bash
./scripts/build_kb.sh            # ~20-30 min on CPU; writes kb/lineready-kb-<date>.dump (+ .sha256)
./scripts/build_kb.sh --export   # re-export only, if the database is already built
```

What it does: parses AMOS work orders, stores and tools, AVIATAR faults and PHA cases, the TSM (fault index,
tasks, fleet allocation table), the AMM (tools, consumables, expendable parts) and the IPC (part numbers,
alternatives); builds the fleet case memory; computes embeddings for 82k defect descriptions, 21k manual task
titles and every text the brief and packs search with; seeds the synthetic demo shift; drops scheduled task
cards the server never reads; exports. Re-run whenever the data pack changes.

## 2. Build and push the three images

```bash
REG=harbor.example.com/lineready; TAG=0.2.0
docker build --target runtime -t $REG/lineready-api:$TAG .
docker build -t $REG/lineready-web:$TAG ./web
docker build -t $REG/lineready-db:$TAG ./deploy/postgres
docker push $REG/lineready-api:$TAG && docker push $REG/lineready-web:$TAG && docker push $REG/lineready-db:$TAG
```

Set `REGISTRY` and the tag in `deploy/k8s/kustomization.yaml`, and your host and TLS secret in `ingress.yaml`.

## 3. Namespace, secret, deploy

```bash
kubectl apply -f deploy/k8s/namespace.yaml
PW=$(openssl rand -hex 16)
kubectl -n lineready create secret generic lineready-secrets \
  --from-literal=POSTGRES_PASSWORD=$PW \
  --from-literal=DATABASE_URL=postgresql://lineready:$PW@lineready-db:5432/lineready \
  --from-literal=ANTHROPIC_API_KEY='<key>'
kubectl apply -k deploy/k8s
kubectl -n lineready rollout status statefulset/lineready-db
```

The API pod stays *not ready* until the knowledge base is loaded (`/api/readyz` checks the TSM).

## 4. Stream the knowledge base in (from the laptop)

```bash
./scripts/restore_kb.sh kb/lineready-kb-<date>.dump --k8s lineready
```

It verifies the checksum, streams the file through `kubectl exec` into `pg_restore` (nothing is written to
the server's disk), replaces only the knowledge tables, keeps the server's own data (briefs, reviews, audit
trail, caches, packs), then checkpoints to release the write-ahead log. Takes about 40 seconds.
Updating the knowledge base later is the same command with a new file: reviews and the audit trail survive.

## 5. Verify

```bash
kubectl -n lineready get pods                      # all Ready
kubectl -n lineready port-forward svc/lineready-web 3000:80
open http://localhost:3000/tonight
```

## What runs on the server

| Object | Purpose |
|---|---|
| `lineready-web` Deployment (1) | UI; `/backend/*` proxied to the API at runtime |
| `lineready-api` Deployment (1) | agents, retrieval, review layer, audit; probes `/api/healthz`, `/api/readyz` |
| `lineready-db` StatefulSet, 1 Gi PVC | Postgres + pgvector, WAL capped |
| `lineready-packs` CronJob | every 5 min: aircraft packs for aircraft landing within 90 min |
| Ingress | only the UI is published |
| NetworkPolicies | DB ← API only; API ← UI and the CronJob only |

All pods run as non-root with read-only root filesystems and dropped capabilities (namespace enforces the
`restricted` Pod Security level).

## Operating it

* **Meaning-based search on the server** uses precomputed vectors: every AVIATAR message, open defect and PHA
  title is embedded on the laptop. Free-text Ask questions fall back to keyword + fleet search (no model on
  the server). Measured on 587 historical defects: recall@3 45.0% with embeddings vs 40.9% without.
* **Token budget:** `LLM_NARRATE_TOP` in the ConfigMap; Claude responses are cached in `llm_cache`.
* **Backups:** the database holds the audit trail and engineer reviews. Back up with a `pg_dump` CronJob to
  storage *off* this server (the disk has no room for local backups).
* **Before real users:** put the Ingress behind corporate SSO (the app has no login yet).
* **Moving off the demo clock:** remove `DEMO_NOW` and replace the file adapters with live AMOS/AVIATAR feeds.
