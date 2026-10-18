> The full documentation index: https://palbase.studio/llms.txt

# Storage

`pb.storage` (the `PalbaseStorage` product) carries a file's bytes to and from the project's storage. What it may write or read is your backend's to decide: an app holds no key that opens storage, so it writes an object only at an **upload URL** your backend signed, reads a private one only at a **download URL** your backend signed, and reads a **public** bucket's objects as anyone may. The backend chooses the bucket, the path, how large, of which types and whose; the app carries the bytes, straight to storage and never through your backend.

## Quick example

The backend signs an upload for the signed-in user ([Direct Uploads](https://palbase.studio/docs/backend/direct-uploads)):

```ts
// src/modules/avatars/avatars.controller.ts
import { Body, Controller, Palbase, Post, User, z, type UserT } from "palbase/backend";

const UploadRequest = z.object({ contentType: z.string().max(100) });
type UploadRequest = z.infer<typeof UploadRequest>;

@Controller("/avatars")
export class AvatarsController {
  // The user asks; the backend decides the path, the ceiling and the owner.
  @Post("/upload-url", { rateLimit: { max: 10, window: 60 } })
  async uploadUrl(@Body(UploadRequest) body: UploadRequest, @User() user: UserT): Promise<{ url: string; path: string }> {
    const ext = body.contentType === "image/png" ? "png" : "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const signed = await Palbase.storage.createUploadUrl({
      path: { bucket: "avatars" },
      body: { path, expires_in: 300, max_bytes: 2 * 1024 * 1024, owner_id: user.id },
    });
    return { url: signed.data.url, path };
  }
}
```

The app asks for the URL through its [generated client](https://palbase.studio/docs/ios/backend-calls), then sends the bytes to it:

```swift
import Foundation
import Palbase
import Palbe
import PalbaseStorage

func uploadAvatar(_ png: Data) async throws {
    let grant = try await pb.backend.avatars.uploadUrl(.init(contentType: "image/png"))
    guard let url = URL(string: grant.url) else { return }
    let stored = try await pb.storage.upload(png, to: url, contentType: "image/png")
    print(stored.path, stored.size, stored.width ?? 0, stored.thumbhash ?? "")
}
```

## The calls

| Method | What it does |
|---|---|
| `upload(_:to:contentType:)` | Writes the bytes at an upload URL your backend signed, and returns the stored object (`StorageAPI.StorageObject`). |
| `download(from:)` | Reads an object at a download URL your backend signed (`Palbase.storage.createSignedUrl`). |
| `publicObject(bucket:path:)` | Reads an object of a public bucket. |
| `publicURL(bucket:path:)` | A public object's address, for an `AsyncImage`, a share sheet, or a cache of the app's own. |

A signed URL is taken only at the project's own address: one that names another host is refused before anything is sent (`foreign_signed_url`), and one that is not a signed object URL is `invalid_signed_url`.

## What an upload answers

The stored object: `bucket`, `path`, `size`, `contentType` (sniffed from the bytes, not taken from what the app said), `checksumSha256`, `ownerId`, a picture's `width`, `height` and `thumbhash` placeholder, its `variants` (the renditions the bucket declares, made inside the upload) and `createdAt`, `updatedAt`.

`contentType` is used only when the bytes cannot say what they are (HEIC, which a stock iPhone camera makes). Storage holds the upload to the URL's grant and the bucket's rules while the bytes stream in, and a refusal is a `PalbaseError`:

| Status | Why |
|---|---|
| `403` | The signature is wrong, expired, another project's, or a download signature. |
| `413 payload_too_large` | Larger than the URL's ceiling or the bucket's. |
| `415 unsupported_media_type` | A type the bucket, or the URL, does not take. |
| `422 unreadable_picture` | A picture the bucket's renditions cannot be made from. |
| `429 quota_exceeded` | The project's storage for the period is used up, with `Retry-After`. |

Your backend learns of the upload from the `file.uploaded` event ([Event Hooks](https://palbase.studio/docs/backend/hooks)), or from a route the app calls once the upload is answered.

## A route that takes the file

A route your backend declares as an upload takes the file in one generated call, with the upload URL made and used inside it and the progress told by phase: see [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls#files).

## Related

- [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads): what an upload URL grants, and why the backend asks first
- [Storage in your backend](https://palbase.studio/docs/backend/storage): buckets, objects, public reads, signed download URLs, renditions
- [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls): the generated client the grant comes through
