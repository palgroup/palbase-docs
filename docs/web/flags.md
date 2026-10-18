> The full documentation index: https://palbase.studio/llms.txt

# Flags

`pb.flags` holds the project's feature flags and remote configuration as this browser's reader sees them: every flag's value resolved by the project for this app and whoever is signed in, kept current as the flags change. A read takes no network: the client answers from the values it holds, which it keeps in the browser between visits, and brings them up to date behind your code. Flags are defined in Studio's flags screens or by a server, never from the browser (see [Flags in your backend](https://palbase.studio/docs/backend/flags)).

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  // What a flag's conditions on the app's version read.
  appVersion: "2.4.1",
});
```

```ts
// src/checkout.ts
import { pb } from "./lib/palbase";

// The values the client holds now: last visit's for this reader, or the fallback before the first read.
const newCheckout = pb.flags.bool("new_checkout", false);
const banner = pb.flags.string("banner_text", "");
const limit = pb.flags.number("cart_limit", 20);
const theme = pb.flags.json<{ accent: string }>("theme", { accent: "#2f6feb" });
console.log(newCheckout, banner, limit, theme.accent);

// Told the keys whose values changed: a change in Studio, a sign-in, a sign-out.
const stop = pb.flags.onChange((keys) => {
  if (keys.includes("new_checkout")) console.log("the checkout is now", pb.flags.bool("new_checkout", false));
});

// Wait for the values to be current before the first render, when that matters more than speed.
await pb.flags.refresh();
console.log(pb.flags.all());
stop();
```

The client starts on first use: the first read, listener or `refresh()` reads the values for whoever is signed in and joins the flags' change channels. The read goes from the browser straight to the project's address, which answers a page on any site. See [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser).

## Reading values

| Member | What it answers |
|---|---|
| `bool(key, fallback)` | A boolean flag's value, or `fallback` when there is none or it is not a boolean. |
| `string(key, fallback)` | A string flag's value, or `fallback`. |
| `number(key, fallback)` | A number flag's value (a finite one), or `fallback`. |
| `json<T>(key, fallback)` | An object flag's value as your type, or `fallback`. The shape is not checked. |
| `value(key)` | A flag's value, any JSON, or `undefined` when there is none yet. |
| `all()` | Every flag's value by key. |
| `source(key)` | Where a value came from: `system` (the flag's), `override` (the user's own), or `experiment` (an experiment's variant). |
| `version` | The version the values are current as of. |
| `onChange(listener)` | Calls `listener(keys)` with the keys whose values changed. Returns the unsubscribe. |
| `refresh()` | Brings the values up to date now. It resolves when they are. |

Every read answers at once, from what the client holds. Before the first read has come back, a reader the browser has seen before gets the values it had last time, and a new one gets the fallback. Give every read a fallback the app works with.

## A signed-in user's values

The values are one reader's: the signed-in user's, or, with no one signed in, this browser's. When someone signs in or out, the values held go (and a listener is told their keys), the new reader's are read, and the listener is told again. One reader's values are never read out to another, even for the moment the new ones take to arrive. A signed-in user's values follow the order below: their own values first, then their experiment's variant, then the flag's conditions.

## What a value is resolved from

Every read is resolved by the project for its reader, in this order:

1. **The user's own value**, when a signed-in user has one. A server gives users their values with the secret key (see [Flags in your backend](https://palbase.studio/docs/backend/flags#users-own-values)).
2. **The variant of an experiment** running on the flag, when the reader is one of its people.
3. **The flag's first condition that matches.** Conditions read what the client says about itself, the share of users a percentile picks (signed-in users only), the country of the address the request came from, the server's clock, and the analytics audiences the reader is in when they allowed personalization ([Consent](https://palbase.studio/docs/web/consent)).
4. **The flag's default.**

What the client says about itself, with every read:

| Header | Sent as | Read as |
|---|---|---|
| `X-Platform` | `web` | `client.platform` |
| `X-Palbase-Client-Version` | `createClient`'s `appVersion`, when given | `client.app_version` |
| `Accept-Language` | `createClient`'s `language`, or the browser's own | `client.locale`, its first language |
| `X-Palbase-Installation` | `pb.installation.id` | Counted toward which versions of your app are in use. |
| `X-Palbase-Installation-Secret` | The install's secret, kept in the browser, with no one signed in | Proves the install, so audiences and experiments can place a reader who is not signed in. |

The country is the one of the address the request came from: the user's own, because the browser calls the project directly.

A value is any JSON the flag's type allows: a boolean, a number, a string (one of the choices a string flag declares) or an object.

## Experiments

A value an experiment gave says so: `source(key)` is `experiment`. When the app reads such a flag by its key (`bool`, `string`, `number`, `json` or `value`), the client records the analytics event `$flag_exposure` with `{ flag, experiment, variant }`, once per analytics session for each flag and experiment, and only while the person allows analytics. That event is what an experiment's results count. `all()` records none, so read a flag in an experiment by its key where the person sees it.

## Keeping up to date

The client keeps the values current by itself. The project announces every change on two realtime channels, which the client joins on the project's socket:

| Channel | Who may join | What it says |
|---|---|---|
| `flags:<ref>` | Anyone reading the project's flags, with no one signed in too | The project's flags changed. |
| `flags:<ref>:<user_id>` | That user only | That user's own values changed. |

Told of a newer version, the client asks for what changed since the one it holds (`GET /flags/delta`). When the delta can no longer bring its values up to date (the reader's context, country or audiences changed, a time condition turned, or the deletions it would need are older than the 30 days kept), the project answers `410`, and the client reads a whole snapshot instead (`GET /flags/snapshot`, sent with the `ETag` of what it holds, answered `304` when nothing changed). A channel the project refuses, with realtime off, still leaves the reads: `refresh()` brings the values up to date.

Every read a client makes — `GET /flags`, a snapshot or a delta, a `304` among them — is metered against the project's flag reads.

## The calls under it

Every client call of the flags module is also on `pb.flags.api`, typed, through the client's session:

| Call | Method | What it answers |
|---|---|---|
| `GET /flags/snapshot` | `api.getSnapshot()` | `{ values, sources, experiments?, sync_version, context_hash, fetched_at }`, `304` with `If-None-Match` when unchanged. |
| `GET /flags/delta?since=<sync_version>` | `api.getDelta({ query: { since } })` | `{ ops: [{ op: "put" \| "delete", key, value?, source, experiment?, version }], sync_version }`, `304` when nothing changed, `410` when a snapshot is needed. |
| `GET /flags` | `api.getValues()` | Every flag's value for this reader, alone. |

An app that reads flags with `pb.flags` makes none of them itself.

## Errors

A read never throws: it answers the fallback. `refresh()` rejects with a `PalbaseError` when the read it waits for fails:

| Status | When |
|---|---|
| 401 | A key of another project, or a token that is not valid. |
| 429 | The project's request rate, or its flag reads for the period, are used up. `Retry-After` says when to try again. |
| 503 | The platform could not answer now. The read is made again with the next change, or the next `refresh()`. |

## Related

- [Flags in your backend](https://palbase.studio/docs/backend/flags) — defining flags and giving users their own values
- [Realtime](https://palbase.studio/docs/web/realtime) — the socket the change notices travel on
- [Consent](https://palbase.studio/docs/web/consent) — personalization, which audience conditions need
- [Overview](https://palbase.studio/docs/web/overview) — the client's options, `appVersion` and `language`
