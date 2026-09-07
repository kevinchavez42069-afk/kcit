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
`client-onboarder`. Done and verified live, 2026-09-07.** The capability
Kevin actually asked for. Confirm-step and concurrent-editor check shipped
alongside it, not after, per the plan.

Mechanism: `dashboard/permissions.mjs`'s `canUseTool` auto-allows
Read/Glob/Grep/WebSearch/WebFetch/Write/Edit (all git-tracked, all
reversible) and always defers Bash to a pending-confirmation record,
polled by the frontend at `GET /api/pending` and resolved at
`POST /api/confirm`. The split that makes this actually hold: `tools`
(what's available to the model, mirrors each agent's real `.md` file) is
a separate SDK option from `allowedTools` (what's pre-approved without a
prompt) — Bash sits in the first list, deliberately excluded from the
second. Confirmed by reading the Agent SDK's own source
(`node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`), which spawns the
real Claude Code CLI and passes these as its actual `--tools` and
`--allowedTools` flags — not assumed from type comments. `checkReposCurrent`
fetches both repos and refuses to start a write-capable agent if either is
behind `origin/main`, guarding the exact divergent-history failure mode
that happened once already between two Claude sessions on 2026-09-06.

**First live test, run by Kevin himself, not self-tested:** started the
server, asked `client-onboarder` to check git status on `kcit`. The confirm
banner appeared with the real command before anything executed. Confirmed
working. (Worth noting honestly: even starting this server was flagged by
the coding session's own permission classifier once Bash-execution
capability was real — correctly, since a service that can trigger shell
commands is not something to self-test unsupervised. Kevin ran it himself
for exactly that reason.)

**Phase 5 — agent-fleet usage tracking. Done and verified live,
2026-09-07.** New `agent_runs` table in `dashboard/db.mjs`, alongside
`chatbot_usage` (that one's customer traffic; this one's Kevin's own
fleet). Every `chatWithAgent`/`runAgentFull` call logs its `result.usage`
and `result.total_cost_usd` straight from the SDK — no separate pricing
math to keep in sync, exactly as planned back in phase 1. `GET
/api/agent-costs` and a dashboard panel next to the existing chatbot-cost
one, refreshed after every reply.

First real row, from Kevin's own test message: `executive-assistant`, 1
run, $0.1441 (8 input tokens, 203 output, 16114 cache read, 16350 cache
write). Getting here caught a real process gap worth keeping in mind for
next time: Kevin's first restart attempt used a server process that had
started *before* this code was even committed — confirmed with hard
timestamps (process start 11:07:03, commit 11:14:10), not a guessed
explanation — so "I restarted it" isn't itself proof a new process is
running new code; check the numbers when it matters.

**All five phases of the original roadmap are now built and verified.**

**Phase 6 — the EA hub.** Came from Kevin's own personal daily-notes
journal (`Downloads/projects/Daily Log/`, not part of this repo) — a
requirements brain-dump for a much bigger role for `executive-assistant`:
real delegation to the other three agents, push notifications, a scheduled
daily standup, and a genuine improvement loop. This directly reversed
EA's old hard rule ("never write for other agents, never delegate").

Three decisions confirmed directly with Kevin before building: delegation
is real but guardrail-tuning stays a drafted suggestion, never
auto-applied; notifications go through Pushover specifically for its
emergency-priority repeat-until-acknowledged tier (ntfy.sh has no
equivalent); the standup is scheduled, not just on-demand.

**Architecture, in one paragraph:** `chatWithAgent` now gives EA its real
tools, Bash included as of phase 6.2, plus the SDK's native
`agents` option, built from `loadAgents()`, so it can genuinely invoke
`prospect-scout`/`follow-up`/`client-onboarder` as subagents — verified in
the SDK's own source, not assumed from docs. A delegated agent keeps its
own real tool list and hits the same `canUseTool` policy `permissions.mjs`
already enforces, since permission checking is session-wide. New
`dashboard/notify.mjs` (Pushover) and `dashboard/scheduler.mjs` (daily
standup + weekly retro, plain `setTimeout`, no cron dependency) round it
out. The improvement loop is a weekly retro, not autonomous self-editing:
EA reviews its own past standups and `agent_runs` cost data, then drafts
concrete proposed prompt changes into new `vault/50-Workspace/EA Retro.md`
for Kevin to apply himself.

**A limitation surfaced and accepted, not a bug**: every `chatWithAgent`
call is a fresh, stateless invocation — no memory of any previous one.
This is why the vault has to be the memory instead of the model: each run
re-reads whatever files it needs via `Read`/`Glob`/`Grep`, which is
correct, since the vault changes between invocations and stale cached
impressions would be worse. The Agent SDK's Sessions feature would avoid
the re-reads; deliberately not used here, since trusting old context is
the opposite of what a state-reporting agent should do.

**Status as of this writing**: Pushover is set up and verified live —
Kevin created the account and application, `PUSHOVER_TOKEN`/`PUSHOVER_USER`
are in `dashboard/.env`, and a real test notification was sent and
confirmed received on his phone. Scheduler date math verified against edge
cases directly. Not yet verified: an actual delegated run producing a real
confirm-step — needs a live test through the running dashboard, same bar
every prior phase was held to.

**Phase 6.1 — visual redesign ("Mission Control"). Done, 2026-09-07.**
Kevin provided six reference images for a retro-terminal / mission-control
look and asked for three distinct mockup directions to choose from before
committing to one — built and published as a single tabbed Artifact
(`dashboard/mockups.html`) rather than applied directly. Kevin picked the
"Mission Control" direction and asked for it applied as the real dashboard
styling, with larger fonts and better layout proportions than the
intentionally-dense mockup demo. `dashboard/public/index.html` and
`style.css` rewritten: dark warm-amber palette, Space Mono throughout, a
two-column layout, numbered bracket-style panel headers (`[01] Chat`
through `[05] Recent activity`), 17px base font size (up from the
mockup's compact sizing). Verified against a scratch mock-data server
(not just static screenshots): chat send/receive bubbles, and — this
caught a real bug — the confirm-step banner. `.confirm-banner`'s own
`display: flex` had the same CSS specificity as the browser's built-in
`[hidden] { display: none }` rule and won on source order, so the banner
rendered as a visible empty bordered box at all times instead of staying
hidden when there was nothing to confirm. Fixed with an explicit
`.confirm-banner[hidden] { display: none; }` rule; re-verified the banner
now stays hidden by default and renders correctly (title, code block,
Approve/Deny) when a confirmation is pending, and clears cleanly on
Approve/Deny.

**Phase 6.2 — EA gets Bash directly. Done, 2026-09-07.** Kevin tried
asking EA to check git status through the live dashboard; it correctly
declined to delegate (none of `prospect-scout`/`follow-up`/
`client-onboarder`'s specialized jobs cover a generic infra command) but
had no way to just do it, since its frontmatter tools were
Read/Write/Edit/Glob/Grep only. Kevin's call: that's wrong for a hub —
EA should be able to check infrastructure state itself, not only by
delegating.

Added `Bash` to `.claude/agents/executive-assistant.md`'s `tools:` field
and rewrote the prompt's opening to state its role and reporting line
explicitly (executive assistant for KC IT Solutions, reports to Kevin
Chavez, the sole owner) plus a new hard rule distinguishing the two cases:
infrastructure visibility (git status, what's running, logs) is EA's own
job now, directly; specialized business work (prospect research, drafting
a follow-up, an onboarding sequence) still delegates to whichever agent's
job it actually is — not because EA lacks the tool, but because that
agent's own prompt carries the domain-specific judgment for it.

The safety-critical part was in `dashboard/chat.mjs`, not the prompt file:
`chatWithAgent` previously set `allowedTools: agent.tools` unfiltered for
EA (there was no Bash in that list to worry about before). Adding Bash to
EA's frontmatter tools without also fixing this would have made Bash a
*pre-approved* tool for EA specifically — skipping the confirm-step
entirely for the one agent used the most, exactly backwards from the
point of the confirm-step. Caught before shipping, not after: fixed by
filtering Bash out of EA's `allowedTools` the same way `runAgentFull`
already does for the other three agents, so it always falls through to
`canUseTool`.

Not yet verified live: asking EA to check git status through the running
dashboard and confirming the banner actually appears — same bar every
prior phase was held to, next thing to test once the server picks up this
change.

## Open items for whoever picks up each phase

- Frontend framework unspecified on purpose — whatever's fastest when a
  phase actually starts.
- ~~Tailscale vs. Cloudflare Tunnel is a phase 2 decision.~~ Decided: Tailscale, live.
- ~~What the "confirm step" looks like in the UI is a phase 4 design question.~~ Decided: phase 6.1's Mission Control redesign.
