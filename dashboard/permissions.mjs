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
//    - Bash: ALWAYS confirm, as far as this file is concerned. This is
//      deliberately blunt - every genuinely hard-to-reverse action in this
//      codebase (git push, a deploy script, an aws cli call) goes through
//      Bash, and nothing *here* tries to tell a safe command from a
//      dangerous one by pattern-matching the string.
//
//      Measured caveat, found by testing this live on 2026-09-07 rather
//      than trusting the design: a layer BELOW this one classifies, and it
//      classifies by COMMAND STRING, not by what the command does. Three
//      real runs through this dashboard:
//        - `git status --porcelain`                    -> NOT gated, ran immediately
//        - `git -C "<path>" status --porcelain`        -> gated, waited
//        - `touch /tmp/<file>`                         -> gated, waited
//      The first two are the same read-only operation. One bypassed the
//      confirm-step, one didn't. So this is a built-in command-pattern
//      allowlist inside Claude Code's own CLI, applied before canUseTool
//      below is ever consulted - not a read-only/mutating distinction, and
//      not something to reason about semantically.
//
//      Practical consequence: do NOT write or rely on "every Bash call
//      waits for Kevin." What actually holds is narrower and fuzzier -
//      most commands gate, some bare well-known read-only invocations do
//      not, and which is which depends on exact string shape. Everything
//      genuinely destructive in this codebase (git push, deploy scripts,
//      aws cli) is well outside any plausible allowlist, so the protection
//      that matters is intact - but the guarantee is not absolute, and
//      anything written for Kevin should say so.
// =====================================================================

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { markAwaitingConfirmation } from "./runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");
export const KC_IT_ROOT = "C:\\Users\\PC USER\\Downloads\\kc.IT";

const AUTO_ALLOW_TOOLS = new Set(["Read", "Glob", "Grep", "WebSearch", "WebFetch", "Write", "Edit"]);

// --- Auto-approve: an explicit, visible, human-flipped override --------
// Kevin's own ask, after clicking through a real test that needed several
// individual approvals for one conceptual task: a way to skip the
// confirm-step for a whole session, not a smarter allowlist that tries to
// guess which commands are safe. That guessing is exactly what the CLI's
// own hidden allowlist above already proved unreliable - this does the
// opposite: OFF by default, reset on every server restart (never
// persisted), toggled only by a real click on a control that stays
// visibly loud (red warning banner) the entire time it's on. Global, not
// per-agent or per-run - matches the single toggle in the UI.
let autoApprove = false;

export function getAutoApprove() {
  return autoApprove;
}

export function setAutoApprove(on) {
  autoApprove = Boolean(on);
  return autoApprove;
}

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

// Phase 8: runId is the caller's own live-run id (see runs.mjs) - passed in
// so a Bash call that falls through to a human can flip that run's tool
// entry from "running" to "awaiting confirmation" instead of just looking
// stuck. toolUseID/agentID come from the SDK's own canUseTool callback
// (verified in runtimeTypes.d.ts - already passed in, previously discarded)
// and are exactly the join key needed, no new bookkeeping required.
/** @returns {import("@anthropic-ai/claude-agent-sdk").CanUseTool} */
export function makeCanUseTool(runId) {
  return async (toolName, input, { toolUseID, agentID } = {}) => {
    if (AUTO_ALLOW_TOOLS.has(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    if (autoApprove) {
      return { behavior: "allow", updatedInput: input };
    }

    if (runId && toolUseID) markAwaitingConfirmation(runId, toolUseID);

    // Everything else (Bash, and anything not explicitly listed above -
    // deny by default rather than silently auto-allow an unrecognized
    // future tool) waits for a human.
    return new Promise((resolve) => {
      const id = randomUUID();
      pending.set(id, { id, toolName, input, toolUseID, agentID, createdAt: Date.now(), resolve });
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
