> The full documentation index: https://palbase.studio/llms.txt

# Overview

`palbase/web` is the Palbase client for web and JavaScript apps. One function, `createClient`, makes the client for one project, and the client holds every module an app uses: `auth` signs a person in and keeps them signed in, `flags` holds the flags' values for them, `analytics` records what they do, `consent` keeps what they allowed, `notify` takes the project's pushes, inbox and in-app messages, `purchases` holds what they bought, and `socket` is the project's one realtime connection. Your own backend's routes and gateways join it as `pb.<backend>` once `palbase apps:sync` has written the app its module. Every call goes through the client's one transport, which carries the publishable key, the signed-in user's access token, refreshes and retries.

The client is built with the **publishable** key, the one that ships in an app. It refuses a secret key outright, and the secret key belongs in [`palbase/server`](https://palbase.studio/docs/server/overview).

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

// The project's address. The browser calls it directly, from a page on any site.
export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  // The environment's publishable key, from Studio's Settings › API keys.
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});
```

```ts
// src/main.ts
import { pb } from "./lib/palbase";

const result = await pb.auth.signIn("ada@example.com", "correct-horse-battery-staple");
if (result.mfaRequired) {
  console.log("a second factor is needed:", result.mfaRequired.factors);
} else {
  console.log("signed in as", result.user.id);
}

pb.auth.onAuthStateChange((event, session) => {
  console.log(event, session?.userId ?? "nobody");
});

// The flags' values for whoever is signed in now, kept current as they change.
if (pb.flags.bool("new_checkout", false)) console.log("the new checkout is on");
```

`signIn` puts the session in the client's store, and from then on every call that acts for the user carries the user's access token. The client refreshes that token before it lapses, once, however many calls ask at the same moment and however many tabs share the session.

## Install

The web SDK is `palbase/web`, a part of the npm package `palbase`: `npm install palbase` (or `bun add palbase`).

```json
{
  "dependencies": {
    "palbase": "^0.10.0"
  }
}
```

A caret on a `0.x` version stays within that minor version: `^0.10.0` takes `0.10.1`, never `0.11.0`.

It is compiled JavaScript with its type declarations: any bundler takes it as it is (Next.js, Vite, esbuild — no setting). A browser or React Native bundle that imports `palbase/server`, `palbase/ai` or `palbase/backend` gets a module that throws: those parts hold the project's secret key or run a server, and never go into an app.

The package's web entry points:

| Import | What it is |
|---|---|
| `palbase/web` | `createClient` and everything it returns. |
| `palbase/web/ssr` | The session in cookies, for an app whose server renders its pages: `createServerClient`, `createBrowserClient`, `keepSession`. See [Next.js](https://palbase.studio/docs/web/nextjs). |
| `palbase/web/vite` | The Vite plugin: builds each mode against the environment you name for it, from what `palbase apps:sync` wrote, and type-checks the app against that environment's backend first. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls#building-for-an-environment). |
| `palbase/web/palbe` | What the module `palbase apps:sync` writes registers your backend with. Your own code does not import it. |
| `palbase/web/push-sw.js` | The service worker that shows the project's pushes. See [Notifications](https://palbase.studio/docs/web/notifications#the-service-worker). |
| `palbase/web/paywall` | A paywall's definition resolved and drawn in the page (`renderPaywall`), and its prices formatted: what `pb.purchases.paywall(placement)` draws with (its `render(container, options)`), for an app that draws one itself. |
| `palbase/web/message` | An in-app message's definition resolved and drawn: over the page (`presentMessage`) or as an inbox card (`renderMessage`). What `pb.notify` draws with, for an app that draws one itself. |

## `createClient(options)`

| Option | Type | What it is |
|---|---|---|
| `url` | `string` | The project's address, `https://<ref>.palbase.studio`: where the client sends its calls and opens its socket. It is an origin alone: `https`, or `http` for a loopback address, no path, query or fragment. |
| `publishableKey` | `string` | The project's publishable key, `pb_<ref>_c…`. A secret key (`pb_<ref>_s…`) throws `TypeError` before anything is sent, and so does anything that is not a publishable key. |
| `storage` | `SessionStore` | Where the session is kept. Default: `localStorage` under `palbase.session.<origin>` in a browser, memory anywhere else. |
| `refresh` | `"behind" \| "before" \| "never"` | When the access token is renewed. `behind` (the default): in the background while it still works, so no call waits. `before`: in front of the call that finds it about to lapse. `never`: not at all. `palbase/web/ssr` sets it for a server. |
| `fetch` | `typeof fetch` | The `fetch` the transport calls. Default: the global one. |
| `webSocket` | `typeof WebSocket` | The WebSocket constructor the socket uses. Default: the global one. |
| `xmlHttpRequest` | `typeof XMLHttpRequest` | What an upload that reports its progress is sent with, since `fetch` tells nothing of a body as it goes. Default: the page's own, unless you gave a `fetch`. |
| `webauthn` | `CredentialsLike` | What passkeys call. Default: `navigator.credentials`. |
| `retry` | `RetryPolicy` | `{ attempts, maxWaitSeconds }`. Default: 3 attempts, and a `Retry-After` longer than 30 s is not waited for. See [Error Handling](https://palbase.studio/docs/web/errors). |
| `analytics` | `boolean \| AnalyticsOptions` | Starts the browser's own measures: a page view per address (`pageViews`), web vitals (`webVitals`) and each `fetch` the page makes (`network`), all on once started; `appVersion` is kept with every event. Left out, none of them starts, and `pb.analytics.capture` still sends what you capture. See [Analytics](https://palbase.studio/docs/web/analytics). |
| `consent` | `ConsentOptions` | What is collected before the person chooses (`start`), the version of the consent text the app shows (`textVersion`), and the app's own keys (`customKeys`). See [Consent](https://palbase.studio/docs/web/consent). |
| `appVersion` | `string` | The app's version as its users see it (`"2.4.1"`), sent with flag reads and paywall requests for the conditions that read it. Nothing is sent without one. |
| `appId` | `string` | The registered app's id, a UUID, as `palbase apps:sync` writes it into the app's settings: sent with paywall requests for placement rules that name an app. A slug throws `TypeError`. |
| `language` | `string \| string[]` | The language the app shows itself in (`"tr"`, `["pt-BR", "pt"]`), sent with every request as `Accept-Language`: what auth's emails, a flag's conditions, a paywall's rules and your backend's translations read. Default: the browser's own. |

What comes back:

| Member | What it is |
|---|---|
| `pb.auth` | Sign-up, sign-in, the session, second factors, passkeys, magic links, phone codes, password and email flows. Every client operation of the auth contract is also there, typed, as `pb.auth.api`. See [Auth](https://palbase.studio/docs/web/auth). |
| `pb.flags` | The project's flags and remote configuration, resolved for this app and whoever is signed in, kept current as they change. See [Flags](https://palbase.studio/docs/web/flags). |
| `pb.analytics` | Events the app captures, page views, the person's properties, and the browser's own measures once started. See [Analytics](https://palbase.studio/docs/web/analytics). |
| `pb.consent` | What the person allowed, key by key: their choices, kept in the browser and sent to the project. See [Consent](https://palbase.studio/docs/web/consent). |
| `pb.notify` | This browser's pushes (`push`), the signed-in person's inbox (`inbox`) and the project's in-app campaigns (`inApp`). See [Notifications](https://palbase.studio/docs/web/notifications). |
| `pb.purchases` | What the signed-in customer has, kept current; the catalog's offerings and paywalls; buying on the web with Stripe Checkout. See [Purchases on the web](https://palbase.studio/docs/purchases/web). |
| `pb.installation` | This browser's install of the app: `pb.installation.id`, the same until the site's storage is cleared. Analytics, flags, consent and pushes say it with what they send. |
| `pb.socket` | The project's realtime socket. It is opened the first time a channel is joined, never before. See [Realtime](https://palbase.studio/docs/web/realtime). |
| `pb.transport` | The transport every call above goes through. See [Calls the client has no method for](#calls-the-client-has-no-method-for). |
| `pb.setLanguage(language)` | Changes the language every request says from now on; `null` goes back to the browser's. |
| `pb.chatToolCall(chatId, callId)`, `pb.chatWorkspaceFile(chatId, path)` | A chat's whole tool answer, and a file of its workspace, read with the member's own session. See [Gateways](https://palbase.studio/docs/web/gateways#chat-gateways). |
| `pb.<backend>` | Your backend's routes and gateways, typed: `pb.backend.notes.create({ title })`, from the module `palbase apps:sync` writes the app. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls) and [Gateways](https://palbase.studio/docs/web/gateways). |

A client is one project. Make it once and import it where you need it: each client keeps its own socket and its own copy of the session. An app whose checkout runs `palbase apps:sync` has its client made for it: it imports `pb` from `palbase/<app>`, made with its environment's address and key, and gives it the options above with `connect(options)` ([Calling Your Backend](https://palbase.studio/docs/web/backend-calls#the-generated-module)).

## Calling the project from a browser

A page on any site calls the project's address directly, as a page calls Supabase or Firebase. Give `createClient` the project's address as `url`, and the client's calls and its socket go there from the browser.

What the address answers a browser:

- **A preflight** (`OPTIONS` with `Access-Control-Request-Method`) is answered `204` and needs no key. It allows `GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `DELETE`, and the headers the browser asks for: `apikey`, `authorization`, `content-type`, `idempotency-key` and any other. The browser may keep the answer for a day (`Access-Control-Max-Age: 86400`).
- **Every answer** carries `Access-Control-Allow-Origin: *`: the module's own, and the platform's refusals too (`401`, `403`, `429`, `404 no_route`), so your code reads an error's status and body. These response headers are exposed to your code: `retry-after`, `x-request-id`, `etag`, `idempotent-replayed`, `www-authenticate`, `location`, `link`, `content-range`, `content-disposition`, `dpop-nonce`, `x-thumbhash`, `x-message-id`, `x-ratelimit-remaining` and `x-ratelimit-reset`.
- **No cookie** is read. A call carries the publishable key in the `apikey` header and the user's access token as `Authorization: Bearer …`. Leave `fetch`'s `credentials` at its default: a browser refuses `credentials: "include"` against an answer that allows any origin. A session kept in cookies (`palbase/web/ssr`) is still sent this way: the cookie is where the session is kept, for your own server to read, not how a call proves it.

**Call the project from the browser, not through your server.** The address the project counts is the caller's. Auth's limits are per address: so many sign-in attempts from one address in a few minutes, and a burst of failed sign-ins from one address blocks it for a while. Auth's proof-of-work is asked of an address that looks like a bot. Analytics and flags read the country from the address. A server that passes every user's calls on to the project makes all of its users one address: one person's failed sign-ins then lock everyone out, and every event is given the server's country.

Your own backend is different. A machine answers at its own address (`https://<name>-<ref>.app.palbase.studio`, or `https://<ref>.app.palbase.studio` for the machine named `backend`), and the platform adds no CORS there: a `palbase/backend` app answers browsers itself, for the origins it names in `PalbaseFactory.create(AppModule, { cors: { origins: ["https://app.example.com"] } })`. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls#cross-origin-calls).

## Calls the client has no method for

The client has a method for what an app does most. A few calls a browser may make have none: the signed-in user's notification preferences (`GET`/`PUT /notify/preferences`) and the topics they follow (`POST`/`DELETE /notify/topics/{name}/subscription`). Make them through `pb.transport`, the client's own transport: it sends the publishable key and the user's current access token, refreshes a token refused before its time and sends the call again, waits out a "not now" on a read, and throws a `PalbaseError` for a refusal, as the client's own calls do.

```ts
// src/settings.ts
import { pb } from "./lib/palbase";

type Preferences = Record<string, Record<string, boolean>>;

// Which categories the signed-in user takes on which channel.
const reply = await pb.transport.send({
  op: "notify.getMyPreferences",
  method: "GET",
  path: "/notify/preferences",
  // The publishable key with the user's access token.
  auth: [["ApiKeyAuth", "userJWT"]],
  // The answers the call has; any other is thrown as a PalbaseError.
  answers: { 200: "json" },
});
const prefs = reply.data as Preferences;
console.log(prefs.email);
```

[Notifications](https://palbase.studio/docs/web/notifications#preferences-and-topics) shows both calls in full. Storage has no other client door: listing, writing and deleting objects is the secret key's, and so is everything that changes a module's settings. Those calls are made from a server, with [`palbase/server`](https://palbase.studio/docs/server/overview) or from your machine as `Palbase.<module>`. A browser uploads through your backend: to its upload route, or to a URL it signed. See [Uploads](https://palbase.studio/docs/web/uploads).

## Sessions and storage

The session is `{ accessToken, refreshToken, expiresAt, userId, user? }`, kept by a `SessionStore`:

- **`localStore(key)`** is the browser default, under `palbase.session.<origin of url>`. Tabs share it: a refresh takes a lock across them (`navigator.locks`), a tab that finds the session already refreshed by another takes that one instead of spending a used refresh token, and a sign-out in one tab signs the user out of every tab. Storage that cannot be written (full, blocked, a private window) keeps the session in this page's memory rather than losing it.
- **`memoryStore()`** is the default anywhere without `localStorage`: one process, one session.
- **Cookies**, for an app whose server renders its pages and needs to know who is signed in: `createBrowserClient` and `createServerClient` from `palbase/web/ssr` keep the session in a cookie the page and the server both read. See [Next.js](https://palbase.studio/docs/web/nextjs).
- Your own store implements `load`, `save` and `clear`, and, if tabs share it, `shared: true` and `watch(onChange)`.

The default key is built from the `url` you give, so each project's session is kept apart from another's in the same browser. An app that gave `createClient` its own origin as `url` finds its users' sessions under that origin's key. To keep them signed in when it moves to the project's address, give that key: `storage: localStore("palbase.session.https://app.example.com")`.

A session belongs to one user. When a tab finds another user's session in the shared store, it says `SIGNED_OUT` and then `SIGNED_IN` and never carries one user's work into the other's account. The socket closes on every sign-in and sign-out for the same reason, and the client's flags, consent choices and push registration follow the new user by themselves. See [Auth](https://palbase.studio/docs/web/auth#listening-for-changes).

## Outside the browser

`createClient` runs anywhere `fetch` does: a Node or Bun script, a test, a React Native app. With no `localStorage` the session lives in memory, and nothing keeps it between runs unless you give a `storage`. A script gives the project's address as `url`, as a page does.

A server is a different job. It acts for the project, not for one signed-in person, and it holds the secret key. That is [`palbase/server`](https://palbase.studio/docs/server/overview), and `createClient` will not take its key. A server that renders one signed-in person's pages uses `createServerClient` from `palbase/web/ssr`, with the publishable key and the request's cookies: see [Next.js](https://palbase.studio/docs/web/nextjs#on-the-server).

## Related

- [Auth](https://palbase.studio/docs/web/auth) — every sign-in flow, the session, passkeys and second factors
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls) — your machine's routes, typed, with the user's access token
- [Flags](https://palbase.studio/docs/web/flags) — the flags' values for this reader, kept current
- [Analytics](https://palbase.studio/docs/web/analytics) and [Consent](https://palbase.studio/docs/web/consent) — events, and what the person allowed
- [Notifications](https://palbase.studio/docs/web/notifications) — web push, the inbox and in-app messages
- [Error Handling](https://palbase.studio/docs/web/errors) — `PalbaseError`, retries and proof-of-work
- [Realtime](https://palbase.studio/docs/web/realtime) — channels over the project's socket
- [Gateways](https://palbase.studio/docs/web/gateways) — your backend's realtime channels, and a chat's state
- [Next.js](https://palbase.studio/docs/web/nextjs) — the session in cookies, client components and server code
- [Server SDK](https://palbase.studio/docs/server/overview) — the secret key's client
