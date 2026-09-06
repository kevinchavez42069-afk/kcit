---
type: client
business: ""
status: onboarding
package:
monthly: false
start-date:
domain: ""
client-id: ""
tags: [client]
---

# {{business}}

| | |
|---|---|
| Package | |
| Monthly plan | |
| Domain owner | Client |
| Client ID (chatbot) | |

## Scope, in writing

What was agreed. Revisions: two rounds included, then hourly.

## Content questionnaire

- [ ] Sent
- [ ] Returned  <- turnaround clock starts here, not at signing

## Permissions

- [ ] Testimonial
- [ ] Named publicly
- [ ] Photos
- [ ] Reference call

## Delivery

- [ ] Site built
- [ ] Chatbot tenant configured (`chatbot\deploy-chatbot.ps1`, no CloudFront
      invalidation needed, `/api/chat` is never cached)
- [ ] Site deployed and CloudFront invalidated (only needed if a page under
      `files/` changed, e.g. adding the widget script tag)
- [ ] Verified on client domain
