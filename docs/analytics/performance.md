> The full documentation index: https://palbase.studio/llms.txt

# Performance

Beside its events, a project's analytics keeps how its apps run on real devices and browsers: **performance samples** (how long an app took to start, a page's web vitals, a request's time), **request traces** (each request as the app or your backend saw it), and **console history** (what a device logged and sent just before something went wrong). Studio shows them on three screens: **Performance**, **Analytics › Network** and **Analytics › Debug history**. They are kept, read and limited as events are ([Analytics](https://palbase.studio/docs/analytics/overview)), with console history kept for a time of its own.

## Performance samples

A sample is one number: a duration in milliseconds, or a web vital's own unit.

| Type | What it measures | Sent by |
|---|---|---|
| `web_vital` | A page's LCP, INP, CLS, FCP and TTFB | The web SDK, with `performance` allowed ([Web Analytics](https://palbase.studio/docs/web/analytics)) |
| `network` | One request the app made: its method and route, its time | The web SDK (each `fetch`), the mobile SDKs |
| `app_start` | How long a mobile app took to open | The mobile SDKs |
| `screen` | How long a screen took | The mobile SDKs |
| `custom` | Anything your code measures | The mobile SDKs |

A network sample's address is kept as its route: no query, and an id in the path is `:id`. Samples go without the person's id unless `analytics` is allowed too.

`perf_sample_pct` keeps a share of the samples, 100 unless changed. The SDKs read it (`GET /analytics/perf/config`, answered `304` while it has not changed) and sample at it before they send, and the module samples again, so a share of 10 sends and keeps about one sample in ten. A send answers how many samples were kept and how many dropped (`{ accepted, dropped }`): a bad shape, a time more than 7 days off, or one not sampled in is dropped, and that is not an error.

### In Studio

**Performance** has a tab for each type: **Network**, **App start**, **Web vitals** and **Custom**. Each lists the type's samples by name with their median (p50), p95, p99 and how many there were; a name chosen draws its percentiles over the period. A web vital is banded as Google bands it — LCP is good at 2.5 s or less and poor past 4 s, INP at 200 ms and 500 ms, CLS at 0.1 and 0.25, FCP at 1.8 s and 3 s, TTFB at 800 ms and 1.8 s — and the screen breaks the slowest 5% down by OS and by app version, and compares the same sample with another environment of the project.

### From a server

| Call | HTTP | Answers |
|---|---|---|
| `listPerfGroups` | `GET /analytics/perf/client` | The window's samples grouped by type and name and one more dimension (`group_by`: `name`, `app_version`, `platform` or `os_version`): `p50`, `p75`, `p95`, `p99` and `sample_count`, the most sampled first. `trace_type` and `name` narrow it |
| `getPerfTimeline` | `GET /analytics/perf/timeline` | One type's samples (`trace_type`, required) bucket by bucket, oldest first: `p50`, `p75`, `p95` and `sample_count`. A percentile is always of one type: an app start's milliseconds and a CLS score are never added together |

```ts
// server/vitals.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const lcp = await palbase.analytics.listPerfGroups({ query: { trace_type: "web_vital", name: "LCP", group_by: "app_version", window_seconds: 7 * 86400 } });
for (const row of lcp.data.rows) console.log(row.key, Math.round(row.p75), "ms at p75 over", row.sample_count, "samples");
```

## Requests

A request trace is one request as one side saw it: its `endpoint`, `method`, `status`, `duration_ms`, its error when it failed, and the request id the platform gave it. `source` says whose report it is:

- **`client`**: the app's. The mobile SDKs report each request they make; the web SDK's network samples are read here too, in the same shape.
- **`backend`**: your backend's. A `palbase/backend` app reports every request it answers, with its route as declared (`/orders/{id}`) and the signed-in caller, in batches behind the answers ([Analytics](https://palbase.studio/docs/analytics/overview#sending-from-a-server)).

The app's report and the backend's of one request share its request id, so the two sides of a request are read together, and the difference between them is often where the time went.

**Analytics › Network** lists the requests newest first, filtered by status, method, endpoint, latency, source and user (**Errors only**, **Server errors** and **Slow >100ms** are ready-made), with the period's requests, its share of server and client errors, its median and its slowest 5%, and the requests by status and latency over time. A request opens with its hops, every report of it from either side; a session opens as a waterfall of its requests in order. **Live on** follows new requests as they arrive.

| Call | HTTP | Answers |
|---|---|---|
| `listTraces` | `GET /analytics/traces` | A page of the window's requests, newest first. `endpoint`, `source`, `method`, `status`, `status_class` (`2xx` … `5xx`), `duration_min_ms`, `duration_max_ms`, `distinct_id` and `request_id` narrow it |
| `getTraceSummary` | `GET /analytics/traces/summary` | The whole window's requests with the same filters, not a page's: counts by status class, `error_rate`, and the median, p95 and p99 durations |
| `getTraceTimeline` | `GET /analytics/traces/timeline` | The summary bucket by bucket, an hour's or a day's, oldest first |
| `getTraceHops` | `GET /analytics/traces/by-trace` | Every report of one request, by its trace id or its request id, in order; 500 at most |
| `listSessionTraces` | `GET /analytics/traces/session` | A page of one session's requests, in the order they happened |

These are what your apps and backend reported. Every request to the project's address, as the platform answered it, is in [Logs](https://palbase.studio/docs/getting-started/logs), and a machine's requests over time are on its page ([Machines](https://palbase.studio/docs/machines/overview)).

## Debug history

When something goes wrong on a device — an error, a crash, or the person reporting a problem — the mobile SDKs send what the app logged and the network exchanges it made just before: up to 500 records, 64 KiB each, 2 MiB in all, kept whole or not at all. Nothing is sampled away. **Analytics › Debug history** shows the records newest first, logs and requests in one stream, filtered by person and session; each says what made the device send it (`error`, `crash` or `user_report`).

Request and response **bodies** are kept only when the project says so (`console_bodies`, off unless changed): otherwise they are removed before anything is kept, and the record says they were. Console history is kept 14 days unless changed (`console_retention_days`, 1 to 30).

```sh
palbase analytics:settings:set console_bodies=true console_retention_days=7
```

Keep bodies only when you need them: a request's body can carry what a person typed, a token, a card's last digits.

| Call | HTTP | Answers |
|---|---|---|
| `listConsoleRecords` | `GET /analytics/console-records` | A page of the window's records, newest first, each as the SDK wrote it (JSON), and `retention_days`. `user` and `session` narrow it |
| `getConsoleConfig` | `GET /analytics/console-breadcrumbs/config` | Whether bodies are kept now (`bodies_enabled`) and why (`enabled`, `disabled`, or `unavailable`: the setting could not be read, and bodies are not kept), and an upload's limits |

## Related

- [Analytics](https://palbase.studio/docs/analytics/overview) — what is kept, for how long, and the settings
- [Reading Analytics](https://palbase.studio/docs/analytics/reading) — events, funnels and retention
- [Web Analytics](https://palbase.studio/docs/web/analytics) — the browser's own measures
- [Logs](https://palbase.studio/docs/getting-started/logs) — every request to the project's address
