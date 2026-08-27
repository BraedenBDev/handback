# Agent USB Workstream — Naming Exercise

## Naming job

The product name must work in a spoken instruction:

> “Hand this work off to **[name]**.”

It should imply that the person receives and controls a portable object, not that the product is another AI assistant, memory database, chat exporter, or generic workspace.

## Naming criteria

Weighted scoring:

1. **Interaction clarity — 30%:** supports handoff, take-away, and return.
2. **Ownability — 20%:** not already saturated by AI, memory, collaboration, logistics, or developer products.
3. **Consumer speech — 15%:** easy to pronounce, spell, and put in a sentence.
4. **Object metaphor — 15%:** feels like something the user can keep or pass.
5. **Trust/privacy fit — 10%:** does not sound disposable, extractive, or crypto-speculative.
6. **Domain practicality — 10%:** a credible domain is authoritatively available at a tolerable renewal price.

## Recommendation

### 1. Handback

**Tagline:** *Hand off the work. Get it back intact.*

Why it works:

- Encodes both directions: the agent hands work to the user, and collaborators can hand an improved version back.
- Distinguishes the product from one-way “handoff” tools.
- Works as a verb-like product instruction: “Put this in Handback” or “Create a Handback.”
- Supports `.handback` as a portable file extension without “capsule” baggage.

Risks:

- “Handback” is a real but less-common word; some users may initially hear “handbook.”
- The product must teach the noun once.

Validated domain opportunity:

- `handback.link` — not found through the authoritative `.link` RDAP endpoint on 2026-08-26, indicating availability at that check.
- Porkbun’s live `.link` page showed an everyday price of **$7.72/year**.
- `handback.com`, `handback.app`, and `handback.dev` are registered.
- Final registrar checkout and trademark screening remain required.

### 2. StateParcel

**Tagline:** *Your work, packed to continue.*

Why it works:

- “State” identifies the actual differentiated payload rather than a transcript.
- “Parcel” makes it a bounded object that can be sent, received, and retained.
- The exact `.com` was available at the authoritative RDAP check, which is unusually strong.

Risks:

- More technical and less elegant in speech than Handback.
- “Parcel” creates logistics and land/GIS search noise.
- Sounds like a protocol object before it sounds like a consumer utility.

Validated domain opportunities:

- `stateparcel.com` — available via authoritative Verisign RDAP at the check; Porkbun listed `.com` at **$11.08/year**.
- `stateparcel.app`, `stateparcel.dev`, and `stateparcel.link` were also available via authoritative RDAP at the check.

### 3. Agent USB

**Tagline:** *Take your AI work with you.*

Why it works:

- Instantly communicates a portable object and ownership.
- Visually distinctive and strong for a hackathon demo.
- The `.usb` file/device metaphor naturally supports local export.

Risks:

- `.usb` is not a delegated public TLD, so `agent.usb` cannot be the service URL.
- Live search shows multiple projects using “AI agent on a USB drive,” making the phrase materially ambiguous.
- Users may reasonably expect an actual hardware/offline-agent product.

Validated domain opportunities:

- `agentusb.app` — available through authoritative Google Registry RDAP at the check; `.app` was $8.75 first year / $14.93 regular registration-renewal-transfer at Porkbun.
- `agentusb.dev` — available through authoritative Google Registry RDAP at the check; `.dev` was $8.75 first year / $12.87 regular registration-renewal-transfer at Porkbun.
- `agentusb.com` is registered.

Verdict: keep as the workstream metaphor or demo codename, not the strongest durable brand.

### 4. CarryCase

**Tagline:** *Carry the state, not the chat.*

Why it works:

- A case is a portable container with contents and structure.
- Friendly and visual; supports an object-oriented UI.
- Less protocol-like than StatePass.

Risks:

- Generic physical-product term with noisy search results.
- “Case” can suggest legal/client case-management software.

Validated domain opportunity:

- `carrycase.app` — available through authoritative Google Registry RDAP at the check; `.app` pricing as above.

### 5. StatePass

**Tagline:** *Pass the work. Keep the state.*

Why it works:

- Technically precise and communicates transfer.
- Strong fit for the structured-state USP.

Risks:

- Sounds like authentication, government identity, or a developer protocol.
- Weak emotional/object metaphor for ordinary users.

Validated domain opportunity:

- `statepass.app` — available through authoritative Google Registry RDAP at the check; `.app` pricing as above.

### 6. Pack It Up

**Tagline:** *Tell your agent to pack it up.*

Why it works:

- Excellent natural-language command.
- Makes state extraction and bundling intuitive.

Risks:

- Existing travel/packing uses, including an AI packing-list app.
- More archival than collaborative; weak return/continuation signal.
- `packitup.ai` was available through authoritative RDAP, but `.ai` cost **$82.70/year** at Porkbun.

### 7. Take It With

**Tagline:** *Take the work with you.*

Why it works:

- Directly expresses the user outcome.

Risks:

- Awkward as a product noun.
- Difficult capitalization and word-of-mouth spelling.
- `takeitwith.ai` was available through authoritative RDAP, but `.ai` cost **$82.70/year** at Porkbun.

## Rejected names

- **Relay / Relay Capsules:** crowded; Relay Capsules is already a directly related Devpost project.
- **Handoff:** category term and already formalized in Agent Handoff Protocol.
- **WorkKey:** conflicts semantically and in search with ACT WorkKeys, a registered mark; `workkey.app` is registered.
- **CarryMark:** an exact-name `carrymark.com` product already has a live “coming soon” page, and the name is easily confused with Caremark in speech.
- **WorkCarry:** low exact software collision, but awkward word order and strongly associated with everyday-carry gear rather than transferable work state.
- **Baton / TaskBaton / PassBaton:** perfect metaphor but crowded; checked domains were registered.
- **Parcel / Agent Parcel:** logistics-heavy; `agentparcel.com` is registered.
- **Packet / WorkPacket:** technical and existing; `workpacket.com` is registered.
- **Passport:** heavily occupied across identity, travel, and portable-memory products.
- **Portkey:** strong metaphor but attached to Harry Potter IP and existing technology brands.
- **Takeout:** strongly associated with Google Takeout and food delivery.
- **Briefcase:** crowded across document, security, and developer tooling.
- **CarryKit, WorkCase, TaskPacket, TaskFolio:** live products or brands already surfaced during collision research.

## Final recommendation for MVP naming

**Best durable-brand direction:** Handback.

**Best domain-ownability fallback:** StateParcel, because the exact `.com` checked available.

**Best immediately legible hackathon metaphor:** Agent USB.

Possible strategy:

> **Handback** — your Agent USB for portable work.

This preserves the USB explanation without forcing a misleading or unregistrable product address.

## Domain evidence and caveats

Availability was checked through IANA’s RDAP bootstrap and the authoritative RDAP service for each supported TLD. A 404/not-found response was treated as “available via RDAP,” not a purchase guarantee. Registration and renewal pricing came from Porkbun’s live TLD pricing pages. Final checkout may still reveal premium, reserved, or registrar-specific restrictions.[7][8][9]

## Sources

[7] https://data.iana.org/TLD/tlds-alpha-by-domain.txt — IANA delegated top-level domains
[8] https://data.iana.org/rdap/dns.json — IANA RDAP DNS bootstrap
[9] https://porkbun.com/products/domains — Porkbun domain pricing
