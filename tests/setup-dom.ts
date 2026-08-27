/**
 * Node 26 ships its own experimental `localStorage` global, which shadows the
 * one jsdom provides and is inert unless node is started with
 * `--localstorage-file`. The result is `localStorage === undefined` inside
 * jsdom tests, which silently skips every storage path rather than failing.
 *
 * This installs a minimal in-memory implementation when none is usable. It is a
 * test-environment gap, not a product one: real browsers have localStorage, and
 * src/auto-approve.ts already treats a throwing store as "off".
 */
function installLocalStorage() {
  try {
    if (typeof localStorage !== "undefined" && localStorage !== null) {
      localStorage.setItem("__probe", "1");
      localStorage.removeItem("__probe");
      return;
    }
  } catch {
    // Falls through to the shim below.
  }

  let store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => void (store = new Map()),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };

  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: shim });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { configurable: true, writable: true, value: shim });
  }
}

installLocalStorage();
