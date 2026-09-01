import { useEffect, useRef, useState } from "react";

type Turn = { from: "user" | "agent"; text: string; link?: string };
/**
 * Two segments per script, and the window wipes between them. The wipe is
 * the load-bearing part: segment two is a *different session* that starts
 * knowing nothing, and the only thing carried across the gap is the link.
 * Play both halves in one unbroken transcript and it reads as an agent
 * with memory, which is the opposite of the claim.
 */
type Segment = { provider: string; turns: Turn[] };
type Script = { segments: Segment[] };

/**
 * Each script crosses vendors. The provider is a property of the SEGMENT,
 * not the script, so the address bar names one agent before the wipe and a
 * different one after it: Claude hands to ChatGPT, ChatGPT to Gemini,
 * Gemini back to Claude. That is the whole pitch, and with one provider on
 * both sides the demo only proved persistence, which a text file also has.
 * The link text is identical across the gap, so "same link, new version"
 * is checkable by eye. Only the closing turn triggers the click/resolve
 * moment; the first link is shown, not yet proven.
 */
const SCRIPTS: Script[] = [
  {
    segments: [
      {
        provider: "Claude",
        turns: [
          { from: "user", text: "Research dinosaurs for me." },
          { from: "agent", text: "Done. Three key eras, a shortlist of sources, one open question about feathered species." },
          { from: "user", text: "Save this to handback.link." },
          { from: "agent", text: "Here's your link:", link: "handback.link/h/aB3xY9Qz…#••••••" },
        ],
      },
      {
        provider: "ChatGPT",
        turns: [
          { from: "user", text: "Pick up the research from this handback.link." },
          { from: "agent", text: "Loaded. Three key eras, one open question about feathered species." },
          { from: "user", text: "Add the asteroid impact timeline, then hand it back." },
          { from: "agent", text: "Added. Same link, new version.", link: "handback.link/h/aB3xY9Qz…#••••••" },
        ],
      },
    ],
  },
  {
    segments: [
      {
        provider: "ChatGPT",
        turns: [
          { from: "user", text: "Summarize this thread for the team." },
          { from: "agent", text: "Done. Objective, decisions, and two open questions, written up." },
          { from: "user", text: "Save this to handback.link." },
          { from: "agent", text: "Here's your link:", link: "handback.link/h/8k2NpQr7…#••••••" },
        ],
      },
      {
        provider: "Gemini",
        turns: [
          { from: "user", text: "Pick up the summary from this handback.link." },
          { from: "agent", text: "Loaded. Objective, decisions, two open questions." },
          { from: "user", text: "Mark the pricing decision resolved, then hand it back." },
          { from: "agent", text: "Updated. Same link, new version.", link: "handback.link/h/8k2NpQr7…#••••••" },
        ],
      },
    ],
  },
  {
    segments: [
      {
        provider: "Gemini",
        turns: [
          { from: "user", text: "Sketch pricing page copy." },
          { from: "agent", text: "Done. Three tiers drafted, each with a one-line pitch." },
          { from: "user", text: "Save this to handback.link." },
          { from: "agent", text: "Here's your link:", link: "handback.link/h/qW4vLm2N…#••••••" },
        ],
      },
      {
        provider: "Claude",
        turns: [
          { from: "user", text: "Pick up the pricing draft from this handback.link." },
          { from: "agent", text: "Loaded. Three tiers, one pitch line each." },
          { from: "user", text: "Rewrite the enterprise tier pitch, then hand it back." },
          { from: "agent", text: "Updated. Same link, new version.", link: "handback.link/h/qW4vLm2N…#••••••" },
        ],
      },
    ],
  },
];

const TURN_DELAY_MS = 1150;
const FIRST_TURN_DELAY_MS = 600;
const CLICK_PAUSE_MS = 1000;
const CLICK_ANIM_MS = 220;
const HOLD_AFTER_CLICK_MS = 1400;
const CLEAR_MS = 350;
/** Beat on the minted link before the session wipes, so it registers. */
const HOLD_BEFORE_BREAK_MS = 1300;

type Phase = "typing" | "session-break" | "clicking" | "clicked" | "clearing";

/**
 * The landing hero. No object metaphor — a scripted conversation plays out
 * in a floating browser window: ask, agent confirms, a real-shaped Handback
 * link appears, a second agent picks that same link back up, edits, and
 * hands it back — then the final link (same text as the first) gets
 * clicked and the address bar proves it's real. Then it clears and a
 * different short task starts. Scroll and pointer position drive one
 * continuous transform on the window itself, applied via rAF-throttled
 * direct style writes rather than React state — this runs on every scroll
 * tick, and re-rendering the tree for that would be wasteful and, worse,
 * laggy.
 */
export function Hero({ onExit }: { onExit: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  const [scriptIndex, setScriptIndex] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const script = SCRIPTS[scriptIndex % SCRIPTS.length]!;
  const segment = script.segments[segmentIndex]!;
  const isLastSegment = segmentIndex === script.segments.length - 1;
  const lastTurn = segment.turns[segment.turns.length - 1]!;

  useEffect(() => {
    const node = stageRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.intersectionRatio < 0.35) onExit();
      },
      { threshold: [0, 0.35, 1] },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [onExit]);

  // Drives the conversation forward: reveal one turn at a time; at the end
  // of segment one wipe the window and open segment two as a fresh session;
  // at the end of segment two click the link, hold, then clear and start the
  // next script. Skipped entirely under reduced motion, which shows the
  // final segment fully resolved and static.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSegmentIndex(script.segments.length - 1);
      setTurnCount(script.segments[script.segments.length - 1]!.turns.length);
      setPhase("clicked");
      return;
    }

    let timer: number;

    if (phase === "typing" && turnCount < segment.turns.length) {
      const delay = turnCount === 0 ? FIRST_TURN_DELAY_MS : TURN_DELAY_MS;
      timer = window.setTimeout(() => setTurnCount((n) => n + 1), delay);
    } else if (phase === "typing" && !isLastSegment) {
      timer = window.setTimeout(() => setPhase("session-break"), HOLD_BEFORE_BREAK_MS);
    } else if (phase === "typing") {
      timer = window.setTimeout(() => setPhase("clicking"), CLICK_PAUSE_MS);
    } else if (phase === "session-break") {
      timer = window.setTimeout(() => {
        setSegmentIndex((n) => n + 1);
        setTurnCount(0);
        setPhase("typing");
      }, CLEAR_MS);
    } else if (phase === "clicking") {
      timer = window.setTimeout(() => setPhase("clicked"), CLICK_ANIM_MS);
    } else if (phase === "clicked") {
      timer = window.setTimeout(() => setPhase("clearing"), HOLD_AFTER_CLICK_MS);
    } else if (phase === "clearing") {
      timer = window.setTimeout(() => {
        setScriptIndex((n) => (n + 1) % SCRIPTS.length);
        setSegmentIndex(0);
        setTurnCount(0);
        setPhase("typing");
      }, CLEAR_MS);
    }

    return () => window.clearTimeout(timer);
  }, [phase, turnCount, scriptIndex, segmentIndex, segment.turns.length, isLastSegment, script.segments]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Phones get a flat, still card. The tilt reads as noise on a small screen,
    // there is no pointer to drive the parallax half of it, and skipping it
    // means no rAF work at all on the device least able to spare it. Matches
    // the `.hero-stage` mobile rules in style.css; keep the two in step.
    if (window.matchMedia?.("(max-width: 46rem)").matches) return;

    function apply() {
      frame.current = null;
      const node = stageRef.current;
      if (!node || !tiltRef.current) return;
      const rect = node.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / rect.height));

      const { x, y } = pointer.current;
      const rotY = x * 16 + progress * 20;
      const rotX = y * -10;
      const rise = progress * -90;
      const scale = 1 - progress * 0.2;
      tiltRef.current.style.transform = `translateY(${rise}px) scale(${scale}) rotateY(${rotY}deg) rotateX(${rotX}deg)`;

      if (copyRef.current) {
        copyRef.current.style.transform = `translateY(${progress * -56}px)`;
        copyRef.current.style.opacity = String(Math.max(0, 1 - progress * 1.7));
      }
    }

    function schedule() {
      if (frame.current === null) frame.current = requestAnimationFrame(apply);
    }

    function onPointerMove(event: PointerEvent) {
      const node = stageRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      pointer.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
      schedule();
    }
    function onPointerLeave() {
      pointer.current = { x: 0, y: 0 };
      schedule();
    }

    const node = stageRef.current;
    window.addEventListener("scroll", schedule, { passive: true });
    node?.addEventListener("pointermove", onPointerMove);
    node?.addEventListener("pointerleave", onPointerLeave);
    apply();

    return () => {
      window.removeEventListener("scroll", schedule);
      node?.removeEventListener("pointermove", onPointerMove);
      node?.removeEventListener("pointerleave", onPointerLeave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const linkLive = phase === "clicked" || phase === "clearing";
  const urlText = linkLive ? lastTurn.link ?? "" : segment.provider;
  const wiping = phase === "clearing" || phase === "session-break";

  return (
    <section className="hero-stage" ref={stageRef}>
      <div className="hero-copy" ref={copyRef}>
        <h2>
          Hand off the work.
          <br />
          Get it back intact.
        </h2>
        <p className="sub">
          One encrypted link. Any agent opens it, adds to it, and hands it back, with every version kept.
        </p>

        {/*
          The one loud object on the page, and deliberately wearing OpenAI's
          black rather than Handback's paper palette: it is a claim about
          somewhere else. Everything around it stays quiet, which is what lets
          it carry the attention rather than compete for it.
        */}
        <a
          className="chatgpt-pill"
          href="https://chatgpt.com/download"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className="chatgpt-pill-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
            />
          </svg>
          <span className="chatgpt-pill-label">
            Try it now in ChatGPT Desktop
            <span className="chatgpt-pill-sub">Work &amp; Codex</span>
          </span>
          <svg className="chatgpt-pill-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10"
            />
          </svg>
        </a>
      </div>

      <div className="window-perspective">
        <div className="window-orbit">
          <div className="window-tilt" ref={tiltRef}>
            <div className="window-object">
              <div className="browser-stack">
                <div className="browser-edge" />
                <div className="browser-card">
                  <div className="browser-chrome">
                    <span className="browser-dot" />
                    <span className="browser-dot" />
                    <span className="browser-dot" />
                    <span className={`browser-url${linkLive ? " is-live" : ""}`}>{urlText}</span>
                  </div>
                  <div className={`browser-screen${wiping ? " clearing" : ""}`}>
                    {/*
                      Every segment of every script renders, stacked into one
                      grid cell, so the card always reserves the height of the
                      tallest of them and never resizes. Measured live before
                      this: segments within a script differed by ~22px and
                      scripts differed by another ~23px, and each change
                      resized the card and shoved the rest of the page down.
                      Inactive segments are visibility:hidden, so they hold
                      space without reaching the accessibility tree, and only
                      the running script's closing chip is marked final, which
                      keeps that a single-match selector.
                    */}
                    <div className="chat-stack">
                      {SCRIPTS.map((s, si) =>
                        s.segments.map((seg, gi) => {
                          const active = si === scriptIndex % SCRIPTS.length && gi === segmentIndex;
                          const closing = si === scriptIndex % SCRIPTS.length && gi === s.segments.length - 1;
                          return (
                            <div className={`chat-segment${active ? " active" : ""}`} key={`${si}-${gi}`}>
                              {seg.turns.map((turn, i) => {
                                const isFinal = closing && i === seg.turns.length - 1;
                                const shown = active && i < turnCount;
                                return (
                                  <div className={`chat-turn ${turn.from}${shown ? " visible" : ""}`} key={i}>
                                    <div className={`chat-bubble ${turn.from}`}>
                                      <p>{turn.text}</p>
                                      {turn.link ? (
                                        <span
                                          className={`link-chip${isFinal ? " link-chip-final" : ""}${phase === "clicking" && isFinal ? " clicking" : ""}`}
                                        >
                                          {turn.link}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="window-ground" />

      {/*
        Honest footnote to the scene above. The loop is real and shipped, but
        the conversation playing out in the window is scripted, and saying so
        where the animation is rather than burying it in the README is the
        difference between a demo and a claim.
      */}
      <p className="hero-note">
        <span aria-hidden="true">*</span> Built on WebMCP. Works today in Chrome 149 to 156 with nothing to set up, and in
        ChatGPT's desktop browser with Site tools on. The conversation above is scripted. Agents without WebMCP fill the
        page directly.
      </p>
    </section>
  );
}
