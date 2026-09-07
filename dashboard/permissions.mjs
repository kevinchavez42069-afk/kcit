// =====================================================================
//  Phase 4 safety layer: the confirm-step and the concurrent-editor
//  check promised in the design doc, not bolted on after the fact.
//
//  Policy for canUseTool, deliberately simple rather than pattern-
//  matching "risky" commands:
//    - Read, Glob, Grep, WebSearch, WebFetch: auto-allow. No side effects.
//    - Write, Edit: auto-allow. Everything these touch is inside a git
//      repo (kcit or kc.IT), so a bad edit is a `git diff` and a revert
//      away - not hard to reverse.
//    - Bash: ALWAYS confirm. This is deliberately blunt - it's also
//      exactly right, because every genuinely hard-to-reverse action in
//      this codebase (git push, a deploy script, an aws cli call) goes
//      through Bash. Nothing here tries to tell a safe git status from a
//      dangerous git push by pattern-matching the command string - the
//      human reads the actual command before it runs, every time.
// =====================================================================

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");
const KC_IT_ROOT = "C:\\Users\\PC USER\\Downloads\\kc.IT";

const AUTO_ALLOW_TOOLS = new Set(["Read", "Glob", "Grep", "WebSearch", "WebFetch", "Write", "Edit"]);

// --- Pending confirmations --------------------------------------------
// One in-memory map, fine for a single-user local tool. Each entry holds
// the resolve function for the Promise canUseTool is blocking on, so the
// browser confirming/denying via POST /api/confirm is what lets the
// underlying tool call actually proceed or fail.
const pending = new Map();

export function listPending() {
  return [...pending.values()].map(({ id, toolName, input, createdAt }) => ({
    id,
    toolName,
    input,
    createdAt,
  }));
}

export function resolvePending(id, approve) {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  entry.resolve(
    approve
      ? { behavior: "allow", updatedInput: entry.input }
      : { behavior: "deny", message: "Denied by Kevin from the dashboard." }
  );
  return true;
}

/** @returns {import("@anthropic-ai/claude-agent-sdk").CanUseTool} */
export function makeCanUseTool() {
  return async (toolName, input) => {
    if (AUTO_ALLOW_TOOLS.has(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    // Everything else (Bash, and anything not explicitly listed above -
    // deny by default rather than silently auto-allow an unrecognized
    // future tool) waits for a human.
    return new Promise((resolve) => {
      const id = randomUUID();
      pending.set(id, { id, toolName, input, createdAt: Date.now(), resolve });
    });
  };
}

// --- Concurrent-editor check --------------------------------------------
// The exact incident this guards against already happened once today:
// two Claude sessions raced on the kcit repo and origin/main diverged
// mid-work. Before a write-capable agent run starts, fetch and compare -
// refuse to start if this machine's view of either repo is stale, rather
// than let an agent write on top of history it hasn't seen.
function checkRepoCurrent(repoPath) {
  try {
    execFileSync("git", ["fetch", "origin"], { cwd: repoPath, stdio: "pipe" });
  } catch {
    return { current: true, reason: null }; // no remote, or fetch failed - nothing to compare against
  }
  try {
    const behind = execFileSync("git", ["rev-list", "--count", "HEAD..origin/main"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    if (Number(behind) > 0) {
      return {
        current: false,
        reason: `${repoPath} is ${behind} commit(s) behind origin/main - someone else pushed since this checkout was last updated.`,
      };
    }
  } catch {
    return { current: true, reason: null }; // no origin/main - e.g. kc.IT has no remote at all
  }
  return { current: true, reason: null };
}

export function checkReposCurrent() {
  const results = [checkRepoCurrent(KCIT_ROOT), checkRepoCurrent(KC_IT_ROOT)];
  const stale = results.filter((r) => !r.current);
  return { current: stale.length === 0, reasons: stale.map((r) => r.reason) };
}
