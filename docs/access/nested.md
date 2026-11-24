> The full documentation index: https://palbase.studio/llms.txt

# Nested Objects

A folder holds folders, and a permission on it holds on everything inside. A team holds teams, and its members are members of each one inside. Access says this with a permission that is derived from itself, one level up:

```text
type folder
  table folders
  depth 16
  relation parent: folder from parent_id
  relation viewer: user
  permission view = viewer + parent->view
  rows select: view
```

`view = viewer + parent->view` reads: *a viewer of this folder can view it, and so can anyone who can view the folder it is in.* Give `viewer` on a top folder and every folder below it — and every row below those — is viewable, ten levels down or sixteen, with no relationship for each.

## A folder is in one folder; a team is in many

What an object is in comes from one of two places, and they nest differently.

- **A column of its own row** (`relation parent: folder from parent_id`): a row has one `parent_id`, so a folder is in **one** folder. Moving a folder is updating that column. The folder it names must be there, as with a foreign key; a row whose `parent_id` is null, or names a row deleted since, is at the top.
- **Relationships** (`relation parent: team`): a team is given to the teams it is in, as any relationship is given, and can be in **many** — an on-call team in both Engineering and Operations holds what is given to either. One object is in 32 others at most.

```text
type team
  depth 8
  relation parent: team
  relation member: user
  permission in = member + parent->in
```

```sh
palbase access:relationships:grant team:web parent team:engineering
palbase access:relationships:grant team:on-call parent team:engineering
palbase access:relationships:grant team:on-call parent team:operations
palbase access:relationships:grant team:engineering member user:user_81aa
```

`user_81aa` is now `in` `web` and `on-call`. Taking a team out of another is `revoke`; what it held through that one goes with it on the very next question.

In SQL, as `service_role`:

```sql
SELECT access.grant('team', 'on-call', 'parent', 'team', 'operations');
SELECT access.revoke('team', 'on-call', 'parent', 'team', 'operations');
```

## How deep

`depth N` says how many levels below a top its objects may be — 16 when the type does not say, 32 at most. It is a promise the database keeps, and what keeps every question fast: a permission is read at most that many levels up.

The levels are counted along the longest way. A team that is two levels below Engineering and four below Operations is four levels deep.

## What is refused

Every write that places an object is checked by the database when it is made — a row inserted or its column changed, a relationship given — whichever app, backend or SQL session makes it:

| SQLSTATE | `code` in a backend | |
|---|---|---|
| `PA008` | `cycle` | the object would be inside itself: put in one of its own, or in itself |
| `PA009` | `too_deep` | an object would be more levels below a top than the type's `depth` — the one placed, or what is below it |
| `PA010` | `too_many_parents` | the object is in 32 others already |
| `PA002` | | a row put in a folder that is not there |
| `55000` | | the write is in a `REPEATABLE READ` or `SERIALIZABLE` transaction (below) — or teams are put in teams while a deploy changes how deep they nest |

```text
ERROR:  folder 7 would put objects more than 16 levels below a top, the most a folder is nested (its depth)
ERROR:  team engineering would be inside itself: it is above the one it would be put in
```

The write is refused whole and nothing of it stays. In a `palbase/backend` app a refused `grant` throws `AccessRefused` with the `code` above; a refused row write throws the database's error, with the SQLSTATE in its `code`.

```ts
import { AccessRefused, Database } from "palbase/backend";

/** Puts a team in another; says why not, in a word a client can show. */
export async function nest(team: string, into: string): Promise<"done" | "inside itself" | "too deep" | "in too many"> {
  try {
    await Database.$asService().$access.grant({ type: "team", id: team }, "parent", { type: "team", id: into });
    return "done";
  } catch (e) {
    if (!(e instanceof AccessRefused)) throw e;
    if (e.code === "cycle") return "inside itself";
    if (e.code === "too_deep") return "too deep";
    if (e.code === "too_many_parents") return "in too many";
    throw e;
  }
}
```

Two writes made at once that are each fine alone — two folders put in each other, a folder moved deeper while one is put in it — never both pass: the second waits for the first, then reads what it left. A folder's write waits only for writes to the folders above it or below it, by the rows' own locks, as a foreign key's do: a bulk insert of a million rows holds nothing else up. Teams of one type are put in one another one at a time — something done far less often.

That needs a write to see what was committed while it waited, which a `READ COMMITTED` transaction does — the default, and what `palbase/backend` and `Database.$atomic` use unless told otherwise. A transaction that reads by one snapshot (`REPEATABLE READ`, `SERIALIZABLE`) could not, and places nothing: `55000`. It may still write a nested type's rows in every way that does not move one — a name, a flag.

## Cutting what comes from above

A folder that keeps its own people out of what the folders above it share:

```text
type folder
  table folders
  depth 16
  relation parent: folder from parent_id
  relation up: folder from parent_id where inherits = true
  relation viewer, hidden: user
  permission view = (viewer + up->view) - hidden
  rows select: view
```

- `up` is `parent` where the row says so: a folder whose `inherits` is false takes nothing from above, and neither does anything below it.
- `- hidden` takes one person away on this folder; the folders below it read `view` of this one, so it is taken there too.

A permission is derived from itself **once**, through one relation to its own type, on the side that gives: inside `+` and `&`, never on the right of `-` (`view = viewer - parent->view` is refused when the schema is read). Two types derived from each other — a folder's view from its project's, the project's from the folder's — are refused too: a loop is only ever one type in itself.

## When the schema is put in

The rows and relationships already there are checked as writes are — at the deploy, or `access:schema:set`, that first nests a table or changes its `depth`; one that changes something else leaves the table alone. While its rows are checked, writes to it wait and reads go on: about 2 seconds a million rows. a folder inside itself, or deeper than the `depth`, or a team in more than 32, stops `access:schema:set` (and an app's deploy) with the object it found:

```text
access: folder 4412 is more than 16 levels below its top, or inside itself (public.folders.parent_id): folder is nested at most 16 levels deep — move it, or say a greater depth
```

Nothing is changed. Move it, or put the schema in with a greater `depth`.

While a `palbase/backend` app's deploy makes teams nest anew, or less deep, the version still serving would put a team in another by the rule it had: until the deploy completes, a team is not put in another (`55000`, *put in another once that deploy completes*). What teams hold, and folders, are written as ever.

## Query performance

Checking a single object or listing the direct children of a folder (`WHERE parent_id = …`) walks at most `depth` ancestor levels and stays fast even on large hierarchies. Full-table scans with no selective filter — such as `count(*)` across an entire guarded table — evaluate access per scanned row and scale with table size. Scope queries to a parent (`WHERE parent_id = …`), paginate with keyset pagination (`ORDER BY id LIMIT 50`, then `WHERE id > …`), or maintain summary counts separately.

A team nested by relationships follows all parent paths up to `depth`, keeping lookups bounded for multi-parent graphs as well.

## Testing it

In a [validation file](https://palbase.studio/docs/access/testing) a nested type's rows and relationships must be what the database would keep — none inside itself, none too deep, none in more than 32 — or the file is refused, naming the object. The [database in memory](https://palbase.studio/docs/backend/testing) refuses the same writes, with the same codes and words, and undoes a refused row write.

## A schema from before

A permission derived from itself is compiled by the engine of `palbase` 0.58 and later. On a database whose schema an earlier one put in, the questions are answered as before, with a note to [put the schema in again](https://palbase.studio/docs/access/sql#putting-a-schema-into-a-database); a `palbase/backend` app takes the engine with its next deploy.
