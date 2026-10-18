> The full documentation index: https://palbase.studio/llms.txt

# Backups & Restore

Every database is backed up continuously: a base backup, and its write-ahead log archived once a minute. You choose how many days of it are kept, and within those days you can **bring the database back to any moment** — the state it held at 14:02:37 last Tuesday, before the migration or the `DELETE` that went wrong. A database you delete is kept, with its backups, for 7 days, and can be taken back until then.

There is nothing to schedule and nothing to turn on: the backups are part of the database, at every size.

## How long backups are kept

A database keeps its backups for **`backup_days`** days — 1 to 35, **7** when left out. In Studio it is **Backups kept** on **New database**, and on the database's page under **Edit access and backups**; through the API, `backup_days` on `createDatabase` or `updateDatabase` (`PATCH /databases/{name}`).

A restore reaches back as far as its backups do. Shortening the days shortens how far back you can go from then on.

## Bringing a database back to a moment

On the database's page (**Database › Databases › `<name>`**), **Point-in-time restore** takes a moment — **Restore to** — and brings the database back to it. Through the API it is `restoreDatabase` (`POST /databases/{name}/restore`) with the moment as an RFC 3339 time:

```ts
// scripts/restore.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

// Back to the moment before the bad deploy.
const { status, data: db } = await palbase.machines.restoreDatabase({
  path: { name: "main" },
  body: { to: "2026-10-06T14:02:37Z" },
});
console.log(status, db.state); // 202 restoring
```

What a moment can be:

- one since the database was opened — or since it was last brought back,
- within its backup days,
- and **not of the last two minutes**: the log is archived once a minute, and the newest of it is not in a backup yet.

A moment outside that is refused with `400 invalid_restore_point`, whose description names the earliest and the latest moment you can ask for. A database already being brought back is refused with `409 database_restoring`.

What a restore does:

- The answer is `202`, and the database's state is **`restoring`**. It is **down meanwhile**: it does not answer, and its clients are told it is being restored.
- It starts again with the data it held at that moment — every database in it, the ones its owner made too.
- Its logins' **passwords are as they are now**, not as they were then: nothing that connects needs a new one.
- The machines given it reconnect when it is back. A `palbase/backend` app answers its requests meanwhile with `503 database_unavailable` and `Retry-After`.

> **Note:** A restore brings the **data** back, not the code. The schema at that moment is the one the machine that migrates the database had then. If a release since then migrated it, the version that serves now may expect columns the restored database does not have: return the machine to the build of that moment too ([Rollback](https://palbase.studio/docs/machines/builds#rollback)), or push the schema it needs.

A restore emits `database.restoring` to the project's webhook. After it, the database's history starts again: the next restore reaches back to when this one was made, and not before.

## Deleting a database

**Delete database** on the database's page (`deleteDatabase`, `DELETE /databases/{name}`) takes it away: **it stops answering at once.** Its volume and its backups are kept for **7 days**, and until then it can be taken back. Its name stays taken until it is purged, and it counts toward the project's 3 databases.

A database a machine is given cannot be deleted — `409 database_in_use`. Give that machine another database or none first (`updateMachine` with `database: { name: "" }`, or **Database: No database** in **Edit settings**).

### Taking it back

**Undelete** on its page (`undeleteDatabase`, `POST /databases/{name}/undelete`) takes a deleted database back within its 7 days: it starts again on the volume and backups it had, with the data it had. A database that is not deleted is refused with `409 database_not_deleted`.

### Purging it now

**Purge database** (`purgeDatabase`, `POST /databases/{name}/purge`) takes a deleted database away **for good, now**, instead of at the end of its 7 days: its volume and its backups are removed, it no longer counts toward the project's databases, and its name is free once it has gone (`409 database_purging` for a new database of that name until then). **It cannot be taken back.** A database that is not deleted is refused (`409 database_not_deleted`); one purged already is answered `204` again.

`listDatabases` (`GET /databases`) lists the deleted databases that may still be taken back beside the others, each with its `deleted_at` and `purge_after` — when its volume and backups go for good.

| What you do | Its data | Its name | Counts toward the 3 |
|---|---|---|---|
| Delete | kept 7 days, with its backups | taken | yes, until purged |
| Undelete (within 7 days) | back, as it was | — | yes |
| Purge | gone, now | free once it has gone | no |
| 7 days pass | gone | free | no |

The events: `database.deleted`, `database.undeleted` and `database.purged`.

## Related

- [Databases](https://palbase.studio/docs/machines/databases) — sizes, logins, connecting, and the SQL console
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — returning a machine to an earlier build
- [Schema changes](https://palbase.studio/docs/backend/migrations) — what a release does to the tables
- [Webhooks](https://palbase.studio/docs/server/webhooks) — the project's events, `database.*` among them
