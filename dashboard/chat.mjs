// =====================================================================
//  Live chat with an agent, via the Claude Agent SDK. Two entry points:
//
//  chatWithAgent  - executive-assistant only, and now a real hub (phase 6):
//                   its own real tools (Read/Write/Edit/Glob/Grep/Bash),
//                   plus an `agents` map so it can genuinely delegate to
//                   the other three via the SDK's native subagent support.
//                   Phase 3 (2026-09-06) had this forced to Read/Glob/Grep
//                   only, as a deliberate stricter cap for the first live
//                   integration; superseded now that phases 3-5 are
//                   verified and Kevin explicitly asked for the hub role.
//                   Phase 6.2 (2026-09-07) added Bash directly to EA's own
//                   tools - Kevin's call: the hub needs to check
//                   infrastructure state (git status, what's running, logs)
//                   itself, not only by delegating. EA's own prompt still
//                   draws the line at specialized business work
//                   (prospect research, follow-up, onboarding), which
//                   stays delegated to whichever agent's job it actually is.
//  runAgentFull   - phase 4. Any of the four agents, with their real
//                   tools. Safety comes from permissions.mjs: Bash always
//                   waits for a human via canUseTool, and a stale local
//                   checkout of either repo blocks the run before it
//                   starts (see checkReposCurrent).
//
//  EA's Bash calls hit the exact same canUseTool confirm-step as any other
//  agent's - see the allowedTools filter in chatWithAgent below. Being the
//  hub does not mean being pre-approved; that would be exactly the kind of
//  privilege escalation the confirm-step exists to prevent. A delegated
//  subagent's Bash call also hits the same policy, since permission
//  checking is session-wide, not per-agent - confirmed architecturally by
//  reading the SDK's own source; still needs a live test (ask EA to check
//  git status and confirm the banner actually appears) once this ships.
//
//  Needs ANTHROPIC_API_KEY in the environment - the Agent SDK cannot
//  reuse Claude Code's own session credentials, it makes its own API
//  calls and Anthropic's terms require a real API key for that. Set by
//  Kevin 2026-09-07, verified working via chatWithAgent.
// =====================================================================

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAgent, loadAgents } from "./agents.mjs";
import { makeCanUseTool, checkReposCurrent, KC_IT_ROOT } from "./permissions.mjs";
import { openDb, insertAgentRun } from "./db.mjs";
import { startRun, endRun, recordToolStart, recordToolEnd } from "./runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");

// Phase 7: developer/code-reviewer both need to read and edit files under
// kc.IT, a separate repo entirely outside cwd (KCIT_ROOT). additionalDirectories
// is what actually grants that - client-onboarder's own job has needed this
// since before phase 7 (chatbot/clients/*.json, deploy.ps1 all live under
// kc.IT) but nothing ever set it explicitly. Applies to every agent through
// both entry points below, not just the two new ones.
const ADDITIONAL_DIRECTORIES = [KC_IT_ROOT];

// Phase 7: a build -> review -> revise orchestration spends EA's own turn
// budget on every delegation plus every result it reads back. One named
// constant so it's tunable in one place instead of two magic 20s. If a run
// ever throws "Agent run failed: error_max_turns" (see runQuery below),
// that's the concrete signal to raise this further - not a guess in advance.
const MAX_TURNS = 60;

// Multi-turn memory within one dashboard conversation - NOT the same thing
// as the deliberate "every standup/retro is a fresh vault read" design.
// Kevin caught this the hard way: the very first version of chatWithAgent
// started a brand-new SDK session on every single /api/chat call, so a
// reply to "yes" the browser had just shown seconds earlier meant nothing
// to the next call - there was no session for "yes" to be an answer *in*.
// Fixed via the SDK's own `resume` option (Options.resume, stable - not
// the "V2 API - UNSTABLE" session functions), which reloads a prior
// session's conversation history before the new prompt runs. This does
// NOT change how fresh the vault reads are - `resume` restores what was
// *said*, each turn still calls Read/Glob/Grep against the live filesystem
// exactly as before.
//
// One in-memory Map, keyed by agent name, fine for a single-user local
// tool (same reasoning as permissions.mjs's `pending` Map). Known
// simplifications, acceptable for now: a server restart clears it (a new
// conversation starts, same as today); the browser's own chat-log is not
// persisted, so a page refresh shows an empty transcript while the server
// still remembers the conversation underneath it - mildly confusing but
// not unsafe. No explicit "new conversation" control yet; add one if a
// stale multi-day conversation ever becomes a real problem in practice.
const sessionIds = new Map();

// CLAUDE.md's rules - no cold outreach, never invent proof, never quote an
// unset price, never expose the API key, voice.md is binding - are described
// in that file as the things that are NOT up for interpretation. They reached
// every Claude Code CLI session and none of these runs: `systemPrompt` here is
// only ever the agent's own .md body, and the SDK defaults `settingSources` to
// [] (sdk.mjs), so no project context loads at all. Every dashboard and
// scheduler run since phase 3 has been operating without them.
//
// Prepending the file explicitly rather than passing settingSources:["project"]
// is deliberate. That option would also import .claude/settings.json if one is
// ever added, including any permission rules in it, which could silently widen
// what canUseTool auto-approves. A hidden allowlist undermining an assumed
// guarantee is the exact failure this project already hit once. This way the
// prompt is exactly what you can read here, with no second source.
// BOTH repos, not just this one. ADDITIONAL_DIRECTORIES above puts kc.IT in
// reach of every agent through both entry points, and kc.IT/CLAUDE.md carries
// binding rules that appear nowhere in this repo's: the Function URL must stay
// on AWS_IAM (setting it to NONE silently exposes the Lambda), deploy.ps1
// ships everything in files/ including a mid-edit session's unfinished work,
// bump the ?v= when script.js or style.css changes, and the sample-plumbing
// demo tenant must keep admitting it's a demo and routing real emergencies to
// a real plumber. Loading only this repo's file would have left those in
// exactly the state this whole fix exists to end: documented as binding,
// silently never delivered.
//
// Labelled by repo rather than concatenated. The two sets disagree on scope,
// and an agent that can't tell which is which could apply a kc.IT deploy rule
// to the vault.
//
// Read on every call, deliberately not cached: these are described as the
// rules that are not up for interpretation, so an edit to either file has to
// take effect on the next run, not after someone remembers to restart the
// server. Two small files per run is nothing next to the API call it precedes.
const RULE_SOURCES = [
  { scope: "the kcit repo (this vault, the agent fleet, the dashboard)", path: join(KCIT_ROOT, "CLAUDE.md") },
  { scope: "the kc.IT repo (the live kcitsolutions.co site and the chatbot product)", path: join(KC_IT_ROOT, "CLAUDE.md") },
];

function projectRules() {
  const blocks = [];
  for (const { scope, path } of RULE_SOURCES) {
    try {
      const body = readFileSync(path, "utf8").trim();
      if (body) {
        blocks.push(
          `===== BINDING RULES governing ${scope} =====\n\n${body}\n\n===== end of rules for ${scope} =====`
        );
      }
    } catch (err) {
      // Loud, not silent: losing these is the bug this code exists to fix.
      console.error(`Could not load ${path} - agents are running WITHOUT the binding rules for ${scope}: ${err.message}`);
    }
  }
  if (blocks.length === 0) return "";
  return (
    "The following are the project's binding rules, loaded from each repo's CLAUDE.md. " +
    "Two rule sets follow and they govern different codebases: apply each to the repo it names, " +
    "and do not carry a rule from one across to the other.\n\n" +
    blocks.join("\n\n")
  );
}

function withProjectRules(systemPrompt) {
  const rules = projectRules();
  if (!rules) return systemPrompt;
  return `${rules}\n\n---\n\n${systemPrompt}`;
}

// Builds the SDK's `agents` option: every agent except the one running,
// so executive-assistant can delegate to prospect-scout/follow-up/
// client-onboarder without a forked copy of their definitions - this
// reads the same .claude/agents/*.md files agents.mjs already parses.
function buildSubagents(excludeName) {
  const subagents = {};
  for (const [name, agent] of loadAgents()) {
    if (name === excludeName) continue;
    subagents[name] = {
      description: agent.description,
      tools: agent.tools,
      // A delegated subagent gets the rules too - it does the same real work
      // with the same real tools, so exempting it would leave the exact hole
      // this fixes, reachable one delegation away.
      prompt: withProjectRules(agent.systemPrompt),
      model: agent.model,
    };
  }
  return subagents;
}

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The dashboard's chat needs its own API key - " +
        "see vault/50-Workspace/AI Operating System.md."
    );
  }
}

// Phase 5: log every dashboard-triggered run, same usage fields index.mjs
// already logs for the customer chatbot (input/output/cache tokens), plus
// the SDK's own total_cost_usd so there's no separate pricing table to
// keep in sync for the agent fleet. A logging failure never breaks the
// chat reply itself - the run already happened, losing the log entry is
// better than losing the answer.
function logRun(agentName, phase, usage, costUsd) {
  try {
    const db = openDb();
    insertAgentRun(db, {
      agentName,
      phase,
      timestampMs: Date.now(),
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      costUsd: costUsd ?? 0,
    });
    db.close();
  } catch (err) {
    console.error("Failed to log agent_runs row (chat reply still succeeded):", err.message);
  }
}

// Phase 8: scans every message the SDK streams, not just the final
// `result`, so runs.mjs can show what's actually happening while an agent
// works - previously everything but the final answer was thrown away here.
// `assistant` messages carry `tool_use` blocks (a tool starting); `user`
// messages carry the matching `tool_result` blocks (that tool finishing) -
// both verified directly in coreTypes.d.ts, not assumed. `Task` tool_use
// blocks carry `input.subagent_type`, which is what lets a delegated
// developer/code-reviewer call show up attributed to the right agent.
function recordStreamActivity(runId, message) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        recordToolStart(runId, {
          toolUseId: block.id,
          name: block.name,
          input: block.input,
          parentToolUseId: message.parent_tool_use_id,
        });
      }
    }
  } else if (message.type === "user") {
    const content = message.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") recordToolEnd(runId, block.tool_use_id);
      }
    }
  }
}

async function runQuery(agentName, phase, prompt, options, runId) {
  let result = null;

  try {
    for await (const message of query({ prompt, options })) {
      recordStreamActivity(runId, message);
      // The 'result' message is the authoritative final answer - it also
      // carries usage and total_cost_usd (SDK computes this itself, no need
      // to duplicate pricing.mjs's math for agent-fleet costs) and
      // session_id, which every message carries but this is the one place
      // that needs to read it back out.
      if (message.type === "result") result = message;
    }
  } finally {
    // Fires on success, on an agent error, and on an exception thrown
    // before the stream ever yields anything - no run is ever left showing
    // as "running" forever.
    endRun(runId);
  }

  if (!result) throw new Error("Agent SDK returned no result message");
  if (result.subtype !== "success") {
    throw new Error(`Agent run failed: ${result.subtype}`);
  }

  logRun(agentName, phase, result.usage, result.total_cost_usd);

  return {
    text: result.result.trim(),
    usage: result.usage,
    costUsd: result.total_cost_usd,
    sessionId: result.session_id,
  };
}

// Runs a query that continues agentName's prior conversation when one
// exists, saving whatever session_id comes back for next time. Falls back
// to a fresh conversation (no `resume`) if resuming the old one throws -
// e.g. its session file was pruned or the server restarted mid-session on
// a different machine state - rather than breaking the chat outright.
//
// runId is minted here, before buildOptions runs, because canUseTool
// (built inside buildOptions) needs it to mark a tool "awaiting
// confirmation" - runQuery can't mint its own, since options (canUseTool
// included) has to exist before runQuery is ever called. A failed-then-
// retried attempt gets its own fresh runId, so it shows as two short-lived
// runs, never one left dangling.
async function runQueryWithMemory(agentName, phase, prompt, buildOptions) {
  const priorSessionId = sessionIds.get(agentName);
  const runId = startRun(agentName, phase, prompt.slice(0, 80));
  try {
    const options = buildOptions(priorSessionId, runId);
    const result = await runQuery(agentName, phase, prompt, options, runId);
    sessionIds.set(agentName, result.sessionId);
    return result;
  } catch (err) {
    if (!priorSessionId) throw err;
    console.error(`Resuming ${agentName}'s session failed, starting fresh:`, err.message);
    sessionIds.delete(agentName);
    const retryRunId = startRun(agentName, phase, prompt.slice(0, 80));
    const options = buildOptions(undefined, retryRunId);
    const result = await runQuery(agentName, phase, prompt, options, retryRunId);
    sessionIds.set(agentName, result.sessionId);
    return result;
  }
}

/**
 * Phase 6: chat with executive-assistant, the hub. Its own real tools,
 * Bash included as of phase 6.2, plus the other three agents available as
 * real subagents it can invoke directly.
 *
 * Phase 9.1: pass `{ unattended: true }` for a scheduler-fired call (the
 * daily standup, the weekly retro) - nobody is watching the dashboard for
 * those, so they must never inherit a human's auto-approve toggle from
 * hours earlier in an unrelated context. A browser-initiated call omits
 * this and behaves exactly as before.
 * @param {string} agentName
 * @param {string} prompt
 * @param {{unattended?: boolean}} [options]
 * @returns {Promise<{text: string, usage: object, costUsd: number}>}
 */
export async function chatWithAgent(agentName, prompt, { unattended = false } = {}) {
  requireApiKey();

  const agent = getAgent(agentName);
  if (!agent) throw new Error(`Unknown agent "${agentName}"`);

  // This function is EA's dedicated path because it's the only agent that
  // gets the `agents` delegation map - a caller reaching for that for one
  // of the other three should use runAgentFull instead.
  if (agentName !== "executive-assistant") {
    throw new Error(`chatWithAgent only serves executive-assistant, not "${agentName}" - use runAgentFull.`);
  }

  // EA now writes to the vault (Daily Digest.md, EA Retro.md) and can
  // delegate to agents that write elsewhere, so a stale local checkout
  // matters here exactly as it does for runAgentFull.
  const repoCheck = checkReposCurrent();
  if (!repoCheck.current) {
    throw new Error(
      "Refusing to start: " + repoCheck.reasons.join(" ") + " Pull the latest before running EA."
    );
  }

  return runQueryWithMemory(agentName, "6", prompt, (resume, runId) => ({
    cwd: KCIT_ROOT,
    additionalDirectories: ADDITIONAL_DIRECTORIES,
    model: agent.model,
    systemPrompt: withProjectRules(agent.systemPrompt),
    // `tools` makes Bash available to EA (as of phase 6.2); `allowedTools`
    // deliberately leaves Bash OUT so it always falls through to
    // canUseTool below - the exact same pre-approval split runAgentFull
    // uses for the other three agents. Without this filter, adding Bash
    // to EA's frontmatter tools would have made it a pre-approved tool
    // for EA specifically, silently skipping the confirm-step - the one
    // thing being "the hub" must never do. `Task` (phase 7) lands in
    // allowedTools too since this filter only strips Bash - delegating
    // itself needs no confirm-step, only what a delegated agent's own
    // Bash calls do.
    tools: agent.tools,
    allowedTools: agent.tools.filter((t) => t !== "Bash"),
    agents: buildSubagents("executive-assistant"),
    canUseTool: makeCanUseTool(runId, { ignoreAutoApprove: unattended }),
    maxTurns: MAX_TURNS,
    ...(resume ? { resume } : {}),
  }));
}

/**
 * Phase 4: chat with any agent, using its real tools. A Bash call goes
 * through permissions.mjs's confirm-step unless auto-approve is on; refuses
 * to start at all if either repo's local checkout is behind origin.
 *
 * Phase 9.1: pass `{ unattended: true }` for a scheduler-fired call (e.g.
 * prospect-scout's Mon/Wed/Fri run) so it never inherits a human's
 * auto-approve toggle from an unrelated context - same reasoning as
 * chatWithAgent.
 * @param {string} agentName
 * @param {string} prompt
 * @param {{unattended?: boolean}} [options]
 * @returns {Promise<{text: string, usage: object, costUsd: number}>}
 */
export async function runAgentFull(agentName, prompt, { unattended = false } = {}) {
  requireApiKey();

  const agent = getAgent(agentName);
  if (!agent) throw new Error(`Unknown agent "${agentName}"`);

  const repoCheck = checkReposCurrent();
  if (!repoCheck.current) {
    throw new Error(
      "Refusing to start: " +
        repoCheck.reasons.join(" ") +
        " Pull the latest before running an agent that writes here."
    );
  }

  return runQueryWithMemory(agentName, "4", prompt, (resume, runId) => ({
    cwd: KCIT_ROOT,
    additionalDirectories: ADDITIONAL_DIRECTORIES,
    model: agent.model,
    systemPrompt: withProjectRules(agent.systemPrompt),
    // `tools` is what makes a tool available to the model at all (mirrors
    // the agent's real .md `tools:` field exactly). `allowedTools` is a
    // SEPARATE pre-approval layer on top - verified by reading the SDK's
    // own source (sdk.mjs), which passes these as the real Claude Code
    // CLI's --tools and --allowedTools flags. Bash is deliberately in
    // `tools` (available) but left OUT of `allowedTools` (not
    // pre-approved), so it's the one tool that always falls through to
    // canUseTool below - confirmed by reading the CLI integration, not
    // assumed from the type comments, since this is the one line that
    // actually enforces the confirm-step.
    tools: agent.tools,
    allowedTools: agent.tools.filter((t) => t !== "Bash"),
    canUseTool: makeCanUseTool(runId, { ignoreAutoApprove: unattended }),
    maxTurns: MAX_TURNS,
    ...(resume ? { resume } : {}),
  }));
}
