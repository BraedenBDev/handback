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

## No revocation

A link cannot be withdrawn. There is no owner account to authenticate against,
so there is nobody the service could accept a revocation from except whoever
holds the link, and that is everyone it was ever shared with. Handoffs also have
no expiry: a link works until the data is deleted by hand.

If a link reaches someone it should not have, treat the contents as disclosed.
Create a fresh handoff rather than trying to recall the old one.

## Threat model in one line

A link is a bearer capability. Whoever holds the whole link, fragment included,
can read and contribute. Everything else follows from that.
