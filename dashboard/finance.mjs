// =====================================================================
//  Finance data layer - pulls every cost source into one shape.
//
//  Two sides kept distinct:
//  - Fleet overhead: agent_runs (Kevin's own operational cost)
//  - Cost of goods: chatbot_usage (sold at $149/month, so COGS matters)
//
//  Reuses existing db.mjs summaries; no new SQL here. The third cost
//  source (recurring fixed costs: domain, Tailscale, Pushover, cal.com)
//  lives in a vault file, not the database, and is parsed here.
// =====================================================================

import { openDb, summaryByAgent, summaryByClient } from "./db.mjs";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = join(here, "..", "vault");
const RECURRING_PATH = join(VAULT, "20-Money-and-Terms", "Recurring Costs.md");

/**
 * Parses Recurring Costs.md into line items. Format:
 *   - Service name: $amount/mo | optional note
 *
 * Blank amounts are allowed (and expected until Kevin fills them), so
 * unparseable values just stay null rather than blowing up the whole layer.
 */
function parseRecurringCosts() {
  if (!existsSync(RECURRING_PATH)) return [];

  const markdown = readFileSync(RECURRING_PATH, "utf8");
  const items = [];

  for (const line of markdown.split("\n")) {
    const match = line.match(/^-\s+(.+?):\s*\$?([\d.]*)\s*\/mo(?:\s*\|\s*(.+))?$/);
    if (!match) continue;

    const [, service, amount, note] = match;
    items.push({
      service: service.trim(),
      monthlyUsd: amount ? parseFloat(amount) : null,
      note: note?.trim() || "",
    });
  }

  return items;
}

/**
 * Returns the unified finance shape. Takes a sinceMs parameter to match
 * the existing /api/costs and /api/agent-costs convention. Recurring costs
 * are not windowed - they're fixed monthly - but the token/request-level
 * data is.
 *
 * Returns:
 * {
 *   sinceMs: number,
 *   fleetOverhead: { agents: [{agent_name, runs, cost_usd, ...}], totalUsd: number },
 *   costOfGoods: { clients: [{client_id, requests, cost_usd, ...}], totalUsd: number },
 *   recurring: { items: [{service, monthlyUsd, note}], totalMonthlyUsd: number },
 *   exists: { agentRuns: bool, chatbotUsage: bool, recurringFile: bool }
 * }
 */
export function getFinanceData(sinceMs = 0) {
  const db = openDb();

  const agents = summaryByAgent(db, sinceMs);
  const clients = summaryByClient(db, sinceMs);

  db.close();

  const recurringItems = parseRecurringCosts();
  const recurringTotal = recurringItems.reduce((sum, item) => sum + (item.monthlyUsd || 0), 0);

  return {
    sinceMs,
    fleetOverhead: {
      agents,
      totalUsd: agents.reduce((sum, a) => sum + (a.cost_usd || 0), 0),
    },
    costOfGoods: {
      clients,
      totalUsd: clients.reduce((sum, c) => sum + (c.cost_usd || 0), 0),
    },
    recurring: {
      items: recurringItems,
      totalMonthlyUsd: recurringTotal,
    },
    exists: {
      agentRuns: agents.length > 0,
      chatbotUsage: clients.length > 0,
      recurringFile: existsSync(RECURRING_PATH),
    },
  };
}
