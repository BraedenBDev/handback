# WebMCP handoff MVP design (research snapshot: 2026-08-26)

## Decision

Use WebMCP only as the browser-local control plane. Keep the handoff service, ciphertext storage, and cryptography in ordinary page JavaScript/fetch code. Expose **three** imperative tools:

1. `create_handoff`: encrypt structured task state in the page, upload ciphertext, and return a human-shareable URL.
2. `read_handoff`: fetch ciphertext by ID, decrypt with the key in the current URL fragment, and return a compact structured snapshot.
3. `propose_changes`: encrypt and persist a new proposal/version; never commit it.

Do **not** expose `approve_handoff` as a WebMCP tool in the MVP. Approval is a visible, ordinary page button that the human clicks after reviewing the rendered proposal. This is the actual consent boundary; a tool callable by the agent would undermine the product promise. If a later build needs an agent-visible transition, expose only a read-only `get_approval_status`, and keep the commit endpoint gated by a user gesture plus a server-side one-time capability.

## What the platform actually provides

The current WebMCP document is a **Draft Community Group Report, not a W3C Standard**.[35]

Its imperative API is `document.modelContext.registerTool({name,title,description,inputSchema,annotations,execute}, {exposedTo,signal})`; the current IDL also has `getTools()` and `executeTool()`.[35][37]

The callback receives structured input and an options object containing an `AbortSignal`; return values must be JSON-serializable.[35][37]

Chrome describes WebMCP as page-declared, structured tools for browser agents, with discovery, JSON schemas, and shared page state.[36]

Chrome 149 has an origin trial; local development is enabled with `chrome://flags/#enable-webmcp-testing`.[36][42]

The Devpost guidance says judges can use ChatGPT's in-app browser or Chrome 149+ with that flag.[40][41]

Important boundaries:

- WebMCP does not itself provide a database, durable storage, encryption, authentication, URL fragments, cross-session memory, or an agent identity. Those are application responsibilities.
- Registration is tied to the document lifetime; the security questionnaire says persistence across browsing sessions is not currently specified.[35] Re-register on every page load.
- Clients must visit the site directly to discover tools; this is not a globally discoverable remote MCP server.[36]
- The browser/page executes the callback in the registering document's existing JavaScript realm; WebMCP is not a server-side RPC tunnel or a permission to load arbitrary new scripts.[35]
- `readOnlyHint` and `untrustedContentHint` are hints to the agent/client, not enforcement or consent. The current spec's IDL does not make either a security boundary.[35]
- The current normative shape has no guaranteed universal browser confirmation dialog for consequential actions. Chrome documentation mentions requesting user interaction for sensitive actions, but the current draft/API surface and security questionnaire should not be treated as a guaranteed approval primitive.[35][36]

## Minimal registration shape (design-level, based on current API)

```js
const HANDOFF_ID = {
  type: "string",
  pattern: "^[A-Za-z0-9_-]{12,64}$",
  description: "Opaque handoff identifier; never put plaintext task data here."
};

const createHandoffTool = {
  name: "create_handoff",
  title: "Create encrypted handoff",
  description: "Encrypt a task locally, store ciphertext, and return a shareable handoff URL. Does not commit or approve anything.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "Plain task text to encrypt locally." },
      context: { type: "object", additionalProperties: true, description: "Optional structured context; encrypt locally." },
      expiresIn: { type: "string", enum: ["1h", "24h", "7d"], description: "Ciphertext expiry." }
    },
    required: ["task", "expiresIn"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: false, untrustedContentHint: false },
  execute: async ({task, context = {}, expiresIn}, {signal}) => {
    // Application code, not WebMCP: validate bounds; generate a random key;
    // encrypt canonical JSON with Web Crypto; POST ciphertext only; return URL.
    return await createEncryptedHandoff({task, context, expiresIn, signal});
  }
};

const readHandoffTool = {
  name: "read_handoff",
  title: "Read encrypted handoff",
  description: "Fetch and decrypt the handoff addressed by this page URL; returns task state and proposal status, never plaintext to the server.",
  inputSchema: {
    type: "object",
    properties: {
      handoffId: HANDOFF_ID,
      version: { type: "integer", minimum: 0, description: "Optional version; defaults to latest." }
    },
    required: ["handoffId"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async ({handoffId, version}, {signal}) =>
    await readAndDecryptFromFragment({handoffId, version, signal})
};

const proposeChangesTool = {
  name: "propose_changes",
  title: "Propose handoff changes",
  description: "Create an encrypted, reviewable proposal for this handoff. The human must review and click Approve; this tool never commits.",
  inputSchema: {
    type: "object",
    properties: {
      handoffId: HANDOFF_ID,
      summary: { type: "string", maxLength: 4000, description: "Proposed change, written for human review." },
      patch: { type: "object", additionalProperties: true, description: "Structured proposed changes; treated as untrusted until reviewed." },
      baseVersion: { type: "integer", minimum: 0, description: "Version the proposal was based on." }
    },
    required: ["handoffId", "summary", "patch", "baseVersion"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
  execute: async ({handoffId, summary, patch, baseVersion}, {signal}) =>
    await saveEncryptedProposal({handoffId, summary, patch, baseVersion, signal})
};

if (document.modelContext) {
  await document.modelContext.registerTool(createHandoffTool);
  await document.modelContext.registerTool(readHandoffTool);
  await document.modelContext.registerTool(proposeChangesTool);
}
```

This is deliberately a **design-level** snippet: callback names and the backend contract are product code, not claimed WebMCP APIs. The WebMCP API names and fields above are the ones in the current draft/Chrome documentation.[35][37]

Return short results (for example `{status:"created", handoffId, url, version}`) because Chrome recommends approximately 500 characters for descriptions, 150 characters per parameter description, 30 characters for names, and 1.5K characters per output.[38] Keep plaintext task content out of tool metadata and URLs except the fragment key.

## Browser and cryptographic interaction

1. **Landing page:** top-level HTTPS page registers the three tools. Show a normal “WebMCP enabled / tools registered” indicator and a manual fallback button.
2. **Create:** agent calls `create_handoff`. Page canonicalizes task state, uses Web Crypto (e.g. AES-GCM with a random content-encryption key), and sends only `{handoffId, ciphertext, nonce, version, expiry}` to storage. It returns `https://app.example/h/<id>#k=<base64url-key>&v=<key-version>`.
3. **Link handling:** the fragment is not sent in the HTTP request, but page JavaScript can read it. Never log it, include it in analytics/referrers, copy it into server logs, or render it into agent-visible text unnecessarily. Treat possession of the full link as bearer capability; provide revoke/expiry.
4. **Read:** recipient opens the link. On load, page registers tools again, parses the fragment locally, fetches ciphertext by ID, decrypts locally, and renders task/version/proposal status. Agent then calls `read_handoff`; the tool output should be a compact structured snapshot, with any user-authored text marked untrusted.
5. **Propose:** agent calls `propose_changes`; page decrypts current state, validates `baseVersion`, creates a new encrypted proposal/version, and renders a prominent diff. Return `status:"awaiting_human_approval"`.
6. **Approve:** human reviews the diff and clicks a standard button. The click handler, not WebMCP, verifies the displayed version and performs the commit with a one-time server nonce/capability. Show committed status and audit timestamp. Provide Reject and Revoke as ordinary buttons.
7. **Export:** local export is a normal button/download (or optional nonessential tool later), so the user can save ciphertext plus metadata without exposing plaintext to storage.

## Security and consent requirements

WebMCP is gated by secure context, origin isolation, and the `tools` Permissions Policy. Chrome says the policy defaults to `self`; cross-origin iframes need `allow="tools"`, and a document using `document.domain`/non-origin-keyed behavior disables WebMCP.[36] Serve HTTPS, do not use `document.domain`, set an explicit origin-isolation policy as appropriate, and keep the app top-level for the demo.

Do not use `exposedTo` unless an explicitly trusted cross-origin frame is unavoidable. Chrome warns that both read-only tools can reveal user data and read/write tools act on behalf of users; exposure must be restricted to origins you trust.[38] Same-origin top-level registration avoids this entire extra trust edge.

The current WebMCP security guidance calls out indirect prompt injection in metadata, inputs, and outputs.[38][35] Therefore: plain, action-specific descriptions; no instructions hidden in task content; `untrustedContentHint:true` for decrypted/user-generated proposal text; strict runtime validation; bounded lengths; reject stale `baseVersion`; idempotency keys; rate limits; no secrets in tool outputs; and never let model-provided text directly become an approval/commit instruction. WebMCP itself does not prove agent identity or guarantee that a description matches behavior; the server must enforce authorization and the human gesture must enforce commit consent.[35]

Use `AbortSignal` for fetch/encryption/storage operations and make retries safe.

A document navigation/unload can abandon pending executions, and the API is asynchronous.[35][37]

Registering the same tool name twice rejects; register once per document lifecycle and unregister via an `AbortController` when the UI state no longer supports a tool.[35][37]

## Under-three-minute demo script

- **0:00–0:20:** Open Chrome 149+ with WebMCP testing enabled (or ChatGPT in-app browser), show the handoff page and “three tools registered.” Mention: “WebMCP exposes structured page actions; it does not store our data.”
- **0:20–0:55:** Tell the agent: “Hand this off: migrate the billing job to weekly, preserve constraints, and ask for review.” Agent calls `create_handoff`; show ciphertext-only network/storage panel and returned link.
- **0:55–1:25:** Open the link in a second tab/window. Show fragment key in the address bar (do not paste it into logs), ciphertext response, then the rendered decrypted task. Ask agent to read it; it calls `read_handoff`.
- **1:25–2:05:** Tell agent: “Propose changing weekly to monthly and add a rollback step.” Agent calls `propose_changes`; show encrypted proposal, version conflict check, and human-readable diff with “Awaiting approval.”
- **2:05–2:35:** Human clicks Approve. Show commit/audit state. Then briefly click Reject/Revoke or demonstrate a stale proposal being refused.
- **2:35–2:55:** DevTools WebMCP panel shows available tools and exact invocation inputs/outputs; Chrome documents this panel for schema validation and invocation history.[43] End with the live URL, public repository, and Chrome/ChatGPT testing instructions.

## Hackathon compliance checklist

The rules require a working hosted project, public open-source repository with a visible license, a description explaining WebMCP fit and the human/agent collaboration, and a publicly visible YouTube demo under three minutes with audio.[41]

The resources page specifically directs builders to Chrome's docs, the security guide, the flag, and examples.[40]

Keep the live demo unauthenticated or provide judge credentials and make the exact browser setup prominent in the README.[40][41]

## Sources

[35] [WebMCP current draft specification](https://webmachinelearning.github.io/webmcp)
[36] [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
[37] [Chrome Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
[38] [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
[40] [WebMCP Challenge resources/FAQ](https://webmcp.devpost.com/resources)
[41] [OpenAI WebMCP Challenge official rules](https://webmcp.devpost.com/rules)
[42] [Chrome WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial)
[43] [Chrome DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp)
