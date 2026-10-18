> The full documentation index: https://palbase.studio/llms.txt

# Overview

`palbase/server` is Palbase for servers: one client, made with the project's **secret key**, that reaches every module's server calls — auth's user management, storage, notify, secrets, flags, analytics, realtime's broadcast and channel declaration, and machines. Use it from anything that runs on a server you control: a Next.js route handler, a worker, a script, a backend that is not a Palbase machine. A `palbase/backend` app does not construct one: its `Palbase` is this same client, built from the machine's environment (see [Backend SDK Overview](https://palbase.studio/docs/backend/overview)).

## Quick example

```ts
// server.ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!, // https://<ref>.palbase.studio
  secretKey: process.env.PALBASE_SECRET_KEY!, // pb_<ref>_s…
});

// Every call takes { path, query, headers, body } as its operation needs them,
// and answers { status, data, headers }.
const { data } = await palbase.storage.listBuckets();
console.log(data.buckets.map((b) => b.name));

// Give one user their own value of a flag; their apps are told at once.
await palbase.flags.putUserValue({ path: { user_id: "usr_123", key: "checkout.new_flow" }, body: { value: true } });
```

## The secret key

An environment has publishable keys (`pb_<ref>_c…`, for apps — each [registered app](https://palbase.studio/docs/apps/overview) has its own) and any number of named secret keys (`pb_<ref>_s…`, for servers). Make a secret key in Studio under **Settings › API keys › Create secret key**: it is shown **once**, and each one can be revoked on its own without touching the others — one per server is the habit that makes a leak cheap to shut out.

A secret key opens the whole project: every user, every file, every secret. `createServer` refuses to run where one could reach a browser:

| Where | What happens |
|---|---|
| A bundle built for a browser or React Native | The package's export conditions resolve `palbase/server` to a module that **throws when the bundle loads** — before a key can ship in it. |
| A page (`document` exists), a browser worker (`navigator.userAgent` starts `Mozilla/`), or React Native | `createServer` throws a `TypeError` naming `palbase/web` as what apps use. |
| A publishable key passed as `secretKey` | `createServer` throws: a publishable key belongs in `palbase/web`. |

Node, Bun, Deno, Cloudflare Workers and edge runtimes resolve the real client.

## `createServer(options)`

| Option | Default | What it is |
|---|---|---|
| `url` | — | The project's address, `https://<ref>.palbase.studio`. https only (http only for a loopback address); the origin alone, with no path. |
| `secretKey` | — | The project's secret key, from the server's environment. |
| `retry` | `{ attempts: 3, maxWaitSeconds: 30 }` | How a call that was answered "not now" is sent again (below). |
| `fetch` | `globalThis.fetch` | The fetch the calls go through. |
| `solveProofOfWork` | `false` | Solve auth's proof-of-work challenge here and send the call again. Left off, a sign-in a server makes for a user answers `403 pow_required` with the challenge, for the user's own device to solve. |

It answers a `PalbaseServer`:

| Member | Module | Contract |
|---|---|---|
| `auth` | users, sessions, test users, auth settings (`/admin/…`) | auth |
| `storage` | buckets, objects, signed URLs | storage |
| `notify` | email, push, SMS, WhatsApp, templates, topics | notify |
| `secrets` | the project's secrets, by environment | secrets |
| `flags` | definitions, users' values, publishing | flags |
| `analytics` | captures, and reading events back | analytics |
| `realtime` | broadcast, state, the channel declaration, limits | realtime |
| `machines` | machines, builds, logs, databases | machines |
| `transport` | the one transport every call goes through | — |

Each module's methods are generated from its contract, one per operation, named by its operation id in camelCase: `PUT /storage/buckets/{bucket}` is `storage.putBucket`, `GET /admin/users` is `auth.adminListUsers`. The module pages say what each module does: [Storage](https://palbase.studio/docs/backend/storage), [Secrets](https://palbase.studio/docs/backend/secrets), [Flags](https://palbase.studio/docs/backend/flags), [Notifications](https://palbase.studio/docs/backend/notifications), [Realtime](https://palbase.studio/docs/backend/realtime), [Channels](https://palbase.studio/docs/backend/channels), [Test Users](https://palbase.studio/docs/backend/test-users), and [Machines](https://palbase.studio/docs/machines/overview) for machines and databases.

## The shape of a call

A call takes one object with the parts its operation has — `path` for the path's parameters, `query`, `headers`, `body` — and answers a `Reply`: the `status` the module answered, its `data` (the JSON body, parsed), and its `headers`.

```ts
// users.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const created = await palbase.auth.adminCreateUser({
  body: { email: "grace@example.com", password: "a long passphrase of her own", email_verified: true },
});
console.log(created.status, created.data.id); // 201 usr_…

const user = await palbase.auth.adminGetUser({ path: { uid: created.data.id } });
await palbase.auth.adminUpdateUser({ path: { uid: user.data.id }, body: { metadata: { plan: "pro" } } });
```

A path parameter is always **one** URL segment: the client percent-encodes it, so a storage path `avatars/ada.png` travels as `avatars%2Fada.png`, and an empty value, `.` or `..` is refused before anything is sent (`invalid_path_parameter`). An answer the module sends as bytes — an object's contents — arrives as the `Response` itself, for you to read as you need (`await reply.data.arrayBuffer()`).

The types of every request and answer are exported, by module, as `types`:

```ts
// report.ts
import type { types } from "palbase/server";

export function describe(object: types.storage.StorageObject): string {
  return `${object.path}: ${object.size} bytes of ${object.content_type}`;
}
```

## Refusals are `PalbaseError`

Every answer the contract calls a refusal throws a `PalbaseError` carrying the module's envelope:

| Field | What it is |
|---|---|
| `status` | The HTTP status; `0` when the request never got an answer. |
| `code` | The envelope's `error` (`user_exists`, `bucket_not_empty`, `own_provider_required` …). |
| `message` | The envelope's `error_description`. |
| `requestId` | The request's id, for the module's logs. |
| `retryAfter` | Seconds the module asked to wait (`Retry-After`, or the envelope's `retry_after`). |
| `body` | The body as sent, for the answers that are not the envelope. |
| `op` | The operation, such as `PutBucket`. |

```ts
// make-user.ts
import { createServer, PalbaseError } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

export async function ensureUser(email: string, password: string): Promise<string | null> {
  try {
    return (await palbase.auth.adminCreateUser({ body: { email, password } })).data.id;
  } catch (e) {
    if (e instanceof PalbaseError && e.code === "user_exists") return null;
    throw e;
  }
}
```

A few codes are the client's own, with `status: 0`: `network_error` (the request did not reach the project), `missing_credential`, `invalid_path` and `invalid_path_parameter`. Two more are about answers the contract does not have: `undeclared_answer` (a 2xx the operation does not declare — the request **may have taken effect**) and `undeclared_redirect`.

The client never follows a redirect. The key goes to the project's origin and nowhere else: a request URL that would leave it is refused, and a 3xx is a refusal rather than a hop that would carry the key to whatever host it names.

## Retries

A call is sent again only when doing so cannot do the work twice:

- **What is retried:** `429`, `502`, `503` and `504`, and a request that never reached the server (`network_error`).
- **Which calls:** reads (`GET`, `HEAD`), and the writes whose contract takes an `Idempotency-Key`. For those the client makes one key per call and every attempt carries it, so the module answers a retry with the first answer (`Idempotent-Replayed: true`) instead of doing the work again. Pass your own `Idempotency-Key` header to make a write safe across your own retries too — a job that runs again after a crash, say.
- **How long:** what the module's `Retry-After` asks, never more than `maxWaitSeconds`; with no word from the module, 0.5 s, 1 s, 2 s … with a little jitter. A wait longer than `maxWaitSeconds` is not waited for: the error reaches you.

Everything else is yours: a `400`, a `409`, a `404` is the module's answer, and sending it again would only get it again. A body that can be read only once (a stream) is not sent twice.

```ts
// strict.ts
import { createServer } from "palbase/server";

// One attempt, no waiting: the caller decides.
export const strict = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
  retry: { attempts: 1, maxWaitSeconds: 0 },
});
```

## Listings, a page at a time

Listings answer a page and a `next_cursor`; the next page is the same call with that cursor, until a page carries none. `pages(call)` walks them for you:

```ts
// sweep.ts
import { createServer, pages } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

let banned = 0;
for await (const page of pages((cursor) => palbase.auth.adminListUsers({ query: { limit: 200, cursor, banned: true } }))) {
  banned += page.users.length;
}
console.log(`${banned} banned users`);
```

A listing that answers a cursor it has answered before is a loop, and `pages` throws rather than page forever.

## From a Palbase machine

A `palbase/backend` app reaches the same client as `Palbase`, imported, never constructed: it is built at boot from `PALBASE_URL` (which the platform sets on every machine) and `PALBASE_SECRET_KEY` (a project secret you add — see [Secrets](https://palbase.studio/docs/backend/secrets)). Everything on this page holds for it: `Palbase.storage.putBucket(…)` is `createServer(…).storage.putBucket(…)`.

## Related

- [Webhooks](https://palbase.studio/docs/server/webhooks) — the project's events delivered to your server, and `verifyWebhook`
- [Backend SDK Overview](https://palbase.studio/docs/backend/overview) — `Palbase`, `Database` and `Log` inside a machine
- [Storage](https://palbase.studio/docs/backend/storage) · [Notifications](https://palbase.studio/docs/backend/notifications) · [Flags](https://palbase.studio/docs/backend/flags) · [Secrets](https://palbase.studio/docs/backend/secrets) — the modules, from a server
- [Web SDK Overview](https://palbase.studio/docs/web/overview) — the publishable-key client for apps
