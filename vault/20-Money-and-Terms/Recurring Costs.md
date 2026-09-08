# Recurring Costs

Fixed monthly costs tracked nowhere else. The finance data layer
(dashboard/finance.mjs) parses this file, so the format matters: one line per
service, with the amount following the colon and `/mo`, and an optional note
after a pipe.

A blank amount is fine - better than a guess. Kevin fills these.

Example:

    - Domain registration (Namecheap): $14.88/mo | actually annual, shown as monthly equivalent
    - Tailscale: $/mo | TODO
    - Pushover: $/mo | TODO
    - cal.com: $/mo | TODO

## The list

- Domain registration (Namecheap): $/mo | TODO - actually annual, convert to monthly
- Tailscale: $/mo | TODO
- Pushover: $/mo | TODO
- cal.com: $/mo | TODO
