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
| `CLAUDE.md` | Always-on guidance for Claude Code in this repo |

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
never a public URL. `executive-assistant`'s chat is always open; a
collapsible drawer next to it talks to any other agent directly. A live
Fleet view shows what each agent is actually doing right now, one frame per
agent, not just the one Kevin addressed. Also: fleet and chatbot costs, the
activity feed, the latest digest.

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
