> The full documentation index: https://palbase.studio/llms.txt

# Calling Your Backend

Your own backend runs on a machine, and an iOS app calls it through a typed client that `palbase apps:sync` generates from the backend's contract: every route is a Swift method with its own request, response and error types, and every call carries the signed-in user's session. The client is compiled into the app with the environment's configuration (`palbase/<app>.palbase`, see [Overview](https://palbase.studio/docs/ios/overview#connect-the-app-to-the-project)), and it compiles against the `Palbe` product: link `Palbe` in each target that compiles the file.

## Quick example

The backend, a `palbase/backend` app on the machine named `backend`:

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Get, Param, Post, User, z, type UserT } from "palbase/backend";

const CreateNote = z.object({ title: z.string().min(1).max(200) });
type CreateNote = z.infer<typeof CreateNote>;

interface Note {
  id: string;
  owner: string;
  title: string;
}

@Controller("/notes")
export class NotesController {
  private readonly notes: Note[] = [];

  @Post("")
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Note {
    const note = { id: crypto.randomUUID(), owner: user.id, title: body.title };
    this.notes.push(note);
    return note;
  }

  @Get("/{id}")
  read(@Param("id") id: string, @User() user: UserT): Note | null {
    return this.notes.find((n) => n.id === id && n.owner === user.id) ?? null;
  }
}
```

The app, after `palbase apps:sync`:

```swift
import Palbase
import Palbe

func addNote(title: String) async {
    do {
        let note = try await pb.backend.notes.create(.init(title: title))
        print("saved", note.id)
    } catch .other(let failure) {
        print("refused:", failure.code, failure.errorDescription ?? "")
    } catch {
        print(error)
    }
}
```

`pb.backend` is the machine named `backend`; `notes.create` is `NotesController`'s `create`. The request is `NotesCreateRequest`, the answer `NotesCreateResponse`, and the call throws `NotesCreateError`, typed.

## The generated client

`palbase apps:sync` reads each backend's contract, the OpenAPI document its machine serves, and writes the client into `palbase/<app>.palbase` for every environment the app is set in. Run it again when the backend's routes change: a route the backend no longer has, or a field it no longer takes, is then a compile error in the app.

| What the backend has | What the app calls |
|---|---|
| The machine `backend` | `pb.backend`. A machine's name is camelCased (`shop-api` is `pb.shopApi`), unless `palbase apps:sync --as shop-api=shop` names it, the same in every environment. |
| `NotesController` | `pb.backend.notes`: the class's name without `Controller`, its first letter lowercased. |
| Its method `create` | `pb.backend.notes.create(…)` |
| A path parameter `{id}` | An argument: `read(id: "n_1")` |
| A `@Body` | The request type, first and unlabelled: `create(.init(title: "Milk"))` |
| `@QueryParams` | A `query:` argument of its own type |
| The method's return | The response type, decoded. A route that answers `204` returns nothing. |

The types are named by the route's operation: `NotesCreateRequest`, `NotesCreateResponse`, `NotesCreateError`, `NotesReadResponse`. Everything is `Codable` and `Sendable`. The names the client gives backends never collide with the client's own (`auth`, `flags`, `storage`, …): `apps:sync` refuses one that would.

A backend the environment does not name is not a build error: each of its calls throws `.transport`, saying which backends the environment has.

## What a call carries

| | |
|---|---|
| The user | The signed-in user's access token, when there is one; nothing when no one is signed in, and the route says whether it needs one ([Authentication](https://palbase.studio/docs/backend/authentication)). A session bound to the device's key is sent with its proof. The publishable key is not sent: a machine asks for none. |
| A dead token | Refreshed once and the call sent again, only for the user whose session sent it. |
| "Not now" | A read (`GET`, `QUERY`) answered `429`, `502`, `503` or `504`, or never answered, is sent again after the server's `Retry-After`. A write is sent again only when the backend keeps its idempotency key (its contract declares the header); otherwise a write that reached the backend before its answer was lost could be done twice. |
| Languages | `Accept-Language`: the device's, or what `pb.setPreferredLanguages(_:)` named. A backend's `t()` reads it ([Translations](https://palbase.studio/docs/backend/translations)). |
| Redirects | Never followed: the user's token stays with the backend's own address. |

A path parameter is sent as exactly one path segment, percent-encoded. A value that would not stay one however a server reads it (empty, `.` or `..`, or one that hides them between slashes, `a/../b`) is refused before anything is sent, as `.encode`.

## Errors

A generated method throws its own error type, so a `do`/`catch` switches on named outcomes:

```swift
import Palbase
import Palbe

func read(_ id: String) async -> String {
    do {
        let note = try await pb.backend.notes.read(id: id)
        return note.title
    } catch .other(let failure) {
        switch failure {
        case .unauthorized: return "Sign in again"
        case .validation(let v): return v.fields.map { "\($0.field): \($0.message)" }.joined(separator: "\n")
        case .rateLimited(let r): return "Try again in \(r.retryAfter ?? 1) s"
        case .network: return "You are offline"
        case .server(let s): return "\(s.code) (\(s.requestId ?? "no request id"))"
        default: return failure.errorDescription ?? "Something went wrong"
        }
    } catch {
        return "\(error)"
    }
}
```

A code the route's contract declares is a case of its own (`NotesCreateError.forbidden` for a route that declares `403 forbidden`); every other failure is `.other(BackendError)`. `BackendError` is the backend's error envelope, classified:

| Case | When |
|---|---|
| `.server(ServerFailure)` | The backend refused: `code`, `status`, `message`, `requestId`, `details` and `data`, the error's payload (`decodeData(_:)` reads it as a type of yours). |
| `.validation(ValidationFailure)` | `400`, the input failed the route's schema: `fields`, each a `field` and its `message`. |
| `.rateLimited(RateLimitInfo)` | `429`, the route's limit: `retryAfter` in seconds. |
| `.unauthorized(AuthFailure)` | `401`, after the client already refreshed the token once. |
| `.network(TransportFailure)` | No answer: no network, the connection lost, a timeout. |
| `.transport(TransportFailure)` | Not sent: a backend the environment does not name. |
| `.decode(CodecFailure)`, `.encode(CodecFailure)` | The answer is not the type the contract declares; the input could not be encoded, or a path parameter is not one segment. |

`code`, `statusCode`, `requestId` and `failure` (the envelope, whichever case it is) are on every `BackendError`. The `requestId` is the line to look for in the machine's logs ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)).

## Files

A route your backend declares as an upload (palbase/backend's `Upload`, with a bucket and a path template) is a generated method that takes the file: `file: PBFileSource`, the route's input, and an `onProgress` closure. The bytes go straight to storage at a URL the backend signs, never through the backend, and the method returns what the route's handler answered once the file is stored.

```swift
import Foundation
import Palbase
import Palbe

func setAvatar(_ png: Data) async throws {
    // posts.photo: an upload route of PostsController, with a path parameter.
    _ = try await pb.backend.posts.photo(postId: "p_1", file: .data(png, contentType: "image/png")) { progress in
        switch progress.phase {
        case .authorizing: print("starting")
        case .uploading: print("\(Int(progress.fraction * 100))%")
        case .processing: print("the backend is handling it")
        }
    }
}
```

`PBFileSource.url(_:filename:contentType:)` streams a file from disk; `.data(_:filename:contentType:)` sends bytes in memory, its type read from the bytes when none is given (a photo from `PhotosPicker` is HEIC, PNG or JPEG). The type matters: storage holds every upload to its bucket's types and size. `BackendUploadProgress` says the `phase` (`authorizing`, `uploading`, `processing`), `sentBytes`, `totalBytes` and `fraction`. The upload route's own name and arguments are your backend's; the example's are an illustration.

To store a file the app has without a route of its own for it, see [Storage](https://palbase.studio/docs/ios/storage).

## Gateways

A backend's gateways, its realtime channels, are in the same client: `pb.backend.join(RoomGateway(roomId: "42"))`. See [Gateways](https://palbase.studio/docs/ios/gateways).

## Calls the contract does not type

`call(_:_:as:method:headers:)` calls a route by its path with an `Encodable` input and a `Decodable` answer, and `call(_:as:method:headers:)` one with no input; the method is `POST` unless `method:` says otherwise. It throws `BackendError`.

```swift
import Palbase
import Palbe

struct Ping: Decodable, Sendable { let ok: Bool }

func ping() async throws -> Bool {
    let pong: Ping = try await pb.backend.call("health/ping", method: .get)
    return pong.ok
}
```

## A backend on your computer

`palbase apps:sync --backend ../server` generates the client from a backend checkout on this computer, before any machine serves its routes: its `palbase/backend` app writes its contract and exits, and nothing is connected to. `pb.palbe(url:)` is a client of a backend at an address of its own, such as `http://localhost:8080` in the simulator, for its untyped calls and its gateways; the address must be `https`, or `http` on `localhost`.

## Related

- [Overview](https://palbase.studio/docs/ios/overview): setting up the app, `apps:sync` and the build
- [Gateways](https://palbase.studio/docs/ios/gateways): a backend's realtime channels, and chats
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers): the routes the client is made from
- [Responses & Errors](https://palbase.studio/docs/backend/errors): the error envelope a refusal is read from
- [`apps:sync`](https://palbase.studio/docs/cli/reference#palbase-appssync): its flags
