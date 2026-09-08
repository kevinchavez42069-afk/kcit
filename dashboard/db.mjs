// =====================================================================
//  Local cost/usage store, SQLite via Node's built-in node:sqlite.
//
//  Lives on Kevin's machine next to the rest of the AI Operating System
//  backend (see vault/50-Workspace/AI Operating System.md) - not AWS, on
//  purpose. The vault stays the source of truth for business content;
//  this is purely a time-series store for numbers nothing else tracks.
//
//  Kept out of git (dashboard/costs.db is in .gitignore) since it's a
//  local cache that rebuilds from CloudWatch, not something to sync
//  between sessions.
// =====================================================================

import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(here, "costs.db");

export function openDb() {
  const db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chatbot_usage (
      request_id      TEXT PRIMARY KEY,
      client_id       TEXT NOT NULL,
      timestamp_ms    INTEGER NOT NULL,
      model           TEXT NOT NULL,
      input_tokens    INTEGER NOT NULL,
      output_tokens   INTEGER NOT NULL,
      cache_read      INTEGER NOT NULL,
      cache_write     INTEGER NOT NULL,
      cost_usd        REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chatbot_usage_client_time
      ON chatbot_usage (client_id, timestamp_ms);

    -- Phase 5: Kevin's own agent-fleet usage, distinct from chatbot_usage
    -- (which is customer traffic). One row per chatWithAgent/runAgentFull
    -- call, logged straight from the SDK's own result.usage and
    -- result.total_cost_usd - no separate pricing math to keep in sync.
    CREATE TABLE IF NOT EXISTS agent_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name      TEXT NOT NULL,
      timestamp_ms    INTEGER NOT NULL,
      phase           TEXT NOT NULL,
      input_tokens    INTEGER NOT NULL,
      output_tokens   INTEGER NOT NULL,
      cache_read      INTEGER NOT NULL,
      cache_write     INTEGER NOT NULL,
      cost_usd        REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_name_time
      ON agent_runs (agent_name, timestamp_ms);
  `);

  return db;
}

/** Logs one dashboard-triggered agent run. Not idempotent by design - every
 *  real call is a real cost, there's no "re-running the same range" concept
 *  here the way there is for the CloudWatch aggregator. */
export function insertAgentRun(db, row) {
  const stmt = db.prepare(`
    INSERT INTO agent_runs
      (agent_name, timestamp_ms, phase, input_tokens, output_tokens, cache_read, cache_write, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    row.agentName,
    row.timestampMs,
    row.phase,
    row.inputTokens,
    row.outputTokens,
    row.cacheRead,
    row.cacheWrite,
    row.costUsd
  );
}

/** Per-agent totals for rows with timestamp_ms >= sinceMs (default: all time). */
export function summaryByAgent(db, sinceMs = 0) {
  const stmt = db.prepare(`
    SELECT agent_name,
           COUNT(*) AS runs,
           SUM(input_tokens) AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           SUM(cache_read) AS cache_read,
           SUM(cache_write) AS cache_write,
           SUM(cost_usd) AS cost_usd
    FROM agent_runs
    WHERE timestamp_ms >= ?
    GROUP BY agent_name
    ORDER BY cost_usd DESC
  `);
  return stmt.all(sinceMs);
}

/**
 * Insert one usage row. Idempotent: re-running the aggregator over a
 * time range it already covered just no-ops on the duplicate request_id,
 * so it's always safe to overlap ranges rather than track a fragile
 * high-water mark.
 */
export function insertUsage(db, row) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO chatbot_usage
      (request_id, client_id, timestamp_ms, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    row.requestId,
    row.clientId,
    row.timestampMs,
    row.model,
    row.input,
    row.output,
    row.cacheRead,
    row.cacheWrite,
    row.costUsd
  );
  return result.changes > 0; // true if this was a new row, false if a duplicate
}

// Tenants that were renamed. The logs keep the old id forever, so a rename
// shows up here as an extra tenant that never existed, and anything reading
// this table counts one customer too many. The finance agent did exactly
// that on its first run: it saw three ids, and reported `riverbend-plumbing`
// as Kevin's first real client. It was the demo tenant before b2f894c
// renamed it, and Kevin has zero clients.
//
// Mapped rather than corrected in place on purpose. The CloudWatch logs
// still say `riverbend-plumbing` for that period, so an UPDATE would be
// undone by the next cost-report.mjs run that covers it. A map survives a
// re-pull; a rewrite does not.
const RENAMED_TENANTS = {
  "riverbend-plumbing": "sample-plumbing",
};

/** Per-client totals for rows with timestamp_ms >= sinceMs (default: all time).
 *  Renamed tenants are folded into their current id, so the row count is the
 *  number of tenants that actually exist, not the number of names ever used. */
export function summaryByClient(db, sinceMs = 0) {
  const stmt = db.prepare(`
    SELECT client_id,
           COUNT(*) AS requests,
           SUM(input_tokens) AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           SUM(cache_read) AS cache_read,
           SUM(cache_write) AS cache_write,
           SUM(cost_usd) AS cost_usd
    FROM chatbot_usage
    WHERE timestamp_ms >= ?
    GROUP BY client_id
    ORDER BY cost_usd DESC
  `);

  const merged = new Map();
  for (const row of stmt.all(sinceMs)) {
    const id = RENAMED_TENANTS[row.client_id] ?? row.client_id;
    const into = merged.get(id);
    if (!into) {
      merged.set(id, { ...row, client_id: id });
      continue;
    }
    for (const k of ["requests", "input_tokens", "output_tokens", "cache_read", "cache_write", "cost_usd"]) {
      into[k] += row[k] ?? 0;
    }
  }
  return [...merged.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}

export function latestTimestamp(db) {
  const row = db.prepare(`SELECT MAX(timestamp_ms) AS latest FROM chatbot_usage`).get();
  return row?.latest ?? null;
}
