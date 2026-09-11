// =====================================================================
//  AWS infrastructure cost collector - the fourth cost source for the
//  finance agent, alongside agent_runs, chatbot_usage and Recurring Costs.
//
//  Pulls daily cost per service from Cost Explorer and stores it in the
//  local aws_costs table. The finance agent reads those rows through
//  finance.mjs; it never calls AWS itself.
//
//  Run:  node aws-cost-report.mjs [--days N] [--report-only]
//
//    --days N       trailing window to pull, default 35. Re-pulled in full
//                    every run rather than resumed from a high-water mark:
//                    AWS marks the whole current month "estimated" and keeps
//                    revising it until the invoice closes, so old rows go
//                    stale. 35 days covers a month-end close. One Cost
//                    Explorer request costs $0.01 whatever the window.
//    --report-only  skip Cost Explorer, just print what's already stored.
//
//  Credentials: its own IAM user, kcit-finops-reader, via the `kcit-finops`
//  AWS CLI profile (override with KCIT_FINOPS_PROFILE). Deliberately not
//  kcit-deploy, which has no billing access by design. The policy is
//  aws-finops-policy.json next to this file: ce:GetCostAndUsage and
//  ce:GetCostForecast, read only. It lives in this repo rather than beside
//  kc.IT's policies because this is the only thing that uses it.
//
//  Cost Explorer quirks, taken from real responses rather than the docs:
//  Total is {} when grouping, so sum the groups; Amount is a string and can
//  be negative (credits, or "-0"), stored as returned, never clamped; and
//  End is exclusive, so End=today yields data through yesterday, which is
//  as fresh as Cost Explorer gets anyway.
// =====================================================================

import { execFileSync } from "child_process";
import { openDb, replaceAwsCostWindow, summaryByService, latestAwsDay } from "./db.mjs";

const PROFILE = process.env.KCIT_FINOPS_PROFILE ?? "kcit-finops";
const REGION = "us-east-1"; // Cost Explorer's only endpoint

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { days: 35, reportOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") args.days = Number(argv[++i]);
    else if (argv[i] === "--report-only") args.reportOnly = true;
  }
  return args;
}

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function fetchDailyCostsByService(startDay, endDay) {
  const buckets = [];
  let nextToken;

  do {
    const cliArgs = [
      "ce", "get-cost-and-usage",
      "--profile", PROFILE,
      "--region", REGION,
      "--time-period", `Start=${startDay},End=${endDay}`,
      "--granularity", "DAILY",
      "--metrics", "UnblendedCost",
      "--group-by", "Type=DIMENSION,Key=SERVICE",
      "--output", "json",
    ];
    // Each page is another billed request. A handful of services over 35
    // days fits in one page today; loop anyway rather than silently truncate.
    if (nextToken) cliArgs.push("--next-page-token", nextToken);

    const raw = execFileSync("aws", cliArgs, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const parsed = JSON.parse(raw);
    buckets.push(...parsed.ResultsByTime);
    nextToken = parsed.NextPageToken;
  } while (nextToken);

  return buckets;
}

function toRows(buckets, fetchedMs) {
  const rows = [];
  for (const bucket of buckets) {
    const day = bucket.TimePeriod.Start;
    for (const group of bucket.Groups ?? []) {
      const metric = group.Metrics.UnblendedCost;
      if (metric.Unit !== "USD") {
        // Never convert with a guessed rate - skip and say so.
        console.warn(`Skipping ${group.Keys[0]} on ${day}: unit is ${metric.Unit}, not USD.`);
        continue;
      }
      rows.push({
        day,
        service: group.Keys[0],
        timestampMs: Date.parse(`${day}T00:00:00Z`),
        costUsd: parseFloat(metric.Amount),
        estimated: Boolean(bucket.Estimated),
        fetchedMs,
      });
    }
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();

  if (!args.reportOnly) {
    const now = Date.now();
    const startDay = utcDay(now - args.days * DAY_MS);
    const endDay = utcDay(now);

    console.log(`Pulling Cost Explorer (profile ${PROFILE}) for ${startDay} up to ${endDay}...`);

    const buckets = fetchDailyCostsByService(startDay, endDay);
    const rows = toRows(buckets, now);
    replaceAwsCostWindow(db, startDay, endDay, rows);

    console.log(`Stored ${rows.length} day/service row(s) across ${buckets.length} day(s).`);
  }

  console.log(`\nAll-time AWS totals by service (latest day: ${latestAwsDay(db) ?? "none"}):\n`);
  const services = summaryByService(db);
  if (services.length === 0) {
    console.log("  (no AWS cost data yet)");
  } else {
    for (const s of services) {
      console.log(
        `  ${s.service}: $${s.cost_usd.toFixed(4)} over ${s.days} day(s)` +
          (s.any_estimated ? " (includes estimates)" : "")
      );
    }
  }

  db.close();
}

main();
