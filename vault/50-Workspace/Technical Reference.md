---
title: Technical Reference
status: reference
source: Notion
notion_id: 3ce5da8c-0d78-8189-b962-cc72ffb1ca99
migrated: 2026-09-06
tags: [technical]
---

# Technical Reference

How the website and AI chat assistant are built. Source of truth is `CLAUDE.md`
and `HANDOFF.md` in the site repo; this is the plain-English version.

## Hosting

Static files in an S3 bucket (`kcitsolutions.co`), served through CloudFront
(`ENS0UT1SINC8O`), region `us-east-1`.

Deploy with `.\deploy.ps1`. Two things that bite: it uploads everything in
`files/`, so half-finished work goes live too; and the CloudFront invalidation
is not optional, skipping it leaves the old page cached and makes a deploy look
like it did nothing.

## The AI chat assistant

Visitor -> widget -> CloudFront -> Lambda -> Claude API. Endpoint is `/api/chat` on
the same origin, so there is no CORS at all. The Lambda's own URL is IAM-only
and not publicly invokable.

**The API key lives only in the Lambda's environment.** It never reaches a
browser. That is the entire reason the Lambda exists. It is Kevin's key, shared
across all clients, which is what makes a monthly plan sellable.

### Multi-tenant

One Lambda serves every client. Each business is one JSON file in
`chatbot/clients/`, with the system prompt built from a shared template, so
improving the prompt improves every client's bot at once.

Adding a client: write the JSON, deploy, add one script tag with
`data-client="<id>"`.

Every request is checked against that client's allowed domains. A clientId is
readable from any page's source, so CORS alone would not stop someone pointing
their own site at the endpoint and spending Kevin's API budget.

### Spend guardrails

16 messages per conversation, 1,000 characters per message, 800 output tokens
per reply, 12 requests per minute per IP per client. Every failure path ends
with the phone number.

## Lead capture

Contact form and chatbot leads both reach `KC.ITSolutions@outlook.com` via
Web3Forms.

**Known weak point:** Web3Forms sits behind Cloudflare, which blocks AWS
datacenter IPs, so the Lambda cannot send leads itself. It hands the browser a
payload and the visitor's connection delivers it. If they close the tab at the
wrong moment, that lead is lost. **Move this to AWS SES before selling to a
paying client.**

## Access

IAM user `kcit-deploy`, scoped narrow: Lambda only for `kcit-*` functions, IAM
roles only `kcit-lambda-*` with only basic logging attachable, CloudFront
limited to the one distribution. No EC2, no billing, nothing that can spend
money. An AccessDenied from this user is the policy working, not a bug.

## Outstanding

- Move lead delivery to SES
- Client onboarding automation, now handled by the `client-onboarder` agent
- Root MFA: done 2026-09-01
