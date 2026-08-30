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
- **`handback_settings` is one-way on the gate.** An agent can call it with
  `requireApproval: true` to put a human back in the loop, and
  `requireApproval: false` is refused with `reason: "human_only"`. That
  asymmetry is the point: it means the approval gate is the one control an agent
  on the page can never remove, however it was instructed.
- **Auto-approval is the default, and it is the weakest point in the design.**
  `stage_handoff` creates and returns a link in one tool call with no human in
  the loop, so an agent that has been prompt-injected can publish the
  conversation it is holding and read back the link it just minted. Encryption
  does not help here: the agent is on the inside of it. The approval strip turns
  the gate back on per device, and anyone handling material they would not
  publish should turn it on.

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

## Rate limiting

Creating a handoff is rate-limited per IP (Cloudflare's Rate Limiting binding).
Reads and contributions are not: a read costs nothing to repeat, and a
contribution can only land on a handoff that already exists, so neither one
grows storage or budget the way an unbounded stream of creates would.

The limit is a target, not a guarantee, confirmed directly against
production, enforcement is approximate rather than an exact per-window cutoff,
consistent with a distributed counter rather than a single global one. The
check also fails open: if the binding is unavailable or errors, creation
proceeds rather than failing a real handoff over an infrastructure hiccup.
This is deliberately a blunt tool against scripted spam, not a precise quota.

## Threat model in one line

A link is a bearer capability. Whoever holds the whole link, fragment included,
can read and contribute. Everything else follows from that.
