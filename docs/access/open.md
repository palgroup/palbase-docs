> The full documentation index: https://palbase.studio/llms.txt

# Open to Everyone

Some objects are not only somebody's. A document shared with everyone in the workspace, a page anybody with its address may read, a post once it is published: each is open to people no relationship names. Access says so with two subjects that stand for everyone of a kind:

| Subject | Holds for |
|---|---|
| `user:*` | every signed-in user |
| `public` | everyone — signed in or not |

They are two on purpose. An object open to every signed-in user is closed to a visitor, and a relation says which of the two it takes — or neither.

## In the schema

```text
type doc
  table docs
  relation owner: user from owner_id
  relation viewer: user | user:* | public
  relation editor: user
  relation listed: public where published = true
  permission view = owner + viewer + editor + listed
  permission edit = owner + editor
  rows select: view
```

- **A kept relation says what it takes.** `viewer: user | user:* | public` is given to one user, to every signed-in user, or to everyone. `editor: user` is not: a relationship for everyone is refused there (`PA005`), so nothing is opened by a call that was meant for one person.
- **A relation can read it from the row.** `relation listed: public where published = true` holds for everyone on each doc whose `published` is true. There is nothing to give or take: publish the row and it is open, unpublish it and it is not. `user:* where …` says the same for signed-in users. It has no `from` — no column names who, the `where` says when — one subject a line, on a type that has a table.
- **A permission is open where what it is made of is.** `view` above is open on a doc that is `listed`, or whose `viewer` was given to everyone. `a + b` is open where either is, `a & b` where both are, and an arrow carries it: `folder->view` is open on a doc whose folder's `view` is.
- **`a - b` takes people away by name.** `view = (viewer + listed) - banned` shows a published doc to every signed-in user but the banned one. Signed out, that person is a visitor like any other: what is the public's cannot be closed to one person.

`edit` above is nobody's but who is named: none of its relations takes `user:*` or `public`. Keep it so for what writes — a permission the public can hold is one a visitor holds.

## Opening and closing an object

From the command line:

```sh
palbase access:relationships:grant doc:42 viewer 'user:*'      # every signed-in user
palbase access:relationships:grant doc:42 viewer public        # everyone, signed in or not
palbase access:relationships:revoke doc:42 viewer public
```

In SQL, as `service_role` — everyone is a **kind** of subject, `'user:*'` or `'public'`, with `'*'` where an id would go:

```sql
SELECT access.grant ('doc', '42', 'viewer', 'user:*', '*');
SELECT access.grant ('doc', '42', 'viewer', 'public', '*');
SELECT access.revoke('doc', '42', 'viewer', 'public', '*');
```

In a `palbase/backend` app:

```ts
import { Database } from "palbase/backend";

export async function share(id: number, everyone: boolean): Promise<void> {
  const access = Database.$asService().$access;
  // Every signed-in user…
  await access.grant({ type: "doc", id }, "viewer", { everyUser: true });
  // …and, when the owner says so, anybody with the address.
  if (everyone) await access.grant({ type: "doc", id }, "viewer", { public: true });
  else await access.revoke({ type: "doc", id }, "viewer", { public: true });
}
```

Each is **one relationship**, however many users there are: in force from the next statement, written to the history, and taken back the same way. Taking it leaves what somebody holds by name as it was. It can be given [until a moment](https://palbase.studio/docs/access/expiring) like any other.

**Everyone is never said by an id.** `"*"` is nobody's id: `access.grant(…, 'user', '*')` is refused (`PA003`), and so is `grant(…, "*")` or `{ user: "*" }` in a backend (`bad_id`). The kind is what your code writes; the id is what may come from a request — so a statement like `access.grant('doc', $1, 'viewer', 'user', $2)` gives a doc to one user or to nobody, whatever `$2` spells. Opening an object is `'user:*'` or `'public'` in SQL, `{ everyUser: true }` or `{ public: true }` in a backend: said on purpose, in a line of its own.

## A visitor

A request with nobody signed in asks as the role `anon`, with no claims:

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT title, body FROM docs WHERE id = $1;            -- the row, when it is open to the public
SELECT access.can('view', 'doc', '42');
SELECT * FROM access.my_objects('view', 'doc');
COMMIT;
```

- `rows select: view` writes the table's policy for `anon` too when the public can hold `view`. What `anon` may do to the table at all is the table's own grant, and yours to give: `GRANT SELECT ON docs TO anon`.
- `anon` asks only the names the public can hold. `access.can('edit', …)` is not answered `false` for it — the name is not its to ask (`42501`) — and a schema that opens nothing to the public gives `anon` nothing of access at all.
- A database of your Palbase project has the role. On a Postgres of your own (`--url`), a schema that opens something to the public is refused until there is one: `CREATE ROLE anon NOLOGIN`, granted to the login your program connects as.

In a `palbase/backend` app a route with `auth: false` is a visitor's:

```ts
// src/modules/docs/public.controller.ts
import { Controller, Database, Get, NotFound, Param } from "palbase/backend";

@Controller("/public/docs", { auth: false })
export class PublicDocsController {
  @Get("/{id}/readable")
  async readable(@Param("id") id: string): Promise<{ readable: boolean }> {
    // True where the public holds it; a name the public cannot hold is answered no without a statement.
    const readable = await Database.$access.can("view", { type: "doc", id });
    if (!readable) throw new NotFound();
    return { readable };
  }
}
```

A table's policy may be the visitor's as well — `policy("readers").for("select").to("authenticated", "anon").using(p.can("view"))` — where the public can hold every name it reads. One that reads a name nothing opens to the public is refused when the migration is planned, by name: for `anon` it would not hide the rows, it would fail the statement.

Somebody signed in of whom nothing else is said holds what `user:*` and `public` give, and nothing more.

## How wide is it open

*Who holds this* names people. What is everyone's names nobody, so it is asked on its own:

```sql
SELECT * FROM access.subjects('view', 'doc', '42');    -- user_81aa: who holds it by name
SELECT access.open('view', 'doc', '42');               -- 'public', 'users', 'visitors', or null
```

| `access.open` | |
|---|---|
| `'public'` | everyone holds it, signed in or not |
| `'users'` | every signed-in user does, and a visitor does not |
| `'visitors'` | who has not signed in holds it, and somebody signed in only where something names them — a banner for visitors, `listed - member` where every signed-in user is a `member` |
| `null` | only who is named |

```ts
import { Database } from "palbase/backend";

/** What a share dialog shows: the people, and the switch beside them. */
export async function sharing(id: number): Promise<{ people: string[]; open: "public" | "users" | "visitors" | null }> {
  const access = Database.$asService().$access;
  const doc = { type: "doc", id };
  return { people: await access.subjects("view", doc), open: await access.openTo("view", doc) };
}
```

```sh
palbase access:subjects view doc:42
```

```text
user_81aa
open to every signed-in user (user:*)
```

The answer is about the permission, not one relation: a doc that is `listed` is open to the public with no relationship given, and the command says so.

## What to keep in mind

- **`user:*` is everyone who can sign in.** Where sign-up is open to anybody, it is one form away from `public`. It is the right word for *everyone here* only where being here is itself decided — a workspace's own app, an invitation.
- **Open is for reading.** A `rows insert`, `update` or `delete` rule on a permission the public can hold lets a visitor write, as far as the table's grant goes. Give what writes to relations that take `user` alone.
- **Nothing is fanned out.** One relationship opens the object and one statement closes it, for the next question anybody asks.

## Testing it

A [validation file](https://palbase.studio/docs/access/testing) writes them as the schema does, and asks as a visitor. Beside its `schema` and `tables`:

```json
{
  "relationships": ["doc:2#viewer@user:*", "doc:3#viewer@public"],
  "expect": [
    { "visitor": true, "can": "view", "cannot": "edit", "on": "doc:3" },
    { "visitor": true, "holds": "view", "of": "doc", "exactly": ["3", "4"] },
    { "open": "view", "on": "doc:2", "to": "users" },
    { "open": "edit", "on": "doc:3", "to": "nobody" }
  ]
}
```

`"to"` is `"public"`, `"users"`, `"visitors"` or `"nobody"`.

`{ "visitor": true, "holds", "of", "exactly" }` is the one to write for every type: it fails the day a change shows a visitor one object more.

## A schema from before

Both subjects are kept by a schema that the engine of this `palbase` compiled. On a database whose schema an earlier one put in, giving to everyone is refused, with the two commands that [put the schema in again](https://palbase.studio/docs/access/sql#putting-a-schema-into-a-database); the relationships it keeps stay as they are.

Until this engine `*` was an id like any other. A relationship an earlier one kept for a user whose id is `*` stops the schema from being put in — read now, it would open the object to every signed-in user: take it first.

Changing what a relation takes is a change to what it keeps. A schema that stops taking `user:*` while objects are open to every signed-in user is refused, as one that drops a relation with relationships is, until they are taken or [said to go with it](https://palbase.studio/docs/access/sql#changing-the-schema).
