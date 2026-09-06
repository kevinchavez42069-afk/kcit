# Handoff

Written 2026-09-06 by a Claude Code cloud session, for whoever picks this up
next. Read this, then `CLAUDE.md`.

## What this repo is

The operations layer for KC IT Solutions: a business knowledge vault (Obsidian)
plus a Claude Code agent fleet that reads it. Built in one session, migrated out
of Notion.

The **website and chatbot code is a separate project**, not in here.

## Where things are on Kevin's machine

| What | Path |
|---|---|
| This repo | `C:\Users\PC USER\Downloads\projects\kcit` |
| The site + chatbot code | `C:\Users\PC USER\Downloads\kc.IT` |
| Obsidian vault | `...\projects\kcit\vault` (opened via "Open folder as vault") |

## Two things a local session can do that the cloud one could not

1. **Read `C:\Users\PC USER\Downloads\kc.IT` directly.** The cloud container had
   no access to Kevin's filesystem. **Do this early** and reconcile it against
   the vault, see "Unverified" below.
2. **Reach `kcitsolutions.co`.** The cloud session's network policy blocked the
   domain outright, so nothing in the vault has been checked against the live
   site.

## Decisions Kevin has made, which override the migrated notes

The vault came from Notion and is **reference material, not law.** It began as
working notes that contradict each other in places. Use it for context, never
to settle an argument, and never cite it back at Kevin as though it binds him.

Explicit overrides, already marked inline in the affected notes:

| Topic | The old notes say | Kevin's current position |
|---|---|---|
| Target market | HVAC / plumbing / electrical only | **Any business, any type.** No vertical restriction |
| Bilingual / Spanish | "The clearest competitive advantage", the moat | **One advantage among several.** Not the lead pitch, not a targeting filter |
| Scale vs focus | Stay narrow, solo operator | **Widening deliberately.** Do not re-argue "building instead of selling" |
| Site design | Reads as generic AI-made template | Use the current site as the reference. Redesign is a **separate later pass** |
| Knowledge base | Notion | **Obsidian**, this repo |

**Do not relitigate these.** They were each raised, discussed, and settled.

## The exception: rules that hold regardless

Not reference. These prevent legal exposure, security incidents, or reputation
damage:

- No cold email, cold SMS, scraped lists, or auto-dialing. CAN-SPAM and TCPA
- Never invent proof. **Zero clients, no case studies exist**
- Never quote a price that is not set. The bilingual add-on has **no number**.
  Missed-call text-back and review automation are **not built**
- The Anthropic API key lives only in the Lambda environment. Never in
  `files/`, never in a browser, never in a chat
- `vault/_style/voice.md` is binding on anything a human will read

## What exists

- `.claude/agents/` , three agents: `prospect-scout`, `follow-up`,
  `client-onboarder`. None have been tested against real work yet
- `vault/` , 18 migrated notes plus templates. Notion left intact as fallback
- `vault/_style/voice.md` , **a seed only**, see below

## What is next, in order

### 1. Reconcile the vault against reality

Read `C:\Users\PC USER\Downloads\kc.IT` and the live site. The vault describes
the site as of 2026-09-01 to 09-03 Notion edits and **has never been verified**.
Check pricing, page count, and service descriptions especially, because
`follow-up` quotes them to real prospects. Fix drift in the vault.

Also read the site repo's own `CLAUDE.md` and `HANDOFF.md`, which the Technical
Reference names as the real source of truth for the build.

### 2. Test `client-onboarder` for the first time

It was written from the Technical Reference and Security Architecture notes but
**has never seen the actual code**. Dry-run against the existing demo tenant
before any real client. Verify the guardrails match reality: `AWS_IAM` auth,
mandatory CloudFront invalidation, `allowedOrigins`, no 4xx in the chat Lambda.

### 3. Build the real `voice.md`

This is the piece Kevin cares most about and it is barely started.

The current file only carries anti-LLM rules (no em dashes, no "delve", etc.).
That is the floor. **The goal is that drafts sound like Kevin**, which needs a
corpus:

1. Get 15-30 samples of his **client-facing** writing. Texts to prospects,
   emails to customers, Facebook posts, quotes he has sent
2. **Critical:** how Kevin types in chat is not how he writes to a customer. His
   chat register is fast and informal with typos left in. Training on it
   produces messages that read as careless. The corpus must be things he
   actually sent to customers. If he has few, have him write five by hand as if
   to a real prospect
3. Rewrite `voice.md` as mostly **verbatim exemplars** labelled by situation
   (first follow-up, price objection, no-reply nudge, scheduling), with the
   extracted rules on top. Examples carry rhythm that rules cannot
4. Iterate: agent drafts ten messages, Kevin marks each "sounds like me" or
   not. Below ~8 of 10, tighten and repeat. Expect two or three rounds

### 4. Push the site repo to GitHub

Not needed for a local session to work, but `kc.IT` currently has **no offsite
backup**. Sweep history for secrets first:

```powershell
git grep -nEi "AKIA[0-9A-Z]{16}|aws_secret|sk-ant-|ANTHROPIC_API_KEY" $(git rev-list --all)
```

Private repo. If a live credential is in history, rotate it before pushing.

## Gotchas found the hard way

- **Vault filenames contain spaces.** Agent definitions originally used
  hyphenated paths and silently failed to read anything. Quote paths in shell
  loops
- **Do not run `sed` over these files for multi-byte characters.** It works
  byte-wise and corrupted every em dash and arrow in the repo. Use `perl -CSD`
  or Python
- Verify after bulk edits: wikilinks resolve, agent paths resolve, no em
  dashes, valid UTF-8

## Open question, low stakes

`Start Here` and `Business Terms and Decisions` disagree on who writes website
copy. Agents follow Business Terms (Kevin writes it from a questionnaire).
Kevin can settle it whenever, it is not blocking.

## Later waves, not built

`site-builder`, `content-writer` (bilingual), `aws-ops`, `doc-keeper`. Add only
once the first three are demonstrably getting used.
