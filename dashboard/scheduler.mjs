// =====================================================================
//  Two recurring triggers for executive-assistant: the daily standup and
//  the weekly retro. Plain setTimeout, not a cron library - a single
//  daily and a single weekly fire don't need a cron expression parser.
//
//  If the server isn't running at the scheduled moment (machine off,
//  restarted mid-window), that day/week's run is simply skipped - no
//  persistence or catch-up logic. Worth knowing, not worth solving yet.
// =====================================================================

import { chatWithAgent } from "./chat.mjs";
import { sendNotification } from "./notify.mjs";

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

function scheduleDaily(hour, fn) {
  const delay = msUntilNextDailyFire(hour);
  console.log(`Scheduler: standup next fires in ${Math.round(delay / 60000)} min (daily at ${hour}:00).`);
  setTimeout(function fire() {
    fn();
    setTimeout(fire, DAY_MS);
  }, delay);
}

function scheduleWeekly(dayName, hour, fn) {
  const delay = msUntilNextWeeklyFire(dayName, hour);
  console.log(`Scheduler: retro next fires in ${Math.round(delay / 3600000)} hr (weekly, ${dayName} at ${hour}:00).`);
  setTimeout(function fire() {
    fn();
    setTimeout(fire, WEEK_MS);
  }, delay);
}

export function startScheduler() {
  const standupHour = Number(process.env.STANDUP_HOUR ?? 7);
  const retroDay = process.env.RETRO_DAY ?? "sunday";
  const retroHour = Number(process.env.RETRO_HOUR ?? 7);

  scheduleDaily(standupHour, runStandup);
  scheduleWeekly(retroDay, retroHour, runRetro);
}
