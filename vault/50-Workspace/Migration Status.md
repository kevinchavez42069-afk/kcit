---
title: Migration Status
status: reference
migrated: 2026-09-06
tags: [meta]
---

# Migration Status

Notion -> Obsidian. **Complete: 18 of 19 pages.** Notion is left fully intact
as a fallback. Nothing has been deleted there.

## How to read these notes

**Reference material, not law.** They started as working notes: thinking out
loud, half-decided, written at different times, contradicting each other in
places. Useful background on how the business got here. Not a rulebook, and
they do not outrank Kevin.

## Migrated

| Note | Folder |
|---|---|
| [[Start Here]] | root |
| [[The Plan]] | 10-Strategy |
| [[Go-to-Market Strategy]] | 10-Strategy |
| [[Serving Hispanic-Owned Businesses]] | 10-Strategy |
| [[Pricing and Unit Economics]] | 20-Money-and-Terms |
| [[Business Terms and Decisions]] | 20-Money-and-Terms |
| [[What We Sell]] | 20-Money-and-Terms |
| [[Plan of Action]] | 30-Playbooks |
| [[Reach Plan]] | 30-Playbooks |
| [[Google Business Profile Setup]] | 30-Playbooks |
| [[Client Documents]] | 40-Client-Documents |
| [[Service Sheet]] | 40-Client-Documents |
| [[Discovery Questions]] | 40-Client-Documents |
| [[Proposal Template]] | 40-Client-Documents |
| [[Founding Client Agreement]] | 40-Client-Documents |
| [[Content Questionnaire]] | 40-Client-Documents |
| [[Technical Reference]] | 50-Workspace |
| [[Security Architecture]] | 50-Workspace |
| [[Marketing Automation Design]] | 50-Workspace |
| [[Backlog - Not Now]] | 50-Workspace |

## Not migrated

**Weekly Schedule.** Empty in Notion, nothing to bring across.

Folder index pages from Notion were not copied. Obsidian's folder view and
graph replace them, except [[Client Documents]], which carries the
document-order table and so was kept.

## Changes made during migration

Not a verbatim copy. Deliberate edits:

1. **Live overrides marked inline** rather than silently applied, so you can
   see what changed. Affected: [[Go-to-Market Strategy]] and [[The Plan]]
   (trades-only niche dropped, any business is now valid),
   [[Serving Hispanic-Owned Businesses]] (demoted from "the moat" to one
   advantage among several), [[Service Sheet]] ("trades" widened to
   "businesses").

2. **Em dashes removed throughout**, per [[voice]]. Commas in prose, colons in
   headings. The follow-up script template lost its em dash too. It would be
   absurd for the vault to ban them and then use them.

3. **Continuous renumbering** in [[Discovery Questions]] and
   [[Content Questionnaire]]. Notion restarted the count in each section, which
   broke the callouts referencing "question 8" and "question 14".

4. **Sections dropped** where an agent or template now covers them, such as the
   CRM design in [[Marketing Automation Design]], replaced by prospect and
   client notes with frontmatter.

5. **Backlog items marked done**: the `/onboard-client` skill and reusable
   subagent definitions both exist now, as `.claude/agents/`.

## Not verified against the live site

These notes describe the site as of their last Notion edit, 2026-09-01 to
09-03. Nothing has been checked against `kcitsolutions.co` itself, because this
session's network policy blocks the domain. Once the site repo is available,
reconcile pricing, page count, and service descriptions before quoting anything
to a real prospect.
