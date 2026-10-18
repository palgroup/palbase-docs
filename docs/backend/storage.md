> The full documentation index: https://palbase.studio/llms.txt

# Storage

Every project has storage: **buckets** of files, read and written by your backend with the secret key. In a `palbase/backend` app the module is `Palbase.storage`; from any other server it is `createServer({ url, secretKey }).storage` — the same client, generated from the storage contract. A client app never holds the secret key, so it reaches files in two ways only: a **public** bucket's objects, which anyone may read, and **signed URLs** your backend hands out — one to read an object, or one to upload it ([Direct Uploads](https://palbase.studio/docs/backend/direct-uploads)). An AI chat message holds to the same: a client attaches only a public bucket's file, and a private one is attached by your server ([AI](https://palbase.studio/docs/backend/ai)).

## Quick example

```ts
// src/modules/avatars/avatars.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class AvatarsService {
  /** Stores the picture as the user's: it goes when they are deleted. */
  async save(userId: string, png: Blob): Promise<string> {
    const path = `${userId}/avatar.png`;
    await Palbase.storage.putObject({
      path: { bucket: "avatars", path },
      query: { owner_id: userId },
      body: png,
      contentType: "image/png",
    });
    return path;
  }

  /** A link that reads the object for ten minutes, by anyone holding it. */
  async link(path: string): Promise<string> {
    const signed = await Palbase.storage.createSignedUrl({ path: { bucket: "avatars" }, body: { path, expires_in: 600 } });
    return signed.data.url;
  }
}
```

## Buckets

A bucket is declared, and declaring it again makes it so. `PUT /storage/buckets/{bucket}` creates the bucket or changes it to what the body says:

| Field | Default | What it says |
|---|---|---|
| `public` | `false` | Anyone may read its objects at `/storage/public/{bucket}/{path}`, with no credential. |
| `file_size_limit` | the platform's, 5 GiB | The largest object it takes, in bytes. |
| `allowed_mime_types` | any | The content types it takes; `image/*` names a family. 64 at most. |
| `variants` | none | The renditions made of every picture put in it (below); 16 at most. |

A bucket's name is a lowercase letter, then lowercase letters, digits and `-`, 2 to 63 characters.

```ts
// src/modules/avatars/buckets.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class BucketsService {
  // A provider's onStart() runs at boot, before the app serves: the bucket
  // is as this code says on every machine that runs it.
  async onStart(): Promise<void> {
    await Palbase.storage.putBucket({
      path: { bucket: "avatars" },
      body: {
        public: true,
        file_size_limit: 5 * 1024 * 1024,
        allowed_mime_types: ["image/*"],
        variants: [
          { name: "thumb", width: 128, height: 128, fit: "cover", format: "webp", quality: 80 },
          { name: "large", width: 1024, height: 0, fit: "inside", format: "jpeg", quality: 0 },
        ],
      },
    });
  }
}
```

The write carries an `Idempotency-Key` the client makes, so its own retry never declares twice; a declaration a renderer cannot honour is refused here (`400`), not at the first upload. `GET /storage/buckets` lists the project's buckets, `GET /storage/buckets/{bucket}` reads one, and `DELETE /storage/buckets/{bucket}` deletes an **empty** bucket — one that still holds objects is refused with `409 bucket_not_empty`, so no file goes by surprise.

Studio's **Storage › Buckets** screen lists the buckets, deletes them, and uploads and deletes files in one.

## Writing an object

`putObject` stores its body at the path, replacing what is there.

```ts
// src/modules/reports/reports.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class ReportsService {
  async publish(month: string, csv: string) {
    const written = await Palbase.storage.putObject({
      path: { bucket: "reports", path: `monthly/${month}.csv` },
      headers: { "If-None-Match": "*" }, // create only: an object already there is 412
      body: csv,
      contentType: "text/csv",
    });
    return written.data; // the StorageObject: path, size, content_type, checksum_sha256 …
  }
}
```

- **Its type is sniffed from the bytes**, not taken from `contentType`, which is used only when the bytes cannot tell (HEIC, say). The bucket's ceiling and its types are enforced while the bytes stream in (`413 payload_too_large`, `415 unsupported_media_type`).
- **`owner_id`** makes the object a user's: it is deleted when they are.
- **`If-None-Match: *`** creates only (`412 object_exists`); **`X-Checksum-Sha256`** (hex) refuses bytes that do not match (`400 checksum_mismatch`), keeping nothing.
- **A picture** gets its `width`, `height`, a `thumbhash` placeholder and the bucket's renditions, made inside the upload — the object answered is complete.
- **It emits `file.uploaded`** to the project's webhook ([Webhooks](https://palbase.studio/docs/server/webhooks)).

A route of a `palbase/backend` app reads its body as JSON, a megabyte by default, so a client's file does not come through your backend to get here: the client PUTs it straight to storage at a URL your backend signed. See [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads).

### What an object looks like

| Field | What it is |
|---|---|
| `bucket`, `path` | Where it is. |
| `size`, `content_type` | Its bytes and the type they were sniffed as. |
| `checksum_sha256` | The bytes' sha256, hex. |
| `owner_id` | The user it belongs to, if any. |
| `width`, `height`, `thumbhash` | A picture's dimensions and placeholder. |
| `variants` | Its renditions, by name: each with its `content_type` and `size`. |
| `created_at`, `updated_at` | When an object was first stored at the path, and when its bytes or path last changed. |

## Reading an object

`getObject` answers the bytes as the `Response` itself, so a large file is never read into memory unless you do so:

```ts
// src/modules/reports/download.service.ts
import { Injectable, NotFound, Palbase } from "palbase/backend";

@Injectable()
export class DownloadService {
  async text(path: string): Promise<string> {
    const reply = await Palbase.storage.getObject({ path: { bucket: "reports", path } });
    if (reply.status === 304 || !reply.data) throw new NotFound(`no report at ${path}`);
    return reply.data.text();
  }

  async thumbnail(path: string): Promise<ArrayBuffer> {
    const reply = await Palbase.storage.getObject({ path: { bucket: "avatars", path }, query: { variant: "thumb" } });
    if (reply.status === 304 || !reply.data) throw new NotFound(`no avatar at ${path}`);
    return reply.data.arrayBuffer();
  }
}
```

A missing object is a `404` refusal (a `PalbaseError`). `Range` (one byte range, answered `206`) and `If-None-Match` (answered `304`, with no body) are honoured, and `headObject` reads the headers without the bytes. A read with the secret key names the object's owner in `X-Owner-Id`; a public or signed URL never does. What is served is made inert — `nosniff`, a sandboxing CSP, and a download for any type a browser does not render safely — and every read counts toward the project's egress.

## Three ways a client reads a file

| URL | Who may read it | Made by |
|---|---|---|
| `https://<ref>.palbase.studio/storage/public/{bucket}/{path}` | Anyone, with no credential — an `<img src>`, a CDN. A private bucket's object is `403`. | Nothing to make: the bucket is `public`. |
| `https://<ref>.palbase.studio/storage/signed/{bucket}/{path}?…&sig=…` | Anyone holding the URL, until it expires (7 days at most). | `createSignedUrl` |
| `GET /storage/buckets/{bucket}/objects/{path}` | Your backend, with the secret key. | — |

The `{path}` in a URL is **one** percent-encoded segment: `a/b.jpg` is `a%2Fb.jpg`. `?variant=thumb` reads a rendition on all three.

```ts
// src/modules/avatars/urls.ts
const PROJECT = "https://<ref>.palbase.studio";

/** A public bucket's object, as an <img src> takes it. */
export function publicUrl(bucket: string, path: string, variant?: string): string {
  // The path is ONE segment: a/b.jpg goes as a%2Fb.jpg.
  const [b, p] = [encodeURIComponent(bucket), encodeURIComponent(path)];
  const url = new URL(`/storage/public/${b}/${p}`, PROJECT);
  if (variant) url.searchParams.set("variant", variant);
  return url.toString();
}
```

A signed URL is absolute, at the project's own address, and opens nothing at another project's. Every parameter of it is covered by its signature: a URL changed by one character, expired, or naming another object is `403`. The object must exist when the URL is signed.

## Image renditions

A bucket's `variants` are made from every picture put in it, inside the upload, and kept beside the original:

| Field | Values | Default |
|---|---|---|
| `name` | a lowercase letter, then lowercase letters, digits and `_` (32 at most) | — |
| `width`, `height` | pixels; `0` derives one from the other and the picture's aspect | — |
| `fit` | `cover` fills the box and crops; `contain` and `inside` keep the whole picture inside it (`inside` never enlarges) | `contain` |
| `format` | `jpeg`, `png`, `webp` | `jpeg` |
| `quality` | 1 to 100 for jpeg and webp; `0` is the format's default | `0` |

A rendition is read by its name (`?variant=`), and served whole — a byte range applies to the original only. A copy carries the original's renditions with it.

## Listing, copying, moving, deleting

```ts
// src/modules/reports/archive.service.ts
import { Injectable, Palbase } from "palbase/backend";
import { pages } from "palbase/server";

@Injectable()
export class ArchiveService {
  /** Every report of a year, newest first, a page at a time. */
  async year(year: string): Promise<string[]> {
    const paths: string[] = [];
    for await (const page of pages((cursor) =>
      Palbase.storage.listObjects({ path: { bucket: "reports" }, query: { prefix: `monthly/${year}-`, limit: 1000, cursor } }),
    )) {
      paths.push(...page.objects.map((o) => o.path));
    }
    return paths;
  }

  async retire(path: string): Promise<void> {
    await Palbase.storage.moveObject({ path: { bucket: "reports" }, body: { from: path, to: `retired/${path}` } });
  }

  async duplicate(path: string, to: string): Promise<void> {
    await Palbase.storage.copyObject({ path: { bucket: "reports" }, body: { from: path, to, overwrite: true } });
  }

  async remove(path: string): Promise<void> {
    await Palbase.storage.deleteObject({ path: { bucket: "reports", path } });
  }
}
```

- **A move** gives the object a new path and copies no byte; **a copy** writes a new object with the original's bytes and renditions. Either refuses an object already at `to` (`409 object_exists`) unless `overwrite`.
- **A delete** removes the object and its renditions; the bytes are swept from the store after.
- They emit `file.moved`, `file.uploaded` and `file.deleted`.

## Reacting to storage events

Every write emits an event — `file.uploaded`, `file.deleted`, `file.moved` — with `{ bucket, path, size, content_type, owner_id }`. A `palbase/backend` app handles them with `@On("file.uploaded")` ([Event Hooks](https://palbase.studio/docs/backend/hooks)); any other server verifies the delivery with `palbase/server` ([Webhooks](https://palbase.studio/docs/server/webhooks)).

## The `Storage` service

A backend reaches a bucket with `Storage`: `Storage.buckets.<name>` for a bucket the project holds (its renditions in the type), `Storage.bucket(name)` for a name made while it runs. Each call answers `{ data, error, status }` and never throws for the platform's sake: a refusal is its `error` (`{ code, message }`), and a platform that could not be reached is `status: 0`.

| Call | What it does |
|---|---|
| `upload(path, file, { contentType?, upsert? })` | Writes the object. Without `upsert` it only creates: an object already there is `409 already_exists`. |
| `download(path)` | The object's bytes, as a `Blob` |
| `getPublicUrl(path, { variant? })` | Its URL at the project's address — a public bucket's objects are read there by anyone; no call is made |
| `createSignedUrl(path, { expiresIn })` | A URL that reads it until it expires: `"90s"`, `"15m"`, `"1h"`, `"7d"`, a week at most |
| `list(prefix?, { limit?, offset? })` | Its objects whose path starts with `prefix`, newest first (100 when no `limit`) |
| `remove(paths)` | Deletes each, in order; the first refusal ends it |
| `move(from, to)`, `copy(from, to)` | Within the bucket |

```ts
// palbase/palbase-env.d.ts
declare module "palbase/backend/stack" {
  interface Buckets {
    avatars: { variants: "thumb" | "card" };
  }
}

export {};
```

```ts
// src/modules/avatars/avatar-urls.service.ts
import { Injectable, Storage } from "palbase/backend";

@Injectable()
export class AvatarUrls {
  async save(userId: string, png: Blob): Promise<{ full: string; thumb: string } | null> {
    const path = `${userId}/avatar.png`;
    const { error } = await Storage.buckets.avatars.upload(path, png, { contentType: "image/png", upsert: true });
    if (error) return null;
    return { full: Storage.buckets.avatars.getPublicUrl(path), thumb: Storage.buckets.avatars.getPublicUrl(path, { variant: "thumb" }) };
  }
}
```

## From the CLI

```sh
palbase storage:buckets:set avatars --public --max-size 5MB --types image/*
palbase storage:buckets:list
palbase storage:cp ./avatar.png avatars:users/42/avatar.png   # up; bucket:path names an object
palbase storage:cp avatars:users/42 ./backup -r                # down, every object under the prefix
palbase storage:ls avatars:users/
palbase storage:url documents:invoices/7.pdf --expires 600      # a signed download URL
palbase storage:rm avatars:tmp/ -r
```

What `storage:buckets:set` is not given stays as it was; a new bucket is private, takes any type and has no renditions until `--variants-file` gives them. `storage:buckets:delete` removes an empty bucket only. See the [CLI reference](https://palbase.studio/docs/cli/reference#storage).


- [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads) — signed upload URLs, and the client's `PUT`
- [Web Uploads](https://palbase.studio/docs/web/uploads) — the browser's side of an upload URL
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals, retries and paging
- [Event Hooks](https://palbase.studio/docs/backend/hooks) — `@On("file.uploaded")` in your backend
