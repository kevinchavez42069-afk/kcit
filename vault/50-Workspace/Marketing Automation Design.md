---
title: Marketing Automation Design
status: design-only
source: Notion
notion_id: 3ce5da8c-0d78-8109-8c48-ed2a147ba81c
written: 2026-09-01
migrated: 2026-09-06
tags: [design, automation]
---

# Marketing Automation Design

Two separate systems, designed but deliberately **not built**. Most of this
belongs after the first three clients exist.

## System A: Automating Kevin's own marketing

### 1. Follow-up reminder system, build now

**This is the actual leak.** Visits happen in person; follow-up is where deals
quietly die. It protects revenue already paid for in hours spent visiting.

> **The key design choice:** it fires *a task for Kevin to personally send*,
> not an auto-send. This keeps the personal touch the local market runs on, and
> sidesteps compliance entirely since it only follows up with people already
> met face to face.

Now handled by the `follow-up` agent plus prospect notes in `60-Prospects/`.

### 2. CRM structure

A spreadsheet is fine to ~20-30 active conversations and painful past that.
Now handled by prospect and client notes with frontmatter, queryable in
Obsidian.

### 3. SEO content pages, opportunistic

Two or three one-time pages. A fixed project, not an ongoing content operation.

### 4. Turning finished work into social content, defer

Not worth building machinery for one to three posts.

### 5. Reactivating "not now" prospects, structure only

The cheapest lead available, but there are zero prospects to reactivate yet.
One `status` field in the prospect template covers it.

## System B: Marketing automation as a product

The more valuable half, because it is revenue rather than cost.

### 1. Review request automation, build first

Automatic text or email after a job is marked done, asking for a Google review
with a direct link. Cheapest to build, near-zero running cost, clear value
story. **Should be the first sellable System B product.**

### 2. Missed-call text-back, after clients 1-3

Directly extends the core pitch. But it is a real build: a VoIP/texting number
(Twilio, ~$1/month plus ~$0.008 per segment) wired to missed-call detection.

> **Do not sell this until a live reference client is using it.**

### 3. Monthly performance reports, after 3+ monthly clients

Frame as retention infrastructure for the $149 plan, not a separate revenue
line.

### 4. Appointment reminder texts, piggyback later

Same Twilio plumbing. Bolt on afterwards.

## Explicitly cut

| Cut | Why |
|---|---|
| Google Business Profile posting | Needs API approval or manual scheduling, and fresh content every time. Breaks the one-person constraint |
| Social media management as a service | A distraction dressed as leverage |
| Anything cold-contact | No cold email, no cold SMS, no scraped lists, no auto-dialing. Ever |

## Sequencing

| When | Build |
|---|---|
| Before client 1 | Follow-up system + CRM structure (done, via agents and vault) |
| Opportunistic | SEO content pages |
| After clients 1-3 | Review request automation |
| After a live reference client | Missed-call text-back |
| After 3+ monthly clients | Monthly performance reports |
| Never | GBP posting, social media management, cold contact |
