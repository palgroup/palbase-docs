> The full documentation index: https://palbase.studio/llms.txt

# Builds, Logs & Rollback

Code reaches a machine one way: **a push to its branch**. The push is built into an image, the image is rolled out **beside the version that serves**, and traffic moves to it once it is up — so a request never meets a gap, and a version that does not come up never takes one. There is no deploy command, and nothing to run on your machine but `git push`.

This page follows one push from GitHub to traffic, then covers what you read on the way — the build's log, the machine's own lines — and how to go back.

## What a push does

```text
git push origin main
  └─ a build per machine whose directory the push changed   (Connecting GitHub)
       queued → building
         ├─ failed              the build's log says why
         ├─ waiting_config      .env.example names a variable the machine lacks
         └─ the image is ready
              └─ (a database's migrations, when this machine runs them: start)
                   ├─ testing           its tests run against the new version (test_command)
                   │    └─ failed       a test failed: the reason names it; it never takes traffic,
                   │                    the old one keeps serving, the migration is taken back
                   └─ the new version starts beside the old one
                        ├─ it answers its health check → traffic moves; the old one stops
                        │    └─ (migrations: complete, once nothing of the old version is left)
                        └─ it does not come up → the old one keeps serving
```

Each commit of the branch is built once for a machine, however often it is pushed. A project builds one thing at a time; a newer commit that arrives while an older one waits takes its place, and the older build ends `cancelled` (*Left behind* on its GitHub check).

A machine that deploys only after its commit's checks pass (`deploy_after_checks`, as Render's *After CI Checks Pass*) lets every push wait for its own checks, side by side. The first whose checks pass is built and leaves the older ones behind, so the machine only ever moves to a newer commit: an older push whose checks pass later is not built. A push whose checks fail ends `skipped`; the others keep waiting.

### Tests before it takes traffic

A machine that names a **test command** (`test_command`, as Render's pre-deploy command or a CI's test step) has every new build tested before it takes traffic — the build is `testing` meanwhile. Once its database's migration has started, the new version comes up beside the one that serves, **as it will run**: its env, its secrets, its database. The build's own image then runs the command in a shell (`bun test`, `npm test`) against it:

- `PALBASE_TEST_BASE_URL` is where the new version answers; `PALBASE_TEST_AUTH_URL` the project's auth;
- **test users** the run makes for its tests (`test_users`), each with its access token, are in `PALBASE_TEST_IDENTITIES` — `api.signInAs("alice")` from `palbase/backend/test` (or `palbase/server/testing`, whatever the backend is written with) acts as one; they are deleted when the run ends, however it ends.

The tests reach what the machine reaches — its database, the project's storage, mail and the rest — so they write as the machine does: write tests that leave the data as a real user's session would, and that do not depend on an empty database.

They pass, and the version takes traffic. One fails, and the build fails: its `reason` names the tests that failed, its GitHub check shows the end of what they printed (what the run was given that is secret written over), the version never takes traffic, the machine keeps the version it runs, and the migration is taken back. A run has 20 minutes. A build is tested as the machine named its tests when the build was released to it. `palbase test --machine <name>` runs the same command, as the same test users, on your computer.

### How the image is made

The build reads the machine's directory (its `path`):

- **With a `Dockerfile`** there, the build uses it, with the build context the machine names (its `context`, else its `path`).
- **Without one**, [Railpack](https://railpack.com) detects what the directory is — Node, Bun, Go, Python, … — and plans the image from it.

A `palbase/backend` app ships a `Dockerfile` (see [Project Structure](https://palbase.studio/docs/getting-started/project-structure)): its decorators need the TypeScript compiler options that Bun reads from `tsconfig.json`, and a Dockerfile says exactly how it is run. A build has 20 minutes, and a repository is built from at most 1 GiB and 100,000 files.

### `.env.example`: what the program must be given

A `.env.example` in the machine's directory is read as **the list of variables the program needs**: every `NAME=` line is a name (comments, blank lines and `PORT` are skipped; a value after `=` is ignored).

```text
# .env.example — the names this backend reads; their values live in Palbase.
PALBASE_URL=
PALBASE_PROJECT_ID=
PALBASE_SECRET_KEY=
```

When the build is done, every name is looked for among what the machine will start with: its own environment variables, its secret set, and what the platform gives it (`PALBASE_URL`, `PALBASE_PROJECT_ID`, `PALBASE_REPLICAS`, `PALBASE_PLATFORM_SECRET`, and with a database `PALBASE_DB_URL` and `PALBASE_DB_CONNECTIONS`). A name found nowhere stops the rollout: the build waits as **`waiting_config`** (*Waiting for variables* in Studio, *Waiting for configuration* on GitHub), its `missing_env` lists the names, and it **rolls out by itself once the machine has them** — add the secret, or the variable, and nothing has to be pushed again.

Without this file nothing is checked, and an app missing a setting is rolled out to fail at start. The version before it keeps serving either way, but the waiting build says what is wrong by name; the failed start says it in its logs.

## The rollout

The new version starts beside the one that serves, and is held to its [health check](https://palbase.studio/docs/machines/overview#the-health-check): 90 seconds to answer `2xx` at its health path. Up, it takes the traffic and the old version is stopped — a `palbase/backend` app finishes the requests in flight first (20 seconds at most), then runs its `onShutdown()`. Not up, it never takes a request: the old version keeps serving, the build's check on GitHub says *Did not come up*, and the machine's `state_reason` says why.

A change that is not a push rolls out the same way: a new size, port, number of copies, environment, secret set or health path, a changed secret of the machine's set, and a rollback.

**`SIGTERM` can come more than once.** A machine runs in a sandbox of its own (a small VM), and a version being stopped is sent `SIGTERM` twice, a few milliseconds apart. A `palbase/backend` app handles that. An app of your own should stop on the first and keep its handler for the rest: in Node and Bun `process.on("SIGTERM", …)`, not `process.once`. A process listening once dies of the second signal (exit 143), and its requests still in flight are cut (`503 machine_interrupted`).

### When a release migrates its database

A machine given a database with **Run migrations** on (`database.migrations: true`) migrates it as part of every release, with no step of yours:

1. **start** — before the new version starts, its image runs once with `PALBASE_DB_MIGRATE=start` and the owner's address: what the new version needs is added beside what the running version uses. The version rolls out only once start succeeded.
2. **rollout** — both versions run against the same tables.
3. **complete** — once the new version has served and nothing of the old one is left, the image runs once more with `PALBASE_DB_MIGRATE=complete`, and what only the old version used is removed.

A start the app itself refuses — a change the schema cannot make while both versions run, or rows that do not fit it — ends the release: the machine stays on the build that serves, and what start began is taken back (`rollback`). A start that was only cut off (the database restarting, a lock not had in time) is run again and picks up where it stopped. What these runs write is in the machine's logs, marked `migration`. The schema side of all this is [Schema changes](https://palbase.studio/docs/backend/migrations); the database side is [Databases](https://palbase.studio/docs/machines/databases).

One migration is open at a time, and a database's migrations are one machine's: a second machine asking to run them is refused (`409 database_migrated_elsewhere`).

## Builds

Studio's machine page (**Backend › Machines › `<name>`**) lists its **Builds**, newest first — every commit of the branch built for it, its state, and a **Running** badge on the one that serves. **Log** opens a build's log; **Roll back** is on every build that succeeded and does not run.

| State | What it means |
|---|---|
| `waiting_checks` | Waiting for its commit's checks on GitHub (`deploy_after_checks`); `reason` names what it waits for |
| `queued` | Waiting its turn: one build at a time per project |
| `building` | Being built |
| `testing` | Released to its machine; its tests (`test_command`) run against it before it takes traffic — they fail and it fails, `reason` naming them, and the machine runs what it ran |
| `waiting_config` | Built, waiting for what `.env.example` names (`missing_env`); rolls out once the machine has it |
| `succeeded` | Built and rolled out — or a newer build already had |
| `failed` | Not built, or not up; `reason` says which |
| `cancelled` | A newer commit was built first, the head of the branch was asked for (a deploy, or a change of source), or the machine was deleted |
| `skipped` | Its commit's checks did not pass, or did not end in time; nothing of it was built (`reason`) |

| Call | HTTP | What it answers |
|---|---|---|
| `listBuilds` | `GET /machines/{name}/builds` | A page of builds, newest first (20 by default, `next_cursor` for the next) |
| `getBuild` | `GET /machines/{name}/builds/{build}` | One build: its commit and message, state, reason, `missing_env`, whether it runs |
| `getBuildLog` | `GET /machines/{name}/builds/{build}/log` | The build's log, its last MiB — where a failure is. `404 log_not_ready` before the build has started; `404 no_log` for one that ended before it ran (its `reason` says why) |

## Logs

What the machine writes to stdout and stderr is kept — every copy, every version (one that never came up too), and its migration runs — for **7 days**, up to 1,200 lines a minute per machine; past that, the rest of that minute is not kept. Write one JSON object a line and each is one line to read back: `Log` from `palbase/backend` does exactly that, with the request's id on every line ([Backend SDK](https://palbase.studio/docs/backend/overview)).

Studio's machine page shows the last hour, the last 100, 500 or 2,000 lines of it. From a server, `readMachineLogs` (`GET /machines/{name}/logs`) answers NDJSON, one line object a line, oldest first:

| Query | |
|---|---|
| `since` | From when, inclusive (RFC 3339); an hour ago when left out, a week ago at most |
| `until` | Until when, exclusive; now when left out. Not with `follow`. |
| `lines` | How many lines at most, 1 to 5,000 (500 by default) — for a followed read, before it follows |
| `follow` | `true` holds the answer open and sends what the machine writes next |

Each line carries `ts` (to the nanosecond), `id` (ids sort as lines do, and the same line read twice has the same id), `stream` (`stdout` or `stderr`), `generation` (the machine's version that wrote it), `source` (`machine`, or `migration` for a migration run), `line` (what was written) and which copy wrote it.

```ts
// scripts/tail.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

type LogLine = { ts: string; id: string; stream: "stdout" | "stderr"; generation: number; source: "machine" | "migration"; line: string };

const since = new Date(Date.now() - 10 * 60_000).toISOString();
const { data } = await palbase.machines.readMachineLogs({ path: { name: "backend" }, query: { since, lines: 200 } });

for (const raw of (await data.text()).split("\n")) {
  if (!raw) continue;
  const l = JSON.parse(raw) as LogLine;
  console.log(l.ts, `v${l.generation}`, l.source, l.stream, l.line);
}
```

A followed read is held open for 5 minutes at most (and ends when the machine is deleted). A project holds 5 followed reads open at once; a sixth is `429 too_many_follows`. A reader whose connection ends goes on with `since=` the time of the last line it had — a line may then come twice, and its `id` says so.

## Rollback

**Roll back** returns the machine to one of its builds that succeeded: a **new version** of the machine, running that build's image, rolled out beside the one that serves like any other. It is the only change of what a machine runs that is not made by a push. The images of a machine's last 10 successful builds are kept; an older build is refused (`409 build_not_deployable`).

```ts
// scripts/rollback.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

// The build that ran before the one that serves.
const { data: page } = await palbase.machines.listBuilds({ path: { name: "backend" } });
const previous = page.builds.find((b) => b.state === "succeeded" && !b.running);
if (previous) {
  const { data: machine } = await palbase.machines.rollbackMachine({ path: { name: "backend" }, body: { build: previous.id } });
  console.log(`rolling out version ${machine.version}: ${previous.commit}`);
}
```

The next push to the branch is built and rolled out as usual, so a rollback holds until then. To keep a machine off a bad commit, revert it on the branch — or point the machine at another branch in **Edit settings**.

> **Note:** A rollback changes code, never data. Once a release's migration has completed, the build you return to reads the tables as that migration left them — a column it dropped is gone. A migration still open when its version is abandoned is taken back instead. Make a change an older build cannot read in two releases, so the one before keeps working: [Schema changes](https://palbase.studio/docs/backend/migrations).

## Related

- [Connecting GitHub](https://palbase.studio/docs/machines/github) — which pushes build which machines
- [Machines](https://palbase.studio/docs/machines/overview) — sizes, the health check, environment and secrets
- [Databases](https://palbase.studio/docs/machines/databases) — giving a machine a database, and its migrations
- [Schema changes](https://palbase.studio/docs/backend/migrations) — what start and complete do to your tables
- [Project Structure](https://palbase.studio/docs/getting-started/project-structure) — the Dockerfile and `.env.example` of a backend
