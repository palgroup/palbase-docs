> The full documentation index: https://palbase.studio/llms.txt

# Flags

`pb.flags` (`studio.palbase:palbase-flags`) is the project's flags as this reader sees them: each value resolved by the project for the app's platform, version and language, the signed-in user and their own values. It is read without waiting, because the values the app last had are kept on the device and are what it starts with. It is kept current: a change made in Studio reaches the app over the project's socket within moments, with no call of yours.

## Quick example

```kotlin
import studio.palbase.flags.flags

// Read now, with a default for a flag the app does not have (yet).
if (pb.flags.bool("checkout.new_flow", default = false)) showNewCheckout()
val greeting = pb.flags.string("home.greeting", default = "Hello")
val limit = pb.flags.int("cart.max_items", default = 20)
```

In Compose, collect the values, and the screen is drawn again when one changes:

```kotlin
import kotlinx.serialization.json.JsonPrimitive

@Composable
fun Greeting() {
    val flags by pb.flags.values.collectAsState()
    val text = (flags["home.greeting"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "Hello"
    Text(text)
}
```

## Reading values

| Member | What it returns |
|---|---|
| `bool(key, default)`, `string(key, default)`, `number(key, default)`, `long(key, default)`, `int(key, default)` | The flag's value as that type, or `default` when there is no such flag or its value is another type. |
| `decode<T>(key)` | An object flag as a `@Serializable` type of yours; `null` when it is missing or does not fit. `decode(key, deserializer)` takes the serializer. |
| `value(key)` | The value as JSON (`JsonElement`), or `null`. |
| `all` | Every flag's value by key. |
| `values` | The same, as a `StateFlow<Map<String, JsonElement>>`. |
| `source(key)` | Where the value came from, as the project says: `override` for the user's own value. |
| `version` | The version the values are current as of. |

```kotlin
import kotlinx.serialization.Serializable

@Serializable
data class Banner(val title: String, val color: String)

val banner = pb.flags.decode<Banner>("home.banner")
```

A value is any JSON the flag's type allows: a boolean, a number, a string or an object.

## A signed-in user's values

The values are one reader's: the signed-in user's, or, with no one signed in, this app's. The values kept on the device are read at launch only when they are the same reader's. When someone signs in or out, the values held go (`values` is empty, and a listener is told their keys), the new reader's are read, and the listener is told again. One reader's values are never shown to another, even for the moment the new ones take to arrive.

## What a value is resolved from

Every read is resolved by the project for its reader, in this order: the user's own value when a signed-in user has one ([Users' own values](https://palbase.studio/docs/backend/flags#users-own-values)), then the variant of an experiment running on the flag, then the flag's first condition that matches, then its default ([How a value is resolved](https://palbase.studio/docs/backend/flags#how-a-value-is-resolved)).

What the client says about itself, with every read:

| Header | Sent as |
|---|---|
| `X-Platform` | `android` |
| `X-OS-Version` | The device's Android version (`Build.VERSION.RELEASE`) |
| `X-Palbase-Client-Version` | The app's `versionName` |
| `Accept-Language` | The user's languages ([Languages](https://palbase.studio/docs/android/overview#languages)) |
| `X-Palbase-Installation` | `pb.installation.id`, with each snapshot: the install a percentage places, counted toward which versions of your app are in use |

The country a condition reads is that of the address the request came from: the device's own, because the app calls the project directly.

At this version the Android SDK records no `$flag_exposure` analytics event when it reads a value an experiment gave.

## Keeping up to date

The flags start being kept current the first time `pb.flags` is used: the latest values are read, and the client joins the project's two flags channels on its socket.

| Channel | Who joins | What it says |
|---|---|---|
| `flags:<ref>` | Anyone reading the project's flags, with no one signed in too | The project's flags changed. |
| `flags:<ref>:<user_id>` | That user only | That user's own values changed. |

Told of a newer version, the client asks for what changed since the one it holds (`GET /flags/delta`). When the delta can no longer bring its values up to date, the project answers `410`, and the client reads a whole snapshot instead (`GET /flags/snapshot`, sent with the `ETag` of what it holds, answered `304` when nothing changed). A sign-in or a sign-out reads the values again for whoever is signed in now.

To hear which flags changed:

```kotlin
val stop = pb.flags.onChange { keys -> println("changed: $keys") }
// or, in a coroutine: pb.flags.changes.collect { keys -> … }
```

`pb.flags.refresh()` brings the values up to date now: what changed since the version held, or a snapshot. It throws `PalbaseError` when the project could not be read, and the values held stay as they are.

## Turning a flag on for one user

A user's own value wins over the flag's conditions: give one from a server ([Users' own values](https://palbase.studio/docs/backend/flags#users-own-values)) or from a terminal, and it reaches their device on their channel:

```sh
palbase flags:users:set <user-id> checkout.new_flow true
palbase flags:users:get <user-id>
```

The debug console is opened for one user the same way ([Debug Console](https://palbase.studio/docs/android/debug-console)).

## Related

- [Flags in your backend](https://palbase.studio/docs/backend/flags): defining flags, conditions and users' own values
- [Realtime](https://palbase.studio/docs/android/realtime): the socket the changes come over
- [Overview](https://palbase.studio/docs/android/overview): the client and its observable state
