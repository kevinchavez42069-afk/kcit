// =====================================================================
//  Push notifications via Pushover. One function, deliberately thin.
//
//  Needs PUSHOVER_TOKEN (this app's token, created once in Pushover's
//  dashboard) and PUSHOVER_USER (Kevin's user key) in dashboard/.env -
//  same gitignored pattern as ANTHROPIC_API_KEY. Not set up yet as of
//  this writing; sendNotification no-ops with a console warning until
//  they exist, so the standup/retro scheduler can call it unconditionally
//  without needing to check first.
// =====================================================================

const PUSHOVER_URL = "https://api.pushover.net/1/messages.json";

/**
 * @param {{title: string, message: string, priority?: -2|-1|0|1|2, url?: string}} opts
 * priority 0 (default) for routine updates like the daily standup.
 * priority 2 ("emergency") for genuinely time-sensitive things - repeats
 * with sound until acknowledged. Requires retry/expire, set below.
 */
export async function sendNotification({ title, message, priority = 0, url }) {
  const token = process.env.PUSHOVER_TOKEN;
  const user = process.env.PUSHOVER_USER;

  if (!token || !user) {
    console.warn(
      "Pushover not configured (PUSHOVER_TOKEN/PUSHOVER_USER unset) - " +
        `would have sent: "${title}"`
    );
    return { sent: false, reason: "not configured" };
  }

  const body = new URLSearchParams({ token, user, title, message, priority: String(priority) });
  if (url) body.set("url", url);
  if (priority === 2) {
    // Emergency notifications require these: retry is how often it
    // re-alerts, expire is how long it keeps trying before giving up.
    body.set("retry", "60");
    body.set("expire", "3600");
  }

  const res = await fetch(PUSHOVER_URL, { method: "POST", body });
  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status !== 1) {
    console.error("Pushover send failed:", res.status, data);
    return { sent: false, reason: data?.errors?.join(", ") ?? `HTTP ${res.status}` };
  }

  return { sent: true, receipt: data.receipt ?? null };
}
