> The full documentation index: https://palbase.studio/llms.txt

# Database

A machine given one of the project's [databases](https://palbase.studio/docs/machines/databases) is started with `PALBASE_DB_URL`, and a `palbase/backend` app that declares its schemas talks to it through `Database`. There is no client to construct: you import `Database` from `palbase/backend` and call it. Two things about it are load-bearing. `Database.public.<table>` is typed against the tables your [schema](https://palbase.studio/docs/backend/schema) declares, and every statement runs inside **the request's own transaction, as the caller** — a signed-in user is Postgres' `authenticated` role with their claims, anyone else `anon` — so [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) filters what your code can even see. The one deliberate exception is `Database.$asService()`, which opens a separate transaction as the service role: explicit, greppable, never the default.

## Quick example

The schema the examples on this page use:

```ts
// src/db/public.ts
import {
  boolean, defineSchema, defineTable, integer, numeric, ownedByUser, policy, text, timestamp, userRef, uuid,
} from "palbase/backend";

export const lists = defineTable("lists", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), title: text() },
  policies: (p) => [policy("lists_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export const todos = defineTable("todos", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    list_id: uuid().references(() => lists.id, { onDelete: "cascade" }),
    owner: ownedByUser(),
    title: text(),
    done: boolean().default(false),
    priority: integer().default(0),
    tags: text().array().default([]),
    created_at: timestamp().defaultNow(),
  },
  policies: (p) => [policy("todos_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export const list_members = defineTable("list_members", {
  columns: {
    list_id: uuid().references(() => lists.id, { onDelete: "cascade" }),
    user_id: userRef({ onDelete: "cascade" }),
    role: text().default("member"),
  },
  primaryKey: ["list_id", "user_id"],
  policies: (p) => [policy("members_self").for("all").using(p.col("user_id").eq(p.auth.uid())).withCheck(p.col("user_id").eq(p.auth.uid()))],
});

export const payments = defineTable("payments", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    idem_key: text().unique(),
    amount: numeric({ precision: 12, scale: 2 }),
  },
  policies: (p) => [policy("payments_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [lists, todos, list_members, payments] });
```

A service that reads and writes it, and the controller and module around it:

```ts
// src/modules/todos/todos.service.ts
import { Database, Injectable, NotFound } from "palbase/backend";
import type { Tables } from "palbase/backend/env";

export type Todo = Tables["todos"]["row"];

@Injectable()
export class TodosService {
  open(): Promise<Todo[]> {
    // No owner filter: RLS scopes this to the caller's own rows.
    return Database.public.todos.findMany({ where: { done: false }, orderBy: { column: "created_at", direction: "desc" } });
  }

  create(owner: string, listId: string, title: string): Promise<Todo> {
    return Database.public.todos.insert({ owner, list_id: listId, title });
  }

  async finish(id: string): Promise<Todo> {
    const todo = await Database.public.todos.update({ where: { id }, set: { done: true } });
    if (!todo) throw new NotFound("todo not found");
    return todo;
  }
}
```

```ts
// src/modules/todos/todos.controller.ts
import { Body, Controller, Get, Param, Post, User, z, type UserT } from "palbase/backend";
import { TodosService, type Todo } from "./todos.service";

const CreateTodo = z.object({ listId: z.string().uuid(), title: z.string().min(1).max(200) });
type CreateTodo = z.infer<typeof CreateTodo>;

@Controller("/todos")
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get("")
  list(): Promise<Todo[]> {
    return this.todos.open();
  }

  @Post("")
  create(@Body(CreateTodo) body: CreateTodo, @User() user: UserT): Promise<Todo> {
    return this.todos.create(user.id, body.listId, body.title);
  }

  @Post("/{id}/done")
  finish(@Param("id") id: string): Promise<Todo> {
    return this.todos.finish(id);
  }
}
```

```ts
// src/modules/todos/todos.module.ts
import { Module } from "palbase/backend";
import { TodosController } from "./todos.controller";
import { TodosService } from "./todos.service";

@Module({ controllers: [TodosController], providers: [TodosService] })
export class TodosModule {}
```

The app passes its schemas to the framework — `PalbaseFactory.create(AppModule, { db: { schemas: [schema] } })` in `src/main.ts` — and that is what opens the database at boot. `Database` is imported by the service, not by the controller: which rows, whose, and in what order are the decisions worth testing, and they belong in the class you test.

## One request, one transaction

Each request is one transaction, opened by its first statement:

- **committed when the handler returns** — before the answer goes — and **rolled back when it throws**, whatever it wrote;
- reached from the handler, from any service it calls, and from an [`@On` handler](https://palbase.studio/docs/backend/hooks) (a delivery is one transaction too) — **never at import time or from a timer**: outside a request `Database.<anything>` throws, naming what was reached;
- **a request that only read** (`findMany`, `findUnique`, `findById`, `count`, `aggregate`, `page`) does not wait for its `COMMIT` — a read of one statement is one round trip — and gives its connection back while the handler [waits on something else](#a-handler-that-waits-on-something-else);
- **a client that hangs up cancels it**: the statement in flight is cancelled and its connection goes back;
- **bounded**: a statement runs at most 55 seconds and waits at most 10 seconds for a lock (5 on `$asService()`), so nothing a request runs outlives the edge in front of the machine.

A database that slept, restarted or failed over closes the connections the app holds. A request that meets a closed one on its first round trip opens another and sends it again — nothing of it had committed — and the caller sees nothing. A connection lost later answers `503 database_unavailable`, because part of the work may have committed.

### A handler that waits on something else

There is nothing to set. A request whose transactions have only read gives its connections back once it has sat a millisecond with no statement running — a call to another service, a timer — and its next statement opens another transaction, bound to the caller again — never refused because the database's queue is full, and ahead of the caller's own requests that have not begun. Reads one after another, and your own code between them, stay in one transaction: giving a connection back and taking one again costs a fraction of a millisecond, so it happens only where a wait is worth it.

```ts
// src/modules/todos/todos-print.service.ts
import { Database, Injectable, NotFound } from "palbase/backend";

@Injectable()
export class TodosPrintService {
  async pdf(id: string) {
    const todo = await Database.public.todos.findUnique({ where: { id }, select: ["id", "title", "done"] });
    if (!todo) throw new NotFound("no such todo");
    // The connection is back in the pool while the other service works.
    const rendered = await fetch("https://pdf.example.com/render", { method: "POST", body: JSON.stringify(todo) });
    return new Response(rendered.body, { headers: { "content-type": "application/pdf" } });
  }
}
```

What is held to the end of the request, because ending it there could change what comes after:

- **after a write** (`insert`, `update`, `delete`, `put`, …), **a lock** (`lock` on `findUnique`, `$lockRows`, `$lockRowsWhere`, `$advisoryXactLock`), **a savepoint** (`$attempt`, `$transaction`) or **SQL of your own** (`$query` — the engine cannot know what it does): everything after it is the same transaction, so a throw still undoes all of it;
- **under a database whose default isolation is repeatable read or serializable**, where one snapshot spans the transaction's statements;
- **while an `$atomic` of the request is open** — it is a transaction of its own, and nothing of the request is given back beside it.

So make the outside call before the first write, and outside `$atomic`. A request that holds a transaction with no statement running for over a second says so in the app's log, once, naming the route:

```text
[palbase] POST /invoices: a transaction of the request could not be given back — it wrote, locked, is an $atomic or an $attempt, ran SQL of its own, or the database keeps one snapshot for it — and sat 2140 ms with no statement running: the handler waited on something else, and a database connection waited with it. Make the outside call before the first write, or outside $atomic.
```

Why giving it back is safe: under read committed, Postgres' default, every statement sees what was committed when it started, and a transaction that only read holds no row lock — the next statement sees what it would have seen in the same transaction. What does move across a wait: `now()` is the new transaction's, a migration's change to a table can land between two reads, and a policy or view that calls a function which writes has that write committed.

## Where the types come from

`Database.public.<table>` is typed by a declaration file, `palbase/palbase-env.d.ts`, that augments `palbase/backend/env`'s `Tables` (and `Schemas`, for every other schema). The CLI writes it from your schema files — each table's row, its insert, its unique keys and its relations both ways (`with`, `has`) — between its markers in that file; `palbase init --db` writes the first one. Run it again after you change a schema file, and commit the file:

```bash
palbase db:types
```

It reads the app's entry (`--entry <file>` when it is not the one the project names) and writes `palbase/palbase-env.d.ts` (`--file <path>` for another); the app's tsconfig must include the file. A schema that has not changed writes the same bytes, so a check in CI can run it and fail on a diff.

A build that cannot run the CLI writes the same declarations with palgres' `makeEnvDts([schema])`.

When you need a row type by name, import it:

```ts
import type { Tables } from "palbase/backend/env";

type Todo = Tables["todos"]["row"];
type NewTodo = Tables["todos"]["insert"];
```

> **Note:** If `Database.public.todos` is a compile error saying the property does not exist, the file has not been written for that table yet. Before any schema exists, `Tables` is empty and every `Database.public.*` access is a compile error — the types are only ever what your schema declares. The runtime never needs them — Bun runs the app without type-checking it — so the file is for your editor and `tsc`.

## The full surface

`Database` carries your schemas by name — `Database.public.<table>`, `Database.<schema>.<table>` — and operations that begin with `$`. A schema or table name can never start with `$`, so a table called `transaction` is `Database.public.transaction` and the operation is `Database.$transaction`.

| Member | What it is |
|---|---|
| `public.<table>`, `<schema>.<table>` | the typed table operations below |
| `$query<T>(sql, params?)` | raw SQL on the request's transaction — **not** read-only |
| `$transaction(fn)` | a **plan** run inside one savepoint of the request's transaction |
| `$atomic(fn, opts?)` | an independently committed transaction, with retries |
| `$attempt(fn)` | `fn` inside a `SAVEPOINT`: its failure rolls back only what its handle wrote |
| `$asService()` | the same surface as the service role, past RLS |
| `$lockRows(table, ids)` | locks those rows in primary-key order — never the caller's order, so two callers cannot deadlock on it |
| `$lockRowsWhere(table, where, { mode })` | locks the rows a filter matches, in one statement |
| `$advisoryXactLock(key)` | locks a **name** until the transaction ends — "one invoice run at a time" |

Every typed table method also has a string-keyed twin — `$insert(table, data)`, `$findMany(table, where, opts)`, `$updateMany`, `$put`, `$claim`, `$count`, `$aggregate`, `$page` and the rest — for code where the table's name is a variable. The name is `"todos"` for `public` and `"ledger.accounts"` for any other schema.

## Typed tables

Every read and every bulk write takes one object — `where`, `select`, `orderBy`, `limit`, `with` sit side by side in it.

| Method | Returns |
|---|---|
| `insert(data)` | the inserted row |
| `insertMany(rows, { onConflict?, action?, returning? })` | the rows written, or their count with `returning: false` — `action: "ignore"` skips a duplicate |
| `findById(id)` / `findUnique({ where, lock? })` | the row, or `null` — with `lock`, locked until the transaction ends |
| `findMany({ where?, select?, orderBy?, limit?, offset?, with? })` | the matching rows |
| `page({ where?, orderBy?, first?, after?, last?, before?, select?, with? })` | `{ rows, pageInfo }` — keyset pages with sealed cursors |
| `count({ where? })` | how many rows match |
| `aggregate({ where?, sum?, avg?, min?, max?, count?, groupBy? })` | the aggregate, or one row per group |
| `update({ where: { id }, set })` | the updated row, or `null` |
| `updateMany({ where, set, returning? })` | the updated rows — an empty `where` is refused |
| `delete(id)` / `deleteMany({ where })` | nothing / how many rows went |
| `put({ data, onConflict })` | insert, or overwrite the row it collided with |
| `claim(unique, extra?)` | `{ inserted, row }` — own an idempotency key, never overwrite |

`update`, `delete` and `findById` address a row by its `id` column; a table keyed otherwise is reached with `findUnique`, `updateMany` and `deleteMany`.

### Filtering and ordering

A field takes a value for equality or an operator object; fields are `AND`ed.

```ts
import { Database } from "palbase/backend";

declare const since: string;

const urgent = await Database.public.todos.findMany({
  where: {
    done: false,
    priority: { gte: 2 },
    created_at: { gt: since },
    tags: { overlaps: ["work", "urgent"] },
    OR: [{ title: { icontains: "invoice" } }, { title: { startsWith: "Pay" } }],
  },
  select: ["id", "title", "priority"],
  orderBy: [{ column: "priority", direction: "desc" }, { column: "created_at" }],
  limit: 50,
});
```

| Operator | SQL |
|---|---|
| a value | `=` — `null` is `IS NULL` |
| `{ in: [...] }` | `IN (…)` — an empty list matches no row |
| `{ neq }`, `{ gt }`, `{ gte }`, `{ lt }`, `{ lte }` | `<>`, `>`, `>=`, `<`, `<=` |
| `{ isNull: true }` / `{ isNull: false }` | `IS NULL` / `IS NOT NULL` |
| `{ contains }`, `{ icontains }`, `{ startsWith }`, `{ endsWith }` | `LIKE` / `ILIKE` on text, the pattern's `%` and `_` escaped |
| `{ contains: [...] }`, `{ overlaps: [...] }` | on an array column: `@>` (all of them), `&&` (any) |
| `OR`, `AND`, `NOT` | the branches |
| `col("other")` | compare with another column: `{ balance: { lt: col("limit") } }` |
| `now()`, `ago({ hours: 1 })` | the server's clock, and the server's clock less a span: `{ created_at: { gt: ago({ days: 7 }) } }` |
| `sqlFragment` | SQL of your own, values bound: `` where: sqlFragment`similarity(title, ${q}) > 0.3` `` |

`col`, `sqlFragment`, `increment`, `decrement`, `now`, `ago` and `withRetry` are imported from `palgres`, the package `palbase/backend` is built on. `select` narrows the returned row type; a column name in `orderBy` or `select` is checked against the schema before any SQL is written.

### Time on the database's clock: `now()` and `ago()`

```ts
import { Database } from "palbase/backend";
import { ago } from "palgres";

// Opened in the last week, by the database's clock.
const recent = await Database.public.todos.findMany({ where: { created_at: { gt: ago({ days: 7 }) } }, select: ["id", "title"] });

// Finished a month ago or more: they go.
const swept = await Database.public.todos.deleteMany({ where: { done: true, created_at: { lt: ago({ days: 30 }) } } });
```

`ago(span)` is `now()` less a span — whole `days`, `hours`, `minutes` and `seconds`, none negative — and it stands wherever `now()` does: a filter, an `insert`, an update's `set`, a plan. Both sides of the comparison are read where the data is. A window counted from `new Date()` moves with every machine's drift from the database, and a row stamped by `defaultNow()` was stamped by the database's clock.

### Relations: `has` and `with`

Every foreign key is a relation both ways — `todos.list` (forward) and `lists.todos` (reverse); [Schema](https://palbase.studio/docs/backend/schema) says how they are named. `has` filters through one, `with` fetches it in the same statement:

```ts
import { Database } from "palbase/backend";

// Lists that still have an open todo, each with its three newest.
const lists = await Database.public.lists.findMany({
  where: { has: { todos: { done: false } } },
  select: ["id", "title"],
  with: { todos: { select: ["id", "title"], orderBy: { column: "created_at", direction: "desc" }, limit: 3 } },
});

for (const list of lists) console.log(list.title, list.todos.length);
```

A `many` relation comes back as an array (`[]` when there is none), a `one` relation as a row or `null`. `with` nests three levels deep.

### Pages

`page()` is keyset pagination: the primary key is appended to the ordering, and its cursors are sealed to the query and to the caller, so a cursor from one user's query does not open another's.

```ts
import { Database } from "palbase/backend";

declare const cursor: string | undefined;

const page = await Database.public.todos.page({
  orderBy: { column: "created_at", direction: "desc" },
  first: 20,
  after: cursor,
  select: ["id", "title", "created_at"],
});
const next = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
```

`first`/`after` page forward and `last`/`before` back; a page is 50 rows when no size is given.

### Aggregates

```ts
import { Database } from "palbase/backend";

const totals = await Database.public.todos.aggregate({ where: { done: false }, count: true, sum: ["priority"] });
// { count: number; sum: { priority: string | null } }

const byList = await Database.public.todos.aggregate({ groupBy: ["list_id"], count: true });
// { list_id: string; count: number }[]

// Several counts, one statement: each name counts what its filter matches, within `where`.
const board = await Database.public.todos.aggregate({
  where: { done: false },
  count: { all: {}, urgent: { priority: { gte: 2 } }, work: { tags: { overlaps: ["work"] } } },
});
// { count: { all: number; urgent: number; work: number } }
```

`count: true` counts the rows; `count: { <name>: <filter> }` counts, in the same statement, the rows each filter matches — `count(*) FILTER (WHERE …)`, one scan however many names — within `where`, per group with `groupBy`, and `{}` is every row. Five limits checked as five `count()` calls are five round trips; as one `aggregate` they are one. `sum` and `avg` are strings — `sum(integer)` is a `bigint` and `sum(numeric)` a `numeric`, both lossy as a JS number — and an empty set sums to `null`, not 0.

### `put()`, `claim()` and skipping what is there

Read-then-write loses a race, and catching the unique violation does not rescue it: the failed insert aborts the request's transaction. Each of these is one statement.

```ts
import { Database } from "palbase/backend";

declare const listId: string;
declare const userId: string;
declare const idemKey: string;

// Write it, and overwrite the row it collided with.
await Database.public.list_members.put({ data: { list_id: listId, user_id: userId, role: "editor" }, onConflict: ["list_id", "user_id"] });

// Write it once: a second call with the same key gets the FIRST call's row back.
const { inserted, row } = await Database.public.payments.claim({ idem_key: idemKey }, { owner: userId, amount: "19.90" });

// Write the ones not there yet, whichever unique key they would collide on: what comes back is what was written.
const written = await Database.public.payments.insertMany(
  [{ owner: userId, idem_key: idemKey, amount: "19.90" }],
  { action: "ignore" },
);
```

`onConflict` must name columns a unique constraint or index covers. `put` overwrites; `claim` never does, and `inserted: false` is not an error — it is the answer that the work was already done. `insertMany` with `action: "ignore"` and no `onConflict` skips a row that collides with **any** unique key — the primary key or another — as Prisma's `skipDuplicates` and Drizzle's `onConflictDoNothing()` do; with `onConflict` it skips only a collision on those columns, and any other is still a `UniqueViolation`. An overwrite (`action: "update"`) has to name its columns. A skipped row is not an error and is not returned; a row a policy refuses is still refused.

### Locking the row you read: `findUnique({ lock })`

A decision read from a row is only as good as the row staying what it was. `lock` reads the row and locks it **in the same statement**, until the transaction ends — a read and then a lock would decide on a row another request changed in between:

```ts
import { Conflict, Database, NotFound } from "palbase/backend";

declare const listId: string;
declare const userId: string;

// A second request changing this member waits here, then reads what the first committed.
const member = await Database.public.list_members.findUnique({ where: { list_id: listId, user_id: userId }, select: ["role"], lock: "update" });
if (!member) throw new NotFound("no such member");
if (member.role === "owner") throw new Conflict("an owner is not demoted here", "owner");
await Database.public.list_members.updateMany({ where: { list_id: listId, user_id: userId }, set: { role: "viewer" } });
```

- **`"update"`** is `FOR UPDATE` — the row is about to change or go; **`"noKeyUpdate"`** `FOR NO KEY UPDATE` — it changes, its key stays; **`"share"`** `FOR SHARE` — it must not change while you read on, and other readers may share it.
- **It is held until the transaction ends** — the request's, or the `$atomic` callback's. Another transaction asking for the row waits — 10 seconds at most on a request, `lockTimeoutMs` in `$atomic`, then `503 database_busy` — and reads what the first committed: the new values, or `null` if it deleted the row.
- **One row has no lock order to get wrong.** For many rows use `$lockRowsWhere`, which takes them in primary-key order. Only the table's own row is locked, never what `with` fetches beside it.
- **Postgres checks a locking read against the table's update policies** as well as its select ones: a row the caller may read but not update comes back `null` with a `lock`.

### `$attempt()`: a failure that does not poison the request

When the recovery is not a `put`, put the write that may fail inside `$attempt`. It takes a `SAVEPOINT`, so only that write rolls back and the request goes on.

```ts
import { Database, UniqueViolation } from "palbase/backend";

declare const listId: string;
declare const userId: string;

const joined = await Database.$attempt(async (tx) => {
  await tx.insert("list_members", { list_id: listId, user_id: userId });
  return true;
}).catch((e: unknown) => {
  if (UniqueViolation.is(e)) return false;
  throw e;
});
```

The handle is a parameter, not the ambient `Database`: only what `tx` writes is inside the savepoint, so a concurrent branch of the same request is never rolled back with it.

## `null` means "no row" — including rows RLS hides

`findById`, `findUnique` and `update` resolve to `null` when no row matched, and that covers two cases you cannot tell apart from inside the handler: the id does not exist, or a policy hides the row from this caller. Not telling them apart is the point — a distinguishable answer would be an oracle for rows the caller may not read. Map it yourself where a missing row is the client's error:

```ts
import { Database, NotFound } from "palbase/backend";

declare const id: string;

const todo = await Database.public.todos.findById(id);
if (!todo) throw new NotFound("todo not found");
```

## Raw SQL with `$query()`

`$query<T>(sql, params?)` runs SQL on the request's transaction and returns rows as plain objects, typed as the `T` you say they are — only you know what raw SQL returns.

```ts
import { Database } from "palbase/backend";

declare const ids: string[];

const rows = await Database.$query<{ id: string; title: string }>(
  "SELECT id, title FROM todos WHERE id = ANY($1::uuid[]) AND NOT done ORDER BY created_at DESC LIMIT $2",
  [ids, 20],
);
```

> **Warning:** `$query` is **not** read-only. It runs on the same transaction the typed tables write through, so a write in it — a plain `UPDATE`, a CTE, a function that writes — commits with the request. What stands between it and your data is RLS and the caller's role, exactly as for everything else on this page.

Parameters are `$1…$n`, never interpolated. Each is sent as the text Postgres reads and the statement's casts decide its type: a string as it is; a number, bigint or boolean as its literal; a `Date` as ISO 8601; an array of scalars as a Postgres array (`= ANY($1::uuid[])`); an object, or an array holding objects, as JSON. For a `jsonb` parameter pass `JSON.stringify(value)` — an empty array alone goes as the Postgres array `{}`, which `::jsonb` reads as an object. Rows come back as the driver parses them: `bigint` and `numeric` as strings, a timestamp as an ISO string.

While a release that renames or retypes a column is between `start` and `complete`, name tables bare in the new version's raw SQL (`todos`, not `public.todos`) and name an `ON CONFLICT` target by its columns, not its constraint — the new version reads through views that hold the new names. The typed tables already work this way. See [Schema changes](https://palbase.studio/docs/backend/migrations).

## Transactions are a plan, not a session

`Database.$transaction(fn)` does not open an interactive session. The callback **describes** what should happen; nothing has run when it returns. The engine then runs the whole plan inside one savepoint of the request's transaction and answers once.

```ts
import { Conflict, Database } from "palbase/backend";

declare const userId: string;
declare const titles: string[];

const { listId } = await Database.$transaction((tx) => {
  const list = tx.public.lists.insert({ owner: userId, title: "Groceries" }).expectOne(new Conflict("the list was not written"));
  tx.public.todos.insertMany(titles.map((title) => ({ list_id: list.id, owner: userId, title })));
  return { listId: list.id };
});
```

Three rules follow, and the first two are the compiler's:

1. **The callback is synchronous.** `async` on it and `await` in it are compile errors — there is nothing to await.
2. **An operation gives a handle, not a row.** Reading a field takes `.expectOne(err)` first, which makes "what if the row is not there" an argument you cannot skip.
3. **A field you read is a `Ref`** — a value the server will produce. It can be written into a later operation and returned from the callback (it is replaced by the real value before `$transaction` resolves); it cannot be branched on.

| Plan method | What it does |
|---|---|
| `insert(values)` | one row |
| `insertMany(rows, { onConflict?, action? }?)` | many rows in one statement, every row the same columns — `action: "ignore"` alone skips a collision with any unique key |
| `put(values, { onConflict })` | insert, or overwrite what it collided with |
| `updateWhere(where, set)` | every matching row — an unfiltered update is refused |
| `deleteWhere(where)` | every matching row — an unfiltered delete is refused |
| `select(where?, { limit?, lock? })` | read rows; `lock: "update"` is a real `FOR UPDATE` |

`increment(n)`, `decrement(n)`, `now()` and `ago(span)` read the column's current value and the server's clock where the plan runs — `increment` and `decrement` in an update's `set`, `now()` and `ago()` wherever a value goes. The typed `update` and `updateMany` take them too:

```ts
import { Database, NotFound } from "palbase/backend";
import { increment } from "palgres";

declare const todoId: string;

await Database.$transaction((tx) => {
  tx.public.todos.updateWhere({ id: todoId }, { priority: increment(1) }).expectOne(new NotFound("todo not found"));
});
```

### Guards

| Guard | Meaning |
|---|---|
| `expectOne(error)` | exactly one row — and the only way to read one |
| `expectNone(error)` | no row matched |
| `expectAtLeast(n, error)` / `expectAtMost(n, error)` | a bound on the count |

A failed guard throws the error you gave and rolls the whole plan back. That replaces reading a value and branching on it: `updateWhere({ id, done: false }, { done: true }).expectOne(new Conflict("already done"))` is a race-free compare-and-set, checked where the rows are.

> **Warning:** Coercing a `Ref` (`String(ref)`, `+ref`), awaiting it or serialising it throws `TxRefError` as the plan is built. Bare truthiness is the one hole JavaScript does not let a proxy close: `if (row.done)` inside the callback is always true. Read a value before the plan and branch there, or say it as a guard.

A plan holds at most 1000 operations and 5000 rows per `insertMany`; a reference points only backwards, at an operation known to yield one row. A plan that breaks a rule throws `TxPlanError` at the line that wrote it, before anything is sent.

## `$atomic()` — a transaction of your own, with retries

`$transaction` is a savepoint of the request's transaction, so it cannot retry: a savepoint keeps its parent's snapshot. When the work needs its own boundary — a transfer, anything that must survive a serialization failure — use `$atomic`. The ledger lives in a schema of its own:

```ts
// src/db/ledger.ts
import { defineSchema, defineTable, numeric, ownedByUser, policy, timestamp, uuid } from "palbase/backend";

export const accounts = defineTable("accounts", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), balance: numeric({ precision: 14, scale: 2 }).default("0") },
  policies: (p) => [policy("accounts_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export const entries = defineTable("entries", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    account_id: uuid().references(() => accounts.id),
    owner: ownedByUser(),
    amount: numeric({ precision: 14, scale: 2 }),
    created_at: timestamp().defaultNow(),
  },
  policies: (p) => [policy("entries_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("ledger", { tables: [accounts, entries] });
```

```ts
// src/modules/ledger/ledger.service.ts
import { Conflict, Database, Injectable, NotFound } from "palbase/backend";
import { decrement } from "palgres";

@Injectable()
export class LedgerService {
  withdraw(accountId: string, amount: string) {
    return Database.$atomic(
      async (tx) => {
        // Ordinary async reads and writes: this callback is not a plan.
        const account = await tx.ledger.accounts.findById(accountId);
        if (!account) throw new NotFound("account not found");
        await tx.ledger.entries.insert({ account_id: accountId, owner: account.owner, amount: `-${amount}` });
        // The compare-and-set is a plan, so the check happens where the row is.
        return tx.$transaction((plan) =>
          plan.ledger.accounts
            .updateWhere({ id: accountId, balance: { gte: amount } }, { balance: decrement(amount) })
            .expectOne(new Conflict("insufficient balance")),
        );
      },
      { isolation: "serializable", retry: 3, lockTimeoutMs: 1000 },
    );
  }
}
```

- **The callback is `async`**, and its promise resolves after `COMMIT`.
- **`retry` is 0 unless you say** (at most 10), and only serialization and deadlock failures are retried. Every retry runs the whole callback again on a fresh transaction, so keep external effects out of it.
- **It commits on its own.** A later error in the handler does not undo it, and it is not atomic with the request's transaction — so do not write the same rows on both sides.
- **Options:** `isolation` (`"read committed"`, `"repeatable read"`, `"serializable"`), `readOnly`, `lockTimeoutMs` (5000 by default), `statementTimeoutMs`, `timeoutMs` for the whole scope, retries and queueing included, and a `signal`.

`withRetry(fn, { retry })` from `palgres` gives the same narrow retry policy to work that is not one transaction.

## When the database says no

A statement Postgres refuses throws an error carrying its SQLSTATE in `sqlstate`. The ones an app branches on have classes of their own, exported by `palbase/backend`:

| Error | When | Left to reach the client |
|---|---|---|
| `UniqueViolation` | a duplicate; the constraint is in `e.constraint` | 409 |
| `SerializationFailure`, `DeadlockDetected` | retry them — `$atomic` does when asked | 409 |
| `BadRequest` | request data used as a filter's structure — see below | 400 `bad_request`, naming the field |
| an `HttpError` | a value its column cannot take (not a uuid, out of range, too long) | 400 `invalid_value`; the value is not repeated |
| an `HttpError` | a row a policy's `WITH CHECK` refuses, or a table the caller's role has no grant on (SQLSTATE `42501`) | 403 `permission_denied` to a signed-in caller, 401 to an anonymous one; nothing of the schema is said. On the service role it is the app's own grants: the driver's error, a 500 |
| `TooManyRequests` | the app's database queue is full | 429 with Retry-After |

```ts
// src/modules/payments/payments.service.ts
import { Conflict, Database, Injectable, UniqueViolation } from "palbase/backend";

@Injectable()
export class PaymentsService {
  async record(owner: string, idemKey: string, amount: string) {
    try {
      return await Database.public.payments.insert({ owner, idem_key: idemKey, amount });
    } catch (e) {
      if (UniqueViolation.is(e) && e.constraint === "payments_idem_key_key") throw new Conflict("this payment was already recorded", "duplicate_payment");
      throw e;
    }
  }
}
```

`UniqueViolation.is(e)` matches by shape and holds across two copies of the package; `instanceof` holds too for what the engine throws. The constraint's name is on `e.constraint`, for you, and never in what reaches the client. Rethrow, as above: a request that swallows a refusal and returns cannot commit — Postgres aborted its transaction — and the commit fails with `TransactionAborted` (exported by `palgres`). Swallowing a failure is what `$attempt` is for.

An outage is never a 500: the database unreachable or refusing connections is `503 database_unavailable` with Retry-After, a connection lost mid-request `503 database_unavailable`, and a lock waited for past its bound `503 database_busy`. See [Responses & Errors](https://palbase.studio/docs/backend/errors).

### Data never becomes structure

A `where` value is a value or an operator — and anything a request sent is only ever a value. The framework marks a request body as `JSON.parse` made it, and Palgres refuses a marked object wherever structure goes — a filter's operators and branches, `select`, `orderBy`, `with`, an aggregate's columns, a claim's key, `onConflict` — with a 400 naming the field. Without that, `{ token: body.token }` with a body of `{ "token": { "neq": null } }` would match every row. Write the structure in code around the values: `{ token: body.token }` with `token: z.string()`, `{ id: { in: body.ids } }`. What a route's schema builds is the route's own, so `z.object({ startsWith: z.string() })` runs as the operator you wrote; what it lets through untouched (`z.unknown()`, a passthrough's extra keys) stays the request's.

## Who each statement runs as

A transaction opens with one statement that binds the caller, its values written as literals:

```sql
SELECT set_config('role', 'authenticated', true),
       set_config('search_path', '…', true),
       set_config('application_name', '…', false),
       set_config('request.jwt.claims', '{"sub":"…","role":"authenticated",…}', true)
```

The role is `authenticated` for a request with a valid token, and `anon` with no claims for one without. `auth.uid()` in a policy reads `sub` from those claims. An operator's app whose every table is the service role's — every request deciding for itself who sees what — says `db: { schemas, requests: "service" }`, and its requests run as `service_role` with the caller's claims kept.

## `$asService()` — past RLS

`Database.$asService()` returns the same typed surface running as `service_role`, which bypasses row-level security. It is for code that legitimately reaches across users: an admin route, a cleanup, a count over everyone.

```ts
import { Database } from "palbase/backend";

const openEverywhere = await Database.$asService().public.todos.count({ where: { done: false } });
```

- **It is a second transaction, on a second connection**, opened by its first use. The role is bound once, when a transaction begins, so a sibling on the request's own transaction would still run as the caller.
- **It keeps the caller's claims.** It changes what may be touched, not who is asking.
- **The two commit as two** — the caller's first — and neither is atomic with the other. Do not write the same row from both in one request: the service side waits at most 5 seconds for a lock the caller's transaction holds, then fails.
- **It does not see what the request wrote.** The caller's transaction has not committed while the handler runs, so a row written through `Database` and read back through `$asService()` reads as it was before: a route that saves a profile and then answers it as the service answers the old one. Read it back through `Database`, or do the write and the read both as the service in one `$asService().$atomic(cb)`.
- **Inside `$asService().$atomic(cb)`, use the handle `cb` is given.** The shared `Database` is refused there: read as the service role, a helper that counts on the caller's RLS would read every user's rows.

Your own code is the only authorisation left inside it, so check the caller's right first, and call it at the point of use rather than keeping the client in a field — the value of the escape hatch is that a reviewer can grep for it.

## Connections and drivers

On a machine, the app may hold `PALBASE_DB_CONNECTIONS` connections — its share of what the database's size allows, counted across every copy of every machine given the database. Told nothing (a laptop), it holds 31. A third of the pool serves requests' first transactions and two thirds their further ones (`$asService`, `$atomic`), so an admitted request never waits for a connection only another request can free. A request that finds the queue full, or waits in it past about a second, answers `429` with Retry-After.

The default driver is Bun's built-in SQL, which is why the examples' images run the app under Bun. Off Bun there is no built-in SQL client, so give one: `db: { schemas, driver }`, with postgres.js created with `{ types: POSTGRES_JS_TYPES }` and its engine `postgresJsDriver(pool, control)`, both from `palgres`. `db.url` overrides `PALBASE_DB_URL`, for a test database of your own.

## Related

- [Schema](https://palbase.studio/docs/backend/schema) — the declarations `Database.public.*` is typed from
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) — policies, roles, and what a policy-less table returns
- [Schema changes](https://palbase.studio/docs/backend/migrations) — how a release migrates the database beside the version serving
- [Databases](https://palbase.studio/docs/machines/databases) — opening one, its credentials, and giving it to a machine
- [Responses & Errors](https://palbase.studio/docs/backend/errors) — the envelope a thrown error becomes
- [Event Hooks](https://palbase.studio/docs/backend/hooks) — `@On` handlers, which run in a transaction of their own
