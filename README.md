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
| `executive-assistant` | Status updates, the daily standup, weekly retro, delegating to the other three |
| `prospect-scout` | Building the visit list, researching a business before walking in |
| `follow-up` | Post-visit messages, lead triage, quotes |
| `client-onboarder` | Adding a client or demo tenant to the chat assistant, deploying |

Two ways to reach them: a Claude Code session opened in this repo (they load
automatically, by trigger phrase or by name), or the dashboard, which serves
the same `.claude/agents/*.md` definitions rather than a forked copy.

## The dashboard

Local Node service on Kevin's machine, reachable from a phone over Tailscale,
never a public URL. Chat with any agent, watch fleet and chatbot costs, read
the activity feed and latest digest. Any `Bash` an agent tries to run waits
for an explicit confirm in the UI first, no matter which agent asked.

Design doc and full build history: `vault/50-Workspace/AI Operating System.md`.

## Private

This repo carries pricing strategy, client agreements, and security
architecture. Keep it private.
