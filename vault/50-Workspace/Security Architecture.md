---
title: Security Architecture
status: current
source: Notion
notion_id: 3ce5da8c-0d78-81cb-8007-d6c2ec444bf2
migrated: 2026-09-06
tags: [technical, security]
---

# Security Architecture

How the system protects the API key, client data, and the AWS account, and
where it is still weak.

## The one thing that matters most

**The Anthropic API key never reaches a browser.**

A key in website JavaScript can be read by anyone who views the page source.
This is why the Lambda exists at all: the browser talks to the Lambda, the
Lambda talks to Claude, and the key stays server-side.

It is Kevin's key, shared across every client. Clients never hold one.

## Layers, outermost first

### 1. The Lambda is not reachable from the internet

The function's own URL is set to `AWS_IAM` auth. Hitting it directly returns
403. Only CloudFront can invoke it, through an Origin Access Control that signs
each request with SigV4.

This required **both** `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`
granted to the CloudFront service principal, scoped by `SourceArn` to the one
distribution. Granting only the first produces a bare `Forbidden`.

> `deploy-chatbot.ps1` must keep this on `AWS_IAM`. An earlier version reset it
> to `NONE` on every run, which silently undid the protection.

### 2. Requests must be signed

The browser sends `x-amz-content-sha256` containing a hash of the request body.
Without it the origin returns a signature mismatch.

### 3. Per-client origin validation

Each client's config lists `allowedOrigins`. Every request is checked against
that list.

**CORS alone would not be enough.** A `clientId` is readable in any page's
source, so without this check someone could copy it, point their own site at
the endpoint, and spend Kevin's API budget. CORS is a browser convention, not a
server-side control.

### 4. Spend guardrails

| Limit | Value |
|---|---|
| Messages per conversation | 16 |
| Characters per message | 1,000 |
| Output tokens per reply | 800 |
| Requests/min per IP per client | 12 |

> **Known limitation:** the rate limiter is in-memory, so it is
> per-Lambda-container and best-effort. It slows a casual abuser, not a
> determined one. Move it to DynamoDB if abuse ever becomes real.

### 5. AWS access is scoped narrow

IAM user `kcit-deploy`:

- Lambda actions limited to functions named `kcit-*`
- IAM role creation limited to `kcit-lambda-*`, and the only attachable policy
  is `AWSLambdaBasicExecutionRole` (logging only), so there is no path to
  minting an admin role
- `PassRole` only toward Lambda
- CloudFront limited to the one distribution
- No EC2, no RDS, no billing, no IAM user management

An `AccessDenied` from this user is the policy working as designed.

## Open risks

| Risk | Severity | Fix |
|---|---|---|
| Root account MFA | Resolved | Confirmed enabled 2026-09-01 |
| No LLC | High | No separation between business and personal liability. Not a technical control, but the biggest exposure here |
| Lead delivery runs in the browser | Medium | Web3Forms blocks datacenter IPs. A visitor closing the tab loses that lead. Move to AWS SES |
| In-memory rate limiting | Low | Per-container only. Move to DynamoDB if abused |
| An exposed access key was rotated | Resolved | A key was pasted into a chat window, then deleted and replaced. Treat any credential that touches a chat, ticket, or doc as public |

## Rules for anyone working on this

1. **Never put an API key in `files/`.** Everything there is served to browsers.
2. **Never paste credentials into a chat.** Enter them directly into the target
   system.
3. **Do not reintroduce 4xx status codes in the chat Lambda.** CloudFront's
   error pages are distribution-wide and would rewrite them into the site's
   HTML 404, hiding config errors as network errors.
4. **The Web3Forms access key is public by design.** It appears in page source
   and only permits sending to its registered address. It is not a secret.
