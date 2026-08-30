# Kickstarting the dev account

The account is cold, so the first thing posted decides whether anything after it
gets seen. The mistake is launching with the product. A new account whose first
post is "check out my thing" reads as an ad from nobody, and X will show it to
nobody.

You have something better: the WebMCP build surfaced findings almost nobody else
has, because almost nobody has shipped against this spec yet. Lead with those.
They earn the follow. The product is the second post, and it lands on an audience
that already thinks you know what you're talking about.

**Nothing in here is automated engagement.** No follow-for-follow, no pods, no
buying anything. That gets accounts throttled and it is transparent to the people
you actually want reading this.

---

## Week 0: two or three days before you post anything

**Make the profile answer "why should I care".** Handle and display name you'll
keep. Bio that says what you build, not what you are: "Building Handback, one
encrypted link that moves AI session state between agents" beats "developer,
builder, AI enthusiast". Link to handback.link. Header image: the OG card already
reads well at that crop.

**Follow 50 to 100 accounts in the actual space.** Chrome DevRel people working
on WebMCP, the MCP spec maintainers, people posting about agent interop and tool
use. Not general "tech Twitter". A tight follow list is what makes your timeline
useful enough that you keep showing up.

**Reply before you post.** Three to five substantive replies a day for two or
three days. Replies are how cold accounts get discovered: they surface to people
already reading that thread, which is a warm audience you have not earned yet on
your own timeline. Substantive means answering a question or adding a fact, never
"great post 🔥".

Do that, and by the time post 1 goes out you are a name a few people have seen.

---

## Post 1: the findings (this is the one that earns follows)

Post as a thread. No product pitch until the last line, and even there keep it
small. Send it on a Tuesday to Thursday morning, US Eastern.

> Shipped a site that registers WebMCP tools for agents.
>
> Five things the docs don't tell you, all found the hard way:

> 1/ The entry point moved twice.
>
> `window.agent` → `navigator.modelContext` → `document.modelContext`
>
> Probe document, then navigator. Never `window.agent`, which never shipped.

> 2/ Thrown errors are discarded by design.
>
> The spec flattens any rejection to a bare `UnknownError`. Your careful message
> never reaches the agent.
>
> So every refusal has to be a *returned value* with a machine-readable reason.
> Then a stale write can hand back the current version and the agent re-proposes
> on its own.

> 3/ Output budgets are real.
>
> A real ChatGPT session hit an oversized tool response, gave up on the tool, and
> scraped the page instead.
>
> Page your responses. It will silently route around you otherwise.

> 4/ Guard against DOM clobbering.
>
> `<form id="modelContext">` makes the property a truthy Element.
>
> Check `typeof registerTool === "function"`, not truthiness.

> 5/ Extensions inject late.
>
> Poll for the API rather than deciding once on mount. Content scripts land after
> your app does.

> All of this is in a public MIT repo, and the site it came from is
> handback.link. Happy to answer anything.
>
> github.com/BraedenBDev/handback

Why this works: every item is a specific, checkable thing that costs a reader
time if they don't know it. That is the only reliable currency on dev Twitter.

---

## Post 2: the product, carried by the video

Two or three days after post 1. Video native to X, never a YouTube link in the
post: X suppresses off-platform links and autoplay is most of what makes a demo
land. Put the YouTube link in a reply.

> An hour of work with one agent. Decisions, constraints, everything you already
> ruled out.
>
> Open a different agent and you're at a blank box.
>
> So I built the handoff: one encrypted link that carries the state, and any
> agent can pick it up.
>
> [video]

Reply, in the same thread:

> How it works: the page registers WebMCP tools, so you say "hand this off to
> handback.link" to the agent you're already in. It packages the state itself.
> Objective, decisions and why, open questions.
>
> Encrypted in your browser. The key lives in the URL fragment, which browsers
> never send to a server, so the service holds ciphertext it can't read.
>
> Free, no account, MIT.

Cut a 45-second version for X specifically. The 3-minute Devpost cut is a
different edit for a different audience. On X you have about two seconds: open
on the blank chat box, not on a logo.

---

## Post 3: the idea worth arguing about

This is the one most likely to travel, because it is a design claim people can
disagree with rather than a feature announcement. Save it for a week or so after
post 2, once the account has some history.

> Giving agents a settings tool is obviously useful and obviously dangerous.
>
> So I made mine one-way.
>
> An agent can call `handback_settings` with `requireApproval: true` and put a
> human back in the loop.
>
> `requireApproval: false` is refused. `reason: "human_only"`.

> The reason: an agent that's been prompt-injected by content it just read can
> raise the safety bar and can never lower it. Only a person can, with a button
> on the page.
>
> It only works because the tools are page-local and the page owns the switch. A
> remote MCP server handing out a settings endpoint has no way to make "off"
> unreachable.

> I think one-way controls should be the default shape for anything agent-facing
> that touches consent. Curious whether anyone's doing this differently.

That last line is doing real work. A question that a knowledgeable person wants
to answer is what turns a post into a thread.

---

## Two rules for the week after

**Answer every reply for the first two hours.** Reply velocity is most of what
early distribution is made of, and it is the one variable you fully control.

**Never invent a number.** You have no users, no stars worth quoting and no
testimonials. You do have 192 unit tests, 50 browser tests, five WebMCP tools and
a spec that moved twice. Those are true, specific, and better than anything you
could round up to.
