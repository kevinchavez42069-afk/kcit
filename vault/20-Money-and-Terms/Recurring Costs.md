# Recurring Costs

Fixed monthly costs tracked nowhere else. The finance data layer
(dashboard/finance.mjs) parses this file, so the format matters: one line per
service, with the amount following the colon and `/mo`, and an optional note
after a pipe.

A blank amount is fine - better than a guess. Kevin fills these.

Example format:

    - Service name: $XX.XX/mo | optional note
    - Another service: $/mo | blank amount until known

## The list

- Domain registration (Namecheap): $/mo | TODO - actually annual, convert to monthly
- Tailscale: $/mo | TODO
- Pushover: $/mo | TODO
- cal.com: $/mo | TODO
