// =====================================================================
//  Recurring triggers for the fleet. Plain setTimeout, not a cron library -
//  a handful of fixed weekly/daily fires don't need a cron expression
//  parser.
//
//  If the server isn't running at the scheduled moment (machine off,
//  restarted mid-window), that day/week's run is simply skipped - no
//  persistence or catch-up logic. Worth knowing, not worth solving yet.
// =====================================================================

import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { chatWithAgent, runAgentFull } from "./chat.mjs";
import { sendNotification } from "./notify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function msUntilNextDailyFire(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function msUntilNextWeeklyFire(dayName, hour) {
  const targetDay = DAY_NAMES.indexOf(dayName.toLowerCase());
  if (targetDay === -1) throw new Error(`Unknown day "${dayName}" - use a full day name like "sunday"`);

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  let daysAhead = (targetDay - next.getDay() + 7) % 7;
  if (daysAhead === 0 && next <= now) daysAhead = 7;
  next.setDate(next.getDate() + daysAhead);
  return next.getTime() - now.getTime();
}

async function runStandup() {
  console.log("Scheduler: running the daily standup...");
  try {
    const { text } = await chatWithAgent(
      "executive-assistant",
      "Produce today's daily standup and append it to the digest, per your instructions."
    );
    await sendNotification({
      title: "Daily standup",
      message: text.slice(0, 1024), // Pushover's own message length cap
      priority: 0,
    });
    console.log("Scheduler: standup done and pushed.");
  } catch (err) {
    console.error("Scheduler: standup failed:", err.message);
  }
}

async function runRetro() {
  console.log("Scheduler: running the weekly retro...");
  try {
    const { text } = await chatWithAgent(
      "executive-assistant",
      "Produce this week's retro and append it to EA Retro.md, per your instructions."
    );
    await sendNotification({
      title: "Weekly retro",
      message: text.slice(0, 1024),
      priority: 0,
    });
    console.log("Scheduler: retro done and pushed.");
  } catch (err) {
    console.error("Scheduler: retro failed:", err.message);
  }
}

// Kevin explicitly wants the existing "don't add more if there's already an
// unvisited backlog" guardrail to keep applying to autonomous runs - but
// that guardrail lives in prospect-scout.md as prose, and an unattended run
// has nobody there to read a pushback and decide. So the throttle is
// enforced here in code, before the agent is even invoked, the same way
// permissions.mjs enforces the confirm-step in code rather than trusting
// the prompt alone. Deliberately simple: one regex on the `status:` line,
// not a real YAML parser - every note in this vault follows the same
// flat frontmatter format the templates define.
function countUnvisitedProspects() {
  const dir = join(KCIT_ROOT, "vault", "60-Prospects");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return 0; // directory missing is not an error here, just zero prospects
  }
  let count = 0;
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    if (/^status:\s*not-visited\s*$/m.test(content)) count++;
  }
  return count;
}

async function runProspectScout() {
  const threshold = Number(process.env.PROSPECT_BACKLOG_THRESHOLD ?? 5);
  const unvisited = countUnvisitedProspects();

  if (unvisited >= threshold) {
    console.log(
      `Scheduler: skipping prospect-scout - ${unvisited} unvisited prospects already (threshold ${threshold}). ` +
        `Visit some of the existing list before more get added.`
    );
    return;
  }

  console.log(`Scheduler: running prospect-scout (${unvisited} unvisited, below threshold ${threshold})...`);
  try {
    await runAgentFull(
      "prospect-scout",
      "Build out today's batch of new prospects, following your own reasoning for who's worth researching " +
        "and your own rule about not piling up more than Kevin can visit. Log what you add, as usual."
    );
    // No separate push here - prospect-scout already appends to Activity
    // Log.md, and Kevin wants this surfaced through the next standup, not
    // an extra ping every run.
    console.log("Scheduler: prospect-scout run complete.");
  } catch (err) {
    console.error("Scheduler: prospect-scout run failed:", err.message);
  }
}

function scheduleDaily(hour, fn) {
  const delay = msUntilNextDailyFire(hour);
  console.log(`Scheduler: standup next fires in ${Math.round(delay / 60000)} min (daily at ${hour}:00).`);
  setTimeout(function fire() {
    fn();
    setTimeout(fire, DAY_MS);
  }, delay);
}

function scheduleWeekly(label, dayName, hour, fn) {
  const delay = msUntilNextWeeklyFire(dayName, hour);
  console.log(`Scheduler: ${label} next fires in ${Math.round(delay / 3600000)} hr (weekly, ${dayName} at ${hour}:00).`);
  setTimeout(function fire() {
    fn();
    setTimeout(fire, WEEK_MS);
  }, delay);
}

export function startScheduler() {
  const standupHour = Number(process.env.STANDUP_HOUR ?? 7);
  const retroDay = process.env.RETRO_DAY ?? "sunday";
  const retroHour = Number(process.env.RETRO_HOUR ?? 7);
  const prospectDays = (process.env.PROSPECT_SCOUT_DAYS ?? "monday,wednesday,friday")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const prospectHour = Number(process.env.PROSPECT_SCOUT_HOUR ?? 9);

  scheduleDaily(standupHour, runStandup);
  scheduleWeekly("retro", retroDay, retroHour, runRetro);
  // Each call is its own independent weekly timer for that day - reusing
  // scheduleWeekly as-is rather than writing a second multi-day scheduler.
  for (const day of prospectDays) {
    scheduleWeekly("prospect-scout", day, prospectHour, runProspectScout);
  }
}
