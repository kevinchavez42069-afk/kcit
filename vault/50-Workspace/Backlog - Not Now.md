---
title: Backlog - Not Now
status: reference
source: Notion
notion_id: 3ce5da8c-0d78-819b-ab07-dc2e7b5a99a4
migrated: 2026-09-06
tags: [backlog]
---

# Backlog, Not Now

Good ideas deliberately not being worked on yet, each with the condition that
would make it worth starting. The point is so these stop taking up head space.
They are not forgotten, they are scheduled.

## Marketing automation

Two separate versions, not to be confused. Detail in
[[Marketing Automation Design]].

### A. Automating Kevin's own marketing

| Idea | Notes |
|---|---|
| Social posts generated from finished work | Every completed site becomes a post. Feeds the idle Instagram and Facebook accounts |
| Follow-up sequences after a walk-in | The visit happens in person; the follow-up is where most deals die |
| Content answering what owners search | "How much should a small business website cost in Richmond" ranks, and pre-sells the pricing |
| A CRM that tracks conversations | Now handled by prospect notes in `60-Prospects/` |

**Why not now:** with zero clients there is nothing to post about and no funnel
to automate.

> **The hard line, whenever this gets built:** no cold email blasts, no cold
> SMS to business numbers, no scraped lists, no auto-dialing. CAN-SPAM and TCPA
> exposure is real, and in a word-of-mouth market it would damage the
> reputation faster than it generates leads. Automate the follow-up with people
> who have *already* talked to you, not the first contact.

### B. Selling marketing automation to clients

The more valuable version, because it is revenue rather than cost. Every add-on
in [[What We Sell]] is a form of this.

**Trigger to start:** when a paying client asks for it, or when two prospects
raise the same need unprompted. Not before.

## Also parked

| Item | Why not now | Trigger to start |
|---|---|---|
| **Move lead delivery to AWS SES** | Current browser-side delivery works | Before the first paying client's bot goes live |
| ~~`/onboard-client` skill~~ | **Built.** Now the `client-onboarder` agent | Done |
| ~~Reusable subagent definitions~~ | **Built.** Three agents in `.claude/agents/` | Done |
| **LocalBusiness schema, sitemap, service pages** | Local SEO pays off over months | Alongside the case studies |
| **Design refresh** | Site reads as generic "AI-made" template. Not blocking a sale | When there are reference sites Kevin likes |
| **DynamoDB rate limiting** | Current in-memory limiter is per-container and best-effort | Only if abuse actually happens |
| **Second and third demo sites** | One good demo is enough to sell with | If the first demo proves it closes deals |

## A finance agent

Kevin's idea, 2026-09-08: a seventh agent that looks at every cost in one
place and recommends where to cut. Not a dashboard panel, an agent that
reasons about the spend and pushes back.

**What it would actually see.** Most of the data already exists and nothing
reads it together:

| Cost | Where it already lives | Status |
|---|---|---|
| Customer chatbot API spend | `chatbot_usage` in `dashboard/costs.db`, from CloudWatch | Collected |
| Kevin's own agent-fleet spend | `agent_runs` in the same DB, per run, with `total_cost_usd` | Collected |
| AWS infrastructure (S3, CloudFront, Lambda) | `aws_costs` in the same DB, from Cost Explorer via `aws-cost-report.mjs` and the read-only `kcit-finops-reader` user | Collected since 2026-09-11 |
| Domain, Tailscale, Pushover, cal.com | `20-Money-and-Terms/Recurring Costs.md` | Tracked, amounts still blank |

The interesting question isn't the total, it's the ratio: fleet spend is
Kevin's own overhead, chatbot spend is cost of goods on a product sold at
$149/month. A finance agent that can't tell those apart is a spreadsheet.
One that can is the thing that answers whether the monthly plan actually
has margin, which [[Pricing and Unit Economics]] still leaves open.

**Why not now:** with zero clients there is no revenue side to optimize
against, and the honest current answer to "where is the money going" is a
few dollars of API spend. The 2026-09-07 audit's central finding was that
infrastructure got built instead of visiting the three prospects sitting
in `60-Prospects/` unvisited. Another agent is more of exactly that.

**Trigger to start:** the first paying client, or monthly spend crossing
roughly $50, whichever comes first. Before that, the cheap version is the
existing cost panel plus the spend ceilings that don't exist yet (see
below), which are a real gap regardless of whether this agent is ever
built.

**Prerequisite either way, and not optional:** there is currently no spend
ceiling anywhere. Not a Lambda reserved-concurrency cap, not an AWS Budget,
not an Anthropic console limit. A runaway loop or an abused endpoint has
nothing to stop it. All three are console changes only Kevin can make, and
they matter more than the agent does.

## The rule for this page

Anything here is a real idea worth doing eventually. **Nothing here gets
started because it sounds interesting on a quiet evening.** Each item has a
trigger; when the trigger fires, it moves out of the backlog and into the plan.
