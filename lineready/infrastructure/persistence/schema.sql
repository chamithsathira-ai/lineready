-- LineReady knowledge base: relational facts, manual index, shift context, review + audit.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Store A: facts (AMOS, AVIATAR) ----------
CREATE TABLE IF NOT EXISTS work_order (
  wo_number    text PRIMARY KEY,
  reg          text NOT NULL,
  operator     text,
  wo_type      text,            -- Scheduled | PIREP | MAREP
  date_opened  date,
  date_closed  date,
  ata          text,
  ata4         text,            -- '34-52'
  description  text,
  actions      text,
  state        text,            -- Open | Closed | V
  tsv          tsvector GENERATED ALWAYS AS (
                 to_tsvector('english', coalesce(description,'') || ' ' || coalesce(actions,''))) STORED
);
CREATE INDEX IF NOT EXISTS wo_reg_ata ON work_order (reg, ata4, date_opened);
CREATE INDEX IF NOT EXISTS wo_state ON work_order (state, wo_type);
CREATE INDEX IF NOT EXISTS wo_tsv ON work_order USING gin (tsv);
CREATE INDEX IF NOT EXISTS wo_desc_trgm ON work_order USING gin (description gin_trgm_ops);

CREATE TABLE IF NOT EXISTS fault_event (
  id           bigserial PRIMARY KEY,
  reg          text NOT NULL,
  ac_type      text,
  flight       text,
  phase        text,
  ata          text,
  ata4         text,
  source       text,
  msg_type     text,            -- FAULT_MESSAGE | WARNING_MESSAGE | ...
  message      text,
  prio         text,            -- NONE | LOW | MEDIUM | HIGH | OK
  occurred_at  timestamp,
  repetitive   boolean,
  multiple     boolean
);
CREATE INDEX IF NOT EXISTS fe_reg_time ON fault_event (reg, occurred_at);

CREATE TABLE IF NOT EXISTS pha_case (
  case_id      text PRIMARY KEY,
  reg          text,
  ata          text,
  severity     text,
  use_case     text,
  title        text,
  system       text,
  case_type    text,
  classification text,
  impact       text,
  opened       timestamp,
  updated      timestamp,
  status       text,
  link         text
);

CREATE TABLE IF NOT EXISTS stock_lot (
  id           bigserial PRIMARY KEY,
  store        text, location text, pn text, serial text, description text,
  mat_class    text, qty numeric, cond text, order_no text
);
CREATE INDEX IF NOT EXISTS stock_pn ON stock_lot (upper(pn));

CREATE TABLE IF NOT EXISTS tool (
  id           bigserial PRIMARY KEY,
  pn text, sn text, description text, tool_id text, station text, store text,
  location text, expires date, qty numeric
);
CREATE INDEX IF NOT EXISTS tool_pn ON tool (upper(pn));

-- ---------- Store B/C: controlled manuals ----------
CREATE TABLE IF NOT EXISTS manual_doc (
  doc text PRIMARY KEY, revision text, revdate date, customer text, source_file text
);

CREATE TABLE IF NOT EXISTS manual_task (
  task_id      text PRIMARY KEY,   -- '32-42-00-810-923-A'
  doc          text NOT NULL,      -- TSM
  ata4         text,
  title        text,
  revdate      date,
  effrg        text,
  causes       jsonb,              -- [{name, fin}]
  refs         jsonb,              -- [{man, ref, title}]  -> graph edges TSM -> AMM
  body         text,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED
);
CREATE INDEX IF NOT EXISTS mt_tsv ON manual_task USING gin (tsv);
CREATE INDEX IF NOT EXISTS mt_title_trgm ON manual_task USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS tsm_fault_index (
  id           bigserial PRIMARY KEY,
  msg          text NOT NULL,      -- normalised upper-case message
  msg_raw      text,
  kind         text,               -- ECAM | CMS | OBSV | ...
  flt_type     text,
  ata          text,
  source       text,
  task_id      text,
  effrg        text
);
CREATE INDEX IF NOT EXISTS tfi_msg ON tsm_fault_index (msg);
CREATE INDEX IF NOT EXISTS tfi_msg_trgm ON tsm_fault_index USING gin (msg gin_trgm_ops);

-- ---------- Shift context (synthetic for the demo: not in the data pack) ----------
CREATE TABLE IF NOT EXISTS engineer (
  engineer_id text PRIMARY KEY, name text, role text, licence text
);
CREATE TABLE IF NOT EXISTS shift_assignment (
  engineer_id text, reg text, arrival timestamp, departure timestamp, stand text, flight_out text,
  PRIMARY KEY (engineer_id, reg)
);
CREATE TABLE IF NOT EXISTS handover_note (
  reg text, written_at timestamp, author text, note text
);

-- ---------- Outputs, review layer, audit ----------
CREATE TABLE IF NOT EXISTS brief (
  brief_id     bigserial PRIMARY KEY,
  engineer_id  text,
  built_at     timestamp DEFAULT now(),
  as_of        timestamp,
  payload      jsonb
);

CREATE TABLE IF NOT EXISTS feedback (
  id           bigserial PRIMARY KEY,
  ts           timestamp DEFAULT now(),
  engineer_id  text, brief_id bigint, item_id text,
  action       text CHECK (action IN ('accept','edit','dismiss')),
  reason       text, edited_text text
);

CREATE TABLE IF NOT EXISTS audit_event (
  id           bigserial PRIMARY KEY,
  ts           timestamp DEFAULT now(),
  actor        text, kind text, ref text,
  payload      jsonb,
  prev_hash    text, hash text
);

-- ---------- Store D: case memory (fleet history of which TSM task engineers used) ----------
CREATE TABLE IF NOT EXISTS case_memory (
  wo_number    text PRIMARY KEY,
  reg          text,
  ata4         text,
  chap         text,
  date_opened  date,
  description  text,
  tasks        text[],           -- cited TSM tasks, 16-char form without variant letter
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(description,''))) STORED
);
CREATE INDEX IF NOT EXISTS cm_tsv ON case_memory USING gin (tsv);
CREATE INDEX IF NOT EXISTS cm_desc_trgm ON case_memory USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cm_chap ON case_memory (chap, date_opened);

-- ---------- LLM response cache (token saver) + interactive features ----------
CREATE TABLE IF NOT EXISTS llm_cache (
  key text PRIMARY KEY, kind text, response jsonb, created timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ask_session (
  session_id text PRIMARY KEY, engineer_id text, turns jsonb DEFAULT '[]', updated timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coach_attempt (
  id bigserial PRIMARY KEY, ts timestamp DEFAULT now(), trainee text, brief_id bigint, item_id text,
  answers jsonb, score jsonb, feedback jsonb
);
CREATE TABLE IF NOT EXISTS logbook_check (
  id bigserial PRIMARY KEY, ts timestamp DEFAULT now(), engineer_id text, wo_number text,
  entry_text text, result jsonb
);
