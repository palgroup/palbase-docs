> The full documentation index: https://palbase.studio/llms.txt

# Cron

A cron is a class the platform runs on a schedule: a nightly report, an hourly cleanup, a digest every Monday at 9 in the morning, Istanbul time. Mark a provider with `@Cron({ name, schedule })` and give it a `run(meta)` method. When the machine's version comes up, the platform asks it which crons it has. It then calls each one when it is due, waking the machine if it sleeps.

Work that comes from something that happened — an order paid, a file uploaded — is not a cron that looks every minute for what to do: put it on the machine's queue as a [task](https://palbase.studio/docs/backend/tasks), and it runs once, as soon as it is put, with the machine asleep in between.

## Quick example

The tables the cron works on:

```ts
// src/db/public.ts
import { defineSchema, defineTable, integer, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

export const profiles = defineTable("profiles", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), name: text(), created_at: timestamp().defaultNow() },
  policies: (p) => [policy("profiles_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export const upload_sessions = defineTable("upload_sessions", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), expires_at: timestamp() },
  policies: (p) => [policy("uploads_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

// The app's own: no policy lets a user reach it, the service role does.
export const daily_reports = defineTable("daily_reports", {
  columns: { run_id: text().primaryKey(), signups: integer(), made_at: timestamp().defaultNow() },
});

export default defineSchema("public", { tables: [profiles, upload_sessions, daily_reports] });
```

```ts
// src/modules/reports/daily-signups.cron.ts
import { Cron, Database, Log, type CronMeta } from "palbase/backend";
import { ago } from "palgres";

// Every day at 06:00 in Istanbul: the last day's sign-ups, counted into one row.
@Cron({ name: "daily-signups", schedule: "0 6 * * *", timeZone: "Europe/Istanbul", timeout: 120, retry: 3 })
export class DailySignups {
  async run(meta: CronMeta): Promise<void> {
    const signups = await Database.public.profiles.count({ where: { created_at: { gte: ago({ days: 1 }) } } });
    // Keyed on the run: an attempt made again finds its row there, and writes no second one.
    await Database.public.daily_reports.insertMany([{ run_id: meta.runId, signups }], { action: "ignore", returning: false });
    Log.info("daily sign-ups", { signups, run: meta.runId, attempt: meta.attempt });
  }
}
```

```ts
// src/modules/reports/upload-sweep.cron.ts
import { Cron, Database, Log } from "palbase/backend";
import { now } from "palgres";

// Every 15 minutes: the upload sessions that expired, removed.
@Cron({ name: "upload-sweep", schedule: "*/15 * * * *" })
export class UploadSweep {
  async run(): Promise<void> {
    const gone = await Database.public.upload_sessions.deleteMany({ where: { expires_at: { lt: now() } } });
    Log.info("expired upload sessions removed", { gone });
  }
}
```

```ts
// src/modules/reports/reports.module.ts
import { Module } from "palbase/backend";
import { DailySignups } from "./daily-signups.cron";
import { UploadSweep } from "./upload-sweep.cron";

@Module({ providers: [DailySignups, UploadSweep] })
export class ReportsModule {}
```

A cron is a provider like any other: its module lists it in `providers`, and it takes its dependencies by constructor — a service whose method does the work, for one. A class is one cron. A controller that is a `@Cron` is refused at boot, because a controller is not where crons live.

## The schedule

Five fields, as cron's, on the clocks of the cron's time zone — **UTC** unless `timeZone` names one: minute, hour, day of the month, month, day of the week.

| Field | Values |
|---|---|
| minute | 0–59 |
| hour | 0–23 |
| day of the month | 1–31 |
| month | 1–12 |
| day of the week | 0–7 (0 and 7 are Sunday) |

Each field is `*`, a number, a list (`1,15`), a range (`1-5`), or a step (`*/10`, `10/20`, `8-18/2`). When both day fields are given, a day that matches either one counts, as in classic cron. There are no seconds and no `@daily`-style names.

A schedule the platform would not run is refused where `@Cron` is written: six fields, `@daily`, `60 * * * *`, or a date that never comes (`0 0 31 2 *`).

### Time zones

`timeZone` is a time zone's IANA name — `Europe/Istanbul`, `America/New_York`, `Asia/Kolkata` — and the schedule is read on its clocks. Where they change for summer time, the platform keeps to one rule, so a cron is never run twice for one time:

- A time the clocks **skip** (02:30 on the night they go from 02:00 to 03:00) is not run that day.
- A time the clocks **show twice** (02:30 on the night they go back from 03:00 to 02:00) is run the first time only.

A cron that must run every so often, whatever the clocks do, is written in UTC.

## Options

| Option | What it is | Default |
|---|---|---|
| `name` | What the platform calls the cron and keeps its runs under. Letters, digits, `.`, `_` and `-`, at most 64. | required |
| `schedule` | Five fields of cron's | required |
| `timeZone` | The IANA time zone whose clocks the schedule is on | `UTC` |
| `timeout` | Seconds one run may take before it is a failed attempt: 1–900 | 30 |
| `retry` | Attempts after a failed one: 0–10 | 5 |

Renaming the cron starts a new one: the old name's runs stay under it. Two crons of one name are refused at boot, naming both. A machine runs at most 50 crons.

## How a run goes

1. **Due.** The platform calls the cron at its minute, waking the machine if it is asleep, on one of its copies. One run of a cron is open at a time: a cron due again while its last run is still going is skipped for that minute. While the machine is held at the call, it is not put to sleep.
2. **Signed.** The call is `POST /_palbase/crons/<name>`, signed with the machine's `PALBASE_PLATFORM_SECRET` in `Palbase-Signature`, as the platform's other calls into a machine are. Anything not signed by the platform is `401`, and nothing runs. A request for these paths from the internet never reaches the machine: its edge answers `404`.
3. **One transaction, as the service role.** `run` runs in a database transaction of its own, given its `CronMeta`. A cron has no caller, so its transaction is the **service role's**: every row is in reach and no policy filters it. That differs from a [delivery](https://palbase.studio/docs/backend/hooks), which runs as `anon`.
4. **Done or failed.** `run` returned: the run succeeded (`204`). It threw — anything, a `NotFound` too: the transaction is rolled back, the error is logged with the cron's name, the run and the attempt, and the attempt failed (`500`). It ran past its `timeout`: the platform hangs up, and what the attempt wrote is rolled back even if it returns later. A failed attempt is tried again after 10 s, 20 s, 40 s, … five minutes at most, until `retry` is spent.
5. **Once.** An attempt that ended is answered `204` if the same call comes again; one still running is answered `409` and is not run beside itself.

A cron this version no longer has is answered `404`: the platform skips the run and does not try it again. A project whose machine time for the period is used up runs no cron: its runs are skipped until the time comes back.

## Run now, pause and resume

From the machine's **Crons** tab in Studio, or the CLI — an admin's, as every change is:

| | Studio | CLI |
|---|---|---|
| Run a cron now, apart from its schedule | Run now | `palbase machines:crons:run <cron>` |
| Pause it: it is not run until resumed, whatever version of the machine comes up meanwhile | Pause | `palbase machines:crons:pause <cron>` |
| Resume it: due at its next time from now — the runs it missed are not made up | Resume | `palbase machines:crons:resume <cron>` |

A run asked for now is marked as such among the runs, and waits its turn behind a run still going (`409` while one is). A pause is the project's, not the program's: a deploy does not undo it.

## What a cron is given

| Field of `CronMeta` | What it is |
|---|---|
| `env` | The app's environment variables as it started, the platform's keys left out |
| `environmentId` | The project's id |
| `cron` | The cron's name |
| `runId` | The run's id. It is the same for every attempt of one run. |
| `scheduledAt` | The minute it was due (or was asked to run now), as a `Date` |
| `attempt` | 1 for the first, then one more for each attempt made again |

> **Note:** An attempt can run and still be counted as failed: the machine finished, but its answer never reached the platform. The next attempt runs it again. Make a cron safe to run twice, keyed on `runId` or on what it works on, as the report above is.

## Seeing the runs

The crons a machine's running version declared, and each one's runs, are on its **Crons** tab in Studio and in the CLI (`palbase machines:crons`, `palbase machines:crons:runs <cron>`). They are also in the API: `GET /machines/<machine>/crons` and `GET /machines/<machine>/crons/<name>/runs`, with the project's secret key.

## On your computer

Off the platform there is no `PALBASE_PLATFORM_SECRET`, so `/_palbase/crons` is not served and nothing calls a cron. The app says how many crons it has when it starts. To run one, call its `run` from a test:

```ts
// src/modules/reports/upload-sweep.cron.test.ts
import { describe, expect, it } from "vitest";
import { UploadSweep } from "./upload-sweep.cron";

describe("UploadSweep", () => {
  it("is a class like any other", () => {
    expect(typeof new UploadSweep().run).toBe("function");
  });
});
```

The database work in a cron needs a request's database, as a handler's does: see [Testing](https://palbase.studio/docs/backend/testing).

## Related

- [Tasks](https://palbase.studio/docs/backend/tasks): work put on the machine's queue, run once, now or later
- [Event Hooks](https://palbase.studio/docs/backend/hooks): the platform's events, delivered as they happen
- [Database](https://palbase.studio/docs/backend/database): the transaction a cron runs in
- [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules): providers and their modules
