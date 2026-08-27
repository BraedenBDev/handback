# Security

## Reporting

Open an issue at <https://github.com/BraedenBDev/handback/issues>. This is a
hackathon project with no production users, so there is no embargo process.

## What the design does and does not protect

- **AES-256-GCM in the browser.** The key is born at creation, lives in the URL
  fragment, and serves every later version. Fragments never travel in an HTTP
  request.
- **The server holds an opaque id, a version number, and a ciphertext envelope.**
  No titles, no summaries, no search index. `tests/worker/ciphertext.test.ts`
  writes a known sentinel through the real flow, then reads every column of every
  table in D1 to prove it is absent.
- **Anyone holding the whole link can read the handoff.** It is a bearer
  capability, like a password in a URL. That buys "no account required", and it
  is a trade rather than an oversight.
- **This is not zero-knowledge.** The server ships the JavaScript that encrypts.
  A compromised server could serve code that leaks the key. Object size, timing
  and IP stay visible to the host.
- **Encryption does nothing about prompt injection.** A handoff carries text
  other people's agents wrote. `read_handoff` marks it untrusted, the UI badges
  it, and nothing in it counts as an instruction.
- **The seal checks consistency. It is not a signature.** Anyone with the key can
  recompute a valid one. It catches careless edits outside the approval path and
  says nothing about who made a change.
- **Contributions only add.** No delete operation exists, since a reviewer will
  spot added text long before they notice text that went missing.

## Expiry, and the absence of revocation

Handoffs expire. The creator picks the window at approval time and seven days is
the default, measured from the last approved change rather than from creation.
On expiry the ciphertext is deleted: first read past the deadline removes it, and
a daily sweep catches whatever nobody came back to. Deletion is real. Nothing can
recover the contents afterwards, including the operator, because the server never
held the key.

There is no revocation. Expiry is a timer, not a kill switch, and nothing here
withdraws a link early. Adding one would mean accepting the instruction from
whoever holds the link, which is everyone it was shared with, so a mis-sent link
would be destroyable by its recipient.

If a link reaches someone it should not have, treat the contents as disclosed.
Shorten the window on the next one rather than trying to recall this one.

## Threat model in one line

A link is a bearer capability. Whoever holds the whole link, fragment included,
can read and contribute. Everything else follows from that.
