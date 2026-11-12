> The full documentation index: https://palbase.studio/llms.txt

# Access

Access answers one question for your app — **may this user do this, on this object?** — and it answers it inside your project's own database, in the same transaction as the query the answer guards. You describe who can hold what in a small schema: the kinds of object your app has, the relationships a user can have to them, and the permissions those relationships add up to. Palbase compiles that schema into your Postgres, and from then on a check is a query, a list is filtered by the same rule that would refuse a single row, and taking a role away is in force for the very next statement.

It is for the case a role on the user cannot express: one person who is a **designer in one product and a developer in the next**, an owner of one company and a guest in another, a member of this channel and not that one. A role in the access token says what somebody is everywhere; a relationship says what they are **here**.

## A first schema

```text
type company
  table companies
  relation owner, member: user

type product
  table products
  relation company: company from company_id
  relation designer, developer, tester: user
  permission design.write = designer + company->owner
  permission code.write   = developer + company->owner
  permission view         = designer + developer + tester + company->owner
```

Read it as sentences. A company has owners and members. A product belongs to a company — the `company_id` column of its row says which — and has designers, developers and testers of its own. Whoever is the product's developer, **or** the owner of the company the product belongs to, may write its code.

Nothing here names a user or a product: the schema says what *can* be held. Who holds it is a **relationship**, one fact each:

```text
company:1   owner      user:olga
product:10  designer   user:una
product:11  developer  user:una
```

With those three, `una` may `design.write` on product 10 and `code.write` on product 11, and not the other way round; `olga` may do both on every product of company 1 — including one created tomorrow, with no relationship of its own.

## The three questions

| Question | In a `palbase/backend` app | In SQL |
|---|---|---|
| May the caller do this on this object? | `Database.$access.can("code.write", { type: "product", id })` | `access.can('code.write', 'product', '11')` |
| Which objects may they do it on? | `Database.$access.objects("view", "product")`, or a row policy that names the permission | `access.my_objects('view', 'product')`, or the policy |
| Who may do it on this object? | `Database.$asService().$access.subjects("view", { type: "product", id })` | `access.subjects('view', 'product', '11')` |

The second question is the one that matters at scale. A list — the last 50 sessions of a product, every product the caller can see — is not checked row by row: the permission is compiled to a set the database joins against, so the list comes back already filtered, by an index, in the time a list takes.

## Where it runs

In your project's database, as views and functions the schema is compiled to. There is no service between your code and the answer, and nothing to keep in step:

- **A check sees the transaction's own writes.** Give a role and ask in the same transaction: the answer is yes. Take it away: the next statement is refused. There is no cache to wait out.
- **A row that is deleted takes its relationships with it**, so an id that is used again starts with nobody holding anything on it.
- **The rule and the data cannot drift.** A relation read from a column (`company: company from company_id`) *is* the column: move the product to another company and its owner changes with the update.
- **A migration that would break the schema is stopped.** A column the schema reads cannot be dropped out from under it; the database refuses, naming what depends on it.

## Two ways to use it

**In a `palbase/backend` app** the schema is a file beside your tables. It is migrated with them, a row policy names a permission with `p.can("view")`, and handlers ask through `Database.$access`, typed by the schema's own names. That is [Access in a Backend](https://palbase.studio/docs/access/backend).

**From any backend, in any language**, the schema goes into a database of the project from the command line, and your code asks in SQL — through whatever driver or ORM it already uses. Nothing of Palbase's is installed in the app. That is [Access from SQL](https://palbase.studio/docs/access/sql), and it is also the way in for a system that already has its tables and its users: [Moving an Existing System](https://palbase.studio/docs/access/moving-in). A system whose rows stay in a database of its own uses the same functions with a schema that names no table: [When Your Data Is Elsewhere](https://palbase.studio/docs/access/elsewhere).

Both speak the same schema language ([The Access Schema](https://palbase.studio/docs/access/schema)) and keep relationships the same way. A database's schema has one owner, though: its `palbase/backend` app's deploys carry it, or the command line puts it in — neither replaces the other's.

## Trying a schema before it ships

A schema is a rule about who sees what, and a rule that is widened by mistake is found by somebody who should not have seen something. `palbase access:test` holds a schema to a file of answers you expect — *una may not write code in product 10; exactly olga and una may view it* — without a database, and ends with `1` naming each expectation a change broke. Run it where you run your tests. See [Testing a Schema](https://palbase.studio/docs/access/testing).

## What it is not

- **Not sign-in.** Who the user *is* comes from [Auth](https://palbase.studio/docs/auth/overview): the verified access token's `sub` is the subject every check is about.
- **Not the roles in the token.** [Roles](https://palbase.studio/docs/auth/users#roles) say what a user is across the whole app (`admin`, `support`) and travel in the token. Use them for that. Use Access when the answer depends on *which* object.
- **Not a place for your data.** Relationships say who is what of which object. The objects themselves stay in your tables.

## The pages

- [The Access Schema](https://palbase.studio/docs/access/schema): types, relations kept or read from a column, permissions and how they combine, row rules, and the limits.
- [Access in a Backend](https://palbase.studio/docs/access/backend): `db.access`, `p.can()`, `Database.$access`, types, migrations, and deleted users.
- [Access from SQL](https://palbase.studio/docs/access/sql): putting a schema into a database, the functions and views, who may call what, and using it from an ORM.
- [Open to Everyone](https://palbase.studio/docs/access/open): an object every signed-in user holds something on, or everyone does — `user:*` and `public`, a visitor's requests, and how wide a name is open.
- [Until a Moment](https://palbase.studio/docs/access/expiring): a relationship that ends by itself — a contractor for thirty days, a link until Friday.
- [Nested Objects](https://palbase.studio/docs/access/nested): a folder in a folder, a team in teams — a permission on one holds on everything inside it.
- [Testing a Schema](https://palbase.studio/docs/access/testing): the validation file and `palbase access:test`.
- [Moving an Existing System](https://palbase.studio/docs/access/moving-in): from a roles table of your own to relationships, without a day when both are wrong.
- [When Your Data Is Elsewhere](https://palbase.studio/docs/access/elsewhere): the rows stay in your own database; Palbase keeps who is what of which object, and what is then yours to keep in step.
