> The full documentation index: https://palbase.studio/llms.txt

# Calling Your Backend

Your own backend runs on a machine at an address of its own. An Android app calls it through a client generated from the backend's contract: `palbase apps:sync` writes it into the app as `palbase/environments/<env>/palbe/<machine>.kt`, and the build compiles the variant's environment in ([The environment in the build](https://palbase.studio/docs/android/overview#the-environment-in-the-build)). Each route is a typed `suspend` function, each error the route can throw is a typed case, and every call carries the signed-in user's token.

The client needs `studio.palbase:palbase-palbe` and the kotlinx.serialization Gradle plugin, because its types are `@Serializable` classes:

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.serialization")
}

dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.4.0"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-palbe")
}
```

## Quick example

The backend, a `palbase/backend` app on the machine named `backend`:

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Get, NotFound, Param, Post, User, z, type UserT } from "palbase/backend";

const CreateNote = z.object({ title: z.string().min(1).max(200) });
type CreateNote = z.infer<typeof CreateNote>;

interface Note {
  id: string;
  owner: string;
  title: string;
}

@Controller("/notes")
export class NotesController {
  private readonly notes = new Map<string, Note>();

  @Post("")
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Note {
    const note = { id: crypto.randomUUID(), owner: user.id, title: body.title };
    this.notes.set(note.id, note);
    return note;
  }

  @Get("/{id}")
  read(@Param("id") id: string, @User() user: UserT): Note {
    const note = this.notes.get(id);
    if (!note || note.owner !== user.id) throw new NotFound("no such note");
    return note;
  }
}
```

The app, after `palbase apps:sync`:

```kotlin
import studio.palbase.generated.*   // the backends' clients and their types

val note = pb.backend.notes.create(NotesCreateRequest(title = "Groceries"))

val again = try {
    pb.backend.notes.read(note.id)
} catch (e: NotesReadError) {
    when (e) {
        NotesReadError.NotFound -> null                 // the route's own error, typed
        is NotesReadError.Other -> throw e.backend      // anything else: a BackendError
    }
}
```

## The generated client

`apps:sync` writes one Kotlin file for each backend of each environment the app is set in, in the package `studio.palbase.generated`:

- **The backend** is a property of the client: `pb.<name>`. The name is the machine's, camelCased (`pb.shopApi` for the machine `shop-api`), unless `palbase apps:sync --as shop-api=shop` names it. It is the same in every environment.
- **A namespace per controller, a function per route.** `NotesController`'s `create` is `pb.backend.notes.create(…)`, as the backend's contract names it.
- **Its types** are named after the route: `NotesCreateRequest` (the body), `NotesCreateQuery` (the query string), `NotesCreateResponse` (the answer) and `NotesCreateError`. A path parameter is a `String` argument.
- **Its gateways** are classes the app joins: [Gateways](https://palbase.studio/docs/android/gateways).

A backend the environment does not name is not a build error: each of its calls fails with `BackendError.NotConfigured`, in the route's `Other`. Run `palbase apps:sync` again when the backend's routes change. `palbase apps:sync --backend <dir>` makes the client from a backend's checkout on this computer, to call an endpoint before any machine serves it ([`apps:sync`](https://palbase.studio/docs/cli/reference#palbase-appssync)).

## What a call carries

A call goes to the address the environment names for the machine, with:

- the signed-in user's access token, when someone is signed in. When the session is bound to the device ([Auth](https://palbase.studio/docs/android/auth#how-the-session-is-kept)), the request also carries a proof signed by the device's key. When no one is signed in, the call goes without a token, and the route decides whether it needs one;
- no API key: a machine asks for none;
- `Accept-Language`, the user's languages, which the backend's translations read;
- an `Idempotency-Key` on every write;
- a field the route marks `encrypted()` sealed, and one it answers through `encrypt()` opened when the answer arrives: the client `palbase apps:sync` wrote holds the project's id and signing key for it ([Encrypted Requests](https://palbase.studio/docs/backend/request-encryption)). A call sent again is the same sealed request.

A call refused with a `401` about the token is refreshed once and sent again, for the same user. A read is sent again when the answer says "not now" (`429`, `502`, `503`, `504`) or the request never got an answer, as the project's calls are ([Errors and retries](https://palbase.studio/docs/android/overview#errors-and-retries)). A write is sent again only when the backend's contract says the route keeps its idempotency key, and always with the same key. Any other write is sent once, because one that reached the backend before its answer was lost would be done twice. No redirect is followed.

## Errors

Each generated function throws its route's own error type: a sealed class with a case for every error the backend's contract says the route can throw, and `Other` for the rest.

```kotlin
// palbase/environments/staging/palbe/backend.kt, as apps:sync wrote it (shortened)
sealed class NotesReadError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    data object NotFound : NotesReadError("not_found")   // 404 not_found: the route throws NotFound
    data class Other(val backend: BackendError) : NotesReadError("Backend error", backend)
}
```

The contract's errors are what the route throws, as the backend's build reads them from its code: the framework's error classes and your own. A case is matched on the answer's status and code.

`Other` carries a `BackendError` (package `studio.palbase.backend`):

| Case | What it is |
|---|---|
| `Http(status, code, description, requestId, details, data)` | An answer that is not 2xx, as the backend sent it in its error envelope. `decodeData(serializer)` reads `data` as a type of yours. |
| `Validation(fields, …)` | A `400` that names fields: each `FieldError(field, message)`. |
| `Unauthorized(…)` | A `401` after the refresh did not mend it. |
| `RateLimited(retryAfter, …)` | A `429`, with the seconds to wait. |
| `IntegrityRequired(code, …)` | A `401 app_attest_required` the device's proof could not settle: the SDK enrolled, proved and sent the call again, and the backend still refused ([Device attestation](#device-attestation)). |
| `AttestationUnavailable(reason, …)` | The route asks for the device's proof and this device cannot give one: an emulator or a key that is not in secure hardware (`hardware_key_unavailable`, `software_key`), an unlocked bootloader (`device_not_locked`), the keystore not answering now (`keystore_unavailable`, asked again later). Nothing more is sent. |
| `StepUpRequired(acrValues, maxAge, …)` | A `401 insufficient_user_authentication`: the route asks for a stronger sign-in (`acrValues`, e.g. `urn:nist:800-63:aal2`). The session is fine and is not refreshed: step the user up with their second factor — `pb.auth.mfa.stepUp(code)` with an authenticator code, `pb.auth.mfa.stepUpWithSms(code)` after `sendStepUpSmsCode()`, or `pb.auth.passkeys.stepUp(context)` with a passkey — then call again (`maxAge` counts from the step-up); the session holds the aal2 token from then on, refreshes included. |
| `Network(ioCause)` | No answer: no network, the host unreachable. |
| `Decoding(decodeCause)` | A 2xx whose body is not what the contract declares. |
| `Encoding(encodeCause)` | The request could not be written; it was not sent. |
| `NotConfigured` | The environment names no such backend: run `palbase apps:sync`. |

`Http`, `Validation`, `Unauthorized` and `RateLimited` have the answer behind them in `envelope`: the status, the code, the message and the request id, whatever they were classified as. A generated error matches its cases against it, so a route that declares a `401` or a `429` of its own still gets its typed case.

## Device attestation

A route the backend marks `attest: true` is called only by your app on a genuine phone ([Device attestation](https://palbase.studio/docs/backend/authentication#device-attestation)). The SDK proves each call by itself:

- once per install, it makes a key in the phone's secure hardware and enrols it: auth checks the key's attestation chain against Google's roots and revocation list, that the phone is locked with a verified boot, and that the app is your registered package signed with one of its registered certificates;
- each call to the backend then carries a signature with that key over the call's method, path, body and a short-lived challenge, and a counter, so a captured call cannot be sent again or changed;
- a `401 app_attest_required` is answered by itself: enrol if needed, prove, send once more.

What only you set: the SHA-256 of the certificates your releases are signed with, registered with the app (`palbase apps:env:set <app> --sha256 play_signing=AB:CD:…`; Play's app signing key and your upload key). Do not register a debug key where attestation is enforced: a debug build can be driven over adb to sign requests. An emulator cannot attest: under enforce its calls end in `AttestationUnavailable`.

## Uploads

A route the backend declares with `@Upload` takes the file in the app's call: the call goes to the project's storage, which writes the file where the route's template says and then runs the route's handler with it ([Upload routes](https://palbase.studio/docs/backend/direct-uploads#upload-routes)). Its generated function takes the bytes, a file name, an optional content type and a progress callback:

```kotlin
// ProfileController's @Upload("/avatar", …) avatar route, with no body of its own:
val avatar = pb.backend.profile.avatar(
    file = bytes,
    filename = "me.jpg",
    contentType = "image/jpeg",
    onProgress = { p -> progress = p.fraction },   // UploadProgress: phase, bytesSent, totalBytes
)
```

A route with path parameters, a body or a query string takes them first, in that order, as any generated call does, and then the file.

`UploadProgress.phase` is `UPLOADING` while the bytes go, then `PROCESSING` while the backend's handler runs, with `fraction` at 1. A content type left out is read from the bytes, then from the file name's extension. What the handler answers is the call's answer (`ProfileAvatarResponse` here), and a refusal it throws deletes the file. A file a backend signed an upload URL for goes through [Storage](https://palbase.studio/docs/android/storage) instead.

## Untyped calls

A route the generated client does not have yet can be called by its path, with types of yours: a `POST`, its body as JSON.

```kotlin
import studio.palbase.backend.call
import kotlinx.serialization.Serializable

@Serializable data class Todo(val id: String, val title: String)
@Serializable data class NewTodo(val title: String)

val todo = pb.backend.call<NewTodo, Todo>("todos/create", NewTodo("Milk"))   // POST /todos/create
```

A path built from a value is held to plain path segments, and anything else is refused before it is sent.

## A backend on your computer

`pb.palbe(URI("http://10.0.2.2:8080"))` (`import studio.palbase.backend.palbe`) is a client of a backend at an address of its own: in a debug build, one running on the computer the emulator runs on. It carries the user's token as the environment's backends do. The generated namespaces hang on the backend's own type, `PB<Name>Backend`, which the app's module can make around it:

```kotlin
val local = PBBackendBackend(pb.palbe(URI("http://10.0.2.2:8080")))
val note = local.notes.create(NotesCreateRequest(title = "Groceries"))
```

## Related

- [Gateways](https://palbase.studio/docs/android/gateways): a backend's realtime gateways, and the chats piped into them
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers): the routes a client is generated from
- [Responses & Errors](https://palbase.studio/docs/backend/errors): the error envelope and the error classes
- [Authentication](https://palbase.studio/docs/backend/authentication): how a machine checks the token
