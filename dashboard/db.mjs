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
  `);

  return db;
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

/** Per-client totals for rows with timestamp_ms >= sinceMs (default: all time). */
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
  return stmt.all(sinceMs);
}

export function latestTimestamp(db) {
  const row = db.prepare(`SELECT MAX(timestamp_ms) AS latest FROM chatbot_usage`).get();
  return row?.latest ?? null;
}
