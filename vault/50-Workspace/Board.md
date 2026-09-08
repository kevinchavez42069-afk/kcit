# Board

What shipped, what is moving, and what is next. The dashboard's Home screen
reads this file directly, so keeping it current is what keeps that strip
honest. Three headings, and they have to keep these names.

Format for a line:

    - what it is | a short note

Add `@you` to anything only Kevin can finish, and it shows up flagged on the
Home screen. Move a line between headings rather than rewriting it, so the
wording that shipped is the wording that was in flight.

executive-assistant may edit this. It is the one place the fleet gets to say
what it thinks the state of play is, and Kevin overrules it freely.

## Shipped

- CSRF guard on every dashboard write route | closed the audit's first critical finding
- Secrets moved out of the repo tree to ~/.kcit/.env | Read and WebFetch were auto-allowed, gitignore did nothing about that
- Agents load both repos' CLAUDE.md | the binding rules had never reached a single agent run
- Pending confirmations now expire instead of hanging | an unanswered Bash call used to block its run forever
- Agent Ops redesign | Home, light and dark, per agent icons, collapsible everything
- Every cost figure now names its window | they were all-time totals wearing no date, and one got read as a day's spend
- Checked the chatbot caching claim | it was wrong, caching saves 41% on real traffic, and both alternatives cost more

## In flight

- prospect-scout, more lead sources | Richmond first, not Richmond only
- Daily digest quality | the standup writes it, nobody has tuned what it says yet

## Up next

- Rotate the leaked Anthropic key @you | it is still live and still matches the key in use
- Set an AWS budget alarm and an Anthropic spend cap @you | needs the console, kcit-deploy gets AccessDenied by design
- Reserved concurrency on the chatbot Lambda @you | same console, same reason
- Push kc.IT to a private remote @you | needs an empty repo created first, everything there lives on one drive
- Shrink the chatbot system prompt | about 1,620 tokens, and every single-shot demo visitor pays 1.25x that with no follow-up to amortise it
- The weekly retro has never read cost data | AI Operating System.md says it reviews agent_runs cost data, the agent's own file does not list it
- voice.md writing samples | oldest open item, still unwritten
