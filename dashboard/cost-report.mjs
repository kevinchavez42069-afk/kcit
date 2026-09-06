// =====================================================================
//  Chatbot cost aggregator - Phase 1 of the AI Operating System
//  (see vault/50-Workspace/AI Operating System.md).
//
//  chatbot/index.mjs already logs one JSON line per Claude API call:
//    { clientId, input, output, cacheRead, cacheWrite }
//  to CloudWatch (log group /aws/lambda/kcit-chatbot). This pulls those
//  lines out, prices them, and stores them locally so "what does the
//  chatbot cost per client" has an actual answer instead of living only
//  in raw logs nobody aggregates.
//
//  Run:  node cost-report.mjs [--days N] [--since] [--report-only]
//
//    --days N       how far back to pull on a cold start (default 7).
//                    Ignored once the DB has data - after the first run
//                    it resumes from the last recorded timestamp minus a
//                    1-hour overlap (CloudWatch ingestion can lag; the
//                    overlap is safe because inserts are idempotent on
//                    the CloudWatch eventId).
//    --report-only  skip CloudWatch entirely, just print totals from
//                    what's already in the local DB.
//
//  Uses the `aws` CLI already configured for kcit-deploy (via
//  execFileSync, not a shell - the same credentials the deploy scripts
//  use, no new IAM permission needed: kcit-deploy already has
//  logs:FilterLogEvents on log-group:/aws/lambda/kcit-* per
//  aws-chatbot-policy.json's ReadLogsForDebugging statement, confirmed
//  working 2026-09-06).
//
//  Windows/Git Bash note: running `aws logs ...` directly in Git Bash
//  mangles a leading `/aws/...` into a Windows path (Git's MSYS layer
//  rewrites anything that looks like a POSIX path). Doesn't affect this
//  script - execFileSync spawns the CLI directly with an argv array, no
//  shell parsing involved - but if you ever test the equivalent `aws`
//  command by hand in Git Bash, prefix it with `MSYS_NO_PATHCONV=1`.
// =====================================================================

import { execFileSync } from "child_process";
import { openDb, insertUsage, summaryByClient, latestTimestamp } from "./db.mjs";
import { costFor } from "./pricing.mjs";

const LOG_GROUP = "/aws/lambda/kcit-chatbot";
const REGION = "us-east-1";

// index.mjs's usage log line doesn't carry the model - there's only ever
// one MODEL constant for the whole Lambda today. Keep this in sync with
// chatbot/index.mjs's MODEL constant; if the chatbot ever serves more than
// one model, the usage log line needs to start carrying it explicitly
// instead of this script guessing.
const MODEL = "claude-opus-5";

const ONE_HOUR_MS = 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { days: 7, reportOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") args.days = Number(argv[++i]);
    else if (argv[i] === "--report-only") args.reportOnly = true;
  }
  return args;
}

function fetchLogEvents(startTimeMs, endTimeMs) {
  const events = [];
  let nextToken;

  do {
    const cliArgs = [
      "logs", "filter-log-events",
      "--log-group-name", LOG_GROUP,
      "--region", REGION,
      "--start-time", String(startTimeMs),
      "--end-time", String(endTimeMs),
      // Every usage line contains "cacheRead" and nothing else in this
      // Lambda's logs does - cheap way to skip startup/debug noise
      // before it ever reaches JSON.parse.
      "--filter-pattern", "cacheRead",
      "--output", "json",
    ];
    if (nextToken) cliArgs.push("--next-token", nextToken);

    const raw = execFileSync("aws", cliArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const parsed = JSON.parse(raw);
    events.push(...parsed.events);
    nextToken = parsed.nextToken;
  } while (nextToken);

  return events;
}

// A matched line looks like:
//   "2026-09-06T12:34:56.789Z\t<requestId>\tINFO\t{"clientId":"...", ...}\n"
// The JSON payload is everything after the third tab.
function parseUsageLine(message) {
  const parts = message.split("\t");
  const jsonPart = parts.length >= 4 ? parts.slice(3).join("\t") : message;
  try {
    return JSON.parse(jsonPart.trim());
  } catch {
    return null; // a log line that happened to contain "cacheRead" as text, not our JSON
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();

  if (!args.reportOnly) {
    const last = latestTimestamp(db);
    const startTimeMs = last ? last - ONE_HOUR_MS : Date.now() - args.days * 24 * ONE_HOUR_MS;
    const endTimeMs = Date.now();

    console.log(
      `Pulling ${LOG_GROUP} from ${new Date(startTimeMs).toISOString()} to ${new Date(endTimeMs).toISOString()}...`
    );

    const events = fetchLogEvents(startTimeMs, endTimeMs);
    let inserted = 0;

    for (const event of events) {
      const usage = parseUsageLine(event.message);
      if (!usage?.clientId) continue;

      const costUsd = costFor(usage, MODEL);
      const wasNew = insertUsage(db, {
        requestId: event.eventId,
        clientId: usage.clientId,
        timestampMs: event.timestamp,
        model: MODEL,
        input: usage.input ?? 0,
        output: usage.output ?? 0,
        cacheRead: usage.cacheRead ?? 0,
        cacheWrite: usage.cacheWrite ?? 0,
        costUsd,
      });
      if (wasNew) inserted++;
    }

    console.log(`Matched ${events.length} log line(s), inserted ${inserted} new usage row(s).`);
  }

  console.log("\nAll-time totals by client:\n");
  const rows = summaryByClient(db);
  if (rows.length === 0) {
    console.log("  (no usage recorded yet)");
  } else {
    for (const r of rows) {
      console.log(
        `  ${r.client_id}: ${r.requests} request(s), ` +
          `$${r.cost_usd.toFixed(4)} ` +
          `(in ${r.input_tokens}, out ${r.output_tokens}, ` +
          `cache read ${r.cache_read}, cache write ${r.cache_write})`
      );
    }
  }

  db.close();
}

main();
