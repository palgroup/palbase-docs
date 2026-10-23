> The full documentation index: https://palbase.studio/llms.txt

# Usage & Limits

Every environment's use is metered by the calendar month (UTC): what its modules did, what its machines and databases ran, and what it sent. Studio shows it on the project's **Settings › Usage**, environment by environment.

An environment is held to limits of three kinds, and each one says so in its answer:

- **Rates**, per second: a call over one is refused for that second (`429` with `Retry-After: 1`).
- **Limits on the month**: a limit set on one of the environment's metrics refuses that use, or only counts it, until the month ends.
- **What a free project gets**: its traffic is slowed past 5 GB, and a free database sleeps past its 400 hours. Neither stops the project or loses its data.

## Where usage is shown

**Project › Settings › Usage** shows one environment at a time (choose it at the top when the project has more than one) over the last 3, 6 or 12 months:

- this month's API requests, monthly active users, stored data and machine hours, each beside its months;
- **Limits**: each limit set on the environment, with what this month has used against it, and **Blocked** once a limit that refuses is reached;
- a chart per month of requests, active users, notifications sent by channel, stored data, download traffic, realtime messages, analytics events, machine hours, machine internet traffic, response traffic and database hours by size;
- **Every metered item**: every metric the environment used, this month and the month before.

Every member of the organization reads it ([Organizations](https://palbase.studio/docs/getting-started/organizations#roles)). The organization's owners are also mailed when a free project has sent 80% of its month's traffic and when it has sent all of it, and when a free database has been awake 80% of its hours and all of them.

## What is metered

| Metric | What counts |
|---|---|
| `requests` | **API requests**: each request to the environment's address that a module answers. Not among them: the cache's calls, the stores' reports to purchases (`/purchases/webhooks/…`), and the files the platform moves for a module's own work, such as an AI workspace's |
| `auth.mau` | **Monthly active users**: the users who signed in or kept a session alive in the month |
| `notify.email`, `notify.push`, `notify.sms`, `notify.whatsapp` | **Email**, **Push**, **SMS** and **WhatsApp** sent: an email through any sender (those through Palbase's shared sender are also `notify.email.shared`), a push delivered to a user on any of their devices, a text or a verification code, a WhatsApp message |
| `storage.bytes` | **Stored data**: the objects and their renditions, the month's largest |
| `storage.egress` | **Download traffic**: what storage sent, a part of response traffic |
| `storage.operations` | The requests storage served |
| `storage.transforms` | **Image transformations**: a picture made over from an original (resized, cropped, re-encoded); one answered from what was made before is not one |
| `cache.bytes`, `cache.egress` | **Cache memory**, the month's largest, and **Cache reads**, a part of response traffic ([Cache](https://palbase.studio/docs/backend/cache)) |
| `realtime.messages` | **Realtime messages**: each one delivered — a broadcast to ten subscribers is ten |
| `realtime.connections` | Realtime connections open at once, the month's largest |
| `flags.reads` | The flag reads clients made, answered in full or not modified |
| `analytics.events` | **Analytics events**: captures, identifies, aliases, screens and page views (setting a person's properties is not counted) |
| `analytics.perf`, `analytics.traces`, `analytics.console` | Performance samples kept, request traces taken, console records kept ([Analytics](https://palbase.studio/docs/analytics/overview)) |
| `machines.seconds` | **Machine hours**: how long the machines were awake, each copy counted; `machines.seconds.<size>` the same by size |
| `machines.egress` | **Machine internet traffic**: what the machines sent to the internet |
| `edge.egress` | **Response traffic**: what the environment's answers sent its clients, its modules' and its machines' alike |
| `machines.builds.seconds` | **Build hours** |
| `machines.images.bytes`, `machines.logs.bytes` | **Machine images** kept, the month's largest, and **Machine logs** kept |
| `databases.seconds.<size>` | **Database hours**: how long the databases of each size were awake |
| `databases.bytes`, `databases.backups` | What the databases hold, and what their backups hold, the month's largest |
| `databases.traffic` | What the databases read from and wrote to their disks |
| `databases.egress` | **Database client traffic**: what the databases sent clients that connect to them over their own addresses (`psql`, a backend on your computer) |
| `ai.tokens.<provider>.<model>.<kind>` | **AI tokens** with Palbase's provider keys, by model and kind: `input`, `image_input`, `output`, `cache_read`, `cache_write`. A model used with the project's own provider key is the provider's to count |
| `ai.images.<provider>.<model>` | **AI images** made, by model |
| `ai.machines.seconds`, `ai.voice.seconds`, `ai.web_search.calls` | **AI workspace hours**, **AI voice hours** and **AI web searches** |

A metric that is "the month's largest" is a level, not a sum: what the environment held at its most during the month.

## Rates

| What | How much | Past it |
|---|---|---|
| The environment's requests | 200 a second, unless Palbase set another | `429 rate_limited`, `Retry-After: 1` |
| What apps send to analytics | 1,000 events, samples, traces and records a second, counted apart from the requests | `429 rate_limited` |
| The cache's calls | As many a second as the requests, counted apart from them; 8 MiB read and 2 MiB written a second | `429 rate_limited` |
| Your backend's own routes | What each route's `rateLimit` says ([Controllers & Routing](https://palbase.studio/docs/backend/controllers)) | `429 too_many_requests` |

Realtime has rates of its own, which a project may lower ([Web Realtime](https://palbase.studio/docs/web/realtime)), and so do sign-ins and the messages a project sends. The SDKs send a refused call again on their own, waiting what `Retry-After` asks, when it is a read or a write that cannot be done twice ([Server SDK](https://palbase.studio/docs/server/overview#retries)).

## Limits on the month

A limit on the month names one metric of one environment and how much of it the month may use, and is one of two kinds: one that **refuses** past it, and one that only **counts**. Palbase sets them; the **Limits** panel lists those set on the environment. A month's use starts again at 00:00 UTC on its first day.

When a limit that refuses is reached, that use is refused until the month ends, and the refusal's `Retry-After` is the seconds until then:

| Limit on | What is refused |
|---|---|
| API requests | Every request to the environment's address but those not counted (above): `429 quota_exceeded` |
| Monthly active users | New sign-ups: `403 signups_closed`. Sign-ins go on: the people already counted keep their accounts |
| Email, push, SMS or WhatsApp | Sending on that channel: `429 quota_exceeded` |
| Stored data | Writing to storage: `429 quota_exceeded`. Reads go on |
| Realtime messages or connections | A new socket: `429 quota_exceeded`, with `Retry-After: 3600` (an hour, not the month's end); and a server's broadcast: `429 quota_exceeded` |
| Flag reads | Reading the flags: `429 quota_exceeded` |
| Analytics events, samples, traces or console records | Sending that kind: `429 quota_exceeded` |
| Machine hours | The machines: they are stopped, dedicated sizes too, and a request to one, a new machine, a cron or a task is `429 quota_exceeded` |

A limit that counts refuses nothing: the use goes on and is metered.

## What a free project gets

A project is free while its organization has no payment account, or has one with no balance left, and while it is pulled to the Free plan or at its monthly cap ([Billing](https://palbase.studio/docs/getting-started/billing)).

- **Sizes.** Its machines are of the `shared-256` size, the one free machine size, and it has one database at most, of the `free` size: a project holds one database of a free size at a time ([Databases](https://palbase.studio/docs/machines/databases#sizes)). Every other size is paid for: opening a machine or a database of one, or moving one to it, is `403 size_not_available`. `palbase machines:sizes` and `palbase databases:sizes` list the sizes and which of them the environment may open now ([Machines](https://palbase.studio/docs/machines/overview#sizes)).
- **Traffic.** It sends 5 GB a month at full speed: its machines' internet traffic and its response traffic together. Past it, until the month ends, its machines' traffic and answers and the files its storage hands out go at about 256 kbit/s; nothing is stopped, and the API's other answers are not slowed. A slowed project's downloads are paced, and one more than it may have under way at once is `429 rate_limited` with `Retry-After`. See [Reaching the internet](https://palbase.studio/docs/machines/overview#reaching-the-internet).
- **A free database** is awake 400 hours a month at most. Past them it sleeps until the month ends, refusing connections, with its data kept; from then its next connection wakes it.
- **AI.** $1.00 of Palbase's models a month, at the provider's price and 10%. Past it, until the month ends, a call to them is `402 ai_payment_required`; a call under the project's own provider key goes on ([AI](https://palbase.studio/docs/backend/ai#what-it-costs)).

A project whose organization pays is never slowed for its traffic, and its machines and databases may be of any size; a database of the `free` size keeps its 400 hours whoever holds it. What it uses past the organization's free quotas is charged from the balance ([Billing](https://palbase.studio/docs/getting-started/billing)).

## Each module's own limits

| Module | Limits |
|---|---|
| Storage | 5 GiB an object unless the bucket says less; a signed URL lives 7 days at most ([Storage](https://palbase.studio/docs/backend/storage)) |
| Cache | 25 MiB of entries, the ones nearest their end dropped to make room; 512 KiB a value ([Cache](https://palbase.studio/docs/backend/cache)) |
| Tasks | 100,000 tasks not yet done, or 256 MiB of what they carry ([Tasks](https://palbase.studio/docs/backend/tasks)) |
| Machines | 5 machines, 1 to 5 copies each, 50 builds a day, logs kept 7 days ([Machines](https://palbase.studio/docs/machines/overview#limits)) |
| Databases | 3 a project, one of them of a free size at a time; a database full to its size's storage turns read-only ([Databases](https://palbase.studio/docs/machines/databases#sizes)) |
| Analytics | Events kept 90 days unless changed, 365 at most ([Analytics](https://palbase.studio/docs/analytics/overview#how-long-it-is-kept)) |

## Related

- [Billing](https://palbase.studio/docs/getting-started/billing) — the plans, the balance and what is charged
- [Logs](https://palbase.studio/docs/getting-started/logs) — every request, with its status
- [Organizations](https://palbase.studio/docs/getting-started/organizations) — who sees the usage page, and who is mailed
- [Machines](https://palbase.studio/docs/machines/overview) — sizes, sleep, and traffic to the internet
- [Databases](https://palbase.studio/docs/machines/databases) — sizes, sleep and storage
