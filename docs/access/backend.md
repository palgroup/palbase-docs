> The full documentation index: https://palbase.studio/llms.txt

# Access in a Backend

In a `palbase/backend` app the [access schema](https://palbase.studio/docs/access/schema) is a file beside your tables. It is migrated with them, a table's row policy names a permission, and handlers ask through `Database.$access`. This page builds one app that way: a company's products, each with its own people.

## The schema is a file of the app

```text
src/
├── main.ts
└── db/
    ├── public.ts          the tables
    └── access.schema      who may do what on them
```

```text
// src/db/access.schema
type company
  table companies
  relation owner, member: user

type product
  table products
  relation company: company from company_id
  relation designer, developer, tester: user
  permission design.write = designer + company->owner
  permission code.write   = developer + company->owner
  permission manage       = company->owner
  permission view         = designer + developer + tester + company->owner
```

```ts
// src/db/public.ts
import { bigint, defineSchema, defineTable, policy, text } from "palbase/backend";

export const companies = defineTable("companies", {
  columns: { id: bigint().primaryKey(), name: text() },
  rls: false,
});

export const products = defineTable("products", {
  columns: { id: bigint().primaryKey(), company_id: bigint(), name: text() },
  // The row policy is the permission: a product is read by whoever holds `view` on it.
  policies: (p) => [policy("holders read").for("select").using(p.can("view"))],
});

export default defineSchema("public", { tables: [companies, products] });
```

```ts
// src/main.ts
import { Module, PalbaseFactory } from "palbase/backend";
import schema from "./db/public";

@Module({})
class AppModule {}

await PalbaseFactory.create(AppModule, {
  db: {
    schemas: [schema],
    // The file itself: the app reads it when it starts, the command line when you test it.
    access: new URL("./db/access.schema", import.meta.url),
  },
});
```

`db.access` is the file's URL, or the schema's text. A schema that does not hold together stops the app when it starts, with the line:

```text
line 13: permission product.manage: company->boss — type company has no relation or permission "boss"
```

The schema is held to your tables as you declared them — every table and column it reads, and their types — before anything reaches a database.

## A policy names a permission

`p.can(name)` in a table's `policies` is *the caller holds this on the row*:

```ts
import { bigint, boolean, defineTable, policy, text } from "palbase/backend";

export const sessions = defineTable("sessions", {
  columns: { id: bigint().primaryKey(), product_id: bigint(), private: boolean().default(false), creator_id: text(), title: text() },
  policies: (p) => [
    policy("holders read").for("select").using(p.can("view")),
    // A row that is not there yet: what its writer holds on the product it names.
    policy("viewers add").for("insert").withCheck(p.and(p.can("add"), p.col("creator_id").eq(p.auth.uid()))),
  ],
});
```

- In `using`, it filters: `Database.public.sessions.findMany()` returns the sessions the caller may view, and a route that forgets a filter cannot read past it ([Row-Level Security](https://palbase.studio/docs/backend/row-level-security)).
- In `withCheck`, it judges the row being written. A permission that goes through a column — `permission add = product->view` on the session type — asks what the writer holds on the product the **new** row names, so *whoever sees a product may start a session in it* is one line.
- It stands beside the table's other conditions with `p.and(…)` and `p.or(…)`.
- The table must be a type's table in the schema, and the type must have the name: anything else is refused when the migration is planned, by name.
- The policy is for `authenticated` (the default) or `service_role`. One for `anon` is refused: a permission answers for a signed-in user.

A list filtered this way is not checked row by row. The permission compiles to a set the database joins against, and the columns it reads are indexed like any column a policy reads.

## Asking: `Database.$access`

```ts
// src/modules/products/products.controller.ts
import { Controller, Database, Forbidden, Get, Param, Post } from "palbase/backend";

@Controller("/products")
export class ProductsController {
  @Post("/{id}/code")
  async push(@Param("id") id: string): Promise<{ pushed: boolean }> {
    if (!(await Database.$access.can("code.write", { type: "product", id }))) {
      throw new Forbidden("You do not write code in this product", "not_a_developer");
    }
    return { pushed: true };
  }

  // The ids of every product the caller may view.
  @Get("/mine")
  mine(): Promise<string[]> {
    return Database.$access.objects("view", "product");
  }
}
```

`can`, `objects` and `held` are about **the request's caller** — the access token's `sub` — and run on the request's own transaction, so they see what the request has written. With nobody signed in (a route with `auth: false`) the answer is no, and the database is not asked.

| | Answers |
|---|---|
| `can(name, { type, id })` | whether the caller holds the relation or permission on the object |
| `objects(name, type)` | the ids of the objects of the type the caller holds it on, sorted |
| `held({ type, id })` | every relation and permission the caller holds on the object, sorted — one statement, for a screen that shows or hides by them |

An id is a string or a whole number; it is compared the way the table's key compares.

### As the service: any user, and who holds what

What names another user is the service role's, reached the explicit way — `Database.$asService().$access`:

```ts
// src/modules/products/people.controller.ts
import { Body, Controller, Database, Delete, Forbidden, Get, Param, Post, z } from "palbase/backend";

const Role = z.object({ user: z.string(), relation: z.enum(["designer", "developer", "tester"]) });
type Role = z.infer<typeof Role>;

@Controller("/products/{id}/people")
export class PeopleController {
  // Who tests this product — for whoever may see it.
  @Get("/testers")
  async testers(@Param("id") id: string): Promise<string[]> {
    if (!(await Database.$access.can("view", { type: "product", id }))) throw new Forbidden();
    return Database.$asService().$access.subjects("tester", { type: "product", id });
  }

  @Post("")
  async give(@Param("id") id: string, @Body(Role) body: Role): Promise<{ given: boolean }> {
    // Your rule for who may give: here, the company's owner.
    if (!(await Database.$access.can("manage", { type: "product", id }))) throw new Forbidden();
    return { given: await Database.$asService().$access.grant({ type: "product", id }, body.relation, body.user) };
  }

  @Delete("")
  async take(@Param("id") id: string, @Body(Role) body: Role): Promise<{ taken: boolean }> {
    if (!(await Database.$access.can("manage", { type: "product", id }))) throw new Forbidden();
    return { taken: await Database.$asService().$access.revoke({ type: "product", id }, body.relation, body.user) };
  }
}
```

| | Answers |
|---|---|
| `check(user, name, object)` | whether that user holds it |
| `objectsOf(user, name, type)` | the objects that user holds it on |
| `subjects(name, object)` | the users who hold it on the object, sorted |
| `grant(object, relation, subject, { by? })` | gives the relationship; `false` when it was already there |
| `revoke(object, relation, subject, { by? })` | takes it; `false` when it was not there |
| `relationships(filter?)` | what is kept: `{ object, relation, subject, since }` |
| `history(filter?)` | what was given and taken, the latest first: `{ at, action, object, relation, subject, by }` |

On `$asService()`, `can`, `objects` and `held` are still about the request's caller: the service's transaction carries the caller's token.

Access decides nothing about **who may give a role** — that is a rule of your app, and the pattern above is the whole of it: ask what the caller holds, then act as the service. Calling a service-only operation on the request's own `Database.$access` is refused before anything is sent.

### Giving and taking

A relationship is given on a **kept** relation (`designer`, not `company`, which is the row's column) to what the relation takes:

```ts
import { Database } from "palbase/backend";

export async function examples(): Promise<void> {
  const access = Database.$asService().$access;
  await access.grant({ type: "product", id: 10 }, "designer", "user_2f9c");
  // The same, said in full; and who did it, when it is not the request's user.
  await access.grant({ type: "product", id: 10 }, "tester", { user: "user_81aa" }, { by: "import of 2026-11" });
  await access.revoke({ type: "product", id: 10 }, "designer", "user_2f9c");
}
```

- The object must exist — a type with a table has its row — and is locked against being deleted while the relationship is written.
- It is in force **from the next statement**: taken away, the user's next request is refused, and the rows are gone from their lists.
- A row's relationships go with the row: deleted, they go; its key changed — by the statement, or by a trigger of the table's own — they follow it. A transaction at `repeatable read` or `serializable` that deletes a row, or changes its key, after a grant it could not see was committed fails with a serialization failure, to be run again, rather than leave the grant behind (`$atomic` runs it again by itself).
- Every change is written to the history with who did it: `by` when you say it, else the request's user, else the database login.
- It is written in the service role's own transaction, which commits with the request — after the caller's own, and apart from it. A change that must stand or fall with other writes is made beside them, on the same `$asService()`.
- A relation that takes objects is given the same way: `grant({ type: "product", id: 10 }, "squad", { type: "team", id: "blue" })`.

`relationships` and `history` take a filter — `{ object: { type, id? }, relation?, subject?, limit? }`, 100 rows unless `limit` says otherwise, 1,000 at most.

### What is refused

`Database.$access` throws `AccessRefused`, with a `code`:

| `code` | |
|---|---|
| `unknown_type`, `unknown_name` | the schema has no such type, or the type no such relation or permission a user can hold |
| `not_kept` | the relation is not one relationships are kept of, or does not take that kind of subject |
| `bad_id` | an id that is empty, longer than 256 characters, or not a string or whole number |
| `not_the_service` | an operation of the service role's, called on the caller's `Database.$access` |
| `no_schema` | the app declares no access schema |
| `no_object` | `grant` on an object that does not exist |
| `too_many` | `subjects` on an object more than 10,000 subjects, or more than 10,000 objects through kept relations, are related to — or subjects × objects past 1,000,000: ask `check` instead |

All but the last two are decided by the schema alone and thrown **before anything is sent**, so a wrong name does not end the request's transaction. They are mistakes of the code, not answers for a client: left to reach it, the request answers `500`. A name that comes from a request is checked against your own list first — the `z.enum([...])` above.

## The names, typed

`palbase db:types` writes the schema into `palbase/palbase-env.d.ts` beside your tables' types:

```sh
palbase db:types
```

From then on `Database.$access` takes only what the schema has. `can("code.wirte", …)` does not compile; neither does `grant(…, "view", …)` — a permission is not given — nor a team where the relation takes a user. Run it again when the schema changes. Until it has run, every name is a string and the checks above happen at run time alone.

## A schema changes with a deploy

The access schema is part of the app's schema. `palbase db:plan` says what a deploy would change, and the deploy's migration makes it:

```sh
palbase db:plan
```

```text
  + access schema 9c41d07a2b11 in place of 5e1f3a8c0d27
  + policy public.sessions.holders read changes
```

A deploy has a window in which the version being replaced and the new one both serve ([Migrations](https://palbase.studio/docs/backend/migrations)). Through it **each version is answered by its own rules** — its policies, plain ones too, and whether the table has row security at all: a request of the old version by the old schema and policies, a request of the new one by the new — in the same table, at the same moment — including a policy only one of them has. Anything else that reaches the tables in that window is held to the old version's rules, all of them. When the old version is gone, the old schema is. If the deploy is abandoned, the new schema is removed, the old policies are as they were, and what the new version gave on a type only it had is taken back.

Three things a deploy will not do, and says so before it changes anything:

- **Rename or retype a column the schema reads in the same deploy.** Ship the rename, then have the schema read the new name in the next.
- **Give a type a table, or another table, while relationships of the type are kept.** Their ids name what the type was before. And until that deploy completes, no relationship of the type is given — by either version: each would read the other's by its own meaning. `grant` answers SQLSTATE `55000` meanwhile.
- **Drop a kept relation that still has relationships.** Take them away first (`revoke`, or [`palbase access:relationships:revoke`](https://palbase.studio/docs/cli/reference#palbase-accessrelationshipsrevoke)): relationships of a name the schema no longer has would mean nothing, and would mean something again if the name came back.

## When a user is deleted

An app with an access schema hears [`user.deleted`](https://palbase.studio/docs/backend/hooks) without writing a handler: every relationship the user held is taken back, in the delivery's own transaction, and the history says it was the deletion. A new user who is later given the same id starts with nothing. The history keeps its rows — who had what, and when it was taken — with the user's id in them: the record of access, not the user's data.

## Testing

`palbase access:test` holds the schema file to the answers you expect, without a database — see [Testing a Schema](https://palbase.studio/docs/access/testing). Code that calls `Database.$access` is tested against a real database: the in-memory `fakeDatabase()` keeps rows, not relationships, and refuses the question.

## From outside the app

The same relationships can be read and changed from the command line, on the environment's database — useful for support, a first owner, or a look at who has what:

```sh
palbase access:check user_2f9c code.write product:11
palbase access:subjects view product:10
palbase access:relationships:grant company:1 owner user:user_81aa
palbase access:history --object product:11
```

See [Access from SQL](https://palbase.studio/docs/access/sql#from-the-command-line) for each.
