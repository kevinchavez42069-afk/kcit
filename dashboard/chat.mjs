// =====================================================================
//  Phase 3: live chat with one agent, via the Claude Agent SDK.
//
//  Deliberately narrower than the real agent for this phase: EA's own
//  file (.claude/agents/executive-assistant.md) lists Write/Edit tools
//  too, since it writes Daily Digest.md on Claude Code. This phase is
//  billed as read-only in the design doc, so the SDK call below
//  restricts allowedTools to Read/Glob/Grep regardless of what the
//  agent's own frontmatter allows - a deliberate, stricter cap for the
//  first live-chat integration, not a bug. Phase 4 lifts this for the
//  other three agents, with a confirm-step in front of anything
//  destructive (see the canUseTool callback path, unused here since
//  everything allowed in phase 3 is already safe to auto-approve).
//
//  Needs ANTHROPIC_API_KEY in the environment - the Agent SDK cannot
//  reuse Claude Code's own session credentials, it makes its own API
//  calls and Anthropic's terms require a real API key for that (not
//  reusing claude.ai/Claude Code auth). Not set up yet as of this
//  writing; every function here is written against the SDK's real
//  shipped type definitions (checked directly, not guessed) but is
//  UNTESTED until a key is available.
// =====================================================================

import { query } from "@anthropic-ai/claude-agent-sdk";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAgent } from "./agents.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const KCIT_ROOT = join(here, "..");

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

/**
 * Run one turn of chat with an agent and return the assistant's text.
 * @param {string} agentName
 * @param {string} prompt
 * @returns {Promise<{text: string, usage: object|null}>}
 */
export async function chatWithAgent(agentName, prompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The dashboard's chat needs its own API key - " +
        "see vault/50-Workspace/AI Operating System.md, phase 3."
    );
  }

  const agent = getAgent(agentName);
  if (!agent) throw new Error(`Unknown agent "${agentName}"`);

  // Phase 3 only serves executive-assistant, and only read-only. This
  // guard stays even if more agents are added to the allowlist below by
  // mistake, so phase 4's real tool access can't be reached accidentally.
  if (agentName !== "executive-assistant") {
    throw new Error(`Phase 3 only serves executive-assistant, not "${agentName}"`);
  }

  let result = null;

  for await (const message of query({
    prompt,
    options: {
      cwd: KCIT_ROOT,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      allowedTools: READ_ONLY_TOOLS,
      permissionMode: "default",
      maxTurns: 8,
    },
  })) {
    // The 'result' message is the authoritative final answer - it also
    // carries usage and total_cost_usd (SDK computes this itself, no need
    // to duplicate pricing.mjs's math for agent-fleet costs later).
    if (message.type === "result") result = message;
  }

  if (!result) throw new Error("Agent SDK returned no result message");
  if (result.subtype !== "success") {
    throw new Error(`Agent run failed: ${result.subtype}`);
  }

  return {
    text: result.result.trim(),
    usage: result.usage,
    costUsd: result.total_cost_usd,
  };
}
