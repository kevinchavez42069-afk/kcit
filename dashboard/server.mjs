// =====================================================================
//  AI Operating System dashboard - phases 1-6.
//  See vault/50-Workspace/AI Operating System.md for the full roadmap.
//
//  Run:  node server.mjs
//  Then open http://localhost:7417 (or the printed URL/credentials).
//
//  executive-assistant (phase 6) is a real hub: its own tools plus the
//  other three agents available to delegate to, and a scheduler firing
//  its daily standup and weekly retro automatically (scheduler.mjs).
//  The other three agents get real write/deploy/AWS power directly too
//  (phase 4). Needs ANTHROPIC_API_KEY in the environment for any chat to
//  work at all; without it, everything else on this page still works,
//  chat alone returns a clear error. Pushover notifications (notify.mjs)
//  need PUSHOVER_TOKEN/PUSHOVER_USER too, and no-op with a console
//  warning until those are set.
//
//  Access model: reachable over Tailscale plus HTTP Basic Auth with a
//  per-IP lockout after repeated failures (see requireAuth below) - that
//  pairing is what's allowed to gate real tool execution, so it isn't
//  loosened here. Never port-forward this to the public internet
//  regardless.
// =====================================================================

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes, timingSafeEqual } from "crypto";
import { execFileSync } from "child_process";
import { homedir } from "os";

// Secrets live OUTSIDE the repo tree, at ~/.kcit/.env, and this is load
// bearing rather than tidiness. Agents run with cwd = the repo root and have
// Read/Grep auto-allowed with no confirm-step, so a .env inside the tree was
// readable by any agent, including unattended scheduled runs - and WebFetch is
// auto-allowed too, so reading it and POSTing it somewhere needed no Bash call
// and raised no prompt. Being gitignored did nothing about that; that only
// governs what git tracks, not what the filesystem hands out.
//
// Deliberately no fallback to the old dashboard/.env path: a fallback would
// quietly re-accept the location this moved away from. If the file is missing
// the server still starts, and chat reports itself unconfigured.
const ENV_PATH = join(homedir(), ".kcit", ".env");
try {
  process.loadEnvFile(ENV_PATH);
} catch {
  console.warn(`No env file at ${ENV_PATH} - chat and notifications stay unconfigured until one exists there.`);
}
import { openDb, summaryByClient, summaryByAgent } from "./db.mjs";
import { chatWithAgent, runAgentFull } from "./chat.mjs";
import { startScheduler } from "./scheduler.mjs";
import { loadAgents } from "./agents.mjs";
import { listPending, resolvePending, getAutoApprove, setAutoApprove } from "./permissions.mjs";
import { listRuns } from "./runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = join(here, "..", "vault");
const PUBLIC = join(here, "public");
const PORT = process.env.PORT ? Number(process.env.PORT) : 7417;

// 0.0.0.0 by default: the actual access boundary is Tailscale (only
// devices on Kevin's tailnet can route to this machine at all) plus the
// Basic Auth below, not the bind address. Override with HOST=127.0.0.1
// to go back to localhost-only if Tailscale isn't set up yet.
const HOST = process.env.HOST || "0.0.0.0";

// The Windows installer doesn't put tailscale.exe on PATH, so a bare
// "tailscale" lookup fails even when it's running - try PATH first, then
// the default install location, before giving up.
const TAILSCALE_CANDIDATES = ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"];

function tailscaleIp() {
  for (const bin of TAILSCALE_CANDIDATES) {
    try {
      return execFileSync(bin, ["ip", "-4"], { encoding: "utf8" }).trim();
    } catch {
      // try the next candidate
    }
  }
  return null; // not installed, or installed somewhere else - not fatal, just skip the hint
}

// --- Auth --------------------------------------------------------------
// Never ship a default credential. If DASHBOARD_USER/PASS aren't set,
// generate one for this run and print it once - inconvenient on purpose,
// so "just works" doesn't quietly mean "wide open."
const AUTH_USER = process.env.DASHBOARD_USER || "kevin";
const AUTH_PASS = process.env.DASHBOARD_PASS || randomBytes(9).toString("base64url");
const generatedPassword = !process.env.DASHBOARD_PASS;

// timingSafeEqual throws on mismatched lengths rather than returning
// false, so check lengths first - safe here because leaking a *length*
// mismatch on a short local username/password isn't the threat model.
function safeEqual(a = "", b = "") {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function checkAuth(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
  return safeEqual(user, AUTH_USER) && safeEqual(pass, AUTH_PASS);
}

// Basic Auth has no built-in lockout, and this endpoint is about to start
// gating real write/deploy power (phase 4) behind it - a few bad guesses
// shouldn't be free. Per-IP, in-memory, best-effort (same honestly-labeled
// limitation as the chatbot Lambda's rate limiter: it slows a casual
// attacker, not a determined one on a botnet, but there is no determined
// botnet on a Tailscale-only surface - the real threat here is a guessed
// password from casual local-network access, which this stops cold).
const FAILED_AUTH_LIMIT = 8;
const FAILED_AUTH_WINDOW_MS = 5 * 60_000;
const failedAuth = new Map();

function isLockedOut(ip) {
  const recent = (failedAuth.get(ip) ?? []).filter((t) => t > Date.now() - FAILED_AUTH_WINDOW_MS);
  failedAuth.set(ip, recent);
  return recent.length >= FAILED_AUTH_LIMIT;
}

function recordFailedAuth(ip) {
  const recent = failedAuth.get(ip) ?? [];
  recent.push(Date.now());
  failedAuth.set(ip, recent);
  if (failedAuth.size > 500) failedAuth.clear(); // crude memory bound
}

function requireAuth(req, res) {
  const ip = req.socket.remoteAddress ?? "unknown";
  if (isLockedOut(ip)) {
    res.writeHead(429, { "Retry-After": "300" });
    res.end("Too many failed logins. Try again in a few minutes.");
    return false;
  }
  if (checkAuth(req)) return true;
  recordFailedAuth(ip);
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="KC IT Ops Dashboard"' });
  res.end("Authentication required.");
  return false;
}

// --- CSRF ----------------------------------------------------------------
// The 2026-09-07 audit's first critical finding. Basic Auth credentials are
// cached by the browser per origin and attached automatically to ANY request
// to that origin, including one a completely unrelated web page triggers
// while the dashboard tab is open. A hidden form posting with
// enctype="text/plain" is a CORS "simple request": no preflight, no consent,
// and this server used to parse its body as JSON and act on it. That was
// enough to flip auto-approve on and then run an agent with Bash, with
// Kevin's own browser supplying the credentials and no confirm banner ever
// appearing. "It's Tailscale-only" is no defense - the request originates
// from his browser, which is already on the tailnet.
//
// The fix is the standard one: require a header a cross-origin form cannot
// set. Any custom header forces a CORS preflight, and the preflight fails
// because this server never sends Access-Control-Allow-* to anyone. Applied
// to every state-changing method rather than only the two endpoints the
// audit named, because /api/confirm approves a queued Bash command and
// deserves the same protection.
const CSRF_HEADER = "x-requested-by";
const CSRF_VALUE = "kcit-dashboard";

function requireSameOrigin(req, res) {
  if (req.method === "GET" || req.method === "HEAD") return true;

  if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
    jsonResponse(res, 403, {
      error: `State-changing requests need the ${CSRF_HEADER}: ${CSRF_VALUE} header. This blocks cross-site request forgery.`,
    });
    return false;
  }

  // Belt and braces: if the browser sent an Origin (it does on POST), it has
  // to be this server. A form post from another page carries that page's
  // origin, so this catches it even if the header check were ever relaxed.
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    let originHost = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      jsonResponse(res, 403, { error: "Cross-origin request refused." });
      return false;
    }
  }

  return true;
}

// --- Data sources --------------------------------------------------------

function readVaultFile(relativePath) {
  const path = join(VAULT, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

// Parses Activity Log.md's convention:
//   ## 2026-09-06
//   - **agent-name** — one-line summary, [[links]]
// A bullet can wrap onto indented continuation lines, and can name more
// than one agent (e.g. "**follow-up** / **prospect-scout**"), so this
// joins each bullet into one logical line before matching it, rather
// than assuming one bullet is exactly one physical line.
function parseActivityLog(markdown) {
  if (!markdown) return [];
  const entries = [];
  let currentDate = null;
  let bullet = null;

  const flush = () => {
    if (bullet && currentDate) {
      const match = bullet.match(/^-\s+(.+?)\s+[—-]\s+(.+)$/);
      if (match) {
        entries.push({
          date: currentDate,
          agent: match[1].replace(/\*\*/g, "").trim(),
          summary: match[2].replace(/\s+/g, " ").trim(),
        });
      }
    }
    bullet = null;
  };

  for (const line of markdown.split("\n")) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      flush();
      currentDate = dateMatch[1];
      continue;
    }
    if (/^-\s+/.test(line)) {
      flush();
      bullet = line.trim();
    } else if (line.trim() === "") {
      flush();
    } else if (bullet) {
      bullet += " " + line.trim();
    }
  }
  flush();

  return entries.reverse(); // newest first
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10_000) req.destroy(); // one chat message shouldn't be an essay
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function serveStatic(req, res) {
  const path = req.url === "/" ? "/index.html" : req.url;
  const filePath = join(PUBLIC, path);
  if (!filePath.startsWith(PUBLIC) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

// --- Server ----------------------------------------------------------

const server = createServer(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (!requireSameOrigin(req, res)) return;

  if (req.url === "/api/activity") {
    const entries = parseActivityLog(readVaultFile("50-Workspace/Activity Log.md"));
    return jsonResponse(res, 200, { entries: entries.slice(0, 50) });
  }

  if (req.url === "/api/digest") {
    const digest = readVaultFile("50-Workspace/Daily Digest.md");
    return jsonResponse(res, 200, { digest, exists: digest !== null });
  }

  if (req.url === "/api/costs") {
    const db = openDb();
    const rows = summaryByClient(db);
    db.close();
    return jsonResponse(res, 200, { clients: rows });
  }

  // Phase 5: what the agent fleet itself costs to run from this dashboard
  // (chatWithAgent and runAgentFull both log here) - distinct from
  // /api/costs, which is customer chatbot traffic.
  if (req.url === "/api/agent-costs") {
    const db = openDb();
    const rows = summaryByAgent(db);
    db.close();
    return jsonResponse(res, 200, { agents: rows });
  }

  // executive-assistant's dedicated endpoint - real tools plus delegation
  // to the other three agents as of phase 6 (see chat.mjs).
  if (req.url === "/api/chat" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body." });
    }
    if (typeof body.message !== "string" || !body.message.trim()) {
      return jsonResponse(res, 400, { error: "Expected a non-empty \"message\" string." });
    }
    try {
      const { text, usage, costUsd } = await chatWithAgent("executive-assistant", body.message);
      return jsonResponse(res, 200, { reply: text, usage, costUsd });
    } catch (err) {
      console.error("Chat error:", err);
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // Phase 4: list the agents this dashboard can run with real tools.
  if (req.url === "/api/agents") {
    const agents = [...loadAgents().values()].map((a) => ({ name: a.name, description: a.description, tools: a.tools }));
    return jsonResponse(res, 200, { agents });
  }

  // Phase 4: run any agent with its real tools. Bash always waits for
  // confirmation - the request stays open (no timeout set) until either
  // the agent finishes or a pending confirmation is resolved via
  // /api/confirm. The frontend polls /api/pending while this is in flight.
  if (req.url === "/api/run" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body." });
    }
    if (typeof body.agent !== "string" || typeof body.message !== "string" || !body.message.trim()) {
      return jsonResponse(res, 400, { error: 'Expected "agent" and a non-empty "message".' });
    }
    try {
      const { text, usage, costUsd } = await runAgentFull(body.agent, body.message);
      return jsonResponse(res, 200, { reply: text, usage, costUsd });
    } catch (err) {
      console.error("Agent run error:", err);
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // Phase 4: the confirm-step. GET to see what's waiting, POST to decide.
  if (req.url === "/api/pending") {
    return jsonResponse(res, 200, { pending: listPending() });
  }

  // Phase 8: what's actually running right now, across every agent -
  // including a scheduler-fired run with no browser request in flight at
  // all. Read-only, no POST side, unlike /api/pending.
  if (req.url === "/api/runs") {
    return jsonResponse(res, 200, { runs: listRuns() });
  }

  if (req.url === "/api/confirm" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body." });
    }
    const ok = resolvePending(body.id, Boolean(body.approve));
    if (!ok) return jsonResponse(res, 404, { error: "No pending confirmation with that id (already resolved, or never existed)." });
    return jsonResponse(res, 200, { resolved: true });
  }

  // Phase 9: an explicit, human-flipped override, not a smarter allowlist -
  // see permissions.mjs's own comment on why. GET so the frontend can sync
  // state on load (in case of a page refresh or a second tab); POST to
  // flip it. Never persisted - resets to off on every server restart.
  if (req.url === "/api/auto-approve" && req.method === "GET") {
    return jsonResponse(res, 200, { autoApprove: getAutoApprove() });
  }
  if (req.url === "/api/auto-approve" && req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body." });
    }
    return jsonResponse(res, 200, { autoApprove: setAutoApprove(body.on) });
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`\nKC IT Ops Dashboard (phases 1-6)`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`ANTHROPIC_API_KEY not set - everything works except chat.`);
  }
  if (!process.env.PUSHOVER_TOKEN || !process.env.PUSHOVER_USER) {
    console.log(`PUSHOVER_TOKEN/PUSHOVER_USER not set - standup/retro will run but won't push.`);
  }
  console.log(`Local:      http://localhost:${PORT}`);
  const tsIp = tailscaleIp();
  if (tsIp) {
    console.log(`Tailscale:  http://${tsIp}:${PORT}  (reachable from any device on your tailnet)`);
  } else if (HOST === "0.0.0.0") {
    console.log(`Tailscale not detected — this is listening on all interfaces but only`);
    console.log(`reachable from this machine or your home network until Tailscale is up.`);
  }
  console.log(`Never port-forward this port to the public internet.\n`);
  console.log(`Login: ${AUTH_USER} / ${AUTH_PASS}`);
  if (generatedPassword) {
    console.log(`(generated for this run — set DASHBOARD_USER/DASHBOARD_PASS to fix it)\n`);
  } else {
    console.log("");
  }
  startScheduler();
});
