> The full documentation index: https://palbase.studio/llms.txt

# iOS SDK

Palbase's iOS SDK is Swift. Its core product, `Palbase`, holds the project's address and publishable key, the transport every call goes through, the signed-in user's session, the realtime socket and the person's consent, with auth in it. Every other module is a product of its own that the app links or leaves out: an app that sends no push carries none of push's code.

The SDK is distributed compiled, as binary XCFrameworks, from [github.com/palgroup/palbase-swift](https://github.com/palgroup/palbase-swift). It runs on **iOS 18** and **macOS 15** or newer and builds with **Xcode 16** or newer, and its API is Swift 6 concurrency throughout: `async` calls, `Sendable` types, and observable state for SwiftUI.

## Quick example

```swift
import Palbase
import SwiftUI

/// The app's one client: the environment its build configuration names.
nonisolated let pb = PalbaseClient(.environment)

struct RootView: View {
    var body: some View {
        // Drawn again on every sign-in and sign-out.
        if let user = pb.auth.state.user {
            Text("Signed in as \(user.email ?? user.id)")
        } else {
            Button("Sign in") {
                Task { _ = try? await pb.auth.signIn(email: "ada@example.com", password: "correct-horse-battery-staple") }
            }
        }
    }
}
```

`.environment` is not typed by you: `palbase apps:sync` writes it, and the build compiles in the one its configuration names (below).

## Install

In Xcode, **File › Add Package Dependencies…**, enter `https://github.com/palgroup/palbase-swift`, and add the products the app uses to its target. In a `Package.swift`:

```swift
.package(url: "https://github.com/palgroup/palbase-swift", from: "0.21.0")
```

| Product | What it is |
|---|---|
| `Palbase` | The core: configuration, transport, session, [auth](https://palbase.studio/docs/ios/auth), the realtime socket, [consent](https://palbase.studio/docs/ios/consent). Every app links it. |
| `PalbaseFlags` | [Feature flags](https://palbase.studio/docs/ios/flags), kept live. |
| `PalbaseAnalytics` | [Events, screens, the person's properties](https://palbase.studio/docs/ios/analytics), timings and reports, as the person allowed. |
| `PalbaseRealtime` | [Channels](https://palbase.studio/docs/ios/realtime): broadcasts and a state the members share. |
| `PalbaseNotify` | [Push](https://palbase.studio/docs/ios/notifications): this install's token, preferences, topics, the inbox, in-app messages. |
| `PalbaseNotificationService` | The app's notification service extension: each push reported delivered, its picture shown. |
| `PalbaseStorage` | [Files](https://palbase.studio/docs/ios/storage): uploads and downloads at URLs your backend signs. |
| `PalbasePurchases` | [Buying in the App Store](https://palbase.studio/docs/ios/purchases), and what the signed-in customer has bought in any store. |
| `PalbaseUI` | The renderer of the screens a project designs (paywalls, in-app messages, inbox cards), in SwiftUI. The two products below bring it. |
| `PalbasePurchasesUI` | The paywall the project publishes, drawn natively. |
| `PalbaseNotifyUI` | In-app messages shown over the app, and the person's inbox, drawn natively. |
| `PalbaseDebug` | The [in-app debug console](https://palbase.studio/docs/ios/debug-console)'s screens. |
| `Palbe` | What the [backend clients](https://palbase.studio/docs/ios/backend-calls) `palbase apps:sync` generates compile against. Link it when the project has a backend. |

A chat's live voice is a package of its own, [palbase-swift-voice](https://github.com/palgroup/palbase-swift-voice), because it brings WebRTC: see [Voice](https://palbase.studio/docs/ios/voice). So are voice and video calls, [palbase-swift-calls](https://github.com/palgroup/palbase-swift-calls) (`PalbaseCalls`, and `PalbaseCallsBroadcast` for the broadcast extension that shares the whole screen): see [Calls](https://palbase.studio/docs/ios/calls).

## Connect the app to the project

The app never holds a URL or a key you type. The CLI writes each environment's settings into the app's repository, and the Xcode build compiles in the environment its configuration names. Debug can build against `staging` and Release against `main`, the project's first environment and its production one, from one source tree.

**1. Register the app**, once per project, with its Apple team, and give it its bundle in each environment it runs in:

```sh
palbase apps:create ios "Shop" --slug shop --team-id ABCDE12345
palbase apps:env:set shop --bundle com.example.shop -E staging
palbase apps:env:set shop --bundle com.example.shop -E main
```

The team is the 10 characters under **Apple Developer › Membership**. The app's widgets and extensions are not apps of their own: they share its sign-in. See [`apps:create`](https://palbase.studio/docs/cli/reference#palbase-appscreate) and [`apps:env:set`](https://palbase.studio/docs/cli/reference#palbase-appsenvset).

**2. Write its settings into the repository**, from the repository's root:

```sh
palbase apps:sync shop
```

It writes `palbase/` and nothing outside it:

| File | What it holds |
|---|---|
| `palbase/environments/<env>/shop.json` | The environment's client document: its address, the app's publishable key, the keychain group, auth's passkey domain, the backends' addresses. |
| `palbase/environments/<env>/contracts/<machine>.openapi.json` | Each backend's contract, as its machine serves it. |
| `palbase/shop.palbase` | Each environment's Swift: `PalbaseConfiguration.environment` and every backend's typed client (`pb.<name>`). |
| `palbase/project.json` | The checkout's project and its apps. |

Commit them. Run `palbase apps:sync` again when the project changes (a new environment, a backend's routes); `palbase apps:sync --check` exits 1 in CI when the committed files are not what the project gives now. `palbase apps:sdkconfig shop` prints the client document without writing anything. See [`apps:sync`](https://palbase.studio/docs/cli/reference#palbase-appssync).

**3. Set up the Xcode project.** Three steps, no plugin, and nothing reaches the network at build time:

1. Add `palbase/shop.palbase` to the **Compile Sources** of every target that uses Palbase: the app, and each widget or extension.
2. In each of those targets, **Build Rules › +**: *Source files with names matching* `*.palbase`, *Custom script* with the script below, and one output file, `$(DERIVED_FILE_DIR)/$(INPUT_FILE_BASE)-palbase.swift`. Leave *Run once per architecture* off. The script reads only its input, so it runs under Xcode's user script sandboxing.
3. Add a user-defined build setting, `PALBASE_ENVIRONMENT`, on every build configuration, its value the environment's slug: `staging` for Debug and `main` for Release, as the project names them.

```sh
[ -n "${PALBASE_ENVIRONMENT:-}" ] || { echo "error: Palbase: the build configuration $CONFIGURATION names no environment: set PALBASE_ENVIRONMENT"; exit 1; }
plutil -extract "environments.$PALBASE_ENVIRONMENT.swift" raw -o "$SCRIPT_OUTPUT_FILE_0" "$INPUT_FILE_PATH" || { echo "error: Palbase: no environment $PALBASE_ENVIRONMENT in $INPUT_FILE_NAME (run palbase apps:sync)"; exit 1; }
```

A configuration that names no environment, or one the app is not set in, stops the build with that message.

**4. Give the targets their capabilities**, from what the client document names:

| Capability | Value | Who needs it |
|---|---|---|
| **Keychain Sharing** | the document's `keychain_group` without its team prefix (`com.example.shop.palbase`; Xcode adds `$(AppIdentifierPrefix)`) | The app and every extension that uses Palbase: they share the session, the device's key, the install and the consent choices through it. |
| **Associated Domains** | each entry of `auth.associated_domains` (`webcredentials:<ref>.palbase.studio`, or the [sign-in domain](https://palbase.studio/docs/auth/providers#your-own-sign-in-domain) its passkeys are saved at) | An app that signs in with [passkeys](https://palbase.studio/docs/ios/auth#passkeys). |
| **Push Notifications** | — | An app that registers for [push](https://palbase.studio/docs/ios/notifications). |

## The client

```swift
import Palbase

nonisolated let pb = PalbaseClient(.environment)
```

Make one client for the app and keep it: every module hangs off it (`pb.auth`, `pb.flags`, `pb.notify`, …), made once on first use and sharing its transport and its socket. A module's property exists once its product is imported: `pb.flags` needs `import PalbaseFlags`. `PalbaseClient` is `Sendable`, and `nonisolated` keeps the global off the main actor in an app whose default isolation is the main actor (a new Xcode 26 project's): code that runs elsewhere — a notification delegate's `nonisolated` method, a background task — reaches it too.

| Member | What it is |
|---|---|
| `pb.auth` | Sign-in, the session and the user: [Auth](https://palbase.studio/docs/ios/auth). |
| `pb.consent` | What the person allowed, key by key: [Consent](https://palbase.studio/docs/ios/consent). |
| `pb.socket` | The project's one realtime socket, opened the first time a channel is joined. `pb.socket.status.state` is observable: `idle`, `connecting`, `connected`, `reconnecting`, `disconnected`. |
| `pb.installation` | This install of the app: `id`, which push, consent and analytics name it by. |
| `pb.debug` | The [debug console](https://palbase.studio/docs/ios/debug-console)'s recording. |
| `pb.configuration` | The configuration it was made with: `url`, `publishableKey`, `environmentInfo` (`ref`, `slug`, `name`, `production`), `backends`. |
| `pb.currentSession()` | The session now, or `nil`. |
| `pb.setPreferredLanguages(_:)` | The languages every request says (`Accept-Language`), when the app has a language setting of its own; `nil` for the device's. Auth's emails, flag and paywall rules and a backend's translations read them. |

`PalbaseClient(_:sessionStorage:retry:)` takes two more settings. `sessionStorage:` defaults to `.keychain` (the project's single default slot); `.keychain(account:)` keeps an account's session in its own keychain slot for multi-account apps ([below](#multiple-accounts-in-one-project)), and `.memory` keeps the session in this process alone. `retry:` is a `RetryPolicy` (below). An app that keeps its user's session itself makes the client with `PalbaseClient(_:sessionKeptBy:retry:)` instead ([below](#a-session-the-app-keeps-itself)).

### What the app adds to the configuration

The generated `.environment` holds what the project says. What is the app's own is added with `with(consent:analytics:appGroup:)`:

```swift
import Palbase

nonisolated let pb = PalbaseClient(try! .environment.with(
    consent: ConsentOptions(start: ["analytics": .granted, "performance": .granted], textVersion: "2026-10"),
    analytics: AnalyticsOptions(appBackground: false),
    appGroup: "group.com.example.shop"
))
```

- `consent`: what the app starts with until the person chooses, and the version of the text its consent screen shows ([Consent](https://palbase.studio/docs/ios/consent)).
- `analytics`: which of analytics' own events it makes ([Analytics](https://palbase.studio/docs/ios/analytics#the-apps-own-events)).
- `appGroup`: the app group the app shares with its notification service extension, where the extension leaves a report it could not send ([Notifications](https://palbase.studio/docs/ios/notifications#the-notification-service-extension)).

A configuration given in code, for a test or a tool, is `PalbaseConfiguration(url:publishableKey:keychainGroup:backends:passkeyRelyingParty:consent:analytics:appGroup:)`. The address must be `https` (plain `http` only for `localhost`) and the project's origin alone, and the key must be the publishable one (`pb_<ref>_c…`): a secret key is refused with a `ConfigurationError`, because it never goes in an app.

## The session

The session is kept in the keychain, readable after the device's first unlock and never moved to another device, in the group the app shares with its extensions: a widget or a notification service extension reads the same signed-in user. The access token is renewed ahead of its end while the app is in the foreground, and a call refused for a dead token is renewed once and sent again, only for the user whose session sent it.

A sign-in is sent with a proof made by a key that is created on the device and kept in its keychain. A session the project binds to that key (DPoP, RFC 9449) is sent with a fresh proof on every call that carries its token, to the project and to your backend alike, so a token copied off the device opens nothing on its own. Nothing in the app's code changes for it.

### Multiple accounts in one project

An app that keeps several accounts signed in at once in the same project uses `PalbaseAccounts` (or `PalbaseClient(_:sessionStorage: .keychain(account:))` directly). Each account gets its own keychain slot, its own `PalbaseClient` (and generated `pb.<name>` backend client), and isolated console logs, while sharing the device's DPoP key and installation across accounts and Mac Developer ID updates. `PalbaseAccounts` persists the account list and the last selected active account in the keychain, restoring them on the next launch:

```swift
import Palbase

let accounts = PalbaseAccounts(.environment)

// Each account has its own PalbaseClient, session, and generated backend client.
let work = accounts.client(for: "work")
_ = try await work.auth.signIn(email: "ada@work.example", password: "correct-horse-battery-staple")
try accounts.select("work")

// On the next launch, accounts.activeClient() restores "work" from the keychain.
if let active = accounts.activeClient() {
    _ = await active.currentSession()
}
```

An app migrating sessions it previously kept in its own store hands them over offline with `accounts.adoptSession(account:accessToken:refreshToken:expiresAt:select:)` (or `pb.auth.adoptSession(accessToken:refreshToken:expiresAt:)`). Adoption reads `sub` and `exp` from the access token without a network call, never overwrites credentials the SDK has already rotated, and throws `keychain_unavailable` if the keychain is locked so the app keeps its legacy copy until persistence succeeds. To move a single-account default `"session"` item into an account slot, call `accounts.adoptDefaultKeychainSession(account:select:)`: it deletes the legacy item only after the new account slot is written.

## A Mac app

The same package runs in a Mac app, on macOS 15 or newer: every product above has a Mac slice, and the client is made and used as on iOS. Only [Voice](https://palbase.studio/docs/ios/voice) and [Calls](https://palbase.studio/docs/ios/calls) are the iPhone's alone.

A Mac app is an app of the project of its own, registered as one, and set up in Xcode as above:

```sh
palbase apps:create macos "Shop for Mac" --slug shop-mac --team-id ABCDE12345
palbase apps:env:set shop-mac --bundle com.example.shop.mac -E main
palbase apps:sync shop-mac
```

Four things are the Mac's own:

- **The keychain.** A Mac has two. An app signed with an App ID (one a provisioning profile gives) keeps the SDK's items in the data protection keychain, the one iOS has: in the configuration's `keychain_group` when it has the **Keychain Sharing** capability, which its extensions need to share the session, and in its App ID's own group otherwise. An app signed without an App ID (Developer ID with no profile) has only the person's login keychain, whose names are every app's: the SDK keeps its items there under a service of the app's own, `io.palbase.sdk (<bundle id>)`, so no two apps read or overwrite each other's. An item there is its signature's as well: macOS lets the signature that made it read it, and asks the person for their keychain's password when any other does. So the release, signed with a Developer ID, keeps that name from version to version, and a build signed otherwise (one from Xcode, which carries the release's bundle id) keeps its own, `io.palbase.sdk (<bundle id>, development)`: both run on one Mac and neither asks.
- **Renewal.** A Mac app is in the foreground while it runs: the access token is renewed ahead of its end while the Mac is awake, and after it wakes, a token that lapsed in its sleep is renewed before the next call goes.
- **Consent.** A choice that could not be sent is sent again when the Mac wakes, as it is when an iPhone's app returns to the foreground.
- **Its platform.** A Mac app is `macos` wherever Palbase asks the app's platform (`PalbaseClient.platform`): a placement's and a flag's platform rules, a paywall's and a message's `visible.platform`, a web checkout's source — so the [charts](https://palbase.studio/docs/purchases/charts) count its web purchases on the Mac. It buys through the App Store as an iPhone app does, on the `ios` channel.

### A session the app keeps itself

Some apps already keep their user's session themselves: signed in by code of their own and shared with processes of their own under their own lock, a command-line helper or a core in another language. Such an app makes the client with `PalbaseClient(_:sessionKeptBy:)`, and the client reads the session from it instead of keeping one.

Auth rotates refresh tokens, each good once, so a session has one keeper. The client asks the keeper for the session before its calls and asks it to renew one about to lapse, naming the refresh token it holds. It never renews a session with auth itself, never writes or deletes one, keeps nothing of it, and lets go of the session it kept itself before the app kept one:

<!-- given: nonisolated func coreSession() throws -> PalbaseKeptSession?, func coreRenew(_ spent: String) async throws -> PalbaseKeptSession -->

```swift
import Palbase

/// The session the app's core keeps, and renews under its own lock.
struct CoreSession: PalbaseSessionKeeper {
    func current() throws -> PalbaseKeptSession? { try coreSession() }

    // The session whose refresh token is `spent`, renewed now, or the newer one another process renewed first.
    // When auth refused it and the app let it go, throw PalbaseSessionEnded(reason:).
    func renew(spent refreshToken: String) async throws -> PalbaseKeptSession { try await coreRenew(refreshToken) }
}

let client = PalbaseClient(.environment, sessionKeptBy: CoreSession())
```

`current()` is asked on the main thread and before calls, at most once a second: it answers from what the app keeps, at once, never waiting on the network or on the lock the app holds while it renews. `renew(spent:)` is asked about a minute before the session lapses, by the client's clock: the keeper renews when asked, whatever margin it keeps itself. It answers the session whose refresh token it was given, renewed, or the newer one when another of its processes renewed it first: auth takes each refresh token once. A session it hands back unrenewed is asked about again a while later, and nothing is told meanwhile; a renewal that answers another user's session is none. It throws `PalbaseSessionEnded` when auth refused the session and the app let it go; the client ends it as `sessionExpired`, for the reason it names, and does not take that session up again while the keeper still holds it. Anything else it throws (offline, an outage) leaves the session as it is, to be renewed later. The session is a bearer one, not bound to the client's device key.

The client follows what the keeper holds: someone else signed in, or no one, is a `signedIn` or `signedOut` it tells the app, as a sign-in in another process is on iOS. When the app signs someone in or out itself, it tells the client, which follows at once:

<!-- given: client: PalbaseClient -->
```swift
await client.auth.sessionChanged()
```

Auth's flows that start, renew, replace or end a session are the app's: every sign-in (a password, a magic link or a phone code, a passkey, Apple or Google), `setSession` and `deleteAccount` — and `auth.api`'s own calls that do the same — are refused with `session_kept_by_app` before anything is sent to auth. `signOut()` sends nothing and reads the app's session again. Revoking a session (`auth.sessions`) is a request like any other: the session it ends is the app's at its next renewal.

## Errors

A module's call that fails throws a `PalbaseError`:

| Field | What it is |
|---|---|
| `status` | The HTTP status; `0` when no answer came, or the refusal was made on the device. |
| `code` | A stable code: the server's (`invalid_credentials`, `rate_limited`, …) or the client's (`network_error`, `timeout`, `passkey_cancelled`, …). |
| `message` | What happened, in English, for a log. |
| `op` | The operation that failed, as the contract names it (`Login`, `GetMe`). |
| `requestId` | The request's id, when the server answered: the line to find in Studio's Logs. |
| `retryAfter` | The seconds the server asked to wait, when it did. |
| `body` | The refusal's body as sent, as `JSONValue`. |
| `isNetworkError` | True when the request was never answered (no network, the host unreachable, no answer in time). Ask this rather than `status == 0`. |

```swift
import Palbase

func signIn(email: String, password: String) async -> String {
    do {
        _ = try await pb.auth.signIn(email: email, password: password)
        return "Welcome back"
    } catch let e as PalbaseError where e.isNetworkError {
        return "You are offline"
    } catch let e as PalbaseError where e.code == "invalid_credentials" {
        return "Wrong email or password"
    } catch {
        return "Something went wrong: \(error)"
    }
}
```

A call to your own backend throws its route's typed error instead: see [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls#errors).

### Retries

A call is sent again only when that cannot do its work twice: a read (`GET`, `HEAD`, `QUERY`), or a write its contract takes an `Idempotency-Key` on, with one key made for the call and carried by every attempt. What is retried is an answer that says "not now" (`429`, `502`, `503`, `504`) and a request that never reached the server, waiting what the server's `Retry-After` asks, or 0.5 s, 1 s, 2 s with jitter when it says nothing. Everything else is the caller's at once.

```swift
import Palbase

// Five attempts, and a Retry-After of up to a minute waited for.
let patient = PalbaseClient(.environment, retry: RetryPolicy(attempts: 5, maxWaitSeconds: 60))
```

The default is `RetryPolicy.default`: three attempts in all, and a `Retry-After` longer than 30 seconds is not waited for (the error goes to the caller). `RetryPolicy.once` sends each call once.

## Related

- [Auth](https://palbase.studio/docs/ios/auth): sign-in, passkeys, Sign in with Apple, the session
- [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls): the generated clients and their errors
- [Introduction](https://palbase.studio/docs/getting-started/introduction): the project's modules, keys and environments
- [CLI reference](https://palbase.studio/docs/cli/reference#apps): every `apps` command
