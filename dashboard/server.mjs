// =====================================================================
//  AI Operating System dashboard - Phase 2, read-only MVP.
//  See vault/50-Workspace/AI Operating System.md for the full roadmap.
//
//  Run:  node server.mjs
//  Then open http://localhost:7417 (or the printed URL/credentials).
//
//  Read-only on purpose - this phase proves out hosting and access
//  control before phase 4 adds anything that can write vault files,
//  commit, deploy, or touch AWS. No chat yet, no tool execution.
//
//  Access model: this process binds to localhost only. Reaching it from
//  a phone/laptop elsewhere means putting it on a private tunnel
//  (Tailscale recommended - see the design doc) rather than opening it
//  to the public internet. HTTP Basic Auth below is defense in depth on
//  top of that, not a substitute for it - don't port-forward this.
// =====================================================================

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes, timingSafeEqual } from "crypto";
import { openDb, summaryByClient } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = join(here, "..", "vault");
const PUBLIC = join(here, "public");
const PORT = process.env.PORT ? Number(process.env.PORT) : 7417;

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

function requireAuth(req, res) {
  if (checkAuth(req)) return true;
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="KC IT Ops Dashboard"' });
  res.end("Authentication required.");
  return false;
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

const server = createServer((req, res) => {
  if (!requireAuth(req, res)) return;

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

  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nKC IT Ops Dashboard (phase 2, read-only) — http://localhost:${PORT}`);
  console.log(`Bound to localhost only. Reach it remotely through a private tunnel`);
  console.log(`(Tailscale recommended), never by port-forwarding this to the internet.\n`);
  console.log(`Login: ${AUTH_USER} / ${AUTH_PASS}`);
  if (generatedPassword) {
    console.log(`(generated for this run — set DASHBOARD_USER/DASHBOARD_PASS to fix it)\n`);
  } else {
    console.log("");
  }
});
