> The full documentation index: https://palbase.studio/llms.txt

# Schema changes

There are no migration files. Your [schema files](https://palbase.studio/docs/backend/schema) are the declaration, and every release of your machine migrates its database to what they say — **beside the version still serving**, so no request waits for a migration and no request of the old version meets a table it cannot read. You change `src/db/public.ts`, commit and push. You run nothing yourself: the platform runs your new image once to **start** the migration, rolls the new version out next to the old one while both read and write the same tables, and runs it again to **complete** once the old one is gone. A change that both versions cannot run through is refused before anything changes, and the version serving keeps serving.

## The workflow at a glance

```bash
# 1. Edit the declaration: add a column, rename one, tighten one.
#    src/db/public.ts
# 2. Regenerate the types, so Database.public.* matches what you wrote.
bun run scripts/palbase-env.ts
# 3. Commit and push to the machine's branch. That push is the release.
git commit -am "notes: pinned, and title is called subject"
git push
```

The machine builds the commit, and because it is given its database with **migrations on** (Studio: the machine's *Database* setting, "runs its migrations"), the release goes:

1. **start** — the new image runs once with `PALBASE_DB_MIGRATE=start` and the database owner's address. Everything the new version needs is added next to what the running version uses. The new version is not rolled out until start succeeds.
2. **rollout** — the new version comes up beside the old one. Both read and write the same tables.
3. **complete** — once the new version has served and no copy of the old one is left, the image runs with `PALBASE_DB_MIGRATE=complete`. Whatever only the old version used is removed; a renamed column takes its new name, a retyped one takes its place.

A version that is abandoned before complete — its start failed, it did not come up, or a newer push took its place — gets **rollback**, which removes what start added and restores what it loosened. Data written meanwhile stays.

A database's migrations are one machine's: a second machine that asks to run them is refused (`409 database_migrated_elsewhere`). Another machine may be given the same database without migrations; it binds to the schema version its own files describe, so it carries the same schema files and is released after the one that migrates.

## The app migrates itself

The migration is not the platform's code. It is Palgres — the same library that serves your queries — inside your own image. `PalbaseFactory.create` reads `PALBASE_DB_MIGRATE`: set, it migrates the database to the `schemas` it was given and exits; unset, it serves.

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";
import schema from "./db/public";

// Serves on $PORT. Run with PALBASE_DB_MIGRATE=start|complete|rollback by a
// release, it migrates the database as its owner (PALBASE_DB_OWNER_URL) and exits.
await PalbaseFactory.create(AppModule, { db: { schemas: [schema] } });
```

```ts
// src/app.module.ts
import { Module } from "palbase/backend";

// The app's modules, listed here as ever: a migration run builds none of them.
@Module({ imports: [] })
export class AppModule {}
```

The schema the engine plans from and the engine that applies it are always the same version, because they are in the same image, and a migration run sees nothing but its own image. The run connects as the database's **owner** (`PALBASE_DB_OWNER_URL`, given to migration runs alone); the version that serves connects as the app's login (`PALBASE_DB_URL`) and cannot alter a table.

How a run exits is all the platform reads of it:

| Exit | What it says | What happens |
|---|---|---|
| `0` | done, or nothing to do | the release goes on: rollout after start, and so on |
| `1` | the migration's own verdict — it is refused, or the rows do not fit it (two rows where a new unique index wants one). Run again, it would end the same | the release stops. What start began is taken back, the version serving stays, and the build says why |
| anything else | it was cut off — the database restarting, a lock not had in the tries it has, the run's node drained, its memory out (`75` when the app says so) | the run is made again, and picks up where it stopped |

A run's lines are in the machine's logs, marked as a migration run's, and its last line is the reason the build shows — see [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds). A migration the process dies in picks up where it stopped: each step is recorded when it commits, and copying a large table records its place with every batch. A step has a day, its attempts together — not a measure of the work, only the end of a run that would never end.

Only one migration is open at a time. A push that comes while one is open waits for its complete — or, when the version it belongs to has not rolled out yet, takes its place: that one is rolled back first.

## What start does, so nothing waits

- New tables and columns are added; **indexes are built `CONCURRENTLY`**.
- `CHECK`s and foreign keys are added `NOT VALID`, then validated while writes go on.
- `NOT NULL` is set through a validated `CHECK`.
- A type change adds a second column of the new type that the two versions write through each other.
- Each step takes the locks its statements need, waits at most 500 ms for them, then gives way and tries again — so a request queued behind it never waits longer than that. A writer is never the one sacrificed to break a lock cycle.
- A table is filled in batches that take only rows no writer holds (`SKIP LOCKED`); a write never waits for a batch longer than its commit.

## Adding things

Adding a table, a nullable column, a column with a default, an index, a unique index, a `CHECK` or a foreign key is an ordinary release — declare it and push. Two things to know:

- **A new `NOT NULL` column needs `.default(…)` or `.fillWith(sql)`**: the version still serving inserts rows without it.
- **Constraints apply at start.** A `CHECK`, unique index or foreign key added by a migration holds for every write once start is done — the old version's writes included. A row the old version writes that a new constraint refuses is refused.

## Renaming a column

A diff shown two names for one column cannot tell a rename from a drop and an add — and the second loses every value. Say which it is:

```ts
// src/db/public.ts
import { defineSchema, defineTable, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    title: text(),
    created_at: timestamp().defaultNow(),
  },
  policies: (p) => [policy("notes_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [notes] });
```

The next release renames `title` and adds `pinned`:

```ts
// src/db/public.ts
import { boolean, defineSchema, defineTable, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    subject: text().renamedFrom("title"),
    created_at: timestamp().defaultNow(),
    pinned: boolean().default(false),
  },
  policies: (p) => [policy("notes_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [notes] });
```

```ts
// src/notes/notes.service.ts
import { Database, Injectable } from "palbase/backend";

@Injectable()
export class NotesService {
  // The new version writes `subject`; the old one, still serving, writes `title` — the same column.
  create(owner: string, subject: string) {
    return Database.public.notes.insert({ owner, subject });
  }
}
```

```ts
// src/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesService } from "./notes.service";

@Module({ providers: [NotesService] })
export class NotesModule {}
```

While both versions run, the table keeps its old names and the new version reads and writes through its version's views, which hold the new names; at complete the column takes its new name. The typed tables work this way already. In the new version's **raw SQL** during that window, name tables bare (`notes`, not `public.notes` — a qualified name reaches the table under its old names), and name an `ON CONFLICT` target by its columns rather than its constraint (a view has none). Tools outside the app — psql, a BI tool — see the table itself: the old names until complete.

Once complete has run, `renamedFrom` is inert — the old name is gone — so delete it whenever you next touch the file.

## Changing a column's type

A type change is planned as a second column of the new type, which both versions write through each other by Postgres' cast both ways (an enum renamed, by its labels); at complete it takes the old column's place. Each version's own writes are cast across, so neither version's values are lost. What both versions cannot run through is refused — see the table below — and for those the way is a new column. A later release's `src/db/public.ts`:

```ts
import { boolean, defineSchema, defineTable, enumType, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    subject: text(),
    created_at: timestamp().defaultNow(),
    // `pinned` becomes a three-way visibility. Postgres has no cast from a
    // boolean to an enum, so it is a new column filled from the old one, and
    // `pinned` is ignored until the next release removes it.
    pinned: boolean().default(false).ignored(),
    visibility: enumType("note_visibility", ["normal", "pinned", "hidden"])
      .fillWith("(CASE WHEN pinned THEN 'pinned' ELSE 'normal' END)::public.note_visibility"),
  },
  policies: (p) => [policy("notes_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [notes] });
```

## Making a column `NOT NULL`

A nullable column with rows cannot just become `NOT NULL`: some rows are `NULL`, and the version still serving goes on writing `NULL`. `.fillWith(sql)` says what such a row gets — the rows already there and every write of the old version while both run — and the column is made `NOT NULL` only after. In this release's `src/db/public.ts`, `summary` was `text().nullable()` until now:

```ts
import { defineSchema, defineTable, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    subject: text(),
    summary: text().fillWith("left(subject, 80)"),
    created_at: timestamp().defaultNow(),
  },
  policies: (p) => [policy("notes_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [notes] });
```

The fill is for the rows the new code does not write: the ones already there, and the old version's. The new version's own inserts must give the column — in its `palbase-env.d.ts` it is required, like any `NOT NULL` column without a default — so the release that adds the fill also changes the code that inserts.

`fillWith` is one SQL scalar expression over the row's own columns. A table, function or type it names is schema-qualified (`public.accounts`): it runs with a pinned `search_path`. It reads past RLS, and what it writes is readable by anyone who can read the row. It goes only on a `NOT NULL` column with no default that is not ignored — a constant is a `.default()` — and the value stays after a rollback, so make it one the old version reads correctly.

## Removing a column or a table

The release that drops a column must not be the release that stops reading it: the version still serving reads it until complete. So a column or a table **with data** goes in two releases:

1. Mark it — `.ignored()` on a column, `{ ignored: true }` on a table — and push. Nothing changes in the database; this release's code no longer names it, and the typed tables leave it out of every row and every statement.
2. Remove it from the schema and push. Its data goes at that release's complete.

A dropped or ignored `NOT NULL` column with no default needs one in the release that ignores it — the new version inserts rows without it, and the old version reads that value in them. Palgres does not make such a column nullable for you: the old version would then read it empty, and after a rollback go on doing so.

## Changing data once

A value a column can be worked out from — the rows already there, and each write of the version still serving — is a fill: `.fillWith(sql)`, run in batches beside both versions with nothing held. Every other change of data that is made once — a catalog's rows, data moved into a new shape, a repair — is a [task](https://palbase.studio/docs/backend/tasks), not part of the migration: it runs on your machine once the release is out, in your own code, and its progress shows in Studio.

```ts
// src/modules/people/split-full-names.task.ts
import { Database, Task, z } from "palbase/backend";

// Picks up only what is still to do: run again, it does nothing twice.
@Task({ name: "split-full-names", payload: z.object({}) })
export class SplitFullNames {
  async run(): Promise<void> {
    await Database.$asService().$query(
      "update people set first_name = split_part(full_name, ' ', 1) where first_name is null and full_name is not null",
    );
  }
}
```

Put it once the release is out, under a key, so a second put is the first one answered:

```sh
palbase machines:tasks:enqueue split-full-names --key split-full-names-1
```

A key holds for a day after the task is over: write the task so a later run finds nothing left to do, as above, rather than counting on the key. A change that is too large for one statement does a share of the rows each run, and puts itself again (`Tasks.enqueue`, with the next key) until none is left.

There is no `backfill(name, sql)` here: a bare `UPDATE` run as part of a release would race the writes of the version still serving, and stay in the schema file for good.

## What is refused, and what to do instead

A refused migration changes nothing, and the version serving keeps serving. The build says what was refused and the way through:

| Change | Instead |
|---|---|
| A column or table with data is removed from the schema | Mark it `.ignored()` / `{ ignored: true }` and release; remove it in the next release |
| A nullable column becomes `NOT NULL` | Give `.fillWith(sql)` |
| A new `NOT NULL` column has no default | `.default(…)` or `.fillWith(sql)` |
| A dropped or ignored `NOT NULL` column has no default | Give it a default in that release |
| The type of a column a `CHECK`, a policy, an expression or partial index, the primary key or another table's foreign key uses | Add a column of the new type with `.fillWith("old::newtype")`, move what uses it, then ignore the old column |
| A type Postgres has no cast to, either way (boolean to an enum, a timestamp to a boolean), or an enum to one whose labels differ | Add a column of the new type with `.fillWith(sql)`, move to it, then ignore the old column — refused on an empty table too |
| The primary key changes | Add a unique constraint |
| An enum loses a value | Add a new enum type and move the column to it |
| An identity column is added to a table with rows | Add a `bigint` column with a default, and fill it |
| A column of a domain with a `CHECK` is added to a table with rows | Add it as the domain's base type with a `CHECK` |
| A column changes type and becomes `NOT NULL` in one release | Change its type in this release, make it `NOT NULL` in the next |
| A raw unit that is a trigger, a rule or a view has no `drop` | Give it one: `raw(name, up, { drop })` |
| A raw index, domain, type or sequence changes under its name | An index: give the new one its own name. A domain, type or sequence: say the change as an `ALTER …` in a unit of its own |
| A policy reads a column (or a table) the same release renames | Rename in this release, change the policy in the next |

## What to know while both versions run

- **Constraints and policies apply at start**, for both versions: Postgres keeps one set of policies per table, and a new constraint holds for every write.
- **A unique the new version drops holds until complete** — the old version's upserts need it — so while both run, the new version cannot write what it forbids. A unique or index changed under its name is built beside the old one, and takes its name at complete.
- **A type change keeps both versions' values.** A value one version wrote is not cast back over when the other updates another column.
- **A stored generated column made plain** is computed for the old version's writes until complete; a rollback leaves it plain.
- **An enum value start added stays after a rollback** — Postgres cannot drop one — and so does a fill.

## Taking over a database Palgres did not make

A database another tool left — Prisma, Drizzle, a team's hand-written SQL — comes over as it is. Palgres writes schema files from it, read only; the address is an environment variable, not an argument, because it holds a password:

```bash
PALGRES_DATABASE_URL='postgresql://…' bun node_modules/palgres/src/cli.ts pull src
# wrote src/db/public.ts
#   column public.orders.user_id may hold a user's id: mark it ownedByUser() or userRef() so user.deleted reaches it
```

What the DSL's builders say is written with them; a default, check or policy they cannot say is written as its SQL. An index the typed form cannot say, and what the database holds besides tables — domains, types, sequences, functions, views, triggers — are raw units in Postgres' own words. The command prints what to look at: columns that may hold a user's id, and what it leaves as it is (a partitioned table, a view over one).

The first release with those files takes the database over. The declared schema is made in a shadow database — the owner has `CREATEDB` for it — and the two are compared the way Postgres writes them. Held as declared, the database becomes version 1 and nothing in it changes; held otherwise, it becomes version 1 as it is, and the ordinary migration to the declared schema does exactly the difference, with the same refusals. A refused take-over writes nothing. Row-level security forced on the owner is turned off — Palgres migrates as the owner, and the app never connects as it — and a database whose own `auth.uid()`, `auth.jwt()` or `auth.role()` reads its caller another way is refused until you rename yours.

## Related

- [Schema](https://palbase.studio/docs/backend/schema) — the declarations a release migrates to
- [Database](https://palbase.studio/docs/backend/database) — the typed tables, and raw SQL while a rename is open
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) — policies, which apply at start
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — what a push does, and the migration run's lines
- [Databases](https://palbase.studio/docs/machines/databases) — giving a machine its database, with migrations on
