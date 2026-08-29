import { useEffect, useRef, useState } from "react";

/** The three agents the README itself names as unable to open each other's work. */
const PROVIDERS = [
  { name: "Claude", url: "claude.ai/chat/1f3c9a…" },
  { name: "ChatGPT", url: "chatgpt.com/c/8b21e0…" },
  { name: "Gemini", url: "gemini.google.com/app/4d7f…" },
];

const SWAP_INTERVAL_MS = 2800;
const UNPLUG_MS = 200;

/**
 * The landing hero. Scroll and pointer position are combined into one
 * transform, applied via rAF-throttled direct style writes rather than
 * React state — this runs on every scroll tick, and re-rendering the tree
 * for that would be wasteful and, worse, laggy.
 *
 * The provider carousel is driven by the drive, not a generic crossfade:
 * on each tick it unplugs (screen starts leaving), then the active
 * provider advances and it plugs back in (new screen arrives) — the
 * transition IS the handoff, not decoration next to it.
 */
export function Hero({ onExit }: { onExit: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const current = PROVIDERS[active % PROVIDERS.length]!;

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

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSwapping(true);
      window.setTimeout(() => {
        setActive((n) => (n + 1) % PROVIDERS.length);
        setSwapping(false);
      }, UNPLUG_MS);
    }, SWAP_INTERVAL_MS);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    function apply() {
      frame.current = null;
      const node = stageRef.current;
      if (!node || !tiltRef.current) return;
      const rect = node.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / rect.height));

      const { x, y } = pointer.current;
      const rotY = x * 14 + progress * 20;
      const rotX = y * -9;
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
              <div className="browser-edge" />
              <div className="browser-card">
                <div className="browser-chrome">
                  <span className="browser-dot" />
                  <span className="browser-dot" />
                  <span className="browser-dot" />
                  <span className="browser-url">{current.url}</span>
                </div>
                <div className="browser-screen">
                  {PROVIDERS.map((provider, i) => (
                    <div className={`provider-slide${i === active ? " active" : ""}`} key={provider.name}>
                      <div className="provider-name">{provider.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`usb-dock${swapping ? " swapping" : ""}`} aria-hidden="true">
                <div className="usb-face u-back" />
                <div className="usb-face u-right" />
                <div className="usb-face u-left" />
                <div className="usb-face u-bottom" />
                <div className="usb-face u-top" />
                <div className="usb-face u-front" />
                <div className="usb-face u-c-back" />
                <div className="usb-face u-c-right" />
                <div className="usb-face u-c-left" />
                <div className="usb-face u-c-bottom" />
                <div className="usb-face u-c-top" />
                <div className="usb-face u-c-front" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="window-ground" />
    </section>
  );
}
