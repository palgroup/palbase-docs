> The full documentation index: https://palbase.studio/llms.txt

# Access from SQL

Access lives in the database, so anything that speaks SQL can use it: a backend in Go, Python, Ruby or Java, an ORM, a script, `psql`. Nothing of Palbase's is installed in the program. The [access schema](https://palbase.studio/docs/access/schema) is put into the database from the command line, and your code asks with ordinary statements.

This is the whole of it, for a database that already has its tables:

```sh
palbase access:schema:set access.schema
```

```sql
-- in a request's transaction, as the signed-in user
SELECT access.can('code.write', 'product', '11');
```

## Putting a schema into a database

`access:schema:set` reads the schema file, checks it against the database's own tables, and compiles it in — in one transaction, as the tables' owner:

```sh
palbase access:schema:set access.schema --dry-run   # what it would do; changes nothing
palbase access:schema:set access.schema
```

```text
production › main now answers from access schema dc239a3a0b78
  company: public.companies, by id
  product: public.products, by id
  session: public.sessions, by id
  13 relations and permissions a subject can hold
  row policy: public.products select
  row policy: public.sessions select
```

It acts on the environment chosen with `palbase use` (or `-E`), on its only database or the one `--db` names; a production environment asks first. `--url postgres://…` acts on a database of your own instead — a Postgres on your computer, for development and tests. It needs `psql` installed.

`palbase access:schema:get` prints the schema a database answers from.

A database whose `palbase/backend` app carries an access schema ([`db.access`](https://palbase.studio/docs/access/backend)) has it changed by that app's deploys, and `access:schema:set` is refused there: each version of the app asks the schema it was migrated with. The other commands of this page work on it as on any.

What it leaves in the database:

| | |
|---|---|
| `access.relationships`, `access.history` | who is what of which object, and every change to it |
| `access.can`, `access.check`, … | the functions below |
| `access.<type>__<name>` | a view for each relation and permission: the ids the asker holds it on |
| triggers on each type's table (`!access_fresh`, `!access_forget`, `!access_move`, `!access_empty`) | a deleted row takes its relationships, an updated key carries them, a new row starts with none |
| `access_<digest>` | the compiled schema itself. Yours to read, not to write in: it is replaced when the schema changes |

The schema is bound to your tables. A migration of yours that would drop or retype a column the schema reads is stopped by the database, naming what depends on it:

```text
ERROR:  cannot drop column company_id of table products because other objects depend on it
DETAIL:  view access_dc239a3a0b78.product__code__write depends on column company_id of table products
```

Change the schema first so that it no longer reads the column, then drop it.

## Who is asking

A [database of the project](https://palbase.studio/docs/machines/databases#connecting) has two logins. Your program connects as the **app** login and takes a role for each transaction:

| Role | Take it for | Access answers |
|---|---|---|
| `authenticated` | a signed-in user's request | for that user alone — the `sub` of `request.jwt.claims` |
| `service_role` | your backend acting for itself | for any user it names |

A request of a signed-in user:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', $1)::text, true);  -- $1: the user's id

-- … the request's statements …

COMMIT;
```

Both settings end with the transaction, so nothing carries to the next request on a pooled connection. The id is the one your sign-in gives the user — with Palbase [Auth](https://palbase.studio/docs/auth/overview), the access token's `sub`, **after** you have verified the token. The database trusts what the transaction says; who may say it is your program.

`authenticated` cannot ask about anybody else. `access.check` is not its to run, the `access.subject` setting is ignored for it, and `access.relationships` is not its to read — a mistake in a query cannot turn one user into another.

## The questions

As `authenticated` — about the user of the transaction:

```sql
SELECT access.can('code.write', 'product', '11');             -- true or false
SELECT * FROM access.my_objects('view', 'product');           -- the ids, as text
```

As `service_role` — about any user, and the third question:

```sql
SELECT access.check('user_2f9c', 'code.write', 'product', '11');
SELECT * FROM access.objects('user_2f9c', 'view', 'product');
SELECT * FROM access.subjects('view', 'product', '10');        -- who holds it
```

| Function | Returns |
|---|---|
| `access.can(permission, type, id)` | `boolean` — the asker holds it |
| `access.my_objects(permission, type)` | `setof text` — the ids the asker holds it on |
| `access.check(subject, permission, type, id)` | `boolean` |
| `access.objects(subject, permission, type)` | `setof text` |
| `access.subjects(permission, type, id)` | `setof text` — the users who hold it. Each one related to the object is asked in turn — about a second at 10,000 — and past that it is refused; so is an object whose holders are looked for through more than 10,000 related objects (`team->member` on a product with that many teams), whether or not they name anyone, and one where the subjects times the related objects pass 1,000,000 (each subject is checked through all of them) |

Ids go in and come out as text, whatever the key's type; they are compared as the key compares them. A name the schema does not have raises an error (below) rather than answering `false`. An object that does not exist is held by nobody.

## Lists

Asking `can` for each row of a list is the slow way, and it is never needed.

### Row policies

With [`rows`](https://palbase.studio/docs/access/schema#rows) in the schema, the table filters itself for `authenticated`:

```text
type session
  table sessions
  …
  rows select: view
```

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', $1)::text, true);
SELECT * FROM sessions WHERE product_id = $2 ORDER BY id DESC LIMIT 50;   -- only what this user may view
COMMIT;
```

The query is the one you would write anyway, from any ORM. Postgres adds the permission to it, uses your indexes, and returns the page already filtered. `rows insert`, `update` and `delete` judge writes the same way: a row the user may not write is refused with SQLSTATE `42501`.

`rows` turns row-level security on for the table and adds policies named `access_select`, `access_insert`, … for `authenticated`. Policies of your own on the same table stay as they are and combine with them as Postgres combines policies; one of your own that already has one of those names stops the schema, by name, rather than being replaced — rename it. `service_role` and the owner pass row-level security, as always.

Row-level security on a table is for every role that is not its owner: a role of your own, or `anon`, reads nothing there until a policy of yours says what it may. It stays on when a `rows` rule is removed — the table then shows `authenticated` nothing, rather than everything.

Index what a permission reads of the row — the columns its relations are `from` (`product_id`, `creator_id` above) — as you would any column you filter by.

A permission says who may write a row *in* a product; it cannot say whose name the row carries. `rows insert: add` lets a user who sees the product start a session — under anybody's `creator_id`. Say the rest in a policy of the table's own, beside it; a restrictive one holds whatever else allows:

```sql
CREATE POLICY started_as_oneself ON sessions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (creator_id = nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub');
```

Grant a request's role only what its requests do — `SELECT` on what they read, `INSERT` where they write — and leave the rest to the service role. A table with no `rows` rule and no policy of yours has no row security: whatever the role is granted there, it does to every row.

### A view to join

Every relation and permission is also a view of the ids the asker holds it on — `access.<type>__<name>`, a dot in the name written as two underscores. Join it, or use it in `IN`:

```sql
SELECT s.*
  FROM sessions s
  JOIN access.session__view v ON v.id = s.id
 WHERE s.product_id = $1
 ORDER BY s.id DESC
 LIMIT 50;

SELECT * FROM products WHERE id IN (SELECT id FROM access.product__code__write);
```

The view's `id` has the key's own type. For `authenticated` it is about the transaction's user. A backend that runs everything as `service_role` says whom it is asking for first, for the rest of the transaction:

```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT access.act_as($1);                                   -- the user's id
SELECT s.* FROM sessions s JOIN access.session__view v ON v.id = s.id ORDER BY s.id DESC LIMIT 50;
COMMIT;
```

`access.act_as` is the service role's (and the owner's); any other role is told so, not silently answered for itself.

## Relationships

Given and taken as `service_role`:

```sql
SELECT access.grant ('product', '10', 'designer', 'user', 'user_2f9c', 'user_81aa');   -- true; false if it was there
SELECT access.revoke('product', '10', 'designer', 'user', 'user_2f9c', 'user_81aa');   -- true; false if it was not
```

The arguments: the object's type and id, the relation, the subject's kind and id, and who did it. The kind is `'user'`, or a type for a relation that takes objects (`'team', 'blue'`). The last argument is written to the history; left out, it is the transaction's user, else the login.

- Only a [kept relation](https://palbase.studio/docs/access/schema#kept-given-and-taken) is given; one read from a column is changed by changing the column.
- The object must exist. The row is locked against being deleted while the relationship is written.
- It is in force from the next statement, in this transaction and — once it commits — every other.

`access.relationships` and `access.history` are tables the service role reads:

```sql
SELECT relation, subject_id, created_at FROM access.relationships WHERE object_type = 'product' AND object_id = '10';
SELECT at, action, relation, subject_id, actor FROM access.history WHERE object_type = 'product' AND object_id = '10' ORDER BY id DESC;
```

Write them only through `grant` and `revoke`: those check the relation, the object and the id's spelling, and nothing else does.

When a user is deleted in your system, take back what they held:

```sql
SELECT access.forget_subject('user_2f9c');   -- how many relationships went
```

## What an error means

| SQLSTATE | |
|---|---|
| `PA001` | the type has no such relation or permission — or there is no such type |
| `PA002` | `grant` on an object that does not exist |
| `PA003` | an id that is empty or longer than 256 characters |
| `PA004` | `subjects` on an object more than 10,000 subjects, or more than 10,000 objects through kept relations, are related to — or subjects × objects past 1,000,000: ask `check` |
| `PA005` | the relation is not kept, or does not take that kind of subject |
| `PA006` | a role that asks for itself alone tried to ask as another subject |
| `42501` | Postgres' own: the role may not run the function, or a row policy refused a write |

An error ends the transaction, as any does. Names come from your code, not from a request: check a name that does against your own list before it reaches SQL.

## Changing the schema

Run `access:schema:set` again with the new file. The change is one transaction: every statement is answered by the old schema or by the new one. What the new schema no longer has is removed; relationships are kept.

Two cases stop it. A kept relation the new schema drops while relationships of it exist; and a type whose table has not been watched until now — the type is given a table or another one, the table was dropped and made again, or access' triggers on it were off — while relationships of the type exist: the ids they name may not be the rows they were given on. Say that they go with it —

```sh
palbase access:schema:set access.schema --drop-relationships
```

— and the history records each as taken by the change.

## From the command line

For support, a first owner, and looking at what is there:

```sh
palbase access:check user_2f9c code.write product:11          # ends with 0 (holds) or 1
palbase access:objects user_2f9c view product
palbase access:subjects view product:10
palbase access:relationships:list --object product:10
palbase access:relationships:grant company:1 owner user:user_81aa
palbase access:relationships:revoke product:10 designer user:user_2f9c
palbase access:history --object product:10
```

Each takes `--db` or `--url` as `access:schema:set` does. A change is written to the history as `cli:<your email>` unless `--by` says otherwise. The [CLI reference](https://palbase.studio/docs/cli/reference#palbase-accessschemaset) has every flag.
