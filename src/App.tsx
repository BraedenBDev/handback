import { CreatePage } from "./CreatePage.tsx";
import { HandoffPage } from "./HandoffPage.tsx";

const USB_MARK_SYMBOL = (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
    <symbol id="usb-mark" viewBox="0 0 24 32">
      <rect x="3.5" y="9" width="17" height="20.5" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <rect x="8" y="2" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="21" r="2.3" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </symbol>
  </svg>
);

/** Two routes, so no router dependency. /h/<id> opens a handoff; / creates one. */
export function App() {
  const match = /^\/h\/([A-Za-z0-9_-]{16,64})\/?$/.exec(location.pathname);
  return (
    <>
      {USB_MARK_SYMBOL}
      {match?.[1] ? <HandoffPage id={match[1]} /> : <CreatePage />}
    </>
  );
}
