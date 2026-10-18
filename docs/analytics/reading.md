> The full documentation index: https://palbase.studio/llms.txt

# Reading Analytics

What a project's analytics kept is read in two places: Studio's **Analytics** screens, for the people of the organization, and the analytics module's read calls, with the project's secret key, for a server, a report or an agent. Both read the same rows, and neither reads past the project's retention ([How long it is kept](https://palbase.studio/docs/analytics/overview#how-long-it-is-kept)).

## In Studio

Each screen reads the environment it is opened in, over the period chosen at its top: the last 24 hours, 7, 30 or 90 days.

| Screen | What it shows |
|---|---|
| **Analytics** | The period's events, people, page views and events per person, its activity over time, then its most viewed pages and where their views came from, its most recorded events, its events by platform, OS version and app version, and by country |
| **Events** | How often the events you choose were recorded, hour by hour or day by day, and the latest events as they arrive, each with its person, session, time and properties |
| **People** | A person found by any id they went by or their email: every id, what they allowed, their properties and their whole timeline |
| **Audiences** | The people a rule picks, built a condition at a time, previewed before it is kept ([Audiences](https://palbase.studio/docs/web/analytics#audiences)) |
| **Event catalog** | Every event a timeline can hold: the platform's with their fields, and those your apps and backend sent in the last 30 days, each with a description your team writes |
| **Funnels** | Events in order, and how many people get from the first to the last within the time to convert, and where they leave |
| **Retention** | People by when they first did one event, and how many came back to do another, period by period |
| **Network** | Every request your apps and backend reported ([Performance](https://palbase.studio/docs/analytics/performance#requests)) |
| **Debug history** | What a device logged and sent before something went wrong ([Performance](https://palbase.studio/docs/analytics/performance#debug-history)) |

A member of the organization reads every screen; changing an audience or the catalog's descriptions is an admin's ([Organizations](https://palbase.studio/docs/getting-started/organizations#roles)).

## From a server

```ts
// server/weekly-report.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });
const WEEK = 7 * 24 * 3600;

const summary = await palbase.analytics.getSummary({ query: { window_seconds: WEEK } });
console.log(`${summary.data.total} events by ${summary.data.unique_users} people`);
for (const e of summary.data.events.slice(0, 5)) console.log(e.name, e.count);

const countries = await palbase.analytics.getEventBreakdown({ query: { by: "country", event: "purchase", window_seconds: WEEK, limit: 5 } });
for (const row of countries.data.rows) console.log(row.value || "unknown", row.events, row.users);

const funnel = await palbase.analytics.runFunnel({
  body: { steps: ["signup_started", "signup_completed", "checkout_started"], window_seconds: WEEK, conversion_window_seconds: 24 * 3600 },
});
for (const step of funnel.data.steps) console.log(step.step, step.name, step.users, step.conversion_rate);

const retention = await palbase.analytics.runRetention({
  body: { first_event: "signup_completed", return_event: "app_opened", period: "week", periods: 8, window_seconds: 8 * WEEK },
});
for (const row of retention.data.rows) console.log(row.cohort_start, row.cohort_size, row.returns);
```

In a `palbase/backend` app the same calls are `Palbase.analytics`. A publishable key is refused every read (`403`): an app sends, and only the project's server reads.

Every read takes `window_seconds`, how far back to look: an hour unless said, 400 days at most, and never past the project's retention. The answers that page say `next_cursor`, which the next call passes as `cursor`; the last page has none.

### Summary

`GET /analytics/summary` (`getSummary`): the window's events — `total`, by how many distinct ids (`unique_users`) — and its 50 most frequent names with their `count`. `window_seconds` in the answer is the window read, after the retention bounded it.

### Events

| Call | HTTP | Answers |
|---|---|---|
| `listEvents` | `GET /analytics/events` | A page of the window's events, newest first, each with its `event_id`, `name`, `distinct_id`, `session_id`, `timestamp` (corrected for the device's clock) and `properties`. `name`, `distinct_id` and `session_id` narrow it; `limit` is 100 unless said, 500 at most |
| `getEventTimeline` | `GET /analytics/events/timeline` | The window's events bucket by bucket, oldest first: `events` and `users` in each, `bucket_ms` its start (unix milliseconds, UTC). `bucket` is `hour` or `day`: hours for two days or less, days beyond, unless said; `name` narrows it to one event. A bucket with no event is not a row |
| `listEventNames` | `GET /analytics/event-names` | Every name the window's events had, 1,000 at most |

### Breakdown

`GET /analytics/breakdown` (`getEventBreakdown`) splits the window's events by one dimension, the most frequent value first: for each `value`, how many `events` had it and by how many distinct ids (`users`).

| `by` | Splits by |
|---|---|
| `platform`, `app_version`, `os_version` | What the app said of itself |
| `country`, `region`, `city` | Where the event came from: an ISO 3166-1 alpha-2 country, a province or state, a city or district |
| `event` | The event's name |
| `property:<key>` | One of the events' properties: letters, digits and `_ . $ -`, 64 at most |

An absent or empty value is `""`; a property that is not a string is its JSON (a number, `true`, an array). `event` narrows it to one event; `limit` is 10 unless said, 100 at most.

### Funnels

`POST /analytics/funnel` (`runFunnel`) counts how many people took each step, in order, each within `conversion_window_seconds` of their first step.

| Field | What it says | Default |
|---|---|---|
| `steps` | 2 to 10 event names, in order | — |
| `window_seconds` | How far back the first step may be | an hour |
| `conversion_window_seconds` | How long after the first step the last may be | an hour |
| `strict_order` | Any other of the funnel's events between two steps breaks the chain | `false` |

Each step answers its place (`step`, from 1), its `name`, the `users` who reached it and its `conversion_rate`: its share of the first step's. A person's anonymous events count with their signed-in ones once an identify joined them.

### Retention

`POST /analytics/retention` (`runRetention`) puts people in a cohort by the period in which they first did `first_event`, and counts how many of them did `return_event` in each period after.

| Field | What it says | Default |
|---|---|---|
| `first_event` | The event that puts a person in a cohort | — |
| `return_event` | The event that counts as coming back | — |
| `period` | `day`, `week` or `month` | `week` |
| `periods` | Periods followed after the cohort, 1 to 31 | 8 |
| `window_seconds` | How far back the cohorts start | 30 days |

The answer's `rows` are the cohorts, newest first: `cohort_start`, `cohort_size`, and `returns`, where `returns[0]` is the cohort's size and `returns[k]` the people back `k` periods later. `observable` says how many of the periods after have fully passed: a period still under way is not counted, so a young cohort's later columns are not zeros but not yet.

### People, the catalog and audiences

`GET /analytics/people`, `GET /analytics/people/{person_id}` and `GET /analytics/people/{person_id}/events` find a person, read what is known of them and their timeline; `GET /analytics/catalog` lists the events a timeline can hold; the audience calls make and read audiences. See [Web Analytics](https://palbase.studio/docs/web/analytics#people).

## From the CLI

```sh
palbase analytics:summary --window 7d
palbase analytics:events --name purchase --window 24h --limit 20
palbase analytics:events --user 3f2c9a1e-…    # one person's, newest first
```

`--window` takes `30m`, `24h`, `7d`; both commands read the environment chosen with `palbase use` or `-E` ([CLI reference](https://palbase.studio/docs/cli/reference#analytics)).

## Errors

| Status | When |
|---|---|
| `400` | A field breaks its rule: a funnel of one step, a `by` that is not one of the dimensions, a `periods` past 31 |
| `403` | Not the project's secret key |
| `429` | Over the project's requests per second; `Retry-After` says when |
| `503` | The read could not be answered now; asking again is safe |

## Related

- [Analytics](https://palbase.studio/docs/analytics/overview) — what is kept, whose it is, and for how long
- [Performance](https://palbase.studio/docs/analytics/performance) — timings, requests and debug history
- [Web Analytics](https://palbase.studio/docs/web/analytics) — sending, people and audiences
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals, retries and paging
