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
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAgent, loadAgents } from "./agents.mjs";
import { makeCanUseTool, checkReposCurrent } from "./permissions.mjs";
import { openDb, insertAgentRun } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");

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
      prompt: agent.systemPrompt,
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

async function runQuery(agentName, phase, prompt, options) {
  let result = null;

  for await (const message of query({ prompt, options })) {
    // The 'result' message is the authoritative final answer - it also
    // carries usage and total_cost_usd (SDK computes this itself, no need
    // to duplicate pricing.mjs's math for agent-fleet costs) and
    // session_id, which every message carries but this is the one place
    // that needs to read it back out.
    if (message.type === "result") result = message;
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
async function runQueryWithMemory(agentName, phase, prompt, buildOptions) {
  const priorSessionId = sessionIds.get(agentName);
  try {
    const options = buildOptions(priorSessionId);
    const result = await runQuery(agentName, phase, prompt, options);
    sessionIds.set(agentName, result.sessionId);
    return result;
  } catch (err) {
    if (!priorSessionId) throw err;
    console.error(`Resuming ${agentName}'s session failed, starting fresh:`, err.message);
    sessionIds.delete(agentName);
    const options = buildOptions(undefined);
    const result = await runQuery(agentName, phase, prompt, options);
    sessionIds.set(agentName, result.sessionId);
    return result;
  }
}

/**
 * Phase 6: chat with executive-assistant, the hub. Its own real tools,
 * Bash included as of phase 6.2, plus the other three agents available as
 * real subagents it can invoke directly.
 * @param {string} agentName
 * @param {string} prompt
 * @returns {Promise<{text: string, usage: object, costUsd: number}>}
 */
export async function chatWithAgent(agentName, prompt) {
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

  return runQueryWithMemory(agentName, "6", prompt, (resume) => ({
    cwd: KCIT_ROOT,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    // `tools` makes Bash available to EA (as of phase 6.2); `allowedTools`
    // deliberately leaves Bash OUT so it always falls through to
    // canUseTool below - the exact same pre-approval split runAgentFull
    // uses for the other three agents. Without this filter, adding Bash
    // to EA's frontmatter tools would have made it a pre-approved tool
    // for EA specifically, silently skipping the confirm-step - the one
    // thing being "the hub" must never do.
    tools: agent.tools,
    allowedTools: agent.tools.filter((t) => t !== "Bash"),
    agents: buildSubagents("executive-assistant"),
    canUseTool: makeCanUseTool(),
    maxTurns: 20,
    ...(resume ? { resume } : {}),
  }));
}

/**
 * Phase 4: chat with any agent, using its real tools. Bash always waits
 * for confirmation via permissions.mjs; refuses to start at all if
 * either repo's local checkout is behind origin.
 * @param {string} agentName
 * @param {string} prompt
 * @returns {Promise<{text: string, usage: object, costUsd: number}>}
 */
export async function runAgentFull(agentName, prompt) {
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

  return runQueryWithMemory(agentName, "4", prompt, (resume) => ({
    cwd: KCIT_ROOT,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
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
    canUseTool: makeCanUseTool(),
    maxTurns: 20,
    ...(resume ? { resume } : {}),
  }));
}
