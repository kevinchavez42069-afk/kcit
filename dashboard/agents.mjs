// =====================================================================
//  Loads agent definitions straight from .claude/agents/*.md - the exact
//  same files Claude Code itself reads. No forked copy: improving an
//  agent's prompt in one place improves it everywhere, dashboard chat
//  included.
//
//  Frontmatter format (matches every file in this repo today):
//    ---
//    name: agent-name
//    description: ...
//    tools: Read, Write, Edit, Glob, Grep
//    model: sonnet
//    ---
//    (system prompt body)
// =====================================================================

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(here, "..", ".claude", "agents");

function parseAgentFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filePath}: no frontmatter block found`);

  const [, frontmatter, body] = match;
  const fields = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const fieldMatch = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (fieldMatch) fields[fieldMatch[1]] = fieldMatch[2].trim();
  }

  if (!fields.name) throw new Error(`${filePath}: missing "name" in frontmatter`);

  return {
    name: fields.name,
    description: fields.description ?? "",
    tools: fields.tools ? fields.tools.split(",").map((t) => t.trim()) : [],
    model: fields.model ?? "sonnet",
    systemPrompt: body.trim(),
  };
}

/** @returns {Map<string, object>} agent name -> parsed definition */
export function loadAgents() {
  const agents = new Map();
  for (const file of readdirSync(AGENTS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const agent = parseAgentFile(join(AGENTS_DIR, file));
    agents.set(agent.name, agent);
  }
  return agents;
}

export function getAgent(name) {
  return loadAgents().get(name) ?? null;
}
