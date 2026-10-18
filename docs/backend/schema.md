> The full documentation index: https://palbase.studio/llms.txt

# Schema

Your database schema lives in your repository, in TypeScript, one file per Postgres schema: `src/db/public.ts` declares `public`, `src/db/billing.ts` declares `billing`. Each file default-exports a `defineSchema("<name>", { tables })` call naming its tables, columns, foreign keys, [Row-Level Security policies](https://palbase.studio/docs/backend/row-level-security), constraints, indexes and extensions. The DSL is Palgres', re-exported by `palbase/backend`, and it is the only description of the schema you write. There are no migration files: every release of your machine migrates its database to what these files declare, beside the version still serving — see [Schema changes](https://palbase.studio/docs/backend/migrations).

## Quick example

```ts
// src/db/public.ts
import {
  boolean, defineSchema, defineTable, enumType, index, integer, jsonb,
  ownedByUser, policy, text, timestamp, uuid,
} from "palbase/backend";

export const lists = defineTable("lists", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    title: text(),
  },
  policies: (p) => [
    policy("lists_own").for("all").to("authenticated")
      .using(p.col("owner").eq(p.auth.uid()))
      .withCheck(p.col("owner").eq(p.auth.uid())),
  ],
});

export const todos = defineTable("todos", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    list_id: uuid().references(() => lists.id, { onDelete: "cascade" }),
    owner: ownedByUser(),
    title: text(),
    status: enumType("todo_status", ["open", "done", "archived"]).default("open"),
    priority: integer().default(0),
    done: boolean().default(false),
    meta: jsonb().nullable(),
    created_at: timestamp().defaultNow(),
  },
  // `policies` and `indexes` are CALLBACKS: `p` carries this table's own column
  // names, so `p.col("ownr")` is a compile error, not a refusal from Postgres.
  policies: (p) => [
    policy("todos_own").for("all").to("authenticated")
      .using(p.col("owner").eq(p.auth.uid()))
      .withCheck(p.col("owner").eq(p.auth.uid())),
  ],
  indexes: (p) => [index("todos_owner_created").on(p.col("owner"), p.col("created_at"))],
});

export default defineSchema("public", { tables: [lists, todos] });
```

The app hands its schemas to the framework in `src/main.ts`. That is how they are found — no directory is scanned:

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";
import schema from "./db/public";

// Serves on $PORT with its database. Run by a release with PALBASE_DB_MIGRATE,
// the same image migrates the database to this schema and exits.
await PalbaseFactory.create(AppModule, { db: { schemas: [schema] } });
```

```ts
// src/app.module.ts
import { Module } from "palbase/backend";

@Module({ imports: [] })
export class AppModule {}
```

Five things to notice:

- **A table is a value that knows its own name.** `defineTable("todos", …)` returns a binding, and `defineSchema` reads the name off it. That is what lets `todos` point at `lists`: one place writes each name, so a reference never resolves against a table whose identity is not set yet.
- **`defineSchema` takes an array** of those bindings, and its first argument is the schema's own name.
- **The file `export default`s the `defineSchema(...)` call.** `main.ts` imports that value; Palgres' type generator reads the same value.
- **Columns are `NOT NULL` by default**; `.nullable()` opts in to `NULL`.
- **RLS is on by default**, and declaring `policies` forces it on. A table with RLS and no policy denies everything — the most common reason a fresh backend's first `GET` returns `[]`. Read [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) before your first release.

## One file per schema

```text
src/db/
  public.ts     → defineSchema("public", …)
  billing.ts    → defineSchema("billing", …)
```

Every schema the app declares is in the `schemas` list it gives `PalbaseFactory.create`, and its tables are reached as `Database.<schema>.<table>` — `Database.public.todos`, `Database.billing.invoices`. A foreign key into another schema imports the table binding and points at it:

```ts
// src/db/billing.ts
import { defineSchema, defineTable, numeric, uuid } from "palbase/backend";
import { lists } from "./public";

const invoices = defineTable("invoices", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    list_id: uuid().references(() => lists.id),
    amount: numeric({ precision: 12, scale: 2 }),
  },
  rls: false,
});

export default defineSchema("billing", { tables: [invoices] });
```

Export the tables another file references (`export const lists = defineTable(…)`). The written foreign key names its target with its schema — `billing.invoices.list_id` points at `public.lists`, never at a same-named table the `search_path` happens to find. A reference into a table no `defineSchema` has claimed is refused with both names, so declare the referenced schema's file and import it.

## `defineTable`

`defineTable(name, input)`. Only `columns` is required.

| Field | Type | What it is |
|---|---|---|
| `columns` | `{ [name]: ColumnBuilder }` | **required** — the table's columns |
| `rls` | `boolean` | defaults to `true`; `false` is the explicit opt-out for a public table |
| `policies` | `(p) => PolicyBuilder[]` | RLS policies; a non-empty list forces `rls` on |
| `primaryKey` | `string[]` | composite primary key, in order |
| `unique` | `{ name, columns }[]` | named multi-column `UNIQUE` constraints |
| `checks` | `{ name, expr }[]` or `(c) => CheckDef[]` | `CHECK` — raw SQL, or the typed `check(name, c.col("total").gt(0))` |
| `indexes` | `(c) => IndexBuilder[]` | `index("name").on(c.col("x"))`, partial, expression, unique, covering |
| `foreignKeys` | `(c) => ForeignKeyBuilder[]` | multi-column `FOREIGN KEY` |
| `raw` | `raw(name, sql)[]` | what the typed fields cannot say — another index method, an `EXCLUDE` |
| `ignored` | `boolean` | "this release no longer reads this table" — the first half of dropping it |

Every callback field is a callback for the same reason: the argument carries this table's own column names as a literal union, so a misspelt column is a compile error on the line you wrote it, not an error from Postgres in the middle of a release.

The returned value **is its columns**: `todos.id` is the `id` column builder, which is what makes `references(() => todos.id)` an ordinary expression your editor completes. The table's own metadata hangs off a symbol, so a column may be called `name`, `columns` or `rls` without shadowing anything. Each table gets its own copy of the column builders it is given, so a shared spread (`...audit`) of columns in two tables is two sets of columns.

## `defineSchema`

`defineSchema(name, input)`.

| Field | Type | What it is |
|---|---|---|
| `tables` | `TableHandle[]` | **required** — the `defineTable` bindings, in any order |
| `extensions` | `string[]` | Postgres extensions the migration creates — see [Postgres extensions](#postgres-extensions) |
| `raw` | `raw(name, up, { drop })[]` | schema-level units: views, functions, triggers over several tables |

`defineSchema` is where every pending reference is resolved: the `() => lists.id` callbacks run here, once every binding exists. Two tables of one name in one schema are refused, and so are two raw units of one name.

## Column types

All factories are imported from `palbase/backend`. The third column is the type `palbase-env.d.ts` gives the value on `Database.public.*` (see [Where the types come from](https://palbase.studio/docs/backend/database)).

| Factory | Postgres type | Row type |
|---|---|---|
| `uuid()` | `uuid` | `string` |
| `text()` | `text` | `string` |
| `integer()` | `integer` | `number` |
| `bigint()` | `bigint` | `string` |
| `numeric()` / `numeric({ precision, scale })` | `numeric` / `numeric(p,s)` | `string` |
| `boolean()` | `boolean` | `boolean` |
| `timestamp()` | `timestamp with time zone` | `string` |
| `date()` | `date` | `string` (`"YYYY-MM-DD"`) |
| `jsonb()` | `jsonb` | `Json` |
| `enumType(name, values)` | a Postgres enum type named `name` | the union of the values |
| `sqlType("inet")` | the Postgres type, as Postgres spells it | `string` — `number` for `smallint`, `real`, `double precision` |

A `.nullable()` column's row type becomes `T | null`. `.array()` makes any scalar an array — `text().array()` is `text[]`, surfaced as `string[]`, filtered with `contains` and `overlaps`; the only default an array takes is the empty one, `.default([])`.

`bigint()` and `numeric()` surface as **`string`**: a JavaScript number cannot hold a 64-bit integer past 2^53 or an arbitrary-precision decimal without rounding. Keep money in them and parse with `BigInt(row.amount)` or a decimal library — or declare `.asNumber()` on a column whose values you know fit in a JS number, and it surfaces as `number`. `date()` is a calendar day, not an instant: a JS `Date` would pick a time zone for it.

`sqlType()` is the escape hatch for a type the DSL does not offer — `inet`, `interval`, `citext`, `character varying(20)`, `vector(1536)`. Spell it as Postgres does (`character varying(20)`, not `varchar(20)`); a type the DSL has is refused by name (`sqlType("text")` asks for `text()`), so each type has one spelling.

### jsonb

A `jsonb()` column takes a plain object or array on insert and update — do not `JSON.stringify` it — and reads back as the value. `jsonb<T>()` takes a payload type, but **the type does not reach `palbase-env.d.ts`**: the generated file types every `jsonb` column as `Json`. Narrow it where you read it, with a schema you already have: `TagList.parse(row.tags)`.

### Enums

`enumType(name, values)` makes a real Postgres enum type, and the TypeScript side is the narrow union of the values:

```ts
import { defineTable, enumType, uuid } from "palbase/backend";

export const tickets = defineTable("tickets", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    // row type: "open" | "pending" | "closed"
    status: enumType("ticket_status", ["open", "pending", "closed"]).default("open"),
    tags: enumType("ticket_tag", ["bug", "billing", "other"]).array().default([]),
  },
});
```

The first argument is the Postgres type's name, not the column's. Adding a value is an ordinary migration; removing one is refused (Postgres cannot drop an enum value) — see [Schema changes](https://palbase.studio/docs/backend/migrations).

## Chain methods

Every builder method returns a builder, so modifiers chain.

| Method | Effect |
|---|---|
| `.primaryKey()` | `PRIMARY KEY` |
| `.notNull()` / `.nullable()` | `NOT NULL` (the default) / allow `NULL` |
| `.default(value)` | a literal `DEFAULT` |
| `.defaultRandom()` | `uuid()` — `DEFAULT gen_random_uuid()` |
| `.defaultNow()` | `timestamp()` — `DEFAULT now()`; `date()` — `CURRENT_DATE` |
| `.defaultSql(expr)` | a default the database computes, written as SQL |
| `.dbAssigned()` | a trigger or rule writes the value: optional on insert, no `DEFAULT` in the DDL |
| `.unique()` | single-column `UNIQUE` |
| `.array()` | an array of this type |
| `.identity()` | `GENERATED ALWAYS AS IDENTITY` on `integer()`/`bigint()` — off every insert and update; `{ always: false }` is `BY DEFAULT` |
| `.generated(expr, { stored? })` | `GENERATED ALWAYS AS (expr)` — virtual by default (Postgres 18), `stored: true` on disk |
| `.references(() => t.col, opts?)` | a foreign key — see [Foreign keys](#foreign-keys) |
| `.selfReferences("column", opts?)` | a foreign key onto this same table |
| `.onDelete(action)` | `ON DELETE` of a foreign-key column |
| `.asNumber()` / `.asDecimal()` | surface a `numeric`/`bigint` column as `number`, or say `string` explicitly |
| `.renamedFrom(previous)` | this column used to be called `previous` |
| `.fillWith(sql)` | how to fill a `NOT NULL` column for rows that do not supply it — see [Schema changes](https://palbase.studio/docs/backend/migrations) |
| `.ignored()` | this release no longer reads or writes the column — the first half of dropping it |

## Foreign keys

The target is a **callback**: `references(() => lists.id)`, not `references(lists.id)`. It runs inside `defineSchema`, where every binding exists, which is what makes a cycle expressible.

| Option | What it does |
|---|---|
| `onDelete` | `"cascade"`, `"set null"`, `"set default"`, `"restrict"` or `"no action"` (the default) |
| `onUpdate` | the same actions, on a change of the referenced key |
| `as` | the forward relation's name — `list_id` gives `list` by default |
| `reverseAs` | the reverse relation's name on the parent — this table's name by default |
| `index` | `false` leaves the column without the index Palgres makes for a foreign key |

Postgres does not index a foreign key's column by itself, and every join through it and every `ON DELETE CASCADE` pays for that. Palgres makes `<table>_<column>_idx` for each one unless you say `index: false` — which is right only when the column is updated often enough that an index on it would cost more than it saves.

### Pointing at this same table

A parent pointer — category trees, replies, org charts — takes the column's name and no callback:

```ts
import { defineTable, text, uuid } from "palbase/backend";

export const categories = defineTable("categories", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    name: text(),
    parent_id: uuid().nullable().selfReferences("id"),
  },
  rls: false,
});
```

### Two tables that point at each other

A cycle needs an explicit return type on **one** side, and one is enough:

```ts
import { type AnyColumn, defineTable, uuid } from "palbase/backend";

export const members = defineTable("members", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    // the annotated side — without it TypeScript chases its own tail (TS7022)
    primary_team_id: uuid().nullable().references((): AnyColumn => teams.id),
  },
});

export const teams = defineTable("teams", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    lead_id: uuid().nullable().references(() => members.id),
  },
});
```

### Two foreign keys to the same table

Every foreign key gives two relation names, which [`with` and `has`](https://palbase.studio/docs/backend/database) read: the forward one on the child (`billing_address_id` → `billing_address`) and the reverse one on the parent (by default the child table's name). Two keys from one table onto one parent collide on the reverse side, so name at least one:

```ts
import { defineTable, text, uuid } from "palbase/backend";

export const addresses = defineTable("addresses", {
  columns: { id: uuid().primaryKey().defaultRandom(), line1: text() },
});

export const orders = defineTable("orders", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    billing_address_id: uuid().references(() => addresses.id, { reverseAs: "billed_orders" }),
    shipping_address_id: uuid().references(() => addresses.id, { reverseAs: "shipped_orders" }),
  },
});
```

A collision is refused when the schema is built, naming both columns and the option that fixes that direction.

### Composite foreign keys

A key of more than one column is declared on the table, with its own name:

```ts
import { defineTable, foreignKey, text, uuid } from "palbase/backend";

export const projects = defineTable("projects", {
  columns: { org_id: uuid(), id: uuid().defaultRandom(), name: text() },
  primaryKey: ["org_id", "id"],
});

export const tasks = defineTable("tasks", {
  columns: { id: uuid().primaryKey().defaultRandom(), org_id: uuid(), project_id: uuid() },
  // A task's project must be of the same organization — a per-column key cannot say so.
  foreignKeys: (c) => [
    foreignKey("tasks_project_fkey").on(c.col("org_id"), c.col("project_id")).references(projects, "org_id", "id").onDelete("cascade"),
  ],
});
```

## Rows that belong to a user

Your users are the project's [auth](https://palbase.studio/docs/web/auth) users, and they live in the platform, not in your database — so a column holding a user's id is plain `text`, with no foreign key. Two factories declare one, and say what happens to the row when that user is deleted:

| Factory | Means | When the user is deleted |
|---|---|---|
| `ownedByUser()` | this row **belongs to** the user — `text`, `NOT NULL` | the row is deleted |
| `userRef({ onDelete })` | this row **points at** a user — `created_by`, `edited_by` | `"cascade"`: deleted; `"set null"`: the column is set to `NULL` (declare it `.nullable()`) |

```ts
import { defineTable, ownedByUser, text, userRef, uuid } from "palbase/backend";

export const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    edited_by: userRef({ onDelete: "set null" }).nullable(),
    body: text(),
  },
});
```

**At most one `ownedByUser()` per table**: which column's user takes the row with them must not depend on the order the columns are declared in.

Deleting what a schema keeps of a user is the framework's job, not yours: when the platform delivers `user.deleted`, `palbase/backend` deletes the user's owned rows and nulls the `set null` references, in one transaction as the service role. That needs the delivery to arrive, so **an app whose schema declares either factory refuses to start without `PALBASE_WEBHOOK_SECRET`** — on a machine the platform gives it, and keeps the machine's `/webhooks/palbase` endpoint for `user.deleted`. See [Event Hooks](https://palbase.studio/docs/backend/hooks) for what that endpoint takes.

> **Note:** A plain `text()` column holding a user's id is not one the framework knows to clear: nothing deletes what it keeps when the user goes, and that erasure is yours to do.

## What is optional on insert

A column is optional on insert when the database can fill it: `.nullable()`, any default (`.default()`, `.defaultRandom()`, `.defaultNow()`, `.defaultSql()`), or `.dbAssigned()`. An `.identity()` (always) or `.generated()` column is on the row and off the insert entirely. Everything else is required. For `todos` above, `Database.public.todos.insert(…)` takes `list_id`, `owner` and `title`, and may take `id`, `status`, `priority`, `done`, `meta` and `created_at`.

## Constraints and indexes

```ts
import { check, defineTable, index, integer, numeric, raw, sqlType, text, timestamp, uuid } from "palbase/backend";

export const products = defineTable("products", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    sku: text(),
    email: text().nullable(),
    price: numeric({ precision: 12, scale: 2 }),
    stock: integer().default(0),
    embedding: sqlType("vector(3)").nullable(),
    deleted_at: timestamp().nullable(),
  },
  rls: false,
  unique: [{ name: "products_sku_key", columns: ["sku"] }],
  checks: (c) => [check("products_price_positive", c.col("price").gt(0)), check("products_stock_not_negative", c.col("stock").gte(0))],
  indexes: (c) => [
    // partial: only the live rows
    index("products_live").on(c.col("sku")).where(c.col("deleted_at").isNull()),
    // partial UNIQUE: NULLs free, non-NULLs unique
    index("products_email_unique").unique().onExpression("lower(email)").where(c.col("email").isNull(true)),
    // covering, newest first
    index("products_stock").on(c.col("stock")).desc().include(["price"]),
  ],
  // What the typed fields cannot say: another index method, an operator class.
  raw: [raw("products_embedding", "CREATE INDEX IF NOT EXISTS products_embedding ON public.products USING hnsw (embedding vector_cosine_ops)")],
});
```

- **`unique`** renders a `UNIQUE` constraint and cannot carry a condition, because Postgres has no partial unique constraint. `index(name).unique().where(…)` is the declarative way to say "NULLs are free, non-NULLs are unique".
- **`checks`** comes in two forms: the typed callback above, whose column names are checked as you type, or `[{ name, expr }]` with the SQL written out. The typed form refuses a subquery or `auth.uid()` — a `CHECK` cannot hold either.
- **`indexes`** — `.on(...cols)` (order kept), `.onExpression(sql)`, `.where(pred)` in the same expression language as policies, `.unique()`, `.include(cols)`, `.asc()`/`.desc()`, `.nulls("first" | "last")`. A migration builds each one `CONCURRENTLY`, so a write never waits for it. An index whose definition changes under the same name is built beside the old one, which the version still serving reads through, and takes its name when the release completes.
- **`raw`** on a table runs its SQL as it is, as the tables' owner. A raw index is known by its name too, so a changed body under the same name is refused: give it a new name.

### Schema-level raw units

What belongs to no single table — a view, a function, a trigger over several tables — is a unit of the schema, and unlike a table's raw entry it has a teardown the migration runs:

```ts
import { boolean, defineSchema, defineTable, ownedByUser, policy, raw, text, uuid } from "palbase/backend";

export const tasks = defineTable("tasks", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), title: text(), done: boolean().default(false) },
  policies: (p) => [policy("tasks_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", {
  tables: [tasks],
  raw: [
    raw(
      "open_tasks",
      "CREATE VIEW public.open_tasks WITH (security_invoker = true) AS SELECT id, owner, title FROM public.tasks WHERE NOT done",
      { drop: "DROP VIEW public.open_tasks" },
    ),
  ],
});
```

A new unit runs its `up`; a unit whose `up` changed runs its previous `drop`, then the new `up`; a unit removed from the declaration runs its `drop`. A view must be `security_invoker = true`, so the reader's policies apply through it. A view, a trigger or a rule with no `drop` is refused — a rollback could not take it back. `{ before: true }` makes a unit before the tables: a domain, a type or a function a column's default calls.

## Postgres extensions

```ts
import { defineSchema, defineTable, sqlType, text, uuid } from "palbase/backend";

const places = defineTable("places", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    name: text(),
    at: sqlType("geography(Point,4326)"),
    embedding: sqlType("vector(1536)").nullable(),
  },
  rls: false,
});

export const geo = defineSchema("public", { tables: [places], extensions: ["postgis", "vector"] });
```

The migration runs `CREATE EXTENSION IF NOT EXISTS` for each, as the database's owner, who is not a superuser — so an extension must be one the owner may create. A Palbase database is Postgres 18 and makes these trusted beside Postgres' own trusted extensions (`pg_trgm`, `citext`, `pgcrypto`, `unaccent` and the rest of contrib's trusted set): `vector` (pgvector), `postgis`, `postgis_topology`, `postgis_raster` and `pg_stat_statements`. A typed column of an extension's type is an `sqlType()`; an index of its method is a `raw` entry. Extensions are only ever added.

## Row-Level Security in the schema

RLS is declared beside the columns, in each table's `policies`, and it is on for every table that does not say `rls: false`. The builder, the roles a policy names, membership policies and the service role are on [Row-Level Security](https://palbase.studio/docs/backend/row-level-security).

## From a declaration to a database

Edit `src/db/public.ts`, commit and push to the machine's branch. The machine builds your image, and before the new version serves, the platform runs that image once with `PALBASE_DB_MIGRATE=start`: it migrates the database to the schema the image carries, while the version before keeps serving. Once nothing of the old version is left, it runs `complete`. You run nothing yourself, and a change that cannot run under both versions is refused before anything changes. How each kind of change goes — and which take two releases — is [Schema changes](https://palbase.studio/docs/backend/migrations).

## Related

- [Database](https://palbase.studio/docs/backend/database) — the typed `Database.public.*` surface these declarations type, and `palbase-env.d.ts`
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) — policies, roles, and `$asService()`
- [Schema changes](https://palbase.studio/docs/backend/migrations) — how a release migrates, `renamedFrom`, `fillWith`, `ignored`, and what is refused
- [Databases](https://palbase.studio/docs/machines/databases) — giving a machine a database, and its migrations
- [Event Hooks](https://palbase.studio/docs/backend/hooks) — `user.deleted`, and the webhook secret an app that keeps users' ids needs
