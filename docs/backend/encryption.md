> The full documentation index: https://palbase.studio/llms.txt

# Field Encryption

A column marked `.encrypted()` is sealed by your app before it is written and opened when it is read, with the project's own field keys. The database, its backups and a dump of it hold ciphertext; your code reads and writes the plain value, as with any other column. It is on every plan, at no cost.

It protects a field from whoever reaches the database without the app: a leaked dump or backup, a stolen database password, a read-only SQL injection. It does not protect it from your app itself — the app holds the keys while it runs.

## Quick example

```ts
// db/public.ts
import { defineSchema, defineTable, text, uuid } from "palbase/backend";

export const patients = defineTable("patients", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    name: text(),
    // Found by equality, and kept unique: { lookup: true } keeps a keyed hash beside it.
    national_id: text().encrypted({ lookup: true }).unique(),
    // Read and written whole, never searched.
    notes: text().encrypted().nullable(),
  },
});

export default defineSchema("public", { tables: [patients] });
```

```ts
// src/modules/patients/patients.service.ts
import { Database, Injectable } from "palbase/backend";

@Injectable()
export class PatientsService {
  async admit(name: string, nationalId: string) {
    return Database.public.patients.insert({ name, national_id: nationalId, notes: "allergy: penicillin" });
  }

  async byNationalId(nationalId: string) {
    return Database.public.patients.findUnique({ where: { national_id: nationalId } });
  }
}
```

What the database holds:

```text
 name |                       national_id                       |       national_id_lookup
------+---------------------------------------------------------+------------------------------
 Ayşe | pbe1.k1.MzMzMzMzMzMzMzMztbNidvqiRRyDjN1Zkdx-38ei7bu3V…   | pbl1.cypF9YEDilHu_qYJy15Snch…
```

## What an encrypted column is asked

The database holds the column's ciphertext, not its value, so it can compare nothing there. An encrypted column takes text; what a query may ask of it is fixed by its type:

| | `.encrypted()` | `.encrypted({ lookup: true })` |
|---|---|---|
| Read and write the value | yes | yes |
| `isNull`, `null` | yes | yes |
| Equality: `{ col: v }`, `in`, `neq`, `findUnique` | — | yes, through the lookup |
| `.unique()`, `onConflict` | — | yes, kept on the lookup |
| `orderBy`, `gt`/`lt`, `contains`/`startsWith`, `search`, `min`/`max`, `groupBy`, an index | — | — |

What is refused is a compile error in a typed query, and an error naming the column when the query is built otherwise. The lookup is a keyed hash (HMAC-SHA256) of the value, kept in `<column>_lookup`, which your code never names; equal values have equal lookups, so a lookup tells which rows hold the same value — keep it off a column whose few possible values that would give away.

An encrypted column is not a default, a primary key, a foreign key, a generated column or a search column, and has no codec: `defineTable` refuses each, naming the column.

## Keys

Each environment has its own field keys, kept by the platform's secrets module and derived from the environment's data key, which the platform's key-encryption key (Azure Key Vault) wraps. Your app reads them with its secret key when it starts and every minute after; a schema without an encrypted column never reads them. The secrets audit trail (`palbase secrets:audit`) has each app key's first read in the hour, and every download by a developer.

A value is bound to its column — `table.column`, or `schema.table.column` outside public: moved to another column, or into another environment, it does not open, and a value changed in the database is refused when read, as is a plain value where an encrypted one belongs.

## Encrypting a column that holds rows

Add `.encrypted()` to the column and deploy. The release migrates beside the version that serves, as every [schema change](https://palbase.studio/docs/backend/migrations) does:

- While both versions run, the column keeps the form the old version reads — plain — and the new version reads either form.
- Once the old version is gone, the release seals every row, in batches, and from then on a plain value in the column is refused.

Taking `.encrypted()` off goes the same way the other way round. An encrypted column, or its table, is not renamed while it holds rows: its values are bound to its name.

## Rotating the keys

```bash
palbase fields:rotate
```

The new key comes into force five minutes later — every running app has fetched it by then. New values are sealed with it from then on, and a `palbase/backend` app seals the older values again with it in the background. The older keys go on opening what they sealed. An owner or an admin rotates; `palbase fields:list` shows the keys and which is in force.

## In Studio

The database's **Tables** screen shows an encrypted value masked. An owner or an admin of the organization opens one with **Show**: the secrets module opens it — the keys never reach Studio — and records who opened which column in the audit trail. A member sees the mask alone.

## Copying, dumping and leaving

- `palbase db:copy --from production --to staging` copies every encrypted value as `•••`, sealed with the target's keys: one environment's values never land readable in another.
- A dump (`palbase db:dump`) holds ciphertext. The environment's owner downloads the keys that open it — `palbase fields:keys --out keys.json` writes them into a file readable by its owner alone, and the download is in the audit trail. Keep the file as you keep the database's password.

## Without palbase/backend

A server with another way to its database — NestJS with TypeORM or Prisma, plain SQL — seals and opens a column itself with `palbase/server`, in the same format: a column one app writes, the other reads.

```ts
// src/patients/fields.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

/** Awaited at startup: after it, the calls below are synchronous. */
export const fieldsLoaded = palbase.fields.load();

/** What an INSERT writes: the sealed value, and the lookup it is found by. */
export function sealNationalId(value: string) {
  return {
    national_id: palbase.fields.encrypt("patients.national_id", value),
    national_id_lookup: palbase.fields.lookup("patients.national_id", value),
  };
}

export const nationalIdLookup = (value: string) => palbase.fields.lookup("patients.national_id", value);
export const openNationalId = (sealed: string) => palbase.fields.decrypt("patients.national_id", sealed);
```

```ts
// src/patients/patients.repository.ts
import { nationalIdLookup, openNationalId, sealNationalId } from "./fields";

/** Your Postgres client (pg's Pool, postgres.js), down to the one call used here. */
export interface Db {
  query(text: string, values: unknown[]): Promise<{ rows: { national_id: string }[] }>;
}

export async function admit(db: Db, id: string, name: string, nationalId: string): Promise<void> {
  const sealed = sealNationalId(nationalId);
  await db.query("INSERT INTO patients (id, name, national_id, national_id_lookup) VALUES ($1, $2, $3, $4)", [id, name, sealed.national_id, sealed.national_id_lookup]);
}

export async function nationalIdOf(db: Db, wanted: string): Promise<string | undefined> {
  const { rows } = await db.query("SELECT national_id FROM patients WHERE national_id_lookup = $1", [nationalIdLookup(wanted)]);
  return rows[0] && openNationalId(rows[0].national_id);
}
```

The first argument is the column's address. A TypeORM column transformer is the same two calls:

<!-- fragment: a property shown out of its TypeORM entity -->

```ts
@Column({ transformer: { to: (v: string) => palbase.fields.encrypt("patients.national_id", v), from: (v: string) => palbase.fields.decrypt("patients.national_id", v) } })
national_id!: string;
```

`palbase.fields` needs Node's crypto: Node, Bun or Deno.

## Tests

`palbase/server/testing`'s `testFields()` gives keys of no project, held in the test's process. Pass them where the project's would go — `createRequestDatabase(sql, identity, { schemas, fields })` from `palbase/backend/engine`, or palgres' `createDatabase({ …, fields })` — for a test that runs an encrypted schema against a database of its own:

```ts
// test/fields.test.ts
import { expect, it } from "bun:test";
import { testFields } from "palbase/server/testing";

it("opens what it seals, at the same column alone", async () => {
  const fields = await testFields();
  const sealed = fields.encrypt("patients.national_id", "10000000146");
  expect(sealed.startsWith("pbe1.")).toBe(true);
  expect(fields.decrypt("patients.national_id", sealed)).toBe("10000000146");
  expect(() => fields.decrypt("patients.phone", sealed)).toThrow();
});
```

`palbase/backend/test`'s in-memory database keeps an encrypted column as a plain one, and does not refuse what the engine refuses on it.
