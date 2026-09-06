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
| `CLAUDE.md` | Always-on guidance for Claude Code in this repo |

## The agents

| Agent | Use it for |
|---|---|
| `prospect-scout` | Building the visit list, researching a business before walking in |
| `follow-up` | Post-visit messages, lead triage, quotes |
| `client-onboarder` | Adding a client or demo tenant to the chat assistant, deploying |

Run `/agents` in Claude Code to confirm they load.

## Private

This repo carries pricing strategy, client agreements, and security
architecture. Keep it private.
