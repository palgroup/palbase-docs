> The full documentation index: https://palbase.studio/llms.txt

# Analytics

Every project has analytics: what people do in its apps, kept as events, and read back as counts, breakdowns, funnels, retention tables and each person's timeline. An app sends with the publishable key, through its SDK; a server sends and reads with the secret key; and Studio's **Analytics** screens show what was kept. Beside the events, analytics keeps how the apps run: timings measured on the devices, the requests they made, and a device's recent console history when something went wrong ([Performance](https://palbase.studio/docs/analytics/performance)).

Nothing needs to be turned on. The project's address takes events from its first request, and what an app may collect follows what its person allowed ([Consent](https://palbase.studio/docs/web/consent)).

## What is kept

| Kind | What it is | Sent by | Counted on the usage page as |
|---|---|---|---|
| Events | A capture (a name and its properties), a page view (`$pageview`), a screen view (`$screen`), an identify (`$identify`), an alias (`$alias`), and a person's properties set | An app's SDK; a server with the secret key | Analytics events (`analytics.events`) — all but setting a person's properties, which is not counted |
| Performance samples | App starts, screens, network calls, web vitals and custom measures, each a number | An app's SDK | `analytics.perf` |
| Request traces | One request as the app or a backend saw it: path, method, status, duration, error | An app's SDK; a `palbase/backend` app, one for each request it answers | `analytics.traces` |
| Console history | A device's recent log lines and network exchanges, sent when something went wrong: an error, a crash, a person's report | An app's SDK | `analytics.console` |

The platform adds events of its own to a person's timeline: a purchase, a push that reached their phone, a consent they changed, an audience they entered or left. `GET /analytics/catalog` lists every event a timeline can hold, the platform's with their fields and the app's own as they arrived.

Each event is given the place of the address it came from: its `country`, `region` and `city`. Places come from DB-IP's IP to City Lite database: IP geolocation by [DB-IP](https://db-ip.com), CC BY 4.0. An address says where its network is, not where the device is.

## Who did it

Every event is someone's, by a **distinct id**:

- **A signed-in user.** With the user's token beside the publishable key, the distinct id is the user's id, whatever the body says: a signed-in user's events are theirs however the app wrote them.
- **An anonymous visitor.** With no one signed in, the SDK makes an anonymous id for the browser or the install, and sends under it.
- **What a server names.** With the secret key, the distinct id is what the body says.

An **identify** ties the anonymous id a person had to the user they signed in as: their events before and after are one person's in funnels, retention and their timeline. The web SDK identifies on its own when someone signs in, and forgets the anonymous id when they sign out ([Web Analytics](https://palbase.studio/docs/web/analytics#pbanalytics)). An **alias** says two ids are one user (`POST /analytics/alias`, `{ from, to }`, the event kept under `to`).

A **person** is a user, with the anonymous ids identified as them, or an anonymous id no one has identified. `GET /analytics/people?query=…` finds one by any id they went by or their email, and `GET /analytics/people/{person_id}` is what is known of them: the ids, the installs their events came from, their properties, when they were first and last seen, and where their newest event came from. See [People](https://palbase.studio/docs/web/analytics#people) and [Audiences](https://palbase.studio/docs/web/analytics#audiences).

A **session** is the SDK's: half an hour without an event ends one, and each event carries its `session_id`.

## Sending from a server

A server sends with the secret key, naming whose the event is:

```ts
// server/orders.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

/** Kept in the person's timeline beside what their apps sent. */
export async function orderShipped(userId: string, orderId: string, items: number): Promise<void> {
  await palbase.analytics.capture({ body: { event: "order_shipped", distinct_id: userId, properties: { order_id: orderId, items } } });
}
```

In a `palbase/backend` app the same calls are `Palbase.analytics`. An event's name is a letter or `$`, then letters, digits and `_.:-$`, 64 characters at most; its properties are 100 at most, 8 KiB each as JSON and 32 KiB in all. The calls an app's SDK makes, their headers and their answers are on [Web Analytics](https://palbase.studio/docs/web/analytics#what-an-app-sends).

A `palbase/backend` app sends a request trace for every request it answers, in batches behind the answers, with the signed-in caller as its distinct id. Nothing is to be written for it: Studio's **Analytics › Network** shows them beside the apps' own ([Performance](https://palbase.studio/docs/analytics/performance#requests)).

## Consent

What an app's SDK collects follows the person's choices, key by key: events, page views, identifies and person properties go only with `analytics` granted; performance samples and request timings with `performance`, and without the person's id unless `analytics` is granted too. A key with neither the person's choice nor a starting value collects nothing. See [Consent](https://palbase.studio/docs/web/consent).

The choices are kept by the SDK, which holds back what was not allowed before it is sent; the analytics module keeps what it is sent. A server that sends about a person with the secret key sends what they agreed to.

## How long it is kept

| Setting | What it says | Default | Range |
|---|---|---|---|
| `retention_days` | How long events, performance samples and request traces are kept | 90 | 1 to 365 |
| `console_retention_days` | How long console history is kept | 14 | 1 to 30 |
| `perf_sample_pct` | The share of performance samples kept: the SDK samples at it before it sends, and the server again | 100 | 0 to 100 |
| `console_bodies` | Whether console history keeps request and response bodies; without it they are removed before anything is kept | `false` | |

A shorter retention removes what is older within minutes; a longer one keeps what is still there for longer. Every read is bounded by it: a window that reaches past the retention reads what is kept.

```sh
palbase analytics:settings:get
palbase analytics:settings:set retention_days=30 perf_sample_pct=10
```

A server reads them with `GET /analytics/settings` and changes them with `PUT /analytics/settings`, which takes all four ([CLI reference](https://palbase.studio/docs/cli/reference#analytics)).

**A deleted user's analytics go with them**: everything under any id they went by — their own, the anonymous ids identified as them, the ids aliased to those — and the events of their installs from while no one was signed in. They leave every audience and come back to none.

## Limits

- A project takes 1,000 events, samples, traces and console records a second, all kinds together. Past it, a send is `429 rate_limited` with `Retry-After`. What an app sends is counted against this, not against the project's requests per second.
- A batch of events is 100 at most and 3 MiB; of performance samples, 100 and 512 KiB; of console history, 500 records, 64 KiB each and 2 MiB in all.
- A send is answered once what it sent is kept: a `202` means the event will be there within seconds. A `503` kept nothing, and is sent again with the same `Idempotency-Key`, which keeps it once.
- When an environment has a limit set on one of the four kinds and the month's are used up, sending that kind is `429 quota_exceeded`, with `Retry-After` until the month ends ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)).

## Related

- [Reading Analytics](https://palbase.studio/docs/analytics/reading) — Studio's screens, summaries, breakdowns, funnels and retention
- [Performance](https://palbase.studio/docs/analytics/performance) — web vitals, app starts, requests and debug history
- [Web Analytics](https://palbase.studio/docs/web/analytics) — sending from the browser, people and audiences
- [Consent](https://palbase.studio/docs/web/consent) — the keys analytics follows
