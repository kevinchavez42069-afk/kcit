# KC IT Solutions, operations repo

Small business technology for Central Virginia. Websites, AI automation, and
dashboards. Run by Kevin Chavez, Richmond VA.

## What is in here

- `vault/` , the business knowledge base, an Obsidian vault. Open it with
  **Open folder as vault**, pointed at `vault/`, not the repo root.
- `.claude/agents/` , the agent fleet. Each agent reads the vault directly.

## How to treat the vault

**The vault is reference material, not law.**

Most of it was migrated from Notion, where it started life as working notes:
thinking out loud, half-decided, written at different times, sometimes
contradicting itself. It is genuinely useful background and it is the best
record of how the business got here. It is not a rulebook, and it does not
outrank Kevin.

So:

- **Use it to understand context**, not to settle arguments.
- **Where notes disagree**, say so and move on. Do not treat it as a crisis or
  demand a ruling before continuing.
- **Where Kevin says something different**, Kevin is right. Do not cite a note
  back at him as though it binds him.
- **Where a note is stale**, flag it and keep going.

Known live overrides of what the notes say: target market is **any business**,
not the trades-only niche; bilingual capability is **one advantage among
several**, not the lead pitch or a targeting filter.

## The exception: things that are not up for interpretation

A small set of rules are not "reference." They exist to prevent legal exposure,
security incidents, or damage to Kevin's reputation, and they hold regardless
of what any note says:

- **No cold email, cold SMS, scraped lists, or auto-dialing.** CAN-SPAM and
  TCPA, plus reputation in a word-of-mouth market.
- **Never invent proof.** Zero clients and no case studies exist yet. Do not
  imply otherwise, ever.
- **Never quote a price that has not been set.** The bilingual add-on has no
  number. Missed-call text-back and review automation are not built.
- **Never expose the API key.** It lives only in the Lambda environment. Never
  in `files/`, never in a browser, never pasted into a chat.
- **`vault/_style/voice.md` is binding** for anything a human will read.
  No em dashes, no LLM register.

Everything else is a starting point, not a constraint.

## Vault structure

Numbered folders hold the more settled material. `50-Workspace/` is the messy
thinking, and is allowed to be unfinished or wrong. Move something out of
`50-Workspace/` when it stops being an idea and becomes a decision.

## Migration status

18 of 19 Notion pages migrated. Notion is left intact as a fallback. See
`vault/50-Workspace/Migration Status.md`.
