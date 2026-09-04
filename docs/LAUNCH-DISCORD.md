# Discord post

Handback: Private, versioned handoffs between agents through WebMCP

I kept running into the same problem when moving work between sessions: a
Markdown export preserved the answer, but not the sources, decisions, open
questions, or history behind it.

I built Handback so the agent you are already working with can package that
context into one encrypted link. Another session or agent can open it, read the
handoff as structured data, contribute changes, and publish a new version back
to the same link. The service stores ciphertext, every contribution is
reviewable, and no account is required.

It uses five WebMCP tools, runs on Cloudflare Workers and D1, and is open source
under MIT.

Would love to hear what you think!

Devpost: https://devpost.com/software/handback-universal-agent-handoff-links
Video: https://youtu.be/S_4ibM1cJXc
Live: https://handback.link/
Repo: https://github.com/BraedenBDev/handback

## Devpost contribution

I designed and built Handback end to end, including the encrypted handoff
format, five WebMCP tools, React interface, Cloudflare Worker and D1 backend,
version history, approval controls, and automated test suite. I also researched
WebMCP compatibility, deployed handback.link, and produced the demo and
submission.
