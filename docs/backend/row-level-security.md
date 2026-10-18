> The full documentation index: https://palbase.studio/llms.txt

# Row-Level Security

Row-Level Security (RLS) makes **Postgres** decide who may see and write which rows. The rule lives beside the table, declared in TypeScript in your [schema](https://palbase.studio/docs/backend/schema), instead of being scattered across handlers where one forgotten `WHERE owner = …` leaks somebody's data. Two facts decide whether your first release works: **RLS is on by default**, and **a table with RLS and no policies denies everything** — a table you have not thought about returns nothing, rather than every row to every caller. If your routes answer `[]` and `null` on data you know is there, that default is the first thing to check.

> **Warning:** This is the first release's silent failure. Declare `todos` with columns and no `policies`, push it, and the `POST` fails while the `GET` returns an empty array — no error names RLS, because nothing went wrong: the database was asked for rows and answered honestly that there are none this caller may see. The rule is one line, `rls = policies.length > 0 || table.rls !== false`, and it is fail-closed on purpose: an empty result is the cost of not thinking about a table, and a leak is the other one.

## Quick example

```ts
// src/db/public.ts
import { boolean, defineSchema, defineTable, ownedByUser, policy, text, timestamp, uuid } from "palbase/backend";

export const todos = defineTable("todos", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    // The user this row belongs to: text, NOT NULL, deleted with the user.
    owner: ownedByUser(),
    title: text(),
    done: boolean().default(false),
    created_at: timestamp().defaultNow(),
  },
  // A CALLBACK: `p` carries this table's own column names, so a misspelt column
  // is a compile error rather than a refusal from Postgres mid-release.
  policies: (p) => [
    policy("todos_own")
      .for("all")
      .to("authenticated")
      .using(p.col("owner").eq(p.auth.uid()))
      .withCheck(p.col("owner").eq(p.auth.uid())),
  ],
});

export default defineSchema("public", { tables: [todos] });
```

```ts
// src/modules/todos/todos.service.ts
import { Database, Injectable } from "palbase/backend";
import type { Tables } from "palbase/backend/env";

type Todo = Tables["todos"]["row"];

@Injectable()
export class TodosService {
  // No owner filter anywhere: the policy is the filter.
  list(): Promise<Todo[]> {
    return Database.public.todos.findMany({ orderBy: { column: "created_at", direction: "desc" } });
  }

  // The policy's WITH CHECK refuses a row whose owner is not the caller.
  add(owner: string, title: string): Promise<Todo> {
    return Database.public.todos.insert({ owner, title });
  }
}
```

The service never says whose rows it wants. Postgres reads the caller off the transaction and applies `owner = auth.uid()` to every statement — the typed tables, `$query`, a `$transaction` plan — so a route that forgets a filter cannot read past it.

## How the caller reaches the database

Every request is one transaction, and it begins by binding the caller:

```sql
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"…","role":"authenticated",…}', true)
       -- and the version's search_path and application_name
```

Both settings are transaction-local, so nothing carries over to the next request on a pooled connection. The claims are the verified access token's, and `auth.uid()` reads `sub` out of them. Everything on the default `Database` surface runs inside that transaction; there is no opt-in step and nothing to forget. Going past it takes the explicit [`$asService()`](#asservice-past-rls).

## The roles a policy names

Three Postgres roles exist, and what the request is decides which one it runs as:

| Role | Who runs as it | Policies |
|---|---|---|
| `authenticated` | a request with a valid access token — `auth.uid()` is the user's id | apply |
| `anon` | a request with no token (a route with `auth: false`), with no claims — `auth.uid()` is `NULL` | apply |
| `service_role` | `Database.$asService()`, and every request of an app that says `db: { requests: "service" }` | never apply — it has `BYPASSRLS` |

`.to()` defaults to `"authenticated"`, so a policy you write without one does nothing for an anonymous caller. A table that anonymous callers read needs a policy that names `anon`:

```ts
import { boolean, defineTable, policy, text, uuid } from "palbase/backend";

export const posts = defineTable("posts", {
  columns: { id: uuid().primaryKey().defaultRandom(), title: text(), published: boolean().default(false) },
  policies: (p) => [policy("posts_read_published").for("select").to("anon", "authenticated").using(p.col("published").eq(true))],
});
```

`.to()` with no arguments is `PUBLIC` — every role. The machine connects as the database's app login, which may become `anon`, `authenticated` or `service_role` and nothing else; it cannot bypass RLS on its own. The owner — the role migrations run as — owns the tables, and the app never connects as it.

> **Note:** These roles are the database's, not the API keys'. The project's publishable key and secret key choose what a call to the [modules](https://palbase.studio/docs/getting-started/introduction) may do. A call to your machine's backend is decided by the user's access token, and inside it the only switch to the service role is the `$asService()` you write.

## Enabling RLS on a table

| You declare | Result |
|---|---|
| neither `rls` nor `policies` | **RLS on, deny-all** — the default |
| a non-empty `policies` | **RLS on**, whatever `rls` says — a policy on a table without RLS would be inert |
| `rls: false`, no policies | RLS off: every role reads and writes every row. An explicit opt-out for a public table |

A write a `WITH CHECK` refuses, or a statement on a table the caller's role has no grant on, throws an `HttpError` carrying Postgres' SQLSTATE `42501` in its `sqlstate`, and the request's transaction rolls back. Left to reach the client it answers as PostgREST does: `403 permission_denied` to a signed-in caller, `401 permission_denied` to an anonymous one, for whom signing in may be what is missing. The answer names nothing of the schema — the policy, the table and the row stay in the log. On the service role — `$asService()`, or every request of an app that says `db: { requests: "service" }` — nobody's rights were judged: a `42501` there is the app's own grants, and passes through as Postgres' error, a `500 internal_error`. When the client should know why, check what the caller may write before writing it and say so with your own `Forbidden` and code.

## The `policy()` builder

`policy(name)` starts a builder whose methods chain; the name is unique per table.

| Method | Default | Notes |
|---|---|---|
| `.for(command)` | `"all"` | `"select"`, `"insert"`, `"update"`, `"delete"` or `"all"` |
| `.to(...roles)` | `"authenticated"` | `"anon"`, `"authenticated"`, `"service_role"`; no arguments is `PUBLIC` |
| `.using(expr)` | none | `USING (…)` — which existing rows a command may see or touch |
| `.withCheck(expr)` | none | `WITH CHECK (…)` — which written rows are allowed |
| `.memberOf(table, fk, opts?)` | — | the membership subquery below; it **is** the `using`, so it refuses to combine with one |
| `.as(mode)` | `"permissive"` | `"restrictive"` ANDs the policy on top of the permissive ones |
| `.withoutIndexes()` | — | the columns it reads get no index of their own from it |

`using` and `withCheck` take the typed expression — built from the callback's `p` — or a raw SQL string for what the expressions cannot say. Prefer the typed form: `p.col(…)` is checked against this table's columns as you write it, a string only by Postgres when the policy is created.

| Expression | SQL |
|---|---|
| `p.col("owner")` | this table's column |
| `p.auth.uid()` | `(select auth.uid())` — evaluated once per statement, not per row |
| `.eq(x)`, `.neq(x)`, `.gt(x)`, `.gte(x)`, `.lt(x)`, `.lte(x)` | comparisons; `x` is another expression or a plain value |
| `.isNull()` / `.isNull(true)` | `IS NULL` / `IS NOT NULL` |
| `.and(…)`, `.or(…)`, `.not()`, `p.and(…)`, `p.or(…)`, `p.not(…)` | combinations |
| `p.lit(v)` | a value, said explicitly |
| `p.existsIn(table, (row) => …)` | a correlated `EXISTS` subquery into another table |

A plain value on the right of `.eq()` is a literal, never a column: `.eq("owner")` compares with the string `"owner"`. A column is always `p.col("owner")`.

Every column a policy reads gets an index unless one already leads with it (`<table>_<column>_idx`), because it is read on every query of the table. `.withoutIndexes()` opts a policy out of that.

### Per-command policies

Split the policies when reads and writes have different rules — anyone signed in reads, only the owner changes:

```ts
import { boolean, defineTable, ownedByUser, policy, text, uuid } from "palbase/backend";

export const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    body: text(),
    pinned: boolean().default(false),
  },
  policies: (p) => [
    policy("notes_read").for("select").using("true"),
    policy("notes_insert_own").for("insert").withCheck(p.col("owner").eq(p.auth.uid())),
    policy("notes_update_own").for("update").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid())),
    policy("notes_delete_own").for("delete").using(p.col("owner").eq(p.auth.uid())),
  ],
});
```

Permissive policies for the same command **OR** together — a row is visible if any of them allows it. Use `.as("restrictive")` for a condition that must **also** hold whatever else is declared, such as a tenant guard.

## Membership: the pattern that does not recurse

Anything shared — a channel, a project, an organisation — has the same shape: a **membership table** joining users to the thing, and a policy on the thing asking whether the caller is in it. Written by hand the two policies point at each other, and Postgres refuses the pair when it is queried:

```text
ERROR: infinite recursion detected in policy for relation "channel_members"
```

The way out is to make it asymmetric. The membership table is protected by the caller's identity **alone** — it never looks at the thing it points to — and every other table asks it:

```ts
import { defineSchema, defineTable, policy, text, userRef, uuid } from "palbase/backend";

export const channels = defineTable("channels", {
  columns: { id: uuid().primaryKey().defaultRandom(), name: text() },
  // 2. The thing asks the membership table; memberOf() writes the subquery.
  policies: () => [policy("channels_member_read").for("select").memberOf("channel_members", "channel_id")],
});

export const channel_members = defineTable("channel_members", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    channel_id: uuid().references(() => channels.id, { onDelete: "cascade" }),
    user_id: userRef({ onDelete: "cascade" }),
  },
  // 1. The membership table names auth.uid() and nothing else, so evaluating
  //    it never reaches another policy.
  policies: (p) => [policy("members_own").for("select").using(p.col("user_id").eq(p.auth.uid()))],
});

export const messages = defineTable("messages", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    channel_id: uuid().references(() => channels.id, { onDelete: "cascade" }),
    author: userRef({ onDelete: "set null" }).nullable(),
    body: text(),
  },
  // 3. Anything hanging off the thing asks the membership table too, typed:
  //    `m` is channel_members' columns, `p` this table's.
  policies: (p) => [
    policy("messages_member_read")
      .for("select")
      .using(p.existsIn(channel_members, (m) => m.col("channel_id").eq(p.col("channel_id")).and(m.col("user_id").eq(p.auth.uid())))),
    policy("messages_member_write")
      .for("insert")
      .withCheck(
        p.col("author").eq(p.auth.uid()).and(
          p.existsIn(channel_members, (m) => m.col("channel_id").eq(p.col("channel_id")).and(m.col("user_id").eq(p.auth.uid()))),
        ),
      ),
  ],
});

export default defineSchema("public", { tables: [channels, channel_members, messages] });
```

`memberOf(membershipTable, foreignKey)` compiles to:

```sql
"id" IN (SELECT "channel_id" FROM "channel_members" WHERE "user_id" = (select auth.uid()))
```

`{ column }` is the column of this table the subquery matches (`id` by default — pass the foreign key's name on a child table), and `{ userColumn }` the membership table's user column when it is not `user_id`. `p.existsIn` is the typed form of the same idea: the subquery's columns come from the membership table's own declaration, so a misspelt one is a compile error too.

> **Note:** A policy `.for("select")` decides only what is visible. Writes need their own — `.for("insert")` with a `withCheck`, as `messages` has — or `.for("all")` when one condition governs both.

## RLS guards reads, not foreign-key checks

A `SELECT`, `UPDATE` or `DELETE` only ever reaches rows the caller may see. A **foreign-key check is not filtered**: when a row's foreign key points at a parent, Postgres validates that the parent exists whoever owns it. Without a policy that says otherwise, a caller can attach a child row to a parent it cannot read. Nothing leaks — it still cannot read the parent — but say what you mean, in the child's `withCheck`:

```ts
import { defineTable, ownedByUser, policy, text, uuid } from "palbase/backend";

export const orders = defineTable("orders", {
  columns: { id: uuid().primaryKey().defaultRandom(), owner: ownedByUser(), note: text().nullable() },
  policies: (p) => [policy("orders_own").for("all").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid()))],
});

export const order_items = defineTable("order_items", {
  columns: { id: uuid().primaryKey().defaultRandom(), order_id: uuid().references(() => orders.id, { onDelete: "cascade" }), sku: text() },
  // Readable and writable only under an order the caller owns.
  policies: (p) => [
    policy("order_items_via_order")
      .for("all")
      .using(p.existsIn(orders, (o) => o.col("id").eq(p.col("order_id")).and(o.col("owner").eq(p.auth.uid()))))
      .withCheck(p.existsIn(orders, (o) => o.col("id").eq(p.col("order_id")).and(o.col("owner").eq(p.auth.uid())))),
  ],
});
```

The `existsIn` runs as the caller, so the `orders` it sees are already the caller's own — the subquery asks the question the foreign-key check does not.

## `$asService()`: past RLS

Some code legitimately reaches across users — an admin route, a cleanup, a count over everyone. `Database.$asService()` returns the same typed surface running as `service_role`, which bypasses RLS:

```ts
import { Database } from "palbase/backend";

// The default: only the caller's own rows.
const mine = await Database.public.todos.findMany();

// The service role: every user's rows. Explicit, and greppable in review.
const all = await Database.$asService().public.todos.findMany();
```

- **It is a second transaction, on a second connection**, opened by its first use — the role is bound once, when a transaction begins. The two commit as two, the caller's first.
- **It keeps the caller's claims**, so `auth.uid()` still resolves in a trigger or a default inside it. It changes what may be touched, not who is asking.
- **It does not nest**: the surface it returns has no `$asService()` of its own.
- **Inside `$asService().$atomic(cb)`, use the handle `cb` is given** — the shared `Database` is refused there, so a helper written against the caller's RLS cannot quietly read everyone's rows.

Inside it your own code is the only authorisation left, so check the caller's right first and call it at the point of use. An app whose every table is the service role's — an operator's tool deciding in its routes who sees what — says so once, `db: { schemas, requests: "service" }`, and every request runs as `service_role`.

## Changing a policy

Edit `policies` in the schema file, commit and push to the machine's branch. The release's migration step changes the policy in place. Postgres keeps one set of policies per table, so a changed policy holds for **both** versions from `start` on — the version still serving is held to it too. A policy that reads a column (or another table) the same release renames is refused: rename in one release, change the policy in the next. See [Schema changes](https://palbase.studio/docs/backend/migrations).

## Related

- [Schema](https://palbase.studio/docs/backend/schema) — `defineTable`, `ownedByUser()`, and where policies sit
- [Database](https://palbase.studio/docs/backend/database) — the request's transaction, `$query`, and `$asService()`
- [Authentication](https://palbase.studio/docs/backend/authentication) — who the caller is, and routes with `auth: false`
- [Schema changes](https://palbase.studio/docs/backend/migrations) — how a release applies a policy change
