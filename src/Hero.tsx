import { useEffect, useRef, useState } from "react";

type Turn = { from: "user" | "agent"; text: string; link?: string };
type Script = { provider: string; turns: Turn[] };

/**
 * Three short, plausible tasks — one per provider the README names as
 * unable to open each other's work — so the URL bar's placeholder (before
 * a link resolves) names the actual agent instead of a generic "new
 * session," and the loop demonstrates all three, not just two.
 */
const SCRIPTS: Script[] = [
  {
    provider: "Claude",
    turns: [
      { from: "user", text: "Research dinosaurs for me." },
      { from: "agent", text: "Done — three key eras, a shortlist of sources, and one open question about feathered species." },
      { from: "user", text: "Save this to Handback." },
      { from: "agent", text: "Here's your link:", link: "handback.link/h/aB3xY9Qz…#••••••" },
    ],
  },
  {
    provider: "ChatGPT",
    turns: [
      { from: "user", text: "Summarize this thread for the team." },
      { from: "agent", text: "Done — objective, decisions, and two open questions, written up." },
      { from: "user", text: "Save this to Handback." },
      { from: "agent", text: "Here's your link:", link: "handback.link/h/8k2NpQr7…#••••••" },
    ],
  },
  {
    provider: "Gemini",
    turns: [
      { from: "user", text: "Sketch pricing page copy." },
      { from: "agent", text: "Done — three tiers drafted, with a one-line pitch for each." },
      { from: "user", text: "Save this to Handback." },
      { from: "agent", text: "Here's your link:", link: "handback.link/h/qW4vLm2N…#••••••" },
    ],
  },
];

const TURN_DELAY_MS = 1300;
const FIRST_TURN_DELAY_MS = 600;
const CLICK_PAUSE_MS = 1000;
const CLICK_ANIM_MS = 220;
const HOLD_AFTER_CLICK_MS = 1600;
const CLEAR_MS = 350;

type Phase = "typing" | "clicking" | "clicked" | "clearing";

/**
 * The landing hero. No object metaphor — a scripted conversation plays out
 * in a floating browser window: ask, agent confirms, a real-shaped
 * Handback link appears, gets clicked, the address bar proves it's real.
 * Then it clears and a different short task starts. Scroll and pointer
 * position drive one continuous transform on the window itself, applied
 * via rAF-throttled direct style writes rather than React state — this
 * runs on every scroll tick, and re-rendering the tree for that would be
 * wasteful and, worse, laggy.
 */
export function Hero({ onExit }: { onExit: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  const [scriptIndex, setScriptIndex] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const script = SCRIPTS[scriptIndex % SCRIPTS.length]!;
  const lastTurn = script.turns[script.turns.length - 1]!;

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

  // Drives the conversation forward: reveal one turn at a time, then click
  // the link, then hold, then clear and start the next script. Skipped
  // entirely under reduced motion, which just shows the last script fully
  // resolved and static.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setTurnCount(script.turns.length);
      setPhase("clicked");
      return;
    }

    let timer: number;

    if (phase === "typing" && turnCount < script.turns.length) {
      const delay = turnCount === 0 ? FIRST_TURN_DELAY_MS : TURN_DELAY_MS;
      timer = window.setTimeout(() => setTurnCount((n) => n + 1), delay);
    } else if (phase === "typing" && turnCount >= script.turns.length) {
      timer = window.setTimeout(() => setPhase("clicking"), CLICK_PAUSE_MS);
    } else if (phase === "clicking") {
      timer = window.setTimeout(() => setPhase("clicked"), CLICK_ANIM_MS);
    } else if (phase === "clicked") {
      timer = window.setTimeout(() => setPhase("clearing"), HOLD_AFTER_CLICK_MS);
    } else if (phase === "clearing") {
      timer = window.setTimeout(() => {
        setScriptIndex((n) => (n + 1) % SCRIPTS.length);
        setTurnCount(0);
        setPhase("typing");
      }, CLEAR_MS);
    }

    return () => window.clearTimeout(timer);
  }, [phase, turnCount, scriptIndex, script.turns.length]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

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
  const urlText = linkLive ? lastTurn.link ?? "" : script.provider;

  return (
    <section className="hero-stage" ref={stageRef}>
      <div className="hero-copy" ref={copyRef}>
        <h2>
          Hand off the work.
          <br />
          Get it back intact.
        </h2>
        <p className="sub">
          A private link, not a paste. Move it, plug it in anywhere, get it back with everything that happened to it.
        </p>
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
                  <div className={`browser-screen${phase === "clearing" ? " clearing" : ""}`}>
                    <div className="chat-stack">
                      {script.turns.map((turn, i) => (
                        <div className={`chat-turn ${turn.from}${i < turnCount ? " visible" : ""}`} key={i}>
                          <div className={`chat-bubble ${turn.from}`}>
                            <p>{turn.text}</p>
                            {turn.link ? (
                              <span className={`link-chip${phase === "clicking" ? " clicking" : ""}`}>{turn.link}</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="window-ground" />
    </section>
  );
}
