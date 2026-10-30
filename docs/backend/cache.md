> The full documentation index: https://palbase.studio/llms.txt

# Cache

Every project has a cache: short-lived entries, each a value a server worked out and wants again, kept by the platform rather than in your machine's memory. Every copy of a machine reads the same entries, a push does not empty them, and a machine that slept finds them when it wakes. In a `palbase/backend` app it is `Cache`; from any other server it is `createServer({ url, secretKey }).cache`, the cache module's calls as its contract states them. Only the secret key reaches it: an app never reads or writes the cache.

A cache is not a database. Every entry runs out, after thirty days at most, and an entry may be gone before its time, dropped to make room. What must not be lost belongs in a [database](https://palbase.studio/docs/backend/database).

## Quick example

```ts
// src/modules/products/products.service.ts
import { Cache, Database, Injectable } from "palbase/backend";

type Product = { id: string; name: string; price_cents: number };

@Injectable()
export class ProductsService {
  /** The catalog, read from the database at most once every five minutes. */
  async catalog(): Promise<Product[]> {
    return Cache.getOrSet("catalog", 300, () => Database.$query<Product>("select id, name, price_cents from products order by name"));
  }

  /** After a change, the next read goes to the database again. */
  async changed(): Promise<void> {
    await Cache.del("catalog");
  }
}
```

## The `Cache` service

| Call | What it does |
|---|---|
| `get<T>(key)` | The value, or `null` when there is none, or when the cache could not be reached |
| `set(key, value, ttl?)` | Writes the value for `ttl` seconds, replacing what was there and its time left. Without a `ttl` it lasts thirty days |
| `getOrSet(key, ttl, fn)` | Reads through: on a hit the value; on a miss `fn`'s, kept for `ttl` seconds |
| `incr(key)` | Adds one to the key's count and answers the new count |
| `del(key)` | Deletes the entry. Deleting what is not there is not an error |

- **A key** is UTF-8 text, 1 to 512 bytes. Every project has keys of its own: no key reaches another project's entries, so a key needs no prefix for that.
- **A value** is JSON, 512 KiB at most. What is kept is what `JSON.stringify` makes of it: a `Date` comes back as its ISO string, a class instance as its fields, `undefined` as `null`. A value written as `null` reads as `null` from `get`, the same as a miss; `getOrSet` counts it as a hit.
- **A `ttl`** is in seconds. A fraction is rounded up; none, `0` or less is thirty days, and more than thirty days is thirty days (`CACHE_MAX_TTL`, which `palbase/backend` exports).

### When the cache cannot be reached

The cache keeps three copies of the entries, one in each zone of the region. When the copy that takes the writes is lost, or stops answering, another takes over within a few seconds: a call made meanwhile waits for it, up to six seconds, and is answered then, instead of failing. An `incr` waited through a takeover is counted once. A copy that stops for maintenance hands over first, and an entry written before it is there after. A copy lost all at once has not handed over: the others receive each write a moment after it is answered, so a write answered in its last moment may be missing from the copy that takes over, an `incr`'s count among them. A count that must be exact belongs in a database.

The app is not stopped by a cache that is away either. A call that cannot reach it, or that is refused for now (`429`, `503`), is treated by what it is for:

| Call | When the cache is away |
|---|---|
| `get` | A miss: `null`, and a warning in the machine's log |
| `set` | The write is let go, with a warning |
| `getOrSet` | `fn` runs and its value is answered, not kept |
| `del` | Throws: the old value would come back after the delete said it was done |
| `incr` | Throws: there is no number to make up |

A read is sent again first, as every read of the server SDK is, waiting the `Retry-After` the cache asks for. Any other refusal, such as a key longer than 512 bytes or a value larger than 512 KiB, throws a `PalbaseError` from every call ([Server SDK](https://palbase.studio/docs/server/overview)).

### Reading through: `getOrSet`

On a miss, `fn` is called and its value kept for `ttl` seconds. Misses on the same key that arrive while `fn` runs, in the same process, wait for that one call: a hundred requests that miss at once work the value out once. The sharing is a process's own, so two copies of a machine that miss at the same moment each call `fn`. When `fn` throws, every caller waiting on it gets that error, and nothing is kept.

### Counting: `incr`

`incr` is atomic across every copy of the machine: two callers never get the same number.

```ts
// src/modules/exports/exports.service.ts
import { Cache, Injectable, TooManyRequests } from "palbase/backend";

@Injectable()
export class ExportsService {
  /** A user's exports today, the fifth the last. */
  async allow(userId: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const n = await Cache.incr(`exports:${userId}:${day}`);
    if (n > 5) throw new TooManyRequests({ retryAfter: 3600 }, "five exports a day");
  }
}
```

- An entry that is not there, or holds something other than a whole number, counts from zero.
- A count keeps the time its entry had left; a new count lasts thirty days. A count started with `set(key, 0, ttl)` ends with that `ttl`.
- A count stops at fifteen digits: one more is refused (`409 count_too_large`) and nothing is counted.
- `incr` is never sent again by the client. When the cache was reached but did not answer, the count may have been taken: read the entry before counting again.

For a route's own limit on how often a caller may call it, use the route's `rateLimit` ([Controllers & Routing](https://palbase.studio/docs/backend/controllers)), not a count of your own.

## Room in the cache

An entry weighs what the cache keeps for it: its value plus three times its key, a quarter more, and 320 bytes. A project's entries together weigh at most its quota, 25 MiB.

A write past the quota does not fail. The project's own entries nearest their end are dropped to make room, and the write's answer says how many (`evicted`). When the cache as a whole is full, the project that weighs the most gives back first; a project under its share keeps its entries. One entry larger than the whole quota is refused (`413 entry_too_large`).

A project reads and writes so many bytes a second (8 MiB read, 2 MiB written; the second's first call is taken whatever its size), and makes at most its requests per second of calls to the cache. Past either, a call is `429 rate_limited` with `Retry-After`.

The cache's calls are not counted as the project's API requests, and they are not lines of its request [log](https://palbase.studio/docs/getting-started/logs). What the project's entries weigh is metered as **Cache memory**, and the bytes its reads carry out as **Cache reads**, on the project's **Settings › Usage** in Studio ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)). A deleted environment's entries are deleted with it.

## From any server

`createServer(...).cache` is the cache module's calls, with the secret key:

```ts
// server/cache.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const written = await palbase.cache.putCacheEntry({ query: { key: "greeting" }, body: { value: { text: "hello" }, ttl: 600 } });
console.log(written.data.expires_in, written.data.evicted);

const read = await palbase.cache.getCacheEntry({ query: { key: "greeting" } });
if (read.data.found) console.log(read.data.value, read.data.expires_in);

const usage = await palbase.cache.getCacheUsage();
console.log(usage.data.bytes, usage.data.limit_bytes, usage.data.entries);
```

| Call | HTTP | Answers |
|---|---|---|
| `getCacheEntry({ query: { key } })` | `GET /cache/entry?key=` | `{ found, value?, expires_in? }`: a key with no entry is `found: false`, not an error |
| `putCacheEntry({ query: { key }, body: { value, ttl? } })` | `PUT /cache/entry?key=` | `{ expires_in, evicted }`. A `ttl` is 1 to 2592000 seconds; outside it, `400` |
| `deleteCacheEntry({ query: { key } })` | `DELETE /cache/entry?key=` | `{ deleted }`: whether there was an entry |
| `incrementCacheEntry({ query: { key } })` | `POST /cache/entry/increment?key=` | `{ value }`: the new count |
| `getCacheUsage()` | `GET /cache/usage` | `{ bytes, limit_bytes, entries }`: what the live entries weigh, the quota, how many there are |

The key is a query parameter, which the request's log line does not keep. A publishable key is refused (`403 secret_key_required`), and so is the secret key sent with a user's token beside it. A cache that could not be reached is `503 cache_unavailable`, and one that takes no more at this moment `503 cache_busy`; both carry `Retry-After`.

## In tests

`withServices({ Cache: … })` gives the code a cache of the test's own ([Testing](https://palbase.studio/docs/backend/testing#the-services-the-code-reads-withservices)). A test that does not give one, and runs code that reads `Cache`, is refused by name: the real calls would reach a platform no test serves.

## Related

- [Database](https://palbase.studio/docs/backend/database) — what must be kept
- [Machines](https://palbase.studio/docs/machines/overview) — copies, sleep, and what a copy keeps in its own memory
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals, retries
- [Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits) — what is metered
