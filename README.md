# kcit

Operations repo for KC IT Solutions: the business knowledge vault and the
Claude Code agent fleet that reads it.

## Setup

```
git clone https://github.com/kevinchavez42069-afk/kcit.git
```

Then in Obsidian: **Open folder as vault**, and select the `vault/` folder
inside this repo. Not "Create new vault", and not the repo root.

Pointing at `vault/` keeps `.claude/` and `CLAUDE.md` out of the graph view
and search results.

## Layout

| Path | What it is |
|---|---|
| `vault/` | Obsidian vault. Business knowledge, prospects, clients |
| `vault/_style/voice.md` | Writing rules. Binding on every agent that drafts text |
| `vault/_templates/` | Note templates |
| `.claude/agents/` | The agent fleet |
| `dashboard/` | Local ops dashboard. Chat with the fleet, costs, activity feed |
| `dashboard/mockups/` | Design mockups, kept as the record of what was decided |
| `CLAUDE.md` | Always-on guidance for Claude Code in this repo |

## Where the documentation lives

Sixteen documents is enough to need a map. Read them in this order.

| Read | For | Authority |
|---|---|---|
| `README.md` | What this repo is and how to run it | Current |
| `CLAUDE.md` | The rules agents must follow here | **Binding** |
| `HANDOFF.md` | Picking the work up cold. State, what is next, traps | Current |
| `vault/Start Here.md` | What the business has live right now | Current |
| `vault/50-Workspace/Board.md` | What shipped, what is moving, what is next | Current |
| `vault/50-Workspace/AI Operating System.md` | Why the dashboard is built the way it is, phase by phase | Build record |
| `vault/50-Workspace/Infrastructure Audit - 2026-09-07.md` | Every known weakness, and which are still open | Findings |
| `vault/50-Workspace/Technical Reference.md` | The site and chatbot stack | Reference |
| `vault/50-Workspace/Security Architecture.md` | The access model | Reference |
| everything else in `50-Workspace/` | Thinking in progress, allowed to be wrong | **Not authoritative** |

Two rules about that last row, both from `CLAUDE.md`. The vault is reference
material, not law, and where Kevin says something different, Kevin is right.
And when something in `50-Workspace/` stops being an idea and becomes a
decision, move it out into a numbered folder.

`kc.IT`, the website and chatbot, is a **separate repo** with its own
`CLAUDE.md` and `HANDOFF.md`. Those are authoritative for anything about the
live site, and agents load both repos' `CLAUDE.md` at run time.

## The agents

| Agent | Use it for |
|---|---|
| `executive-assistant` | Status updates, the daily standup, weekly retro, checking infrastructure state, delegating to the other five |
| `prospect-scout` | Building the visit list, researching a business before walking in |
| `follow-up` | Post-visit messages, lead triage, quotes |
| `client-onboarder` | Adding a client or demo tenant to the chat assistant, deploying |
| `developer` | A code change, a bug fix, a small feature in either `kcit` or `kc.IT` |
| `code-reviewer` | An independent check on `developer`'s branch before it goes to Kevin |

`developer` only ever works on a `dev/<slug>` branch and never merges,
pushes, or opens a pull request itself; `code-reviewer` has no `Write` or
`Edit` on purpose, so it can't quietly fix what it's supposed to be
checking. `executive-assistant` orchestrates a build-review-report cycle
between them but never merges anything on their behalf either. That
decision is always Kevin's.

Two ways to reach them: a Claude Code session opened in this repo (they load
automatically, by trigger phrase or by name), or the dashboard, which serves
the same `.claude/agents/*.md` definitions rather than a forked copy.

## The dashboard

Local Node service on Kevin's machine, reachable from a phone over Tailscale,
never a public URL. Five screens:

| Screen | What it answers |
|---|---|
| **Home** | What needs me right now. Approvals waiting, the board, today's spend, recent activity, a compact EA chat, the fleet. Every block collapses and keeps a summary in its header when shut |
| **Console** | Talking to one agent. Picking another swaps the whole window rather than splitting it. The fleet rail beside it lists all six agents always, dimmed when idle and lit when running, and it resizes and collapses |
| **Costs** | What it costs, over a window you choose. Today / 7 days / 30 days / all time, agent fleet and client chatbots separately |
| **Digest** | The morning standup, newest first |
| **Activity** | The full log, one row per event |

Light and dark, following the system and overridable. Each agent has its own
icon and accent colour, carried everywhere it appears.

Every figure comes from a real endpoint. Anything without a data source gets
an empty state rather than a placeholder number, and no cost is ever shown
without naming the window it covers, because a total with no date attached
has already been misread once.

The board on Home reads `vault/50-Workspace/Board.md`. Move a line between
its three headings, add `@you` to anything only Kevin can finish, and the
Home screen follows. `executive-assistant` may edit it.

A command that changes something waits for an explicit confirm in the UI
first, by default, no matter which agent asked - with one caveat worth
knowing, not assuming: Claude Code's own CLI has a built-in allowlist for a
few bare well-known read-only commands that bypasses this before it's ever
consulted (see `permissions.mjs` for the specifics found by testing it
live). An explicit, visibly loud auto-approve toggle also exists for
skipping the confirm-step on purpose, off by default, never persisted, and
automatically ignored by any scheduled/unattended run so a toggle left on
during the day can't silently affect the 7am standup.

Design doc and full build history: `vault/50-Workspace/AI Operating System.md`.

## Private

This repo carries pricing strategy, client agreements, and security
architecture. Keep it private.
