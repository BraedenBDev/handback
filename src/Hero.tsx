import { useEffect, useRef } from "react";

export function Hero({ onExit }: { onExit: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
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

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    if (tiltRef.current) tiltRef.current.style.transform = `rotateY(${px * 22}deg) rotateX(${py * -14}deg)`;
  }
  function onPointerLeave() {
    if (tiltRef.current) tiltRef.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  }

  return (
    <section className="hero-stage" ref={sentinelRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <h2>Hand off the work. Get it back intact.</h2>
      <p className="sub">
        A private link, not a paste. Move it, plug it in anywhere, get it back with everything that happened to it.
      </p>

      <div className="usb-perspective">
        <div className="usb-orbit">
          <div className="usb-tilt" ref={tiltRef}>
            <div className="usb-object">
              <div className="face f-back" />
              <div className="face f-right" />
              <div className="face f-left" />
              <div className="face f-bottom" />
              <div className="face f-top" />
              <div className="face f-front" />
              <div className="face c-back" />
              <div className="face c-right" />
              <div className="face c-left" />
              <div className="face c-bottom" />
              <div className="face c-top" />
              <div className="face c-front" />
              <div className="usb-loop" />
              <div className="usb-label">
                AES · 256
                <br />
                local key
              </div>
              <div className="usb-led" />
            </div>
          </div>
        </div>
      </div>
      <div className="usb-ground" />
    </section>
  );
}
