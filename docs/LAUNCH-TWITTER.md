# Kickstarting the dev account

Every link below was checked and resolves. Do not add one I have not verified;
a dead or wrong link from a new account is expensive in a way it is not from an
established one.

**The deadline sets the schedule.** The WebMCP Challenge closes **3 September,
1 p.m. PT**, winners announced 23 September. The conversation is happening
*right now* and dies down after that, so the educational posts have to land
while people are actively searching the term. That is the whole reason for the
order below.

---

## Platform: post on X, mirror to Bluesky, skip Threads for now

**X is where this specific conversation is.** OpenAI Devs announced Site Tools
there, the opening livestream was there, and the people judging and building
against this spec are there. For a topic this narrow and this current, "where
the conversation is" beats "which platform has better engagement rates".

**Bluesky is worth a mirror.** It has a smaller but denser developer population
and the same posts cost you nothing to cross-post. Do it a couple of hours later
so you are not answering replies in two places at once.

**Threads: not yet.** Its developer audience is real but it rewards established
accounts, and there is no WebMCP conversation there to join. Revisit when you
have something evergreen rather than something time-boxed.

## Hashtags: one, sometimes two, never three

The algorithm reads your post text with a language model now; it does not need a
hashtag to work out the topic. Three or more trips spam heuristics and costs you
reach. The only hashtags still worth using are ones a community is actively
browsing, which during a hackathon is exactly the case here.

- Use **#WebMCP** on the educational and product posts. That is the one people
  are actually searching this week.
- Before you post, open the challenge page and the Devpost feed and check
  whether OpenAI is pushing a specific event tag. If they are, mirror it exactly.
  If they are not, do not invent one.
- No `#buildinpublic #ai #coding #dev` stacks. That reads as reach-farming and
  it now measurably costs reach.

Better than a hashtag: name the accounts. `@OpenAIDevs`, `@ChromiumDev`. A
mention puts you in their notifications, which a hashtag never does. Use it once
where it is genuinely relevant, not on every post.

## Where else to share

- **The challenge Discord.** There is a dedicated channel linked from the
  challenge page. Highest-signal place to post the build, and the people in it
  are the ones most likely to actually read the repo.
- **Hacker News**, Show HN, once. Title: `Show HN: Handback – one encrypted link
  that moves AI session state between agents`. No hashtags, no emoji, and reply
  to every comment.
- **r/mcp** on Reddit, and the OpenAI developer forum thread about Site Tools.
- Devpost's own project feed, which is free traffic you get anyway by submitting.

---

## Week 0: before any of this

- Profile that answers "why should I care": bio says what you build, not what
  you are. Link to handback.link. The OG card crops well as a header.
- Follow 50 to 100 accounts actually in this space. Chrome DevRel, the MCP spec
  people, OpenAI devs, others building for the challenge.
- Three to five substantive replies a day for two days before posting. Replies
  surface to people already reading that thread, which is the only warm audience
  a cold account has. Substantive means adding a fact, never "great post".

No automated engagement, no follow-for-follow, no pods. It gets accounts
throttled and the people you want are the ones who notice.

---

# The posts, in order

## Day 1, morning — Retweet, with a comment

Quote-retweet OpenAI's announcement rather than posting cold. You borrow an
audience that is already reading about exactly this.

> https://x.com/OpenAIDevs/status/2092344959248761263

Your comment:

> This is bigger than it sounds. A website can now hand an agent real tools
> instead of hoping it can drive the UI.
>
> Spent the last week building on it. Notes coming.

## Day 1, afternoon — Post 1: What is WebMCP

> Every agent that "uses" a website today is guessing.
>
> It reads the DOM, infers what a button does, clicks, and hopes. It breaks when
> you ship a redesign.
>
> WebMCP is the fix: the site hands the agent actual tools.

> Concretely, a page calls `document.modelContext.registerTool()` with a name, a
> description and a JSON Schema for the inputs.
>
> The agent in the browser can now call that function directly. No scraping, no
> guessing, no separate MCP server to run.

> The part people miss: it works on the *live, signed-in page*. Same session,
> same auth, same state you are looking at.
>
> You and the agent are working on the same thing, not two copies of it.

> Spec (W3C Web Machine Learning CG, still an incubation draft, not a standard
> yet): https://webmachinelearning.github.io/webmcp/
>
> Chrome's docs: https://developer.chrome.com/docs/ai/webmcp
>
> #WebMCP

## Day 2 — Post 2: OpenAI's Site Tools

> ChatGPT's desktop browser now supports WebMCP. OpenAI calls it Site Tools.
>
> If your site registers tools, ChatGPT and Codex can call them on the page
> you're already on.
>
> Docs: https://learn.chatgpt.com/docs/webmcp

> Worth knowing before you try it: it needs GPT-5.6 Sol or Terra, and it is not
> available in Enterprise or Edu workspaces.
>
> Chrome 149 to 156 also supports it. Sites can run the origin trial so visitors
> don't touch a flag.

## Day 2, later — Post 3: The future of WebMCP

This is the one most likely to travel, because it takes a position.

> WebMCP is not a standard yet. It is a Draft Community Group Report, it is not
> on the W3C standards track, and Chrome is the only engine shipping it.
>
> I still think it is the most important web API proposed in years. Here is the
> argument.

> Every integration we build for agents today is a bilateral deal. An MCP server
> per app, a connector per vendor, an API key per user.
>
> That does not scale to the whole web. There is no world where every site
> negotiates with every agent.

> WebMCP inverts it. The site declares its tools once, in its own page, and
> every agent gets them. It is the same trick that made the web work the first
> time: a common surface instead of N×M integrations.

> The honest risks: one engine, WebKit unenthused, and standardisation measured
> in years not months. It may not survive.
>
> But "sites describe themselves to agents" is going to happen in some form. The
> question is which shape wins.
>
> #WebMCP

## Day 3 — Post 4: The hackathon

> OpenAI is running a 10-day WebMCP Challenge and it closes tomorrow, 3 Sept,
> 1 p.m. PT.
>
> Top 10 get $3,000 each, a year of ChatGPT Pro and a Codex Micro keyboard, plus
> prizes from Shopify, Chrome, Netlify, Cloudflare, Vercel and Render.
>
> https://openai.com/webmcp-challenge/

> I built something for it. Posting it tomorrow.
>
> If you're on the fence: the brief is "an app that becomes meaningfully better
> when people and their agents use it together", which is a genuinely
> interesting constraint to design against.
>
> https://webmcp.devpost.com/

## Day 4, morning — Post 5 + 6: Handback and the demo

The product and the demo are one post, not two. The video is the hook and a
link-only post will underperform it badly. Upload the video **native to X**; do
not post a YouTube link in the main tweet.

> You spend an hour with an agent. Decisions, constraints, everything you ruled
> out.
>
> Open a different agent and you're at a blank box.
>
> So I built the handoff. One encrypted link that carries the state, and any
> agent can pick it up.
>
> handback.link
>
> [video]

First reply, same thread:

> How it works: the page registers WebMCP tools. You say "hand this off to
> handback.link" to the agent you're already talking to, and it packages the
> state itself. Objective, decisions and why, open questions.
>
> One tool call. It hands you back a link.

Second reply:

> It's encrypted in your browser before anything leaves. The key lives in the
> URL fragment, which browsers never send to a server, so the service holds
> ciphertext it can't read.
>
> Which also means whoever holds the link can read it. Bearer capability, not
> zero-knowledge. The site says so.

Third reply:

> Free, no account, no sign-up. Built for the #WebMCP Challenge.

Cut a **45-second** version for X. The under-3-minute cut is for Devpost and is
a different edit for a different audience. On X you have about two seconds, so
open on the blank chat box, never on a logo.

## Day 4, afternoon — Post 7: The repo

Separate post a few hours later, so the video post owns the morning.

> Handback is open source, MIT.
>
> https://github.com/BraedenBDev/handback
>
> Five WebMCP tools, 192 unit tests, 50 browser tests including one that runs
> against a real `document.modelContext` rather than a mock.

> If you're implementing WebMCP, `docs/WEBMCP-COMPATIBILITY.md` is the file to
> read. It's everything the spec didn't tell me, written down as I hit it.
>
> The entry point moved twice. Thrown errors get discarded. Output budgets are
> real and ChatGPT will silently scrape your page instead.

## Day 5+ — Post 8: The findings thread

Hold this one until after the submission. It is your best evergreen post and it
does not need the hackathon to land, so do not spend it competing with your own
launch.

> Shipped a site with WebMCP tools. Five things the docs don't tell you:

> 1/ The entry point moved twice.
> `window.agent` → `navigator.modelContext` → `document.modelContext`
> Probe document, then navigator. Never `window.agent`, which never shipped.

> 2/ Thrown errors are discarded by design. The spec flattens any rejection to a
> bare `UnknownError`, so your careful message never reaches the agent.
>
> Every refusal has to be a returned *value* with a machine-readable reason.

> 3/ Output budgets are real. A real ChatGPT session hit an oversized tool
> response, gave up on the tool, and scraped the page instead.
>
> Page your responses or it routes around you.

> 4/ Guard DOM clobbering. `<form id="modelContext">` makes the property a
> truthy Element. Check `typeof registerTool === "function"`.

> 5/ Extensions inject late. Poll for the API instead of deciding once on mount.

> All of it in a public MIT repo: https://github.com/BraedenBDev/handback

## Second retweet, any time

The Chrome docs or the spec repo, quoted with one useful sentence. Retweeting
without a comment adds nothing and gets you nothing.

> https://github.com/webmachinelearning/webmcp

> The spec repo is more readable than most. If you want to know where this is
> going, read the open issues, not the blog posts about it.

---

## Two rules

**Answer every reply for the first two hours.** Reply velocity is most of early
distribution and it is the one input you fully control.

**Never invent a number.** No users, no stars, no testimonials. You do have five
tools, 192 unit tests, 50 browser tests, a spec that moved twice, and a real
ChatGPT session that gave up and scraped the page. Those are true, specific, and
more interesting than anything you could round up to.
