> The full documentation index: https://palbase.studio/llms.txt

# Until a Moment

A relationship can be given until a moment: a contractor for thirty days, a support engineer for an hour, a link that works until Friday. It stops holding at that moment by itself. Nothing has to run, and nobody has to remember to take it back.

## Giving it

From the command line — a length of time from now, or the moment itself:

```sh
palbase access:relationships:grant product:10 tester user:user_2f9c --until 30d
palbase access:relationships:grant product:10 tester user:user_2f9c --until 2026-12-01T00:00:00Z
```

```text
user:user_2f9c is now tester of product:10 until 2026-12-11T09:30:00.000Z
```

`--until` takes `90s`, `30m`, `12h`, `30d`, `2w` — counted by the database's clock, the one that ends it — or a moment in ISO 8601.

In SQL, as `service_role`, the moment is the last argument, after who did it:

```sql
SELECT access.grant('product', '10', 'tester', 'user', 'user_2f9c', 'user_81aa', now() + interval '30 days');
```

In a `palbase/backend` app:

```ts
import { Database } from "palbase/backend";

const DAY = 24 * 60 * 60 * 1000;

export async function invite(productId: number, user: string): Promise<void> {
  const access = Database.$asService().$access;
  await access.grant({ type: "product", id: productId }, "tester", user, { until: new Date(Date.now() + 30 * DAY) });
  // The same, with the moment as text.
  await access.grant({ type: "product", id: productId }, "tester", user, { until: "2026-12-01T00:00:00Z" });
}
```

- **Any kept relation, any subject**: a user, a team (`squad`, until the project ends), [every signed-in user or the public](https://palbase.studio/docs/access/open) (a link open until Friday).
- **The moment is still to come.** One that has passed is refused — `PA007` in SQL, `bad_time` in a backend — rather than given and gone.
- A relation read from a column has no end to give: it is the column, and it changes when the column does.

## What ending means

Every question is answered as of the statement that asks it. From the first statement that starts after the moment the relationship does not hold — for `can` and `check`, for the lists, for a row policy, for *who holds this*, and for everything reached through it: a team's member until Friday stops holding, on Friday, whatever the team gives.

Its row stays where it was until something sweeps it. Nothing reads it there, so no answer waits for that.

## Changing the end

A relationship is held once. Given again while it is held, it takes the end said now:

| Given again | |
|---|---|
| with a later `until` | it is extended |
| with an earlier one | it ends sooner |
| with none | it has no end any more |

Each answers `false` — it was already held — and each is a line of the history. The command says what changed:

```text
user:user_2f9c was already tester of product:10 — it now ends 2027-01-01T00:00:00.000Z
user:user_2f9c was already tester of product:10 until 2027-01-01T00:00:00.000Z — it now has no end
```

To end it now, [take it](https://palbase.studio/docs/access/sql#relationships). Given after it has ended, it is given anew, and answers `true`.

## What is kept, and what happened

```sh
palbase access:relationships:list --object product:10
palbase access:history --object product:10
```

```text
product:10  tester  user:user_2f9c  until 2026-12-11T09:30:00.000Z

2026-12-11T09:30:00+00:00  ended  user:user_2f9c  tester  product:10  by access: its time passed
2026-11-11T09:30:00+00:00  gave  user:user_2f9c  tester  product:10  by cli:olga@example.com  until 2026-12-11T09:30:00.000Z
```

The list shows what holds, each with its end; what has ended is not in it. The history tells an ending at the moment it ended — not when its row went — as `ended`, done by access itself.

In a backend, `relationships()` gives `{ object, relation, subject, since, until }` for what holds (`until` is `null` for one with no end), and `history()` gives `{ at, action, object, relation, subject, by, until }`, where `action` is `"grant"`, `"revoke"` or `"expire"`.

In SQL the two tables are read with the end in mind:

```sql
-- What holds now: a row whose time has passed may still be there.
SELECT relation, subject_id, expires_at
  FROM access.relationships
 WHERE object_type = 'product' AND object_id = '10'
   AND (expires_at IS NULL OR expires_at > now());

-- What happened, endings included, the latest first.
SELECT at, action, relation, subject_id, actor, expires_at
  FROM access.past
 WHERE object_type = 'product' AND object_id = '10'
 ORDER BY at DESC, id DESC NULLS FIRST;
```

`access.past` is `access.history` with each relationship that has ended and is still in its table told at the moment it ended.

## Sweeping

A relationship that has ended is removed when another is next given on the same object, when it is given again or taken — and by a sweep:

```sh
palbase access:relationships:sweep
```

```sql
SELECT access.sweep();         -- how many went: 10,000 at most a call
SELECT access.sweep(500);      -- or fewer at a time
```

```ts
import { Database } from "palbase/backend";

/** For a job of the app's own: how many rows went. */
export async function tidy(): Promise<number> {
  return Database.$asService().$access.sweep();
}
```

It is housekeeping. Run it from a job of your own — once a day is plenty — if you give many short relationships; every answer is the same before and after, and so is the history, which tells each ending at the moment it ended whether or not its row has gone. One that has ended is in no schema's way: a relation can be dropped from the schema while only ended relationships of it are left.

## Roles in the token have no end

`until` is a relationship's. A [role](https://palbase.studio/docs/auth/users#roles) — what a user is across the whole app, carried in the token — is given until it is taken. For *support for an hour*, keep it as a relationship on a type of its own and ask access:

```text
type app
  relation support: user
```

```sh
palbase access:relationships:grant app:main support user:user_2f9c --until 1h
```

## Testing it

A [validation file](https://palbase.studio/docs/access/testing) gives a relationship its end, and says the moment the questions are asked at. Beside its `schema` and `tables`:

```json
{
  "relationships": [{ "is": "product:10#tester@user:tess", "until": "2026-12-01T00:00:00Z" }],
  "now": "2026-12-02T00:00:00Z",
  "expect": [{ "subject": "tess", "cannot": "test.run", "on": "product:10" }]
}
```

Without `"now"` it is the moment the file is run — a file that is right today and wrong after the first of December, which is seldom what a test should be.

In a `palbase/backend` unit test the [database in memory](https://palbase.studio/docs/backend/testing) ends a relationship by the test's clock: move it with your runner's fake timers and ask again.

## A schema from before

An end is kept by a schema that the engine of this `palbase` compiled. On a database whose schema an earlier one put in, `--until` is refused, with the two commands that [put the schema in again](https://palbase.studio/docs/access/sql#putting-a-schema-into-a-database); the relationships it keeps stay, with no end.

A `palbase/backend` app takes the engine with its next deploy. While that one deploy is open, the version being replaced still answers from the schema the earlier engine compiled, which reads a relationship **between two objects** — a team's to a product — as it stands: an end for one is refused until the deploy completes. What a user holds ends for both versions.
