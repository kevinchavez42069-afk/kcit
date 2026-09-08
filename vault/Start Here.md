---
title: Start Here
status: reference
source: Notion
notion_id: 3ce5da8c-0d78-813e-84cd-d9fad24ea209
migrated: 2026-09-06
tags: [moc]
---

# Start Here

Current state of the operation. What exists, what is still open, and who has to
do it.

Read this first, then [[The Plan]] and [[Plan of Action]].

## The one-line version

The product is built and live. **Zero clients.** Everything that remains is
either sales or a form to fill in.

## What is live right now

| | |
|---|---|
| **Website** | 14 indexed pages at kcitsolutions.co, 7 English and 7 Spanish, plus 2 non-indexed thank-you pages. Both `kcitsolutions.co` and `www.` resolve |
| **Spanish site** | Full coverage, reciprocal hreflang, language toggle on every page. See [[Serving Hispanic-Owned Businesses]] |
| **Contact form** | Delivers to KC.ITSolutions@outlook.com. Verified with real submissions |
| **AI assistant** | Live on every page and bilingual. Mirrors the visitor's language, answers pricing, qualifies, captures name and number, emails the lead |
| **Booking** | "Book a call" opens cal.com/kcitsolution |
| **Live public demo** | kcitsolutions.co/demo.html, an assistant for an invented plumbing company. The newest and most useful sales asset |
| **Technical SEO** | robots.txt, sitemap.xml, LocalBusiness structured data, canonical tags, link previews |
| **Facebook** | facebook.com/KCITSolutionsRVA. 2 posts published, 2 scheduled |
| **Instagram** | @kc.itsolutions. 5 followers, effectively dormant |
| **Version control** | git, full history |
| **Agent fleet** | Six Claude Code agents (`prospect-scout`, `follow-up`, `client-onboarder`, `executive-assistant`, `developer`, `code-reviewer`) reading this vault directly. `executive-assistant` is the hub and can delegate to the other five. See `.claude/agents/` |
| **Ops dashboard** | Local, reachable over Tailscale. Home / Console / Costs / Digest / Activity, light and dark. Full agentic chat with every agent, a live view of what each is doing right now, cost tracking by time window, Pushover notifications, and an explicit auto-approve override for the confirm-step (session-only, off by default, never applies to scheduled runs). Phases 1-10 of the roadmap, all live. See [[AI Operating System]] and [[Board]] |

## The chatbot is a product, not just a feature

It is multi-tenant. One backend serves every client; adding a customer is one
config file and a script tag. Two tenants run on it today, yours and the demo.

That means the assistant is something you *sell*, not just something you have.
Almost nobody selling to Central Virginia small businesses can hand a prospect
a working demo. Lead with it.

## Decisions already closed

| Decision | Where it landed |
|---|---|
| AWS root MFA | On |
| Revision rounds | Two included, then hourly |
| Included "small change" | Text and image swaps, hours, prices, services. Not new pages or redesigns |
| Who writes the copy | See the conflict noted in [[Business Terms and Decisions]] |
| Domain ownership | Client owns the domain, Kevin manages hosting |
| Turnaround | Quote longer than needed, deliver early |
| Monthly price | $149/month, ~$99 for founding clients |

## What is still open

| Item | Why it matters | Who |
|---|---|---|
| **Rotate the Anthropic API key** | A live key sat in a loose file at the `kc.IT` repo root. Still live. Nothing else closes this, and the file stays until it is rotated so there is a record of what leaked | Kevin |
| **AWS Budget alarm + Anthropic spend cap** | Nothing anywhere stops a runaway. `kcit-deploy` gets AccessDenied by design, so it needs the console | Kevin |
| **`kc.IT` has no git remote** | The whole site and chatbot live on one drive. Needs an empty private repo created first | Kevin |
| **No clients** | The only number that matters | Kevin |
| **Google Search Console** | All SEO is inert until the sitemap is submitted. ~10 minutes | Kevin |
| **Google Business Profile** | Free, and the biggest factor in local map results. Verification takes days | Kevin |
| **Virginia LLC** | ~$100. No liability separation as a sole proprietor | Kevin |
| **No portfolio** | "Can I see something you've built" currently has no good answer | Buildable |
| **Business cards / QR** | Gates in-person outreach. See [[Reach Plan]] | Kevin |
| **Headshot** | The About page is a stranger asking for $1,200 | Kevin |
| **Facebook cover typo** | Reads `>Data%Reporting` where other lines use underscores | Kevin |

## Next

[[The Plan]] for strategy and kill criteria. [[Plan of Action]] for the
sequenced list of what to do next.
