import { CreatePage } from "./CreatePage.tsx";
import { HandoffPage } from "./HandoffPage.tsx";

const BROWSER_MARK_SYMBOL = (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
    <symbol id="browser-mark" viewBox="0 0 28 22">
      <rect x="1.5" y="1.5" width="25" height="19" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <line x1="1.5" y1="7" x2="26.5" y2="7" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="4.6" cy="4.2" r="0.9" fill="currentColor" />
      <circle cx="7.6" cy="4.2" r="0.9" fill="currentColor" />
    </symbol>
  </svg>
);

/** Two routes, so no router dependency. /h/<id> opens a handoff; / creates one. */
export function App() {
  const match = /^\/h\/([A-Za-z0-9_-]{16,64})\/?$/.exec(location.pathname);
  return (
    <>
      {BROWSER_MARK_SYMBOL}
      {match?.[1] ? <HandoffPage id={match[1]} /> : <CreatePage />}
    </>
  );
}
