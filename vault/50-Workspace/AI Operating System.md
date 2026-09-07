---
title: AI Operating System
status: reference
tags: [technical, roadmap]
---

# AI Operating System

Design doc and phased roadmap for a dashboard where Kevin can chat directly
with the agent fleet, see usage and cost, and see findings, with
[[executive-assistant]] as the agent overseeing the other three. Written
2026-09-06, roadmap only, no code shipped yet.

## Why

Today the fleet (`prospect-scout`, `follow-up`, `client-onboarder`,
`executive-assistant`) only exists inside Claude Code CLI sessions on Kevin's
machine. No way to check in from a phone, no visibility into what any of this
costs, and "status" means asking a CLI session to read [[Activity Log]].

Decided directly with Kevin, not up for re-litigating:

- **Chat has full agentic power.** Dashboard chat can actually invoke the real
  agents with their real tools — write vault files, commit, deploy, touch AWS.
  Not a read-only Q&A layer.
- **Cost tracking covers both** the customer chatbot's API spend and Kevin's
  own agent-fleet usage, sequenced rather than built at once.

Because full agentic power was chosen, the central problem this doc solves is:
how does a browser reach real filesystem/git/AWS access on Kevin's machine,
without that access leaking or becoming a second, harder-to-scope copy of
credentials — the kind of thing that already caused real trouble once, when
two Claude sessions raced on this same repo on 2026-09-06 (see [[Push Log]]).

## Architecture

### Why this runs on Kevin's machine, not the cloud

The agents' tools operate on two real local git working trees
(`C:\Users\PC USER\Downloads\projects\kcit` and
`C:\Users\PC USER\Downloads\kc.IT`), the local AWS CLI profile
(`kcit-deploy`), and local git credentials. A cloud-hosted copy of all that
means either syncing two live working trees — a third concurrent editor, on
top of the two that already collided once — or duplicating AWS/git
credentials into a new environment. Both are worse than the status quo.

**The dashboard backend runs locally, as a persistent service on Kevin's
machine, reachable remotely through a private tunnel, not a public URL.**

- **Tailscale** (default): a private mesh network Kevin reaches from his
  phone or laptop. Zero public attack surface, free for personal use.
- **Cloudflare Tunnel + Access** is the fallback if he ever wants a normal
  public URL without opening a port. New vendor relationship (DNS is at
  Namecheap, hosting is AWS), so only worth it if Tailscale's
  device-enrollment model is too limiting.

Either way, no new copy of the `kcit-deploy` credentials or the git repos gets
created. The dashboard is another way to drive the same local environment
Kevin already drives by hand.

### Components

1. **Backend service** (Node, matching the chatbot's existing style —
   `@anthropic-ai/sdk` / Claude Agent SDK), always-on, on Kevin's machine.
   Loads each agent's system prompt and tools straight from
   `.claude/agents/*.md` — same source of truth Claude Code already reads, no
   forked copy to drift out of sync. Exposes a chat API per agent plus a
   status/usage API.
2. **Frontend**, served by the same backend: a chat panel per agent
   (`executive-assistant` as the default/home view), a live feed of
   [[Activity Log]] and `Daily Digest.md` rendered instead of read via CLI,
   and the usage/cost widgets below.
3. **Usage/cost store**: local SQLite next to the backend. Keeps this off AWS
   for phase 1 — Kevin's machine already holds the vault, the source of
   truth, so a local DB fits the same trust boundary. Two tables to start:
   `chatbot_usage` (per client, from CloudWatch) and `agent_runs` (per
   dashboard-triggered agent invocation, logged directly by the backend).
4. **Audit log**: every dashboard-triggered agent action (file write, commit,
   deploy, AWS call) gets one row — agent, action, target, timestamp,
   outcome. The safety net for giving browser chat real power: whatever it
   does is reconstructable after the fact, same spirit as [[Activity Log]]
   but for the actions themselves, not just their summaries.

### The two cost sources

- **Customer chatbot spend, first.** `chatbot/index.mjs` already logs input
  and output tokens, plus cache read/write, per request per `clientId` to
  CloudWatch — the data exists, just never aggregated. Phase 1 pulls it with
  a scheduled CloudWatch Logs query, prices it against current rates, stores
  it per client per day. Needs one small IAM addition: read-only
  `logs:FilterLogEvents` on the `kcit-chatbot` log group, on a narrowly
  scoped credential — tiny and read-only, consistent with how `kcit-deploy`
  is already scoped. See [[Technical Reference]].
- **Kevin's own agent-fleet usage, second — and easier than it sounds.** Once
  agent runs go through the new Agent SDK backend instead of raw Claude Code
  CLI, that backend sees every request's `usage` object directly, the exact
  pattern `index.mjs` already uses. No Anthropic Console/Admin API
  dependency; it falls out of building the phase 4 backend, not a separate
  integration.

### Where findings live

No new source of truth. [[Activity Log]] and the notes under `60-Prospects/`
and `70-Clients/` stay authoritative, exactly as `executive-assistant`
already reads them. The dashboard is a window onto the vault, not a
replacement for it — a Claude Code CLI session working the vault directly
doesn't need to change anything. The dashboard and the CLI are two doors into
the same room.

### Safety guardrails, non-negotiable regardless of phase

Full agentic access from a browser is a real escalation in blast radius —
it's the same key that deploys production.

- **A confirm step for hard-to-reverse actions** (git push, deploy, AWS
  changes), even in the full-power model — the same propose-then-ask-then-act
  pattern this repo's sessions already use by hand. A "review and confirm"
  UI step in front of those specific tool calls, not a blanket restriction.
- **Concurrent-editor awareness.** Two Claude Code sessions on this repo
  already produced a real divergent-history incident on 2026-09-06 (see
  [[Push Log]]). A third concurrent actor makes that more likely, not less.
  Phase 4 needs some form of "is anyone else active here right now" surfaced
  before a dashboard-triggered agent starts writing.

## Phased roadmap

**Phase 0 — this doc.** Done, no code.

**Phase 1 — chatbot cost pipeline. Done, 2026-09-06.** `dashboard/cost-report.mjs`
pulls `/aws/lambda/kcit-chatbot`'s CloudWatch logs, prices each request against
`dashboard/pricing.mjs`, and stores per-request rows in local SQLite
(`dashboard/costs.db`, gitignored). No new IAM credential needed —
`kcit-deploy` already had `logs:FilterLogEvents` on `kcit-*` log groups
(`aws-chatbot-policy.json`'s `ReadLogsForDebugging` statement), confirmed
working directly rather than assumed. Run `node cost-report.mjs` from
`dashboard/`; resumes incrementally after the first run. First real numbers:
`kc-it-solutions` $0.12, `sample-plumbing` $0.05, plus some older usage under
`riverbend-plumbing` — the demo tenant's name before it was renamed (see git
history, `chatbot/clients/`), not a mystery client.

Not yet done: running this on a schedule (currently a manual/on-demand
script) and surfacing it anywhere but the terminal — that's what phase 2's
dashboard is for.

**Phase 2 — read-only dashboard MVP. Done, including the tunnel,
2026-09-06.** `dashboard/server.mjs` (plain `node:http`, no new
dependencies) serves three read-only endpoints — `/api/costs` (phase 1's
SQLite), `/api/activity` (parses [[Activity Log]]), `/api/digest`
(`Daily Digest.md`, graceful when EA hasn't produced one yet) — plus a
small static frontend in `dashboard/public/`. Gated with HTTP Basic Auth
(`DASHBOARD_USER`/`DASHBOARD_PASS` env vars, or a random one generated and
printed each run if unset — never a shipped default credential). Verified
end to end: auth rejects with no/wrong credentials and accepts the right
ones, all three endpoints tested against real data, static files serve
correctly.

Kevin installed and logged into Tailscale the same session. `server.mjs`
now binds to `0.0.0.0` (Tailscale plus Basic Auth are the real access
boundary, not the bind address) and detects the Tailscale IP at startup —
`HOST=127.0.0.1` in the environment goes back to localhost-only if needed.
**Confirmed live**: reachable and authenticating correctly at
`http://100.87.11.96:7417` from outside localhost, not just in theory.

**Phase 3 — chat with `executive-assistant` only, read-only. Done and
verified live, 2026-09-06.** Kevin supplied an API key, stored in
`dashboard/.env` (gitignored, loaded via `process.loadEnvFile`, never
committed). First real message — "what happened recently, give me a
status" — came back correctly grounded in the actual vault (real Activity
Log entries, real open items), cost $0.19, and caught a genuinely stale
line in this very file (the chatbot redeploy note, fixed above). New
files:
`dashboard/agents.mjs` (parses `.claude/agents/*.md` directly — same source
of truth Claude Code reads, nothing forked), `dashboard/chat.mjs` (calls the
Agent SDK with EA's real system prompt), and `POST /api/chat` plus a chat
panel in the frontend. Deliberately stricter than EA's own file: EA's
frontmatter lists Write/Edit (it uses those for `Daily Digest.md` on Claude
Code), but this phase locks `allowedTools` to `Read`/`Glob`/`Grep` only,
regardless — "read-only" is a promise this phase keeps by construction, not
by trusting EA's own restraint. Verified everything that doesn't need a
live API call: server starts clean, existing endpoints unaffected, chat
returns a clear error instead of crashing when the key is missing, empty
messages get rejected, and the new per-IP auth lockout (added the same
session, 8 failures / 5 min) actually trips at the 9th bad login.

Everything was written against the SDK's real shipped type definitions
(`node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/sdk/*.d.ts`,
checked directly rather than guessed from docs) — that paid off, the
`result` message's exact shape (`.result` for the text, `.usage` and
`.total_cost_usd` alongside it) came straight from reading the types, not
from the fetched doc summary, which described a different, wrong shape.

**Phase 4 — full agentic chat for `prospect-scout`, `follow-up`,
`client-onboarder`.** The capability Kevin actually asked for. Ship the
confirm-step and concurrent-editor check alongside this, not after. The
Agent SDK's `canUseTool` callback (confirmed present in the shipped types)
is the real mechanism for the confirm-step: it can pause before a specific
tool call and wait on a decision, which is exactly "review and confirm
before this one executes" rather than a blanket restriction. Needs a way
to get that decision from the browser mid-request (Server-Sent Events or
polling) — not yet designed further than that.

**Phase 5 — agent-fleet usage tracking.** Falls out of phase 4's backend
logging its own `usage` objects. Add the `agent_runs` rollup once phase 4 is
live.

## Open items for whoever picks up each phase

- Frontend framework unspecified on purpose — whatever's fastest when a
  phase actually starts.
- ~~Tailscale vs. Cloudflare Tunnel is a phase 2 decision.~~ Decided: Tailscale, live.
- What the "confirm step" looks like in the UI is a phase 4 design question.
