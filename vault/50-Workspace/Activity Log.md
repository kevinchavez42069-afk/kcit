---
title: Activity Log
tags: [meta]
---

# Activity Log

Append-only. Every agent (`prospect-scout`, `follow-up`, `client-onboarder`)
adds one line here when it finishes a run that produced something real, a new
prospect note, a drafted message, a client onboarded, a deploy. Not a place
for internal reasoning, just what happened and where to find it.

**Format:** `- **agent-name** — one-line summary, [[links]] to the notes it touched`

`executive-assistant` reads this to build the daily digest. If nothing
happened, there is no entry, and the digest should say so plainly rather than
inventing activity.

## 2026-09-06

- **client-onboarder** — Dry-ran against the demo tenant, fixed onboarding
  sequence gaps (missing vault client record) and a template assumption.
  See commit d6271f1.
- **follow-up** / **prospect-scout** — Dry-run verification pass, both agents'
  claims checked out; fixed a missing field in `prospect.md` and a stale
  assumption in `client.md`. See commit fdd41e1.
