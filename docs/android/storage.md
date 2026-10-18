> The full documentation index: https://palbase.studio/llms.txt

# Storage

`pb.storage` (`studio.palbase:palbase-storage`) carries files between the app and the project's storage. The app writes and reads a file through a URL the project's backend signed, which says which object, for how long, how large and whose: the backend decides, and the app carries the bytes. A public bucket's objects are anyone's to read.

## Uploading

The backend signs an upload URL for one object (`Palbase.storage.createUploadUrl`, [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads)) and answers it from a route of its own. The app sends the bytes to it:

```kotlin
import studio.palbase.storage.storage

// grantUrl: what your backend's route answered, an upload URL it signed.
val stored = pb.storage.upload(bytes, signedUrl = grantUrl, contentType = "image/jpeg")
println("${stored.bucket}/${stored.path}: ${stored.size} bytes, ${stored.contentType}")
```

`upload(data, signedUrl, contentType)` returns the object as storage stored it (`StorageAPI.StorageObject`: `bucket`, `path`, `size`, `contentType`, `checksumSha256`, `width` and `height` for an image, `ownerId`). The content type is used only when the bytes cannot say what they are, since storage reads the type from the bytes. Storage checks the grant while the bytes stream: a file past the URL's `max_bytes`, of a type the bucket does not take, or sent after the URL expired is refused with a `PalbaseError`.

The URL's conditions (the bucket, the path, the expiry, the ceiling, the types, the owner) are all covered by its signature, so a URL changed on the device opens nothing.

## Downloading

A private object is read with a download URL the backend signed (`Palbase.storage.createSignedUrl`, [Storage](https://palbase.studio/docs/backend/storage)):

```kotlin
val bytes: ByteArray = pb.storage.download(signedUrl)
val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
```

## Public buckets

A public bucket's objects need no URL of the backend's:

```kotlin
val logo: ByteArray = pb.storage.publicObject("public-assets", "logo.png")

// The address itself, for an image loader or a share sheet:
val address: java.net.URI = pb.storage.publicUrl("public-assets", "logo.png")
```

`publicUrl` is `https://<ref>.palbase.studio/storage/public/{bucket}/{path}`, with each part encoded as one path segment.

## Signed URLs stay at the project's address

A signed URL is taken only at the project's own address, the configuration's `url`. A URL that names another host is refused before anything is sent (`foreign_signed_url`), so a URL from somewhere else never takes the user's request away from the project. A URL that is not a signed object URL is `invalid_signed_url`.

## Through your backend's upload routes

A backend route declared with `@Upload` takes the file in the same call as its body, and its generated function reports progress ([Calling Your Backend](https://palbase.studio/docs/android/backend-calls#uploads)). Use one when the backend's code must run with the file. Use a signed URL when the backend only grants the write.

## Related

- [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads): signing an upload URL
- [Storage in your backend](https://palbase.studio/docs/backend/storage): buckets, objects, public reads and signed URLs
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the route that answers the URL
