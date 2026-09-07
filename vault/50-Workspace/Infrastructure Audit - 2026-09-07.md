---
title: Infrastructure Audit - 2026-09-07
status: reference
tags: [technical, business, audit]
---

# Infrastructure Audit, 2026-09-07

Kevin asked for a complete, unsparing sweep of everything built so far, in the
voice of a decorated CIO, covering the ops dashboard, the six-agent fleet, the
live kc.IT product, and the business strategy behind all of it. Four
independent deep-read audits, one per domain, synthesized into one report.

**Full report:** https://claude.ai/code/artifact/69d24a2d-4837-4d37-8404-32a1e137b394

## The one-sentence version

At 2:59pm the day this was built, `prospect-scout` handed over three real,
researched local prospects with opening lines already written. Every commit
from 3:15pm to 4:45pm was dashboard work instead. All three are still
`status: not-visited`. That's the throughline of the whole audit, on both the
business side and the technical side.

## What needs action first

- **Already handled, verify it stuck:** a live Anthropic API key was found
  sitting in plaintext, ungitignored, in the kc.IT repo. Rotate it if that
  hasn't been confirmed done.
- **Critical, technical:** a real CSRF hole on `/api/run` and
  `/api/auto-approve` (any webpage you visit can flip auto-approve on and
  trigger Bash execution), a blocking un-timeouted `git fetch` that can
  freeze the whole dashboard, `CLAUDE.md`'s non-negotiable rules silently
  never loading for any dashboard/scheduler run, and a secret-exfiltration
  chain that needs zero Bash calls (`prospect-scout`'s auto-allowed
  `Read`/`WebFetch` alone is enough).
- **Critical, kc.IT:** the chatbot's `Origin`-header check is not a real
  authenticator (a bare `curl` bypasses it, and the working exploit is
  already written down in `HANDOFF.md`), and there is no spend ceiling
  anywhere, not in code, not an AWS Budget, not an Anthropic console cap.
- **The business finding that outranks all of it:** the infrastructure was
  the wrong thing to build first. Full pricing, go-to-market, and
  prioritization critique is in the report.

## What's genuinely solid

Credit given where it held up: the IAM scoping on `kcit-deploy`, the
subagent-can't-re-delegate SDK-level guarantee, the client-side chatbot
widget's clean code, and the general habit of testing safety claims live
instead of trusting the design doc, when that habit was actually applied.
The audit's own biggest theme is that it wasn't applied consistently, and
the report names exactly where.

See the full report for the complete findings, severity ratings, and the
prioritized plan (today / this week / before onboarding a client / freeze
list).
