> The full documentation index: https://palbase.studio/llms.txt

# Direct Uploads

A file a user uploads goes from their device **straight to storage**, never through your backend. Your backend decides what may be uploaded — which bucket and path, how large, of which types, belonging to whom — in one of two ways:

- **A signed upload URL.** Your backend signs a URL that grants exactly that, and the client `PUT`s the bytes to it. The signature is the credential: the client needs no key, and the URL opens one object, once its conditions hold, until it expires. This page's quick example.
- **An upload route.** A route declared with `@Upload` takes the file in the client's call: storage asks the route where the file goes before it writes a byte, and runs the route's handler once the file is stored. See [Upload routes](#upload-routes).

## Quick example

```ts
// src/modules/avatars/dto.ts
import { z } from "palbase/backend";

export const UploadRequest = z.object({ contentType: z.enum(["image/png", "image/jpeg", "image/webp"]) });
export type UploadRequest = z.infer<typeof UploadRequest>;

export interface UploadGrant {
  url: string;
  expiresAt: string;
  path: string;
}
```

```ts
// src/modules/avatars/avatars.controller.ts
import { Body, Controller, Palbase, Post, User, type UserT } from "palbase/backend";
import { UploadRequest, type UploadGrant } from "./dto";

@Controller("/avatars")
export class AvatarsController {
  // The user asks; the backend decides the path, the ceiling and the owner.
  @Post("/upload-url", { rateLimit: { max: 10, window: 60 } })
  async uploadUrl(@Body(UploadRequest) body: UploadRequest, @User() user: UserT): Promise<UploadGrant> {
    const ext = body.contentType.split("/")[1];
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const signed = await Palbase.storage.createUploadUrl({
      path: { bucket: "avatars" },
      body: { path, expires_in: 300, max_bytes: 2 * 1024 * 1024, owner_id: user.id },
    });
    return { url: signed.data.url, expiresAt: signed.data.expires_at, path };
  }
}
```

The client then sends the file to that URL:

```ts
// upload.ts
export async function upload(grant: { url: string }, file: Blob): Promise<void> {
  const res = await fetch(grant.url, {
    method: "PUT",
    headers: { "content-type": file.type, "if-none-match": "*" },
    body: file,
  });
  if (!res.ok) throw new Error(`the upload was refused: ${res.status}`);
}
```

## The flow

1. **The client asks your backend** for a grant — a route of your own, with whatever the upload needs to say (the kind of file, which record it belongs to).
2. **Your backend signs it** with `POST /storage/buckets/{bucket}/upload-urls` (`Palbase.storage.createUploadUrl`) and answers the URL.
3. **The client `PUT`s the bytes** to the URL — `PUT /storage/signed/{bucket}/{path}`, with the signature in its query.
4. **Storage checks the grant while the bytes stream**, stores the object, answers it (`200`, or `201` for a new one), and emits `file.uploaded`.

Your backend is not on the upload's path, so it learns of the upload from the event: an `@On("file.uploaded")` handler ([Event Hooks](https://palbase.studio/docs/backend/hooks)), or a route the client calls once its `PUT` is answered.

## What the URL grants

`createUploadUrl` takes:

| Field | What it pins |
|---|---|
| `path` | The object's path, chosen by your backend, never by the client. |
| `expires_in` | Seconds the URL works: 1 to 604800 (7 days). |
| `max_bytes` | A ceiling below the bucket's own `file_size_limit`. |
| `owner_id` | The user the object will belong to; it is deleted with them. |

The bucket's `allowed_mime_types` are pinned too. It answers `{ url, expires_at }`: an absolute URL at the project's own address, `https://<ref>.palbase.studio/storage/signed/{bucket}/{path}?…`. Every one of its query parameters — the bucket, the path, the expiry, the ceiling, the types, the owner — is covered by its signature, so a client that edits one holds a URL that opens nothing.

## The `PUT`

| Header | What it does |
|---|---|
| `Content-Type` | Used only when the bytes cannot say what they are (HEIC): the type is sniffed from the bytes. |
| `If-None-Match: *` | Create only: an object already at the path is refused with `412`. |
| `X-Checksum-Sha256` | The bytes' sha256, hex: bytes that do not match are refused, and nothing is kept. |

| Answer | Why |
|---|---|
| `200` / `201` | Stored — the object, as JSON: `path`, `size`, `content_type`, `width`, `height`, `thumbhash`, `variants`. |
| `400 checksum_mismatch` | The bytes do not have the sha256 `X-Checksum-Sha256` named. |
| `403` | The signature is wrong, expired, another project's, or a download signature. |
| `412 object_exists` | `If-None-Match: *` and an object is already there. |
| `413 payload_too_large` | Larger than the URL's ceiling or the bucket's. |
| `415 unsupported_media_type` | A type the bucket, or the URL, does not take. |
| `422 unreadable_picture` | A picture the bucket's renditions cannot be made from: truncated, or a format storage does not read. |
| `429 quota_exceeded` | The project's storage for the period is used up under its quota (with `Retry-After`). |

A picture's renditions are made inside the upload, so the object the `PUT` answers already carries them.

> **Note:** A browser page on any site can make this `PUT`: it is preflighted, and the project's address answers the preflight. See [Web Uploads](https://palbase.studio/docs/web/uploads) for the browser.

## Upload routes

An upload route is one method that both decides where a file goes and runs once it is there. The client sends the file with the route's input in one call to the project's storage; storage asks your machine whether this caller may upload and where to, writes the bytes under the bucket's rules, then hands the route's handler the stored object. What the handler answers is the client's answer. Nothing is signed, the client makes no second call to say it is done, and the bytes still never pass through your machine.

```ts
// src/modules/profile/profile.controller.ts
import { Controller, PalError, Upload, UploadedObject, User, type UserT } from "palbase/backend";

interface Avatar {
  owner: string;
  path: string;
  size: number;
  contentType: string;
  thumbhash?: string;
}

@Controller("/profile")
export class ProfileController {
  // Into the avatars bucket, under a folder of the user's: the client never names the path.
  @Upload("/avatar", { bucket: "avatars", pathTemplate: "{userId}/{uploadId}-{filename}", rateLimit: { max: 10, window: 60 } })
  avatar(@UploadedObject() file: UploadedObject, @User() user: UserT): Avatar {
    // Runs once the file is stored. A refusal thrown here deletes it.
    if ((file.width ?? 0) < 128) throw new PalError(422, "picture_too_small", "An avatar is 128 pixels wide at least");
    return { owner: user.id, path: file.path, size: file.size, contentType: file.contentType, thumbhash: file.thumbhash };
  }
}
```

The client calls it through the module `palbase apps:sync` writes, the file after the route's input: `pb.backend.profile.avatar(file, { onProgress })` in a browser ([Web Uploads](https://palbase.studio/docs/web/uploads#an-upload-route)).

`@Upload(subpath, options)` is a `POST` route of its controller, and takes:

| Option | What it is |
|---|---|
| `bucket` | The bucket its files go to: lowercase letters, digits and dashes, starting with a letter, 2 to 63 long. Its rules (the largest file, the types it takes, its renditions) hold every upload as storage writes it. |
| `pathTemplate` | The path each file is stored under, made for each upload from the tokens below. Segments separated by `/`, none empty, `.` or `..`, no control character, 1024 bytes at most. |
| `auth` | Who may upload, as any route's `auth`: a signed-in user unless `auth: false`. |
| `rateLimit` | How many uploads a caller may start per window, as any route's `rateLimit`. Spent as an upload is asked for, before a byte is written. |

| Token | What it becomes |
|---|---|
| `{userId}` | The signed-in user's id; `anonymous` for no one, on a route with `auth: false`. |
| `{uploadId}` | The upload's own id, made by storage: `file.uploadId` in the handler. |
| `{filename}` | The name the client gave its file, made one path segment: control and invisible characters dropped, `/` and `\` a dash, a run of dots one dot, no leading dot or space, 200 characters at most; `file` when it gave none. |

A template that names another token, or is no path storage keeps, stops the app as it starts. Storage writes an upload's object only where none is: put `{uploadId}` in the template, or a second upload to the same path is refused `412 object_exists`.

The handler takes the stored object with `@UploadedObject()`, and what any route takes: the input the client sent beside the file with `@Body(schema)`, the caller with `@User()` or `@OptionalUser()`, `@Param` and `@QueryParams`. It runs as the caller does, their row-level security included. The caller is the one storage names, their id and session, not their token: an upload route cannot ask for a verified email, and `@Headers()`, `@Req()` and `@Client()` stop the app as it starts, because storage forwards none of the client's headers. A method is an upload route or another route, never both.

| `@UploadedObject()` | What it is |
|---|---|
| `uploadId` | The upload's id, the same as in its path. |
| `bucket`, `path` | Where it was stored, as `pathTemplate` made it. |
| `size` | Bytes, as storage counted them. |
| `contentType` | The type storage found in the bytes, not the file's name or what the client claimed. |
| `checksum` | The stored bytes' SHA-256, hex. |
| `width`, `height`, `thumbhash` | A picture's size in pixels, and its placeholder (ThumbHash). Absent for anything else. |
| `variants` | The renditions the bucket declares, by name, each its address: a public bucket's. None for a private bucket. |

### What storage does

1. **The client's call.** `POST /storage/upload/<machine>/<route>` at the project's address, with the publishable key and the user's token when someone is signed in. `<route>` is the route's path as one percent-encoded segment (`profile%2Favatar`), and the request's query is the route's. The body is `multipart/form-data`: a JSON `body` part of 1 MiB at most (the route's input), then the `file`.
2. **The machine authorizes it**, within 30 seconds. The route's `auth` and `rateLimit` are held as a request of the caller's would meet them, its `@Resolve` parameters and guards run, its query and the `body` are checked against their schemas, and `pathTemplate` is made into the path. A refusal is the client's answer, as the app gave it, and no byte is written.
3. **Storage writes the bytes** to the bucket under its rules, and measures them: size, checksum, the type the bytes are, a picture's size, placeholder and renditions. The object belongs to the signed-in user, and is deleted with them.
4. **The handler runs** with the stored object, within two minutes. Its answer (`200` with JSON, `204`, a `Response` it built, a refusal) is relayed to the client as it gave it. A refusal, or no answer in two minutes, deletes the object. A kept one is told as `file.uploaded` ([Event Hooks](https://palbase.studio/docs/backend/hooks)).

What the client can be answered besides the route's own:

| Status | Why |
|---|---|
| `400` | Not an upload: not multipart, no `file` part, a `body` that is not JSON or is over 1 MiB, a route or machine name that is none; or a file name that makes the path longer than storage keeps. |
| `401` | The route needs a signed-in user, and no one is. |
| `404` | No such machine, no upload route at that path, or the bucket the route names is none. |
| `412 object_exists` | An object is already at the path the template made. |
| `413` | Larger than the bucket takes. |
| `415` | A type the bucket does not take. |
| `429` | The route's `rateLimit` for this caller (`Retry-After`), the project's storage used up under its quota, or its machine calls all under way. |
| `502` | The app did not answer, or its authorize named no bucket and path an object can have. |
| `503` | The machine is waking or building. Sending again is safe. |

## Why the backend asks first

There is no client-side object API: the publishable key opens nothing in storage, so a client cannot write a file anywhere your code did not name. Putting the decision in your backend gives it the whole say:

- **The path is yours.** A user cannot overwrite another's file, because they never choose the path.
- **The size and type are yours,** per upload, below the bucket's.
- **The owner is yours.** `owner_id` ties the object to the user it is for, and deleting the user deletes it.
- **The rate is yours.** The grant is a route of your own: `rateLimit` on it holds how often a user may upload.

## Uploading from your backend

When the bytes are already on your server — a generated report, a file fetched from elsewhere — write them with `putObject` and skip the URL: see [Storage](https://palbase.studio/docs/backend/storage).

## Related

- [Storage](https://palbase.studio/docs/backend/storage) — buckets, objects, renditions and signed download URLs
- [Web Uploads](https://palbase.studio/docs/web/uploads) — the browser's side, for a signed URL and for an upload route
- [Event Hooks](https://palbase.studio/docs/backend/hooks) — acting on `file.uploaded`
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers) — the grant's route and its `rateLimit`
