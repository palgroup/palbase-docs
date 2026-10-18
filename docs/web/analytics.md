> The full documentation index: https://palbase.studio/llms.txt

# Analytics

`pb.analytics` sends the project's analytics module what the app's people do: the events it captures, page views, and what it knows of the person. It holds events and sends them together, a few seconds apart or twenty at a time, and a page that closes sends what it holds as it goes. With the `analytics` option of `createClient` it also records the browser's own measures: a page view per address, web vitals and the page's request timings. Nothing is collected that the person has not allowed: events, page views and person properties go only with the `analytics` key granted, the browser's timings only with `performance` ([Consent](https://palbase.studio/docs/web/consent)). What the project reads back (summaries, event lists, funnels, retention, people) is the secret key's, and Studio's Analytics screens show it.

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  // Page views, web vitals and request timings, recorded by the client; the app's version kept with every event.
  analytics: { appVersion: "2.4.1" },
  // Collected before the person chooses. Where the law asks first, start them denied and ask: see Consent.
  consent: { start: { analytics: "granted", performance: "granted" } },
});
```

```ts
// src/checkout.ts
import { pb } from "./lib/palbase";

pb.analytics.capture("checkout_started", { plan: "pro", items: 3 });

// What is known of the person: the signed-in user, or this browser's anonymous visitor.
await pb.analytics.people.set({ plan: "pro" });
await pb.analytics.people.setOnce({ first_plan: "pro" });
await pb.analytics.people.add({ checkouts: 1 });

// A view the address does not show (a dialog, a step of a wizard).
pb.analytics.page({ title: "Checkout: payment" });
```

The calls go from the browser straight to the project's address, which answers a page on any site. See [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser).

## `pb.analytics`

| Member | What it does |
|---|---|
| `capture(event, properties?)` | Records an event: a name (a letter or `$`, then letters, digits and `_.:-$`, 64 at most) and its properties. |
| `page({ url?, title?, referrer?, properties? })` | Records a `$pageview`: the page's address unless given, its title, where the visitor came from. |
| `people.set`, `people.setOnce`, `people.unset`, `people.add` | Sets the person's properties, sets the ones not set already, removes some, adds to numbers. |
| `identify(traits?)` | Ties this browser's anonymous events to the signed-in user, with their traits. The client does it on its own when someone signs in. |
| `reset()` | Forgets this browser's anonymous id and session: the next visitor is someone new. The client does it on its own when someone signs out. |
| `flush()` | Sends what is held now. |
| `start(options?)` | Starts the browser's own measures, as the `analytics` option does: `pageViews`, `webVitals`, `network`, each on unless turned off. Returns what stops them. |
| `onEvent(listener)` | Told of each event the app captures, here in the page, whatever the person chose: what in-app messages are triggered by. Nothing leaves the page for it. |

An event is the signed-in user's when someone is signed in, and this browser's anonymous visitor's otherwise; once they sign in, their anonymous history is theirs. A session is half an hour without an event.

What the client reads on its own goes as the page's **route**, not its address: no query, no fragment, and a path segment that is not a word of the route (a number, an id, an email, a token) becomes `:id`. `/orders/8f1c…/receipt?token=…` is sent as `/orders/:id/receipt`. The browser's referrer is cut the same way, since on a same-site arrival it is the whole previous address. What your code passes to `page()` is sent as you passed it.

The browser's own measures, once started:

| Measure | What it is | Key |
|---|---|---|
| Page views | A `$pageview` for the first page and each navigation after it (history and back/forward). | `analytics` |
| Web vitals | LCP, CLS, INP, FCP and TTFB, as `web_vital` samples. | `performance` |
| Request timings | Each `fetch` the page makes: method, address without its query, status, time. | `performance` |

A timing goes without the person's id unless `analytics` is granted too. Refusing a key drops what was held of it at once.

## What an app sends

The client makes these calls for you. They are the analytics module's, with the publishable key over HTTPS, and a signed-in user's token makes what they send theirs:

| Call | What it is | Body |
|---|---|---|
| `POST /analytics/capture` | One event | `{ event, distinct_id, properties?, session_id?, app_version?, timestamp?, sent_at? }` |
| `POST /analytics/batch` | Up to 100 events, 3 MiB | `{ events: [<capture bodies>] }` |
| `POST /analytics/page` | A `$pageview` | `{ distinct_id, url, title?, referrer?, properties?, session_id?, … }` |
| `POST /analytics/screen` | A `$screen` | `{ distinct_id, screen_name, properties?, session_id?, … }` |
| `POST /analytics/identify` | An `$identify`: who the user is | `{ distinct_id, anonymous_id?, traits? }` |
| `POST /analytics/alias` | An `$alias`: two ids are one user | `{ from, to }` |
| `POST /analytics/people` | The person's properties | `{ set?, set_once?, unset?, add? }` |
| `POST /analytics/perf` | Up to 100 samples, 512 KiB: web vitals, request timings | `{ items: [ … ] }` |

- **`event`**: a letter or `$`, then letters, digits and `_.:-$`, 64 characters at most.
- **`distinct_id`**: who did it, 256 characters at most, with no NUL character. With a user's token the user's id is the distinct id, whatever the body says, so a signed-in user's events are theirs however the app wrote them.
- **`properties`** and **`traits`**: 100 at most, 8 KiB each as JSON, 32 KiB in all.
- **`timestamp`** and **`sent_at`**: unix milliseconds on the device's clock. The difference between `sent_at` and the server's clock is the device clock's error, and it is taken off `timestamp`. An event queued offline keeps its own `timestamp` and gets a fresh `sent_at` when it goes out.
- **`identify`'s `anonymous_id`**: the id the user had before signing in. Their anonymous history goes with them, and if they are deleted, it goes too.

The headers say what the server cannot tell from the body:

| Header | Effect |
|---|---|
| `idempotency-key` | The same key sent again within two minutes is not kept twice. Send one per event, and send it again with a retry. |
| `x-platform` | `web`, `ios` or `android`, kept with the event. |
| `x-palbase-client-version` | Your app's version, kept with the event. |
| `x-os-version` | The operating system's version. |
| `x-palbase-installation` | The install it came from (`pb.installation.id`): the platform's events about the install — a push that reached it while no one was signed in — are its person's. Sent only with `analytics` granted. |

## What comes back

A call is answered once what it sent is kept: on the platform's stream, written to the store within seconds, even while the store restarts. So a `202` means the event will be there.

| Status | When |
|---|---|
| `202` | Kept. A batch answers it when every event was kept. |
| `207` | A batch with some events refused: `{ accepted, rejected: [{ index, error, error_description }] }`. The rest were kept. |
| `400` | The body does not fit the rules above. A batch none of whose events was kept answers its first refusal. |
| `413` | Over the size limits. |
| `429` | Over what the project may send per second, all kinds together. `Retry-After` says when. |
| `503` | Not kept: send again with the same `idempotency-key`. |

What an app sends is counted against its own budget, per project per second, not against the requests the rest of the project's calls may make.

## Consent

Analytics follows what the person allowed, kept by `pb.consent`: events, page views, `identify` and person properties go only with `analytics` granted; web vitals and request timings with `performance`, and without the person's id unless `analytics` is granted too. A key with neither the person's choice nor a starting value collects nothing. Every call that carries the person's data says the install it came from, `X-Palbase-Installation`. See [Consent](https://palbase.studio/docs/web/consent) for the keys, the starting values and a consent screen.

A user's analytics go when the user is deleted — everything under any id they went by, and the install's events from while no one was signed in. The project's analytics settings (`PUT /analytics/settings`, with the secret key) say how long events are kept: 90 days unless changed.

## People

The anonymous id an app had before its person signed up is that person once `identify` names it: their events before and after are one person's in funnels, retention and their timeline. Properties are set of a person with `POST /analytics/people` (`{ set?, set_once?, unset?, add? }`; the client's `pb.analytics.people.set`, `setOnce`, `unset` and `add`): a signed-in user's are theirs, an anonymous visitor's are their anonymous id's. Where an install came from (`$initial_utm_source`, `$initial_referrer` …) is set once of the person who installed.

The project's server reads them with the secret key: `GET /analytics/people?query=…` finds a person by any id they went by or their email, `GET /analytics/people/{person_id}` is their profile — with where they were last ([Where a person is](#where-a-person-is)) — and `GET /analytics/people/{person_id}/events` their timeline, newest first — what their apps sent, what their backend sent, and what Palbase did for them (a purchase, a push that reached their phone, a consent changed). `GET /analytics/catalog` lists every event a timeline can hold: Palbase's, with their fields, and the app's own as they arrived; `PUT /analytics/catalog/{name}` describes or hides one. Studio's **People** and **Event catalog** screens show the same.

## Where a person is

Each event is given the place of the address it came from — the user's own, because the browser sends it to the project directly: its `country` (ISO 3166-1 alpha-2), its `region` (a province or state, by its English name) and its `city` (a city or district). A person's profile says where their newest event that had a place came from; a summary breaks down by each of the three; an audience can pick people by them. Places come from DB-IP's IP to City Lite database: IP geolocation by [DB-IP](https://db-ip.com), CC BY 4.0. An address says where its network is, not the device: a phone on mobile data is often placed in its carrier's city.

## Audiences

An audience is the people a rule picks, among those behind the project's events. Its members are worked out when it is made or changed, then every minute, and each person who enters or leaves it from then on is told: `audience.entered` and `audience.exited` (`{ audience_id, audience_name, person_id, user_id }`) go into their timeline, to your webhook and to your backend's `@On` handlers. Its first members are not told they entered — the rule came to them, they did nothing — and neither is anyone when it is deleted. A push can go to an audience's members ([Notifications](https://palbase.studio/docs/backend/notifications#to-an-audience)).

The secret key's calls:

| Call | What it does |
|---|---|
| `POST /analytics/audiences` | Makes one: `{ name, description?, rule }`. A project keeps 100 at most. |
| `POST /analytics/audiences/preview` | Who a rule would pick now, without keeping it: how many, and the first twenty. A rule that takes longer than 20 seconds to work out answers `422 preview_too_slow`. |
| `GET /analytics/audiences`, `GET /analytics/audiences/{id}` | Each audience with its rule, how many are in it, when it was last worked out, and `state`: `ready`, or `pending` while a rule made or changed is worked out. |
| `PATCH /analytics/audiences/{id}` | Changes its name, description or rule. A changed rule is worked out anew, and, like a new one, tells no one at once. |
| `GET /analytics/audiences/{id}/members` | A page of its members: each one's person id, the user they signed in as, and the installs their events came from. |
| `DELETE /analytics/audiences/{id}` | Deletes it and its members. |

A rule is one to twenty conditions, every one of which holds (`match: "all"`, unless said) or at least one (`"any"`):

```json
{
  "match": "all",
  "conditions": [
    { "type": "event", "event": "purchase", "did": false, "within": { "amount": 7, "unit": "days" } },
    { "type": "event", "event": "app_opened", "did": true, "at_least": 3, "within": { "amount": 30, "unit": "days" } },
    { "type": "property", "key": "plan", "op": "neq", "value": "pro" },
    { "type": "place", "field": "city", "op": "in", "value": ["Istanbul", "Kadıköy"] },
    { "type": "platform", "op": "eq", "value": "ios" }
  ]
}
```

| Condition | Picks a person who… |
|---|---|
| `event` | did (`did: true`, `at_least` times, 1 unless said) or did not (`did: false`) an event in the last `within`: `amount` `minutes`, `hours` or `days`, a year at most. The event is an app's own or one of Palbase's (`purchases.purchase.completed`, `notification.opened` …). |
| `property` | has a property: `eq`, `neq`, `gt`, `gte`, `lt`, `lte` (numbers), `contains` (text, any case), `set`, `not_set`. |
| `place` | was last in a `country`, `region` or `city`: `eq`, `neq`, or `in` a list of up to 50. |
| `platform` | last sent from `ios`, `android` or `web`: `eq`, `neq` or `in`. |

`neq` holds for a person the value is not known of, as not `eq`. A user who is deleted leaves every audience and never comes back to one. Studio's **Analytics › Audiences** screen builds a rule a condition at a time, previews it, and lists each audience's people.

## From the CLI

The secret key's reads and the analytics settings are also commands of the CLI, for the environment it is pointed at (`-E <env>`):

```sh
palbase analytics:summary --window 7d
palbase analytics:events --name checkout_started --window 24h --limit 20
palbase analytics:settings:set retention_days=30
```

| Command | What it does |
|---|---|
| [`palbase analytics:summary`](https://palbase.studio/docs/cli/reference#palbase-analyticssummary) | What analytics counted over a window (`30m`, `24h`, `7d`): events, users, sessions, the top events. |
| [`palbase analytics:events`](https://palbase.studio/docs/cli/reference#palbase-analyticsevents) | The events recorded, newest first: by name, by user (their distinct id), over a window. |
| [`palbase analytics:settings:get`](https://palbase.studio/docs/cli/reference#palbase-analyticssettingsget), [`palbase analytics:settings:set`](https://palbase.studio/docs/cli/reference#palbase-analyticssettingsset) | How long events are kept (`retention_days`), the share of performance samples kept (`perf_sample_pct`), whether bodies are kept (`console_bodies`). A shorter retention removes what is older within minutes. |

## Related

- [Overview](https://palbase.studio/docs/web/overview) — the client's options, and calling the project from a browser
- [Consent](https://palbase.studio/docs/web/consent) — the keys analytics follows
- [Auth](https://palbase.studio/docs/web/auth) — the session whose token makes events the user's
- [Reading analytics](https://palbase.studio/docs/analytics/reading) — summaries, breakdowns, funnels and retention, in Studio and through the API
- [Server SDK](https://palbase.studio/docs/server/overview) — reading summaries, events and funnels with the secret key
