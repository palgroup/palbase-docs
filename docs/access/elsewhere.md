> The full documentation index: https://palbase.studio/llms.txt

# When Your Data Is Elsewhere

Access runs in a Postgres database of your Palbase project. Your app's own data does not have to be there. A system whose rows live in another database — MySQL, MongoDB, Firestore, a Postgres of your own — keeps them where they are and gives Palbase one thing to hold: **who is what of which object**. Your backend asks in SQL, as [Access from SQL](https://palbase.studio/docs/access/sql) describes; this page is what differs when no table of yours is here.

## A database for the relationships

Open a database in the project. The `free` size is enough for relationships alone:

```sh
palbase databases:create access --size free
```

A `free` database sleeps when it is idle and is woken by the next connection in about 10 seconds; a size that never sleeps answers at once ([Databases](https://palbase.studio/docs/machines/databases)). An app that asks on every request wants one that does not sleep.

## A schema without tables

No type names a table, so an object is an id your system says — a product's id as your own database has it:

```text
type company
  relation owner, member: user

type product
  relation company: company
  relation designer, developer, tester: user
  permission code.write = developer + company->owner
  permission view       = designer + developer + tester + company->owner + company->member
```

`relation company: company` is kept here, as a relationship, where a schema beside your tables would read it from a column: when a product is made in your system, say which company it is of. Every relation is [kept](https://palbase.studio/docs/access/schema#kept-given-and-taken) in a schema like this one.

```sh
palbase access:schema:set access.schema --db access
palbase access:test access.test.json          # the cases that must never open, before it ships
```

## Asking, giving and taking

Your backend connects with the database's application login (`palbase db:url access --role app --with-password`) and takes the service role for each transaction — it acts for itself, and names the user it asks about:

```sql
BEGIN;
SET LOCAL ROLE service_role;

-- a product is made in your system: its company, and who develops it
SELECT access.grant('product', '11', 'company', 'company', '1', 'setup');
SELECT access.grant('product', '11', 'developer', 'user', 'user_2f9c', 'user_81aa');

SELECT access.check('user_2f9c', 'code.write', 'product', '11');   -- may this user do this, here?
SELECT * FROM access.objects('user_2f9c', 'view', 'product');      -- the ids they may see
SELECT * FROM access.subjects('view', 'product', '11');            -- who may see this one

COMMIT;
```

The functions, the errors and the history are the same as with tables: [Access from SQL](https://palbase.studio/docs/access/sql#the-questions).

## What is yours to keep in step

With tables, the database does these by itself. Without them, your code does:

- **A list is filtered by you.** Row policies guard rows of this database, and yours are not in it. Ask `access.objects` for the ids the user may see, and read those from your own database — `WHERE id IN (…)`.
- **An object that is deleted takes nothing with it.** Nothing here knows your row is gone. When you delete it, take its relationships in the same step:

  ```sql
  SELECT access.revoke(object_type, object_id, relation, subject_type, subject_id, 'product deleted')
    FROM access.relationships
   WHERE (object_type = 'product' AND object_id = '11') OR (subject_type = 'product' AND subject_id = '11');
  ```

- **An object that does not exist can be named.** A relationship is given on any id; a typo in one is a relationship on nothing. Give them from the code that makes the object.
- **A user who is deleted** is taken back with `SELECT access.forget_subject('user_2f9c')`, as with tables.
- **Two databases, two transactions.** A product made in your database and its relationships given here do not commit together. Give the relationships after your own write succeeds, and take them before you delete: what a failure between the two leaves is then an object nobody was let into — closed, and mended by doing the step again — never a relationship on an object that is not there, which the next object under that id would be born holding.

## When the data moves in

A system that later brings its tables to a database of the project names them in the schema (`table products`, `relation company: company from company_id`) and gains what this page does by hand — lists filtered by the database, a deleted row's relationships gone with it. [Moving an Existing System](https://palbase.studio/docs/access/moving-in) is that road.
