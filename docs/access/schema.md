> The full documentation index: https://palbase.studio/llms.txt

# The Access Schema

The access schema is a text file in a language of its own — not TypeScript, not SQL — so a backend in any language, the command line and the tests all read the same thing. It says three things: what kinds of object exist, what a user can be to each, and what that lets them do. This page is the language, statement by statement, and the rules a schema is held to.

```text
type company
  table companies
  relation owner, member: user

type team
  relation member: user

type product
  table products
  relation company: company from company_id
  relation designer, developer, tester: user
  relation squad: team
  permission design.write = designer + company->owner
  permission code.write   = developer + company->owner
  permission view         = designer + developer + tester + squad->member + company->owner

type session
  table sessions
  relation product: product from product_id
  relation creator: user from creator_id
  relation member: user
  relation team: product from product_id where private = false
  permission view = creator + member + team->view
```

A statement is a line. `//` and `#` start a comment. Indentation is for the reader.

## `type`

```text
type product
```

A kind of object. Its name is lowercase letters, digits and single underscores, starting with a letter, 40 characters at most. `user` is taken: it is whoever asks.

An object is a type and an id — `product:10`. A **subject** is who holds something: a user, by the id your [auth](https://palbase.studio/docs/auth/overview) gives them (the access token's `sub`).

## `table`

```text
  table products
  table billing.invoices key number
```

The table whose rows are the type's objects. With it:

- **an object exists when its row does.** Nothing is held on an object that is not there, and a relationship cannot be given on one;
- **a row that is deleted takes its relationships**, a key that is updated carries them to the new id — row by row, before any user-defined `AFTER` triggers on the table (triggers whose names sort ahead of Access's internal trigger order are refused when applying the schema; rename them or run them `BEFORE` the change) — and a table that is truncated leaves none, each recorded in history as a database change. A newly inserted row starts with no relationships, even if its id existed previously;
- the type's relations can be read from the row's columns (below), and its permissions can guard the rows ([in a backend](https://palbase.studio/docs/access/backend#a-policy-names-a-permission), or with [`rows`](#rows)).

The object's id is the table's primary key. A table whose primary key is several columns, or that has none, names one column that identifies a row: `table invoices key number`. The key is text, a uuid or an integer, and it identifies a row **by itself, at every moment**: `NOT NULL`, and unique alone — the primary key, or a unique constraint or index of that column and no other — by a check that is not `DEFERRABLE`. A schema other than `public` is written before the name.

A type is given its table once. Giving a type a table later, or another table, while relationships of it are kept is refused: the ids they name are not that table's rows.

A type **without** a table is a grouping that lives only in relationships — the `team` above. Its objects exist as far as relationships name them, and its ids are any text you choose (`team:blue`).

What cannot carry a type: a view, a foreign table, a partitioned table or one of its partitions, a table that inherits from another, and a table with `FORCE ROW LEVEL SECURITY`.

## `relation`

A relation is something a subject **is** to an object. It is kept, read from a column of the object's row (`from`), or true of everyone on the rows a condition picks (`where`, with no `from`).

### Kept: given and taken

```text
  relation designer, developer, tester: user
  relation squad: team
  relation viewer: user | team
```

A relationship of a kept relation is a fact Palbase stores — *una is designer of product 10* — given and taken through the API ([`grant` and `revoke`](https://palbase.studio/docs/access/backend#giving-and-taking)). After the colon is what can hold it: `user`, one or more types, or both, separated by `|`. Several relations that take the same subjects share a line.

A relation that takes a **type** is not held by any user directly. It links two objects — *team blue is the squad of product 10* — and a permission follows it with an [arrow](#arrows-through-a-relation).

Two more subjects stand for everyone of a kind, and a relation takes them only where it says so:

```text
  relation viewer: user | user:* | public
```

`user:*` is every signed-in user and `public` everyone, signed in or not — one relationship opens the object to all of them ([Open to Everyone](https://palbase.studio/docs/access/open)). A relation that does not name them is never given to everyone.

A relationship is kept for good, or [until a moment](https://palbase.studio/docs/access/expiring): given with an end, it stops holding at that moment by itself.

### Read: from a column

```text
  relation company: company from company_id
  relation creator: user from creator_id
  relation team: product from product_id where private = false
```

The relationship is the row's own column: the product's company is whatever `company_id` says, now. There is nothing to give, take or keep in step — change the column and the relationship has changed. One relation a line, one kind of subject.

The column holds a user's id (`: user from …` — text, a uuid or an integer) or the key of another type's object (`: company from …` — the same type as that table's key). The relationship is there when the column is not null **and** the `where` holds.

`where` says when the column counts:

| Written | Meaning |
|---|---|
| `private = false`, `state != 'draft'`, `level >= 3` | a comparison with a value: `'text'` (256 characters at most), a number, `true` or `false`. Order (`<`, `<=`, `>`, `>=`) is for numbers |
| `deleted_at is null`, `owner_id is not null` | null or not |
| `state in ('open', 'review')` | one of several values |
| `a and b`, `a or b`, `not a`, `( … )` | combinations; `and` beside `or` needs parentheses |

A condition that is unknown — a comparison with a null — is not true, as in SQL: the relationship is not there.

The same column can be read twice under different conditions. Above, a session's `product` is always its product, and its `team` is its product *only while the session is not private* — which is how "everyone who sees the product sees its open sessions, and a private one is its creator's and its members'" is said in one line.

### Read: from the row, for everyone

```text
  relation listed: public where published = true
  relation internal: user:* where state != 'draft'
```

With no `from`, no column names who: the relation holds for **everyone** — `public`, or every signed-in user with `user:*` — on each row the `where` picks. Publish the row and it is open; there is nothing to give or take. One relation a line, on a type that has a table; the `where` is written as above. See [Open to Everyone](https://palbase.studio/docs/access/open).

## `permission`

```text
  permission code.write = developer + company->owner
```

A permission is what relations add up to. Its name follows a type's naming rule and may carry one dot (`code.write`, `billing.read`), to group permissions the way your app talks about them.

A type's name and a name of it are asked together — `access.product__code__write` — and a name in Postgres holds 63 characters: the two with their separators (a dot counts as two) fit in 63, or the schema is refused where it is read.

| Written | Holds for a subject when |
|---|---|
| `developer` | they hold `developer` on this object — a relation, or another permission of the same type |
| `a + b` | either |
| `a & b` | both |
| `a - b` | `a`, and not `b` |
| `company->owner` | they hold `owner` on the object this one's `company` relation leads to |
| `( … )` | grouping |

`a - b` is *holds `a` and does not hold `b`* — and a relation read from a column does not hold while its `where` is unknown. So *unless suspended*, read from a column that may be null, lets everyone through while it is null: make such a column `NOT NULL`, or say the null case in the condition.

Two different operators in one expression need parentheses — `a + b & c` is refused rather than guessed at. An expression continues on the next line after an operator, before one, or inside parentheses:

```text
  permission view = designer + developer + tester
                  + squad->member
                  + (company->owner - suspended)
```

### Arrows: through a relation

`company->owner` reads: *go to this product's company; is the subject its owner?* The left side is a relation of this type that leads to objects; the right side is a relation or a permission of the type it leads to. When the relation takes several types (`viewer: user | team`), every one of them must have the name.

An arrow is how a role on something large reaches everything inside it without a relationship for each: one `owner` on a company is `code.write` on every product of it, today's and tomorrow's.

Arrows chain through types: `session → product → company` is three levels and any number more is fine. A type that contains itself — a folder in a folder, a team in teams — derives a permission from itself one level up, `view = viewer + parent->view`, with `depth N` saying how many levels there may be: [Nested Objects](https://palbase.studio/docs/access/nested). Two types derived from each other, round and back, are refused when the schema is read.

## `rows`

```text
type product
  table products
  …
  rows select: view
  rows update, delete: code.write
```

For a database that is **not** migrated by a `palbase/backend` app: makes the type's permission the table's row policy for the commands named (`select`, `insert`, `update`, `delete`), for the `authenticated` role — and for `anon` too where [the public can hold](https://palbase.studio/docs/access/open) the permission — and turns row-level security on for the table. A signed-in user's `SELECT * FROM products` then returns the products they hold `view` on, whatever wrote the query. See [Access from SQL](https://palbase.studio/docs/access/sql#row-policies).

In a `palbase/backend` app the tables' policies are written with the tables, and a schema with `rows` is refused: say [`p.can("view")`](https://palbase.studio/docs/access/backend#a-policy-names-a-permission) in the table's `policies` instead, where it can stand beside the table's other conditions.

## What a schema means, exactly

- **A relation holds** for a subject on an object when the relationship is kept (`product:10 designer user:una`), or the row's column says so.
- **A permission holds** when its expression is true, each name in it asked of the same subject and object, each arrow of the objects the relation leads to.
- **Nothing holds on an object that does not exist.** While nobody is signed in, the asker is a visitor: they hold what the `public` holds, and nothing else.
- **A relationship that has ended does not hold**, from the first statement that starts after its moment.
- **Ids are compared as the key compares them**: a uuid in either case is the same uuid, `07` and `7` are the same integer, and text is compared exactly. A user's id in a kept relationship is text, compared exactly: give it as your sign-in writes it.

"Who holds this on that object" is answered from the subjects the permission's own relations name there — each then asked — so the list is exact, and bounded by how many subjects are related to the object. What is everyone's names nobody: it is not in the list, and is asked as [how wide the name is open](https://palbase.studio/docs/access/open#how-wide-is-it-open).

## What is refused, and when

A schema is checked whole before anything is changed, and the refusal names the line:

```text
line 9: permission doc.view: holder->member — type org has no relation or permission "member"
line 3: "&" beside another operator: put parentheses around one of them
relation product.company: public.products has no column "firm_id"
```

Against the database it is also held to the tables as they are: every table and column it reads exists, a key is a type an id can be, and a column that leads to another type has that type's key type.

| Limit | |
|---|---|
| Types in a schema | 200 |
| Relations and permissions in a type | 100 |
| Terms in one permission's expression | 200 |
| Comparisons in one `where` | 50 |
| Parentheses and `not`, nested | 32 |
| A type's name with one of its names, as `type__name` | 63 characters |
| Relations a permission comes to once everything it is derived from is written out | 200 |
| Lookups the database plans for one permission | 300 |
| Indexes on a type's table | 150 |
| Schema complexity & planning budget | Checked automatically when the schema is applied |
| Terms the whole schema comes to, written out | 25,000 |
| Permissions derived from one another, in a chain | 16 |
| Levels of a [nested type](https://palbase.studio/docs/access/nested) (`depth`) | 32 — 16 when not said |
| Objects of its type one object nested by relationships is in | 32 |
| An id | 256 characters |
| The schema's text | 256 KiB |

Four of these are the ones a real schema can meet.

- **Relations written out.** Permissions that name each other through several paths multiply. Define the shared part once as its own permission and reference it.
- **Lookups planned.** Each union branch on a kept relation and each arrow through another type's permission expands the query plan. Deep multi-level chains through kept relations multiply quickly; if your schema exceeds the 300-lookup limit, flatten the chain or read relations from row columns where possible.
- **Indexes on a type's table.** Tables with more than 150 indexes are refused when applying the schema so query planning stays fast.
- **Query planning budget.** When you apply a schema (`access:schema:set` or a deploy), Palbase validates that every permission and row policy stays within safe planning time and memory bounds for your tables and indexes, refusing overly expensive schemas by name before they reach production.
  - Because a single `UPDATE` or upsert statement may evaluate multiple policies (`SELECT`, `USING`, `WITH CHECK`), their costs combine against the per-statement budget.
  - A query that self-joins a guarded table evaluates the policy for each reference.
  - If you run Access on a self-hosted Postgres database, disable Postgres JIT compilation for your application role (`ALTER ROLE <login> SET jit = off`) so complex permission queries do not incur unnecessary JIT compilation overhead.

Each is refused when the schema is put in — with the count, and the line or the table — rather than found slow, or out of memory, in production.

## Changing a schema

A schema is replaced whole, and the replacement is one transaction: every question is answered by the old schema or by the new one, never by half of each. In a `palbase/backend` app the change travels with a deploy, and each version of the app is answered by its own schema while both serve ([Migrations](https://palbase.studio/docs/access/backend#a-schema-changes-with-a-deploy)).

Relationships are kept across a change. One thing needs a decision: a kept relation that the new schema no longer has, while relationships of it exist. They would mean nothing — and would mean something again, unseen, if the name came back — so the change is refused until they are taken away, or you say they go with it ([`--drop-relationships`](https://palbase.studio/docs/access/sql#changing-the-schema)).
