// =====================================================================
//  Phase 8: live "what's actually running right now" state, across every
//  agent - the dashboard's own chat, a delegated subagent, and anything
//  the scheduler fires unattended (the standup, the retro, prospect-scout's
//  Mon/Wed/Fri run). None of that was visible before this file existed:
//  chat.mjs's runQuery only ever looked at the final `result` message from
//  the SDK's stream and threw everything else away.
//
//  Same shape as permissions.mjs's `pending` Map - one in-memory store,
//  plain functions, fine for a single-user local tool. Keyed by runId, not
//  by agent name, because concurrent runs are real: scheduler.mjs already
//  calls chatWithAgent/runAgentFull directly, so a 7am scheduled standup
//  can genuinely overlap a browser-initiated chat.
// =====================================================================

import { randomUUID } from "crypto";

const runs = new Map();

// Never store a tool's raw `input` - Write/Edit carry full file bodies,
// unsuitable for a one-line status. Derive the short, human-legible summary
// once, here, at the moment a tool starts.
function summarize(name, input) {
  if (name === "Bash") return input?.command ?? "";
  if (name === "Task") return `${input?.subagent_type ?? "agent"}: ${input?.description ?? ""}`;
  if (name === "Read" || name === "Write" || name === "Edit") return input?.file_path ?? "";
  if (name === "Glob" || name === "Grep") return input?.pattern ?? "";
  return "";
}

export function startRun(agent, phase, promptSnippet) {
  const runId = randomUUID();
  runs.set(runId, {
    runId,
    agent,
    phase,
    promptSnippet,
    startedAt: Date.now(),
    activeTools: new Map(),
    completedCount: 0,
  });
  return runId;
}

export function recordToolStart(runId, { toolUseId, name, input, parentToolUseId }) {
  const run = runs.get(runId);
  if (!run) return;
  run.activeTools.set(toolUseId, {
    name,
    summary: summarize(name, input),
    startedAt: Date.now(),
    parentToolUseId: parentToolUseId ?? null,
    status: "running",
  });
}

export function recordToolEnd(runId, toolUseId) {
  const run = runs.get(runId);
  if (!run) return;
  if (run.activeTools.delete(toolUseId)) run.completedCount += 1;
}

export function markAwaitingConfirmation(runId, toolUseId) {
  const run = runs.get(runId);
  const tool = run?.activeTools.get(toolUseId);
  if (tool) tool.status = "awaiting confirmation";
}

export function endRun(runId) {
  runs.delete(runId);
}

// Delegated calls attribute to the right agent by walking one level: a
// tool's parentToolUseId points back to the Task call that started the
// subagent, and that Task's own summary already carries the subagent_type
// (see summarize() above) - the fleet is flat hub-and-spoke (confirmed in
// Phase 7: a subagent can't itself delegate further), so one level is all
// there is.
export function listRuns() {
  return [...runs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((run) => ({
      runId: run.runId,
      agent: run.agent,
      phase: run.phase,
      promptSnippet: run.promptSnippet,
      startedAt: run.startedAt,
      completedCount: run.completedCount,
      activeTools: [...run.activeTools.entries()].map(([toolUseId, tool]) => ({
        toolUseId,
        ...tool,
      })),
    }));
}
