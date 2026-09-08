# Handoff

For whoever picks this up cold. Read this, then `CLAUDE.md`.

Last brought current 2026-09-08. Originally written 2026-09-06 by a cloud
session, when the fleet was three untested agents and the dashboard did not
exist. If a claim here looks older than the code, trust the code and fix
this file.

## What this repo is

The operations layer for KC IT Solutions: a business knowledge vault
(Obsidian) plus a Claude Code agent fleet that reads it, plus a local
dashboard for running that fleet.

The **website and chatbot code is a separate project**, not in here.

## Where things are on Kevin's machine

| What | Path |
|---|---|
| This repo | `C:\Users\PC USER\Downloads\projects\kcit` |
| The site + chatbot code | `C:\Users\PC USER\Downloads\kc.IT` |
| Obsidian vault | `...\projects\kcit\vault` (opened via "Open folder as vault") |
| **Secrets** | `~/.kcit/.env`, deliberately outside both repo trees |

That last row matters and is not tidiness. Agents run with cwd at the repo
root and have `Read`/`Grep` auto-allowed with no confirm step, so a `.env`
inside the tree was readable by any agent including unattended scheduled
runs. `WebFetch` is auto-allowed too, so exfiltrating it needed no Bash call
and raised no prompt. Being gitignored did nothing about that. There is no
fallback to the old `dashboard/.env` path on purpose; if the file is missing
the server still starts and chat reports itself unconfigured.

## What exists now

- **Six agents** in `.claude/agents/`: `executive-assistant` (the hub, can
  delegate to the other five), `prospect-scout`, `follow-up`,
  `client-onboarder`, `developer`, `code-reviewer`. All have run real work.
- **The dashboard**, `dashboard/`. Local Node service, Tailscale plus Basic
  Auth, never a public URL. Home / Console / Costs / Digest / Activity.
  Phases 1 through 10 of [[AI Operating System]] are live.
- **The vault**, 18 migrated notes plus templates and everything added
  since. Notion left intact as a fallback.
- `vault/_style/voice.md`, **still a seed only**. See below.

## Decisions Kevin has made, which override the migrated notes

The vault came from Notion and is **reference material, not law.** It began
as working notes that contradict each other in places. Use it for context,
never to settle an argument, and never cite it back at Kevin as though it
binds him.

| Topic | The old notes say | Kevin's current position |
|---|---|---|
| Target market | HVAC / plumbing / electrical only | **Any business, any type.** No vertical restriction |
| Bilingual / Spanish | "The clearest competitive advantage", the moat | **One advantage among several.** Not the lead pitch, not a targeting filter |
| Scale vs focus | Stay narrow, solo operator | **Widening deliberately.** Do not re-argue "building instead of selling" |
| Knowledge base | Notion | **Obsidian**, this repo |

**Do not relitigate these.** They were each raised, discussed, and settled.

## The exception: rules that hold regardless

Not reference. These prevent legal exposure, security incidents, or
reputation damage:

- No cold email, cold SMS, scraped lists, or auto-dialing. CAN-SPAM and TCPA
- Never invent proof. **Zero clients, no case studies exist**
- Never quote a price that is not set. The bilingual add-on has **no
  number**. Missed-call text-back and review automation are **not built**
- The Anthropic API key lives only in the Lambda environment and
  `~/.kcit/.env`. Never in `files/`, never in a browser, never in a chat
- `vault/_style/voice.md` is binding on anything a human will read

## What is next, in order

### 1. Things only Kevin can do

These are blocked on his console access, not on anyone's time, and the first
has been open two days.

- **Rotate the Anthropic API key.** A live key sat in a loose `.txt` at the
  `kc.IT` repo root, one `git add -A` from permanent history. The file is
  deliberately still there, because until the key is rotated it is the only
  record of exactly what leaked. Delete it *after* rotation, not before.
- **Set an AWS Budget alarm and an Anthropic spend cap**, and reserved
  concurrency on the chatbot Lambda. `kcit-deploy` gets AccessDenied on all
  three by design; that is the policy working, not a bug.
- **Create an empty private GitHub repo for `kc.IT`.** It still has no
  remote, so everything there lives on one drive.

### 2. Build the real `voice.md`

The oldest open item, and the one Kevin cares most about. Barely started.

The current file only carries anti-LLM rules (no em dashes, no "delve").
That is the floor. **The goal is that drafts sound like Kevin**, which needs
a corpus:

1. Get 15-30 samples of his **client-facing** writing. Texts to prospects,
   emails to customers, Facebook posts, quotes he has sent.
2. **Critical:** how Kevin types in chat is not how he writes to a customer.
   His chat register is fast and informal with typos left in. Training on it
   produces messages that read as careless. The corpus must be things he
   actually sent to customers. If he has few, have him write five by hand as
   if to a real prospect.
3. Rewrite `voice.md` as mostly **verbatim exemplars** labelled by situation
   (first follow-up, price objection, no-reply nudge, scheduling), with the
   extracted rules on top. Examples carry rhythm that rules cannot.
4. Iterate: agent drafts ten messages, Kevin marks each "sounds like me" or
   not. Below ~8 of 10, tighten and repeat. Expect two or three rounds.

### 3. Shrink the chatbot system prompt

**Not** the caching. That was investigated on 2026-09-08 and the claim was
wrong, which is worth reading before anyone re-opens it.

The alarm was that `sample-plumbing` has a 0% cache hit rate and averages
2.3x per request what `kc-it-solutions` costs, so caching was said to be
costing more than it saves. Measured against the real 21 requests instead,
in units of one system prompt (write 1.25x input, read 0.1x):

| Configuration | Cost |
|---|---|
| 5 minute cache, current | **12.45** |
| No caching at all | 21.00, 41% more |
| 1 hour TTL | 13.50, 8% more |

Caching pays off from a conversation length of 1.28 onward and the measured
mean is 2.33. Twelve of 21 requests hit the cache. A 1 hour TTL loses
because its write costs 2x rather than 1.25x, and only 3 of 18 gaps between
requests fell in the 5-to-60 minute band it would have rescued.

The `sample-plumbing` number is real but it is not a bug. Every one of its
requests is an isolated single-message conversation, which pays the 1.25x
write and never reads. That is what demo traffic looks like: a prospect asks
one question and leaves. No cache setting fixes it.

The actual lever is the **system prompt size**, about 1,620 tokens, because
a single-shot visitor pays 1.25x that with nothing to amortise it against.
Shortening it helps every request, cached or not.

Re-measure before changing any of this. The right answer depends on the
traffic mix and the mix will change as real clients arrive.

### 4. Smaller, tracked on the board

Per-agent path scoping, `code-reviewer`'s unrestricted Bash, and the weekly
retro never reading cost data despite the roadmap saying it does. See
[[Board]] and [[Infrastructure Audit - 2026-09-07]].

## Gotchas found the hard way

- **Vault filenames contain spaces.** Agent definitions originally used
  hyphenated paths and silently failed to read anything. Quote paths in
  shell loops.
- **Do not run `sed` over these files for multi-byte characters.** It works
  byte-wise and corrupted every em dash and arrow in the repo. Use
  `perl -CSD` or Python.
- **Claude Code's CLI has its own Bash allowlist that runs before
  `canUseTool`.** A bare `git status --porcelain` never reaches the confirm
  step, while `git -C "<path>" status --porcelain` does. Found by testing it
  live, after a test using the bare form produced a false negative. Never
  use a bare well-known read-only command to probe the permission gate.
- **Two `CLAUDE.md` files are in scope, not one.** Agents work in `kc.IT`
  too and the runtime loads both, labelled per repo. Its deploy rules exist
  nowhere in this repo's copy.
- **Check the remote, not the local ref.** `git log origin/main` reads a
  cached ref that a silently failed fetch leaves looking correct and stale.
  Use `git ls-remote origin refs/heads/main` when it matters. A push
  reported as done had not landed, and the local ref agreed with the claim.
- **Two vault files show as modified permanently.** `Go-to-Market
  Strategy.md` and `Discovery Questions.md` are CRLF noise only. Confirm
  with `git diff --ignore-all-space` and leave them unstaged.
- Verify after bulk edits: wikilinks resolve, agent paths resolve, no em
  dashes, valid UTF-8.

## Later waves, not built

`site-builder`, `content-writer` (bilingual), `aws-ops`, `doc-keeper`. Add
only once the current six are demonstrably getting used.
