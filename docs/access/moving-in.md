> The full documentation index: https://palbase.studio/llms.txt

# Moving an Existing System

A system that already runs has its answer to *who may do what* somewhere: a `role` column, a members table for each kind of thing, `if` statements in handlers, roles in a token. This page moves that answer into an [access schema](https://palbase.studio/docs/access/schema) without a day when the old answer and the new one disagree and nobody knows — in six steps, each of which leaves the system working, and the first four of which change nothing a user can see.

It needs your tables in a database of the project, and nothing else: your backend, its language, its ORM and its migrations stay as they are. Everything here is SQL and the command line ([Access from SQL](https://palbase.studio/docs/access/sql)).

The example is a product tool that keeps its roles in two tables:

```sql
-- what the system has today
CREATE TABLE company_members (company_id bigint, user_id text, role text);   -- 'owner', 'member'
CREATE TABLE product_members (product_id bigint, user_id text, role text);   -- 'designer', 'developer', 'tester'
```

and checks them in code: *a developer of the product, or an owner of its company, may write its code*.

## 1. Write down what the code already does

Read the checks, and write each as a line of the schema. What you find maps like this:

| In the system today | In the schema |
|---|---|
| a foreign key to the thing it belongs to (`products.company_id`) | `relation company: company from company_id` |
| a column that names a user (`sessions.creator_id`) | `relation creator: user from creator_id` |
| a members table with a `role` column | a **kept** relation for each role: `relation designer, developer, tester: user` |
| a flag that changes who sees a row (`private`, `archived`) | a `where` on the relation that depends on it |
| "A, or B of the parent" in a handler | `permission code.write = developer + company->owner` |
| "A, unless B" | `permission edit = editor - suspended` |
| a role in the token that means the same everywhere (`admin`, `support`) | leave it where it is — it is not about an object |

```text
type company
  table companies
  relation owner, member: user

type product
  table products
  relation company: company from company_id
  relation designer, developer, tester: user
  permission code.write = developer + company->owner
  permission view       = designer + developer + tester + company->owner
```

Relations read `from` a column need no moving at all: they are your data, read where it is. Only the members tables hold facts that will live in Access.

Leave [`rows`](https://palbase.studio/docs/access/schema#rows) out for now. Without it the schema filters nothing, and putting it in changes no query's answer.

## 2. Hold it to the cases you know

Write a [validation file](https://palbase.studio/docs/access/testing) from real cases — three or four people you can name, what each must and must not reach — and run it until it passes:

```sh
palbase access:test access.test.json
```

This is where a misreading of the old code shows, before a database is involved.

## 3. Put the schema in

```sh
palbase access:schema:set access.schema
```

The database now answers `access.check(…)` — from no relationships yet, so everything that depends on a members table answers no. Nothing reads it. The app is as it was.

## 4. Copy the roles, and keep them in step

One statement a table, as the owner or the service role:

```sql
SELECT count(*) FROM (
  SELECT access.grant('product', product_id::text, role, 'user', user_id, 'import') FROM product_members
) copied;

SELECT count(*) FROM (
  SELECT access.grant('company', company_id::text, role, 'user', user_id, 'import') FROM company_members
) copied;
```

`grant` is safe to run again — a relationship that is there is left alone — and refuses a row whose role the schema does not have, or whose product does not exist, naming it: fix the row or the schema, and run it again.

From here until the old tables are gone, a change to one must reach the other. A trigger does it without touching your code:

```sql
CREATE FUNCTION mirror_product_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM access.revoke('product', OLD.product_id::text, OLD.role, 'user', OLD.user_id, 'mirror');
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM access.grant('product', NEW.product_id::text, NEW.role, 'user', NEW.user_id, 'mirror');
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER mirror AFTER INSERT OR UPDATE OR DELETE ON product_members
  FOR EACH ROW EXECUTE FUNCTION mirror_product_member();
```

Create it as the tables' owner, in the same transaction as the copy, so that no change falls between them. It runs inside the statement that changed the members table: both change, or neither.

## 5. Compare, until nothing differs

The old answer and the new one now exist side by side. Ask both, for everything:

```sql
-- the old table says yes, Access says no
SELECT m.* FROM product_members m
 WHERE NOT access.check(m.user_id, m.role, 'product', m.product_id::text);

-- Access keeps a relationship the old table does not have
SELECT r.* FROM access.relationships r
 WHERE r.object_type = 'product'
   AND NOT EXISTS (SELECT 1 FROM product_members m
                    WHERE m.product_id::text = r.object_id AND m.user_id = r.subject_id AND m.role = r.relation);
```

Both return nothing when the copy is whole. That compares the stored facts; the rules built on them are compared where they run. In each place the code decides, ask Access as well and log a disagreement, while still acting on the old answer:

```sql
SELECT access.check($1, 'code.write', 'product', $2);   -- beside the old check, not instead of it
```

Leave it for as long as it takes every path to be walked — a release, a week. A disagreement is a line of the schema that misreads the code, or a path of the code nobody remembered. Fix the schema, [test](#2-hold-it-to-the-cases-you-know), `access:schema:set` again.

## 6. Switch, then remove the old

When the log has been quiet:

1. **Checks.** Replace each old check with `access.can` (as the user) or `access.check` (as the service). The comparison code goes.
2. **Lists.** Add `rows select: view` to the types whose tables should filter themselves, and take the hand-written `WHERE` filters out as you reach them — or leave them: the policy holds either way. Queries that must see everything run as `service_role`.
3. **Writes to roles.** Have the code that adds and removes members call `access.grant` and `access.revoke` in place of writing the members tables.
4. **The old tables.** Drop the triggers, then the tables.

Each of the four is its own release. After the first, a wrong answer is one release back.

## Users and their ids

A subject is the id your sign-in gives a user — whatever your backend puts in `request.jwt.claims` as `sub`. Relationships must use that same id. If the system is moving its users to Palbase [Auth](https://palbase.studio/docs/auth/overview) too, bring the users over first ([importing users](https://palbase.studio/docs/auth/users)) and copy the roles under the ids they have there.

When a user is deleted, `SELECT access.forget_subject($1)` takes back everything they held.

## One owner for a database's schema

A database's access schema is put in from the command line, as on this page, or carried by a `palbase/backend` app's deploys ([Access in a Backend](https://palbase.studio/docs/access/backend)) — one or the other. An app's migration does not take over a schema the command line put in, and `access:schema:set` does not replace an app's: each refuses, saying which the database has. A system that moves in with this page stays on the command line; relationships are given and taken from it either way.
