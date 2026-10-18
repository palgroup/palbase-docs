> The full documentation index: https://palbase.studio/llms.txt

# Flags

`pb.flags` (the `PalbaseFlags` product) holds the project's feature flags and remote configuration as this app's reader sees them: every flag's value resolved by the project for the app's platform, version and language and for whoever is signed in, kept current as the flags change. A read takes no network: it answers from the values held, which are kept on the device between launches, and brings them up to date behind your code. Flags are defined in Studio's flags screens or by a server, never from the app ([Flags in your backend](https://palbase.studio/docs/backend/flags)).

## Quick example

```swift
import Palbase
import PalbaseFlags
import SwiftUI

struct Checkout: View {
    var body: some View {
        // Drawn again when one of these flags changes: in Studio, the user's own value, another user signing in.
        let flags = pb.flags.state
        VStack {
            Text(flags.string("banner_text", default: "Welcome"))
            if flags.bool("new_checkout", default: false) {
                Text("Up to \(flags.int("cart_limit", default: 20)) items")
            }
        }
    }
}
```

The module starts on first use: the values held on the device are read at once, the latest are fetched for whoever is signed in, and the flags' change channels are joined on the project's socket.

## Reading values

The same reads are on `pb.flags.state`, an `@Observable` on the main actor for SwiftUI, and on `pb.flags` itself, from any thread:

| Member | What it answers |
|---|---|
| `bool(_:default:)` | A boolean flag's value, or the default when there is none or it is not a boolean. |
| `string(_:default:)` | A string flag's value, or the default. |
| `number(_:default:)` | A number flag's value as a `Double`, or the default. |
| `int(_:default:)` | A number flag's value when it is a whole number, or the default. |
| `decode(_:as:)` | An object flag's value as your `Decodable` type, or `nil`. |
| `value(_:)` | A flag's value as `JSONValue`, or `nil` when there is none. |
| `all` | Every flag's value by key. |

A view that reads one flag from `state` is drawn again when that flag's value changes, and only then; a view that reads `all` is drawn again on any change. Every read answers at once. Before the first fetch has answered, the app reads the values it held at its last launch, or the default on its first. Give every read a default the app works with.

On `pb.flags`:

| Member | What it does |
|---|---|
| `source(_:)` | Where a value came from: `system` (the flag's), `override` (the user's own) or `experiment` (an experiment's variant). |
| `version` | The version the values are current as of. |
| `holds(reader:)` | Whether the values held are this user's (`nil`: no one signed in). |
| `onChange(_:)` | Calls the listener with the keys whose values changed. Returns what stops it. |
| `changes` | The same, as an `AsyncStream<Set<String>>`. |
| `refresh()` | Brings the values up to date now, and returns when they are. It throws a `PalbaseError` when the read fails. |

```swift
import Palbase
import PalbaseFlags

struct Theme: Decodable { let accent: String }

func applyFlags() async {
    // Wait for current values before a first screen that depends on them.
    try? await pb.flags.refresh()
    let theme = pb.flags.decode("theme", as: Theme.self)
    print(theme?.accent ?? "default accent", pb.flags.source("theme") ?? "none")

    for await keys in pb.flags.changes where keys.contains("maintenance") {
        print("maintenance is now", pb.flags.bool("maintenance", default: false))
    }
}
```

## A signed-in user's values

The values are one reader's: the signed-in user's, or with no one signed in, this install's, proven with its secret. When someone signs in or out, the values held go, and listeners are told their keys; the new reader's are read, and listeners are told again. One reader's values are never read out to another, even for the moment the new ones take to arrive: a gate on a flag closes for the next user rather than staying open with the last one's value.

## What a value is resolved from

Every read is resolved by the project for its reader, in this order:

1. **The user's own value**, when a signed-in user has one. A server gives users their values with the secret key ([Flags in your backend](https://palbase.studio/docs/backend/flags#users-own-values)), and so does [`palbase flags:users:set`](https://palbase.studio/docs/cli/reference#palbase-flagsusersset).
2. **The variant of an experiment** running on the flag, when the reader is one of its people.
3. **The flag's first condition that matches.** Conditions read what the app says about itself, the share of users a percentile picks, the country of the address the request came from, the server's clock, and the analytics audiences the reader is in, when they allowed personalization ([Consent](https://palbase.studio/docs/ios/consent)).
4. **The flag's default.**

What the app says about itself, with every read:

| Header | Sent as | Read as |
|---|---|---|
| `X-Platform` | `ios` | `client.platform` |
| `X-Palbase-Client-Version` | The app's `CFBundleShortVersionString` | `client.app_version` |
| `X-OS-Version` | The system's version (`18.6.2`) | `client.os_version` |
| `Accept-Language` | The device's languages, or what `pb.setPreferredLanguages(_:)` named | `client.locale`, its first language |
| `X-Palbase-Installation` | `pb.installation.id` | Counted toward which versions of your app are in use. |
| `X-Palbase-Installation-Secret` | The install's secret, with no one signed in | Proves the install, so audiences and experiments can place a reader who is not signed in. |

## Experiments

A value an experiment gave says so: `source(_:)` is `experiment`. When the app reads such a flag by its key (`bool`, `string`, `number`, `int`, `decode` or `value`, on `pb.flags` or `state`), the SDK records the analytics event `$flag_exposure` with `{ flag, experiment, variant }`, once per analytics session for each flag and experiment, through `pb.analytics` while the person allows analytics. That event is what an experiment's results count, so the app links `PalbaseAnalytics` and has used `pb.analytics` once. `all` records none: read a flag in an experiment by its key where the person sees it.

## Keeping up to date

The SDK keeps the values current by itself. The project announces every change on two realtime channels, which it joins on the project's socket:

| Channel | Who may join | What it says |
|---|---|---|
| `flags:<ref>` | Anyone reading the project's flags, with no one signed in too | The project's flags changed. |
| `flags:<ref>:<user_id>` | That user only | That user's own values changed. |

Told of a newer version, the SDK asks for what changed since the one it holds (`GET /flags/delta`). When the delta can no longer bring its values up to date (the reader's context or audiences changed, or the deletions it would need are older than the project keeps), the project answers `410`, and the SDK reads a whole snapshot instead (`GET /flags/snapshot`, sent with the `ETag` of what it holds). A channel the project refuses, with realtime off, still leaves the reads: `refresh()` brings the values up to date.

## The debug console

The flag `palbase.debug_console`, given to one user as their own value, opens the [debug console](https://palbase.studio/docs/ios/debug-console) for them.

## Related

- [Flags in your backend](https://palbase.studio/docs/backend/flags): defining flags and giving users their own values
- [Analytics](https://palbase.studio/docs/ios/analytics): `$flag_exposure`, and the audiences conditions read
- [Realtime](https://palbase.studio/docs/ios/realtime): the socket the change notices travel on
- [Web Flags](https://palbase.studio/docs/web/flags): the same flags in a browser
