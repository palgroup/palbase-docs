> The full documentation index: https://palbase.studio/llms.txt

# Machines

A **machine** is your own code running on Palbase: a small sandboxed computer that runs one image of your project's, built from a branch of a GitHub repository, and answers HTTPS at an address of its own. A [`palbase/backend`](https://palbase.studio/docs/backend/overview) app is the usual thing to run on one, but a machine runs whatever its build makes — a Next.js site, a Go service, a worker that only serves a health check.

You never deploy a machine by hand. You [connect GitHub](https://palbase.studio/docs/machines/github), open the machine on a repository, a branch and a directory, and from then on **a push to that branch is the deploy**: it is built, rolled out beside the version that serves, and only then takes traffic. See [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds).

In Studio, machines live under **Backend › Machines**. Everything Studio does there is the machines module's API, which takes the project's secret key — every step on these pages names the call beside the click.

## What a machine is

| | |
|---|---|
| Name | Lowercase letters, digits and dashes, starting with a letter, 32 characters at most. `backend` when left out. Not `github`, `network` or `sizes`, which are the API's own paths. |
| Source | A repository, a branch and a directory of it ([Connecting GitHub](https://palbase.studio/docs/machines/github)) |
| Size | How much CPU and memory it has, and whether it sleeps (below) |
| Port | The TCP port it listens on, `8080` unless you say otherwise. It also finds it in `PORT`. |
| Copies | How many copies run while it is awake, 1 to 5 |
| Health check | A path that answers 2xx while it serves |
| Environment | Variables of your own, and the project secret set it starts with |
| Database | One of the project's [databases](https://palbase.studio/docs/machines/databases), or none |

A project has **5 machines at most**, and a machine's name is that machine's alone. Deleting a machine frees its name at once.

## Its address

The machine named `backend` is the project's backend and answers at the project's own name under the app domain; any other machine answers at its name and the project's ref:

```text
https://<ref>.app.palbase.studio          the machine named backend
https://<name>-<ref>.app.palbase.studio   any other machine
```

The `url` field of the machine (Studio shows it as **Address**, with an **Open** button) is the address to use. A request there is your customers' own: no API key is asked for and none is added. Who may call a route is the app's to decide — a `palbase/backend` app checks the caller's access token on every route that needs one ([Authentication](https://palbase.studio/docs/backend/authentication)).

What the platform answers itself, before your program sees anything:

| Answer | When | Safe to send again |
|---|---|---|
| `404 no_such_machine` | The host names no machine (deleted, or never made) | — |
| `429 quota_exceeded` | The project has used its machine time for the period; `Retry-After` says until when | at that time |
| `429 rate_limited` | The project's machines are over its requests-per-second limit; `Retry-After: 1` | yes |
| `503 machine_waking` | The machine was asleep and is still coming up; the request did not reach it; `Retry-After: 5` | yes |
| `503 machine_unavailable` | The machine could not be woken or reached; `Retry-After: 2` | yes |

Every request to the address is counted where it arrives, whatever program answers it: Studio's machine page draws the machine's **Requests** by status class and its **Response time** (median and p95) over the period chosen — the platform's answers above among them, as your customers saw them. Thirty days are kept; of a request, only its time, status and duration — nothing of who sent it or what it asked.

A path whose first segment is `_palbase` — `/_palbase/health`, `/_palbase/crons` — is never sent to a machine from outside. It is the platform's own way in (its health checks, its [crons and tasks](#crons-and-tasks)), and a request for it from the internet is answered `404`. A backend's contract is not asked of it: its build writes it, and the platform keeps it with the build.

## Sizes

| Size | CPU | Memory | Sleeps |
|---|---|---|---|
| `shared-256` | 0.2 vCPU | 256 MiB | yes |
| `shared-512` | 0.5 vCPU | 512 MiB | yes |
| `shared-1024` | 1 vCPU | 1024 MiB | yes |
| `dedicated-1x` | 1 vCPU of its own | 2048 MiB | never |
| `dedicated-2x` | 2 vCPU of its own | 4096 MiB | never |

A **shared** size has a fraction of a CPU as its ceiling and is **put to sleep when it is idle** — after 15 minutes without a request — and woken by the next request, which waits for it. A request that waits longer than the wake allows is answered `503 machine_waking` with `Retry-After`, and asking again is what brings the answer. A **dedicated** size has whole CPUs of its own and never sleeps.

Sleeping has consequences for code: a machine that sleeps runs nothing while it sleeps. A timer, an in-memory cache or a background loop stops with it, and a request that wakes it pays the start-up. Work that must happen on a schedule is a [cron](#crons-and-tasks), and work to be done once, now or later, a [task](#crons-and-tasks): the platform wakes the machine for either.

`shared-256` is the size every project may open. The others are sizes that are paid for: open to an environment on Pay as you go with credit ([Billing](https://palbase.studio/docs/getting-started/billing)); for another, opening a machine at one, or moving one to it, is refused with `403 size_not_available`; `palbase machines:sizes` lists the sizes the environment may open now ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)).

What a project's machines and databases reserve between them is held to the project's limit: a size or a number of copies that does not fit is refused with `409 machines_over_limit`.

## Copies

A machine runs **one copy** unless you give it more (`replicas`, **Copies** in Studio, 1 to 5). Each copy runs on a node of its own, a request goes to one of them, and a copy or a node that goes leaves the others serving. A node taken for maintenance or given back is emptied one copy at a time, and a machine of one copy is moved, not stopped: its copy starts on another node and takes requests before the old one stops. Every copy is of the machine's size and counts as one against the project's limits and its machine time.

What a copy keeps in its own memory or on its own disk, the others do not see — a session, a counter, a cache, a rate-limit window. A machine with more than one copy keeps those where every copy reaches them: its database, or the project's [cache](https://palbase.studio/docs/backend/cache). A long-lived connection (a WebSocket) stays with the copy that took it. The machine finds its number of copies in `PALBASE_REPLICAS`.

## The health check

A machine says it is well at a **health path**: a path on its port that answers 2xx while it serves. While it starts it has 90 seconds to answer there; once it serves, one that stops answering for about 6 seconds is started again.

Leave the path empty and the build says it: a directory whose `package.json` depends on `palbase/backend` is asked at `/_palbase/health`, which the framework answers `200` while it serves and `503` while it stops. A machine that says nowhere is asked only whether it listens on its port.

## Its environment

The platform starts every machine with these, whatever else it is given:

| Variable | What it holds |
|---|---|
| `PORT` | The port it listens on |
| `PALBASE_URL` | The project's address, `https://<ref>.palbase.studio` |
| `PALBASE_PROJECT_ID` | The project's id |
| `PALBASE_REPLICAS` | How many copies of it run |
| `PALBASE_PLATFORM_SECRET` | The key the platform signs its own calls to this machine with ([crons and tasks](#crons-and-tasks), a backend's contract) |
| `PALBASE_MACHINE` | The machine's own name: what its program puts its tasks on the queue of |
| `PALBASE_DB_URL` | Given a database: where it answers, as the application's login |
| `PALBASE_DB_CONNECTIONS` | Given a database: how many connections to it one copy may hold |

Besides those, a machine has two sources of its own:

- **Environment variables** — settings, not secrets: one `NAME=value` a line in Studio's **Edit settings**, `env` in the API. 100 variables and 64 KiB at most. `PORT` is refused there, and a name the platform sets gives way to the platform's.
- **Secrets** — the project keeps its secrets in two sets, `production` and `development`, and a machine names the set it starts with (**Secrets** in **Edit settings**: *No secrets*, *Production secrets* or *Development secrets*). Every secret of the set is in the machine's environment by its name; a name in `env` wins over the same secret. When a secret of the set changes, the machine rolls out with the new value beside the version that serves. Studio's **Environment › Variables** screen holds the set the environment's machines start with — see [Secrets](https://palbase.studio/docs/backend/secrets).

A `palbase/backend` app also needs `PALBASE_SECRET_KEY` — the project's secret key, which nothing puts there for you. Make a secret key in **Settings › API keys** (it is shown once), add it as the secret `PALBASE_SECRET_KEY`, and start the machine with that set. Name it in the app's `.env.example` and a build waits for it instead of rolling out an app that cannot start ([Builds](https://palbase.studio/docs/machines/builds)).

A change of size, port, copies, environment, secrets or health path rolls out beside the version that serves; a change of source is built first and rolls out once its build is up.

## Opening one

In Studio: **Backend › Machines › New machine**. The sheet asks for the repository (only those the connected accounts can push to), the branch, the directory, the name, the size, the port and, optionally, a database and whether this machine runs its migrations. The branch's head is built at once; the machine answers at its address once that build is up.

From a server, with the secret key, it is one call — the same module Studio calls:

```ts
// scripts/open-machine.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const { data: machine } = await palbase.machines.createMachine({
  body: {
    name: "backend",
    size: "shared-512",
    port: 8080,
    source: { repository: "acme/notes", branch: "main", path: "server" },
    secrets: "production",
  },
});

console.log(machine.state, machine.url); // building https://<ref>.app.palbase.studio
```

Inside a `palbase/backend` app the same client is `Palbase.machines`. The calls:

| Call | HTTP | What it does |
|---|---|---|
| `createMachine` | `POST /machines` | Opens a machine; its state is `building` |
| `listMachines` | `GET /machines` | The project's machines, by name |
| `getMachine` | `GET /machines/{name}` | What was asked for, and what runs |
| `updateMachine` | `PATCH /machines/{name}` | Changes its source, size, port, copies, env, secrets, health path or database |
| `deleteMachine` | `DELETE /machines/{name}` | Takes it away; its address stops answering |

A machine's `state` is `building` (no build of it runs yet), `starting`, `awake`, `asleep` or `failed` — `state_reason` says why it failed, or why a new version is not up. `version` counts the changes asked for and `running_version` the one that runs: they are equal once a change has rolled out.

## Crons and tasks

A machine that sleeps cannot keep a timer, and a timer in a machine with three copies fires three times. So the schedule — and the queue of work to be done once — are the platform's: the program **says** what crons and task types it has, and the platform **calls** it when a cron is due or a task's time comes — waking the machine for it, and calling one copy.

> **Note:** A backend on `palbase/backend` answers these calls itself: mark a provider with `@Cron` — see [Cron](https://palbase.studio/docs/backend/cron) — or `@Task` — see [Tasks](https://palbase.studio/docs/backend/tasks). Any other program answers the calls below.

The calls, all on the machine's own port, all signed with the key in `PALBASE_PLATFORM_SECRET`:

| Call | The program answers |
|---|---|
| `GET /_palbase/crons` | `{"crons": [{"name", "schedule", "time_zone", "timeout", "retry"}]}` — asked once each version comes up; `404` means it has none |
| `POST /_palbase/crons/<name>` | Runs the cron. The body is `{"cron", "run_id", "scheduled_at", "attempt"}`; the call is held open until it is done |
| `GET /_palbase/tasks` | `{"tasks": [{"name", "timeout", "retry", "concurrency"}]}` — asked with the crons; `404` means it has none |
| `POST /_palbase/tasks/<name>` | Does one attempt of a task. The body is `{"task", "id", "attempt", "payload", "created_at"}`; the call is held open until it is done |

A cron's `schedule` is five cron fields — minute, hour, day of month, month, day of week — on the clocks of `time_zone` (an IANA name; UTC when left out). `timeout` is the seconds an attempt has (30 when left out, 900 at most) and `retry` the attempts a run has after its first fails (5 when left out, 10 at most). A task type's `timeout` is 60 when left out (900 at most), its `retry` 5 (20 at most) and its `concurrency` — how many of its tasks are with the machine at once — 5 (50 at most). A name is letters, digits, `.`, `_` and `-`, 64 characters at most; a machine has 50 crons and 50 task types at most. What the platform cannot run (a bad schedule or zone, a value out of range) is left out of the list.

A `2xx` answer is done. For a cron, `404` is "no such cron in this version", and the run is skipped; anything else — or no answer within the timeout — is a failed attempt, made again after 10 s, 20 s, … up to five minutes apart. One run of a cron runs at a time: a cron due again while its last run is still going is **skipped**, not queued. For a task, `422` is "this task can never be done" — it fails at once — and anything else that is not `2xx` is a failed attempt, made again after 10 s, 20 s, … up to an hour apart.

Every call carries `Palbase-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(key, "<t>.<body>")>` — a webhook's signature, with the machine's key. `verifySignature` from `palbase/server` checks it:

```ts
// crons/server.ts
import { createServer } from "node:http";
import { verifySignature, WebhookSignatureError } from "palbase/server";

const key = process.env.PALBASE_PLATFORM_SECRET ?? "";

const crons = [{ name: "nightly-digest", schedule: "0 3 * * *", time_zone: "Europe/Istanbul", timeout: 120, retry: 3 }];

async function nightlyDigest(runId: string): Promise<void> {
  console.log(JSON.stringify({ msg: "digest", run_id: runId }));
}

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const path = new URL(req.url ?? "/", "http://machine").pathname;

  if (path !== "/_palbase/crons" && !path.startsWith("/_palbase/crons/")) {
    res.writeHead(200).end("ok");
    return;
  }
  try {
    // A GET is signed over "<t>." and an empty body; a POST over its bytes as they arrived.
    const signature = req.headers["palbase-signature"];
    await verifySignature({ secret: key, signature: Array.isArray(signature) ? signature[0] : signature, body });
  } catch (e) {
    res.writeHead(e instanceof WebhookSignatureError ? 401 : 500).end();
    return;
  }

  if (req.method === "GET" && path === "/_palbase/crons") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ crons }));
    return;
  }
  if (req.method === "POST" && path === "/_palbase/crons/nightly-digest") {
    const run = JSON.parse(body.toString("utf8")) as { run_id: string; attempt: number };
    await nightlyDigest(run.run_id);
    res.writeHead(204).end();
    return;
  }
  res.writeHead(404).end();
}).listen(Number(process.env.PORT ?? 8080));
```

The same `run_id` comes with every attempt of one run, and the same `id` with every attempt of one task: key the work on it, and an attempt made again after a lost answer does not do it twice.

What the platform keeps of them, with the secret key:

| Call | HTTP | What it answers |
|---|---|---|
| `listCrons` | `GET /machines/{name}/crons` | The crons the running version said, each with its zone, when it is next due, whether it is paused, and its latest run |
| `listCronRuns` | `GET /machines/{name}/crons/{cron}/runs` | A cron's latest 50 runs, newest first: `running`, `waiting`, `succeeded`, `failed` or `skipped`, with the attempts each took, why one failed, and whether it was asked to run now. Runs are kept 7 days. |
| `runCron` | `POST /machines/{name}/crons/{cron}/run` | Runs it now, apart from its schedule (`409` while a run of it is not over) |
| `pauseCron` / `resumeCron` | `POST /machines/{name}/crons/{cron}/pause`, `…/resume` | Paused, it is not run until resumed, whatever version comes up; resumed, it is due at its next time |
| `enqueueTask` | `POST /machines/{name}/tasks` | Puts a task — `{"task", "payload", "delay" \| "run_at", "key"}` — of a type the running version declares |
| `listTasks` | `GET /machines/{name}/tasks` | Its tasks, newest first, of one `state` and `task` type or all; a task that succeeded or was cancelled is kept a day, one that failed 30 |
| `getTask` | `GET /machines/{name}/tasks/{task}` | One task, with its payload |
| `retryTask` / `cancelTask` | `POST /machines/{name}/tasks/{task}/retry`, `…/cancel` | A failed task back on the queue, its attempts counted on; a waiting one taken off it |
| `listTaskTypes` | `GET /machines/{name}/task-types` | The task types the running version declared, with what each one's queue holds |

## Reaching the internet

A machine reaches the internet as any server does — a payment provider's API, a webhook of yours, a package registry — on any port but 25: send mail through a provider's API or its submission port (587). It reaches nothing of the platform's own network: not another project's machine and not the platform's services, except at the platform's public address, as any client of it does.

What a project's machines send to the internet is counted, in bytes, as **Machine internet traffic** on the project's usage page (`machines.egress`). What they send to the platform at its public address, what goes to their databases, and what they take from the internet is not. What the project's answers send its clients — its machines' answers, its modules' (files storage hands out among them) — is counted as **Response traffic** (`edge.egress`), in bytes on the wire.

A free project sends 5 GB a month at full speed: its machines' internet traffic and its response traffic together. Past it, until the month ends (UTC), it is slowed, never stopped — every byte still goes:
- its machines send to the internet at about 256 kbit/s between them — each copy of a machine its share; requests still go out, connections open at once and downloads keep going; what they send takes longer;
- its machines' answers to their clients go at about 256 kbit/s between them, as do the files its storage hands out (about 256 kbit/s for the project); its other answers — the API's JSON, realtime — are counted but not slowed.

Each machine's log says so when the slowing begins (`palbase: this project has sent 5 GB …`). What its machines send the project's databases and the platform at its public address is never slowed, DNS questions to the machine's resolvers keep a pace of their own, and a project that may use paid sizes is not slowed at all.

### Its outbound range

Every machine reaches the internet from one small range of addresses, the platform's, written as a CIDR (such as `203.0.113.8/29`). Studio shows it on the **Machines** page, under **Outbound address**. Add the whole range to a provider's allowlist when the provider — a bank, a payment or an SMS provider — lets in only the addresses it knows: a connection may leave from any address in it.

**The range is shared by every Palbase machine**, of every project. An allowlist of it lets in all of Palbase, not your project alone, so a provider must still know you by your own credentials, such as an API key. The range stays the same as the platform changes; a change of it is announced before it is made.

| Call | HTTP | What it answers |
|---|---|---|
| `getMachineNetwork` | `GET /machines/network` | `outbound_ips`: where machines reach the internet from, as ranges (CIDR); `shared`: `true`, every project's machines leave from them |

## Limits

| | |
|---|---|
| Machines per project | 5 |
| Copies per machine | 1 to 5 |
| What machines and databases reserve between them | 2 vCPU and 4096 MiB a project (a shared size reserves a quarter of its CPU ceiling, a dedicated one all of it; memory is reserved whole) |
| Builds | 50 a day (UTC) per project; one build at a time; 20 minutes at most each |
| Idle before a shared size sleeps | 15 minutes |
| Environment variables | 100, 64 KiB in all |
| Logs kept | 7 days, up to 1,200 lines a minute per machine |
| Traffic, free project | 5 GB a month at full speed, machine internet traffic and response traffic together; then machines' traffic and answers, and storage's files, at about 256 kbit/s until the month ends (UTC); see [Reaching the internet](#reaching-the-internet) |
| Connections to the internet open at once | Per copy of a machine, by its memory: 4,096 for 256 MiB, twice that for each doubling — 8,192 (`shared-512`), 16,384 (`shared-1024`), 32,768 (`dedicated-1x` and larger). One more is refused at once (`connection refused` / a reset). Connections to the platform, to your databases and DNS questions to the machine's resolvers are not counted. The cap keeps one machine from taking a server's whole connection table from the machines beside it: close connections you no longer use, and pool those you reuse |

## Related

- [Connecting GitHub](https://palbase.studio/docs/machines/github) — the repository, branch and directory a machine is built from
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — what a push does, and how to go back
- [Databases](https://palbase.studio/docs/machines/databases) — Postgres of your own, and giving one to a machine
- [Backend SDK](https://palbase.studio/docs/backend/overview) — the framework most machines run
- [Secrets](https://palbase.studio/docs/backend/secrets) — the secret sets a machine starts with
- [Server SDK](https://palbase.studio/docs/server/overview) — `createServer`, the client every call on this page goes through
