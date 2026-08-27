import { CreatePage } from "./CreatePage.tsx";
import { HandoffPage } from "./HandoffPage.tsx";

/** Two routes, so no router dependency. /h/<id> opens a handoff; / creates one. */
export function App() {
  const match = /^\/h\/([A-Za-z0-9_-]{16,64})\/?$/.exec(location.pathname);
  return match?.[1] ? <HandoffPage id={match[1]} /> : <CreatePage />;
}
