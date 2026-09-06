---
title: Migration Status
status: in-progress
migrated: 2026-09-06
tags: [meta]
---

# Migration Status

Notion -> Obsidian. **Notion is left fully intact as a read-only fallback**
until this vault is confirmed complete. Nothing has been deleted there.

## Migrated (11)

| Note | Folder |
|---|---|
| [[Start Here]] | root |
| [[The Plan]] | 10-Strategy |
| [[Go-to-Market Strategy]] | 10-Strategy |
| [[Serving Hispanic-Owned Businesses]] | 10-Strategy |
| [[Pricing and Unit Economics]] | 20-Money-and-Terms |
| [[Business Terms and Decisions]] | 20-Money-and-Terms |
| [[Plan of Action]] | 30-Playbooks |
| [[Reach Plan]] | 30-Playbooks |
| [[Technical Reference]] | 50-Workspace |
| [[Security Architecture]] | 50-Workspace |
| [[Marketing Automation Design]] | 50-Workspace |

## Still to pull (8)

- Google Business Profile Setup -> 30-Playbooks
- What We Sell -> 20-Money-and-Terms
- Backlog - Not Now -> 50-Workspace
- Weekly Schedule -> 50-Workspace
- Client Documents: Service Sheet, Founding Client Agreement, Content
  Questionnaire, and one more -> 40-Client-Documents

Folder index pages from Notion are **not** being copied. Obsidian's folder
view and graph replace them.

## Changes made during migration

Not a verbatim copy. Deliberate edits:

1. **Live overrides marked inline.** Where a Notion page conflicts with a
   current decision, the note carries a callout saying so rather than being
   silently rewritten. Affected: [[Go-to-Market Strategy]] (trades-only niche
   dropped, any business is now a valid target), [[Serving Hispanic-Owned
   Businesses]] (demoted from "the moat" to one advantage among several),
   [[The Plan]] (niche reasoning marked as history).

2. **The follow-up script lost its em dash.** The original read "it's Kevin [dash] stopped by...". Now a period, per [[voice]]. The vault should not
   ship an example that breaks its own style rule.

3. **Structural sections dropped** where an agent or template now covers them,
   e.g. the CRM design in [[Marketing Automation Design]], which is replaced by
   prospect and client notes with frontmatter.

## Known unresolved

> [!warning] Who writes the website copy?
> [[Start Here]] says the client supplies it. [[Business Terms and Decisions]]
> says Kevin writes it from their questionnaire answers. These are materially
> different commitments, and the turnaround promise depends on which is true.
> Agents currently follow the Business Terms version. **Needs a ruling.**

## Verified against the live site (2026-09-06)

Reconciled against `C:\Users\PC USER\Downloads\kc.IT` (site + chatbot source)
and the live `kcitsolutions.co`. Findings:

- **Page count was wrong.** [[Start Here]] said 17 pages (9 English, 8
  Spanish). `sitemap.xml` lists 14 indexed pages, 7 English + 7 Spanish, plus
  2 non-indexed thank-you pages (`thanks.html` / `gracias.html`). Fixed.
- **Live chatbot bug, not a vault error.** `chatbot/clients/kc-it-solutions.json`
  had `"audience": "people who run trades, shops, and restaurants, not IT
  departments"` — that string is injected verbatim into the production system
  prompt, so the assistant could tell a real visitor it only serves trades,
  contradicting the any-business decision below. Fixed in the JSON
  (2026-09-06); **needs a chatbot redeploy to take effect** —
  `chatbot\deploy-chatbot.ps1` has not been run for this change yet.
- **Pricing, bilingual behavior, and the demo tenant's honesty rules all check
  out** against the live code — no drift.
- **The $149/month plan is decided but not live anywhere** — not on the
  pricing page, not in the chatbot's config. The "unpriced cliff" after
  included hosting expires ([[Pricing and Unit Economics]]) is still
  genuinely unresolved on the live site, not just in the docs.
