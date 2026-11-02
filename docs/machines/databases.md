> The full documentation index: https://palbase.studio/llms.txt

# Databases

A project's **database** is Postgres 18 of its own, with pgvector and PostGIS, reached from anywhere over TLS with a password. Give one to a [machine](https://palbase.studio/docs/machines/overview) and the machine starts with its address; connect to it from anything else — `psql`, a migration tool, a BI tool, a server of your own — with the credentials Studio shows once.

A database is the project's, not a machine's. One may be given to several machines, and one machine — the one that runs its migrations — owns its schema. A [`palbase/backend`](https://palbase.studio/docs/backend/database) app declares that schema in TypeScript and migrates it on every release; anything else that connects is an ordinary Postgres client.

In Studio, databases live under **Database › Databases**. Each step below names the machines module's call beside the click, for a script that holds the secret key.

## Opening one

**Database › Databases › New database** asks for:

| Field | API | |
|---|---|---|
| **Name** | `name` | Lowercase letters, digits and dashes, starting with a letter, 32 at most; `main` when left out. It answers at `<name>-<ref>.db.palbase.studio`. |
| **Size** | `size` | One of the sizes below; `free` when left out. It can be changed later ([below](#changing-and-removing-one)) |
| **Allowed addresses** | `allow` | Who may connect, as addresses or CIDRs (`203.0.113.7`, `203.0.113.0/24`), 50 at most. Empty: anyone with the password. |
| **Backups kept** | `backup_days` | 1 to 35 days — 7 at most on Free: how far back a [restore](https://palbase.studio/docs/machines/backups) reaches |

The database's volume is made and it starts; it answers once its state is `awake`. **The answer that opens it holds both of its passwords — the owner's and the application's — and no answer holds them again.** Studio shows them on the database's page once; copy them then. A password you did not keep is made new, not read back ([below](#passwords)).

```ts
// scripts/open-database.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const { data: db } = await palbase.machines.createDatabase({
  body: { name: "main", size: "free", backup_days: 7 },
});
console.log(db.host, db.state); // main-<ref>.db.palbase.studio starting
```

A project has **3 databases** at most — a deleted one counts until it is purged — and **one of a free size** at a time.

## Sizes

| Size | CPU | Memory | Storage | Sessions on `5432` | Transactions at once on `6543` | Sleeps | On Pay as you go |
|---|---|---|---|---|---|---|---|
| `free` | 0.25 vCPU | 512 MiB | 1 GB | 38 | 12 | yes — and awake 400 hours a month at most | free — 400 hours a month, then $0.041 an hour |
| `hobby` | 0.25 vCPU | 512 MiB | 5 GB | 38 | 12 | yes | $11 a month awake |
| `starter` | up to 0.5 vCPU | 1 GiB | 10 GB | 76 | 24 | never | $21.70 a month |
| `standard-1x` | up to 1 vCPU | 2 GiB | 25 GB | 152 | 50 | never | $47.20 a month |
| `standard-2x` | up to 2 vCPU | 4 GiB | 50 GB | 240 | 80 | never | $89.70 a month |
| `dedicated-1x` | 1 vCPU of its own | 4 GiB | 25 GB | 240 | 80 | never | $101 a month |
| `dedicated-2x` | 2 vCPU of its own | 8 GiB | 50 GB | 240 | 80 | never | $193 a month |

A month is 730 hours, and a database is billed by the second it is awake: its storage is in its price — Render's price for its CPU and memory, and its storage at Render's $0.30 a GB past the first. A `starter`, `standard-1x` or `standard-2x` database has a quarter of its CPUs reserved for it and uses the rest while the other databases and machines on its node leave them; a dedicated one has its CPUs whole. The dedicated sizes are priced at what their whole CPUs cost us and a quarter more: at Render's prices they would cost less than they cost us. `shared-1g`, `shared-2g` and `shared-4g` are retired: a database that has one keeps it until it moves to another size — billed as `standard-1x` (`shared-1g`, `shared-2g`) or `standard-2x` (`shared-4g`), none more than it was — and none moves to one.

The two connection columns are what each port takes at once ([Connecting](#connecting)); `direct_connections` and `pooled_connections` on each size (`listDatabaseSizes`, `GET /databases/sizes`) and in a database's metrics answer them too.

`free` is the size every project may open. The others are sizes that are paid for: open to an environment on Pay as you go whose payment account is not held ([Billing](https://palbase.studio/docs/getting-started/billing)); another is refused one with `403 size_not_available`.

A size that sleeps is put to sleep when it is idle and **woken by the next connection**, in about 10 seconds; the client's connection waits for it. A Free environment's `free` and preview databases are awake 400 hours a month between them, and read and write 100 GB of their disk: past either they all sleep until the month ends, and a client is told so (`free_database_hours_spent`, `free_database_traffic_spent`). A `free` database asleep for a week is **archived**: what it holds is kept in its backups and its disk is let go. Its next connection brings it back — the same data — in a few minutes rather than seconds; a client that waits longer is told to connect again. A database's disk while it is asleep, or deleted and kept until it is purged, is billed at $0.25 a GiB-month on Pay as you go ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits#what-compute-costs-past-its-free-quota)); an awake database's hours pay for it. What the `free`, preview and `hobby` sizes read and write on their shared disk is free up to 100 GB a month, then $0.02 a GB on Pay as you go. The other sizes never sleep and live on a disk of their own.

The size is chosen when the database is opened and can be changed later ([below](#changing-and-removing-one)). What a project's machines and databases reserve between them is held to its limit, and a size that does not fit is refused with `409 machines_over_limit`.

### When it is full

A database holding its size's storage turns **read-only**: a transaction takes no writes unless it asks to, and reads go on. `read_only`, `used_bytes` and `quota_bytes` on the database say where it stands. To make room, write in a transaction that asks for it — `BEGIN READ WRITE`, then `DROP`, `TRUNCATE`, or `DELETE` followed by `VACUUM FULL` (a `DELETE` alone frees no room). Once it holds less than 95% of its quota it takes writes again, within a minute.

## Connecting

Every database has two logins:

| Login | Who it is | What it is for |
|---|---|---|
| **Owner** | Owns the database and its tables | Migrations, `psql`, a tool that changes the schema (Prisma, …) |
| **App** | What a machine given the database connects as | Your app's queries. It cannot bypass row-level security; it may `SET ROLE anon`, `authenticated` or `service_role`. |

and two ways in:

| Port | Through | Use it for |
|---|---|---|
| `5432` | A session pool (PgBouncer, session mode): each connection holds one of Postgres' own for as long as it stays open | Migrations, `LISTEN`, advisory locks and session settings; a long-lived server with a small pool of its own |
| `6543` | A transaction pool (PgBouncer, transaction mode): up to 1,000 clients share Postgres' connections, each held only for one transaction | Your application's traffic: many servers or copies, serverless functions, a connection per request. A session's `SET`, `LISTEN` and advisory locks do not hold here. |

### When a port is full

Each port takes so many connections at once — its size's limit, in the [table above](#sizes):

- **`5432`** takes as many open sessions as its size allows (38 on `free`), counted once a client has logged in with its password. One more is **refused at once** with `53300 too many connections`, its message naming the limit; it is not queued. Connect again once a session ends, move your application's traffic to `6543`, or open a larger size.
- **`6543`** runs as many transactions at once as its size allows (12 on `free`), however many clients are connected. A transaction waits its turn for **20 seconds** at most — longer than a move between sizes holds the ports, shorter than a web request waits for its answer — then is refused with `53300 too many connections`. Keep transactions short: one held open while the application waits on something else holds a place others wait for.

A database's own machines are given their share of `5432` (`PALBASE_DB_CONNECTIONS`, [below](#giving-it-to-a-machine)), counted twice so a new version starts beside the old: they stay within it on their own. A client of its own — a server elsewhere, a BI tool, `psql` — counts against the same sessions: point several servers, or a serverless platform, at `6543`, where their connections are shared.

TLS is required, and the URLs Studio gives check the server's name (`sslmode=verify-full`). A client that sends no TLS server name — libpq before 14, some drivers — connects as the user shown as **User for clients without SNI**, which carries the database's name in it.

**How to connect** (`getDatabaseCredentials`, `GET /databases/{name}/credentials`) answers everything but the passwords, ready to paste, for each login: a direct URL, a pooled URL, a `psql` command, a JDBC URL and the two lines of a Prisma schema's env (`DATABASE_URL` pooled for queries, `DIRECT_URL` for migrations). `[YOUR-PASSWORD]` stands where the password goes.

```text
postgresql://<owner-user>:[YOUR-PASSWORD]@main-<ref>.db.palbase.studio:5432/<database>?sslmode=verify-full
```

## Giving it to a machine

In the machine's **New machine** sheet or **Edit settings**, choose the **Database**, and whether this machine **runs its migrations**. Through the API it is the machine's `database`:

```ts
// scripts/give-database.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

await palbase.machines.updateMachine({
  path: { name: "backend" },
  body: { database: { name: "main", migrations: true } },
});
```

The machine is rolled out with two more variables:

- **`PALBASE_DB_URL`** — the database's address, as the **app** login. A `palbase/backend` app reads it by itself; any other program connects with it.
- **`PALBASE_DB_CONNECTIONS`** — how many connections to it **one copy** may hold. The database's connections are shared out among the copies of every machine given it, counted twice (a new version comes up beside the one that serves) and with a migration run's share apart. A `palbase/backend` app holds itself to it; a program of your own should size its pool by it. Copies the database could not serve are refused (`409 database_connections_short`), and the other machines given it roll out to their new share.

A machine's connection is a client like any other: it wakes a database that sleeps and keeps it awake while it holds one.

**Run migrations** (`migrations: true`) makes every release of the machine migrate the database before it serves — as the **owner**, with `PALBASE_DB_MIGRATE=start` before the rollout and `=complete` after ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds#when-a-release-migrates-its-database)). A database's migrations are one machine's: a second machine asking for them is refused with `409 database_migrated_elsewhere`. The other machines given the database read and write it as the app login, and must read the schema the migrating machine declares.

A change of `database` gives it whole: `migrations` left out is `false`. `{ name: "" }` gives the machine none. A database that is not the project's is refused (`400 database_not_found`).

A machine is given **any database of its project's**, whichever environment keeps it: a staging machine may take production's database. The name is looked up in the machine's own environment first, then in the project's others; `environment: { ref }` beside it names the environment to find it in (`409 ambiguous_database` when two keep one of that name). Another environment's database is given **as its app**: `migrations: false` (`409 migrations_where_kept` otherwise) — its migrations, and its owner's login, stay with a machine of the environment that keeps it. Giving it needs the admin role there (`403 environment_role_required`): its app login is written for the machine, so whoever ships that machine's code reads and writes that database as its app. The machine's `database.environment` says where it is kept, and the database's own `environment` says it too. A machine of an environment that is deleted loses the login it was written; restored, it is given it again, as it was. A database moves to another environment of the project with `palbase databases:move` ([Moving to another environment](https://palbase.studio/docs/machines/overview#moving-to-another-environment)): its data stays as it is, and its old host keeps working.

## A pull request preview's own

A machine that runs its database's migrations and previews its pull requests ([Pull request previews](https://palbase.studio/docs/machines/hosting#pull-request-previews)) has each preview given a database of its own, `<database>-pr<number>`, of the `preview` size: 0.25 vCPU, 512 MiB and 500 MB, asleep when idle, with **no backup to bring it back from**: no base backup is taken of it, and no moment of it can be restored. It is opened empty with its preview, migrated by the preview's releases, and deleted — at once, with no restore window — when its preview goes: its pull request closed, three days without a push, seven days after it was opened, or the machine deleted. It is listed with the environment's databases and counts against none of them; its hours are the `free` size's — from the same 400 free hours, billed at its price past them on Pay as you go. No database is opened at the `preview` size, moved to it or from it, or named `<name>-pr<number>` by hand.

## Passwords

A password is shown once — when the database is opened, and when it is made new. **Make a new password** on the database's page (**New owner password**, **New app password**), or `changeDatabasePassword` (`POST /databases/{name}/password` with `role: "owner"` or `"app"`), answers the credentials with the new one; the other login carries `[YOUR-PASSWORD]`. The new password works once the database has taken it, a few seconds later.

- **Owner**: its current password stops working. Migrations, `psql` and anything else that connects as the owner need the new one — the machine that runs migrations is given it by the platform.
- **App**: the new password is set on a second app login, and the machines given the database move to it with **none of their connections refused**. The old login keeps working until the next change — so to shut out a leaked app password, make it new **twice**.

A change waits for the one before it to reach the database: `409 password_change_pending` with `Retry-After`, and the same while a database first starts.

## The SQL console

**Database › SQL** runs read-only SQL against a database — `SELECT`, `EXPLAIN`, `SHOW` — with autocomplete from its tables, a history and saved queries. It is `queryDatabase` (`POST /databases/{name}/sql`), and its rules are the module's:

- One statement, 64 KiB at most; two are refused (SQLSTATE `42601`).
- It runs as the **owner**, in a transaction that takes no writes and is always rolled back: a write is refused by Postgres (`25006`).
- It has 15 seconds (`57014`) and 5 seconds for a lock (`55P03`).
- It answers the columns and the first rows (1 to 1,000, `limit`), `truncated` when there were more, and how long it took. Values come as JSON: a timestamp in RFC 3339, `numeric` as a string, `bytea` as `\x` and its hex, `json` and `jsonb` as the JSON they hold.
- A statement Postgres refuses is `400 query_failed` with its message and its `sqlstate`.

`GET /databases/{name}/schema` answers what the console's autocomplete reads: every table outside Postgres' own schemas and Palgres', its columns in order — type as Postgres writes it, nullable, part of the primary key, the column a foreign key points at — and whether row-level security is on.

A sleeping database is woken for the console, the call held a few seconds (`503 database_waking` with `Retry-After` past that). A database being restored, or one that cannot start, is refused with `409`. A database runs a few console calls at once; past that, `429 too_many_queries`.

## Changing and removing one

`updateDatabase` (`PATCH /databases/{name}`, **Edit access and backups** in Studio) changes who may connect (`allow`), how many days of backups are kept (`backup_days`) and the database's size (`size`). Deleting one, taking it back and purging it are on [Backups & Restore](https://palbase.studio/docs/machines/backups#deleting-a-database).

A new size is answered at once with `202`: the database moves to it while it serves. Its sessions on the direct port end once, when it moves, and new logins wait a few seconds then. A change of size is refused with `409` when the database is already moving to another size (`database_resizing`), being brought back to a moment (`database_restoring`) or failed (`database_failed`), or when it holds more than the new size's storage (`database_too_large`); a smaller size waits until what the database holds has been measured, within minutes of its start (`database_not_measured`). A size that is paid for is refused with `403 size_not_available` while those sizes are not open.

| Call | HTTP | |
|---|---|---|
| `listDatabases` | `GET /databases` | The project's databases by name — deleted ones that may still be taken back among them |
| `getDatabase` | `GET /databases/{name}` | Its host and ports, size, `allow`, `backup_days`, state, how much it holds and how long it has been awake this month |
| `createDatabase` | `POST /databases` | Opens one; the answer holds both passwords, once |
| `updateDatabase` | `PATCH /databases/{name}` | Who may connect, and its backup days |
| `getDatabaseCredentials` | `GET /databases/{name}/credentials` | How to connect, without the passwords |
| `changeDatabasePassword` | `POST /databases/{name}/password` | A new owner or app password, shown once |

A database's `state` is `starting`, `awake`, `asleep`, `archived`, `restoring` or `failed` (`state_reason` says why).

## From the CLI

```sh
palbase databases:create main --size free --backup-days 7   # its passwords are kept on this computer
palbase databases:list
palbase db:url main --pooled                                 # a connection address for any tool
palbase db:shell main                                        # psql on it (it wakes if asleep)
palbase db:dump main --file main.dump                        # pg_dump's custom format, as its owner
palbase databases:update main --allow 203.0.113.0/24        # who may connect; --size moves it to another size
palbase db:copy --from main --to staging                     # one environment's data into another's
```

`palbase databases:sizes` lists the sizes, `palbase databases:password:reset <name> --role owner|app` makes a login's password new, and `palbase databases:restore <name> --to <time>` brings a database back to a moment ([Backups & Restore](https://palbase.studio/docs/machines/backups)). The schema commands — `db:plan`, `db:push`, `db:migrate`, `db:pull`, `db:seed`, `db:types` — work on the schema of a `palbase/backend` app ([Schema changes](https://palbase.studio/docs/backend/migrations)). Every command is in the [CLI reference](https://palbase.studio/docs/cli/reference#databases).

## Related

- [Backups & Restore](https://palbase.studio/docs/machines/backups) — point-in-time restore, and deleting, taking back and purging a database
- [Database](https://palbase.studio/docs/backend/database) — the queries a `palbase/backend` app runs against it
- [Schema](https://palbase.studio/docs/backend/schema) · [Schema changes](https://palbase.studio/docs/backend/migrations) — the schema a release migrates
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) — what the app login cannot bypass
- [Machines](https://palbase.studio/docs/machines/overview) — the machines a database is given to
