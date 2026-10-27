> The full documentation index: https://palbase.studio/llms.txt

# Analytics

`pb.analytics(startingConsent)` (`studio.palbase:palbase-analytics`) is the app's analytics, performance samples and diagnostics, each behind its consent category: events the app captures and screens it shows (analytics), timings (performance), and its log and failed requests (diagnostics). Nothing waits on it. What is collected is held and sent together, and a send that fails is let go.

## Quick example

```kotlin
import studio.palbase.Consent
import studio.palbase.analytics.analytics
import kotlinx.serialization.json.JsonPrimitive

// Nothing is collected until the person says yes.
val analytics = pb.analytics(startingConsent = Consent.State.DENIED)

// The person's choice, from the app's consent screen:
pb.consent.set(Consent.Category.ANALYTICS, Consent.State.GRANTED)

analytics.screen("Checkout")
analytics.capture("checkout_started", mapOf("items" to JsonPrimitive(3), "plan" to JsonPrimitive("pro")))
```

`pb.analytics(…)` is made once. The first call's starting consent is the one kept, so make it at launch, with the starting consent the app's users need.

## Consent

`pb.consent` is the one gate every collecting module asks. While a category is not granted, nothing of it is made: no event, no queue, no file, no request, and no anonymous id.

| `Consent.Category` | What it covers |
|---|---|
| `ANALYTICS` | Events the app captures, and screens viewed |
| `PERFORMANCE` | Timings: launches, screens, requests |
| `DIAGNOSTICS` | The app's log, its reports and its failed requests |

There is no default. The app says what it starts with when it makes analytics (`startingConsent`), because whether its users must opt in is the app's to know. That applies to every category until the user's own choice is recorded, which then wins:

```kotlin
pb.consent.set(Consent.Category.PERFORMANCE, Consent.State.DENIED)
val chosen: Consent.State? = pb.consent.state(Consent.Category.ANALYTICS)   // null: not chosen yet
val stop = pb.consent.onChange { category, state -> println("$category is now $state") }
pb.consent.reset()   // forget the choices: the starting consent applies again
```

When a category is withdrawn, what was held of it is deleted, on the device too, and with analytics the anonymous id and the session go as well. A store that cannot be read counts as a refusal, never as the starting value. The choices are kept on the device: at this version the Android SDK does not send them to the project.

## Events and screens

| Method | What it does |
|---|---|
| `capture(event, properties)` | Records an event. The name is a letter or `$`, then letters, digits and `_.:-$`, 64 at most. `properties` is a `Map<String, JsonElement>`. |
| `screen(name, properties)` | Records a screen the user saw. |
| `identify(traits)` | Ties this device's anonymous events to the signed-in user, with their traits. It is done by itself at sign-in, with the next send. |
| `flush()` | Sends what is held now, of the categories granted now. |

An event is sent as the signed-in user, or, with no one signed in, under an anonymous id the device keeps (`anon_…`). A session is the events with no more than 30 minutes between them. When the user signs out, the anonymous id goes, and the next person on the device is someone new.

What is held goes together: 5 seconds after the first of it, as soon as 20 events, screens and timings are held, and when the app's screens are hidden. What is held when the app closes is kept on the device and sent at the next launch.

## Timings

While `PERFORMANCE` is granted, the SDK times on its own how long the launch took, from the process's start to its first activity started, as an `app_start` sample named `cold` — a process begun for a push, a job or a widget and opened later is not one. In an app built with the Palbase Gradle plugin it also times each request the app makes — its own OkHttp clients and `HttpURLConnection`s and every library's, the SDK's among them — as a `network` sample: its method, its address as its route (no query, an id in the path as `:id`), its status and how long it took. What analytics itself sends is not timed.

```kotlin
// settings.gradle.kts
pluginManagement { repositories { gradlePluginPortal(); google(); mavenCentral(); maven("https://palgroup.github.io/palbase-android/") } }

// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("studio.palbase") version "0.10.0"
}
```

The plugin rewrites, as the app is built, each `OkHttpClient()`, `OkHttpClient.Builder.build()`, `URL.openConnection()` and a connection's `getResponseCode()` and `getInputStream()` — in the app and in every library it takes — to the SDK, which does what was asked and times it. It reaches no network, and an app without `palbase-analytics` is built as it was. Each timing is turned off in `AnalyticsOptions(network = false, appStart = false)`.

An app whose users can grant `PERFORMANCE` declares these timings in Play Console's Data safety form as **App info and performance › Diagnostics**, collected, for analytics.

What the app measures itself:

```kotlin
import studio.palbase.analytics.Analytics

val trace = analytics.startTrace("load_feed")
loadFeed()
trace.stop(mapOf("source" to "network"))

analytics.measure("image_decode", 12.5, Analytics.Measure.CUSTOM, mapOf("format" to "webp"))   // milliseconds
```

`Analytics.Measure` is the kind of a measurement: `CUSTOM`, `SCREEN`, `APP_START` or `NETWORK`. Each is collected only with `PERFORMANCE` granted.

## Diagnostics

```kotlin
analytics.log("cart is empty at checkout", Analytics.Level.WARNING)   // kept in memory, the last 200 lines
analytics.report()                                                     // sends the lines kept, as what led to an error

analytics.recordRequest(method = "GET", endpoint = "/v1/feed", status = 500, durationMs = 840, requestId = "req_01")
```

`log` keeps a line in memory and sends nothing, so the lines go only with a `report()`, which sends them as what led to an error (or, with another `trigger`, what the user reported). `recordRequest` records a request the app made and how it ended. Each is collected only with `DIAGNOSTICS` granted.

Studio's Analytics screens show what the app sent: its events, people, funnels and retention.

## Related

- [Overview](https://palbase.studio/docs/android/overview): the client, consent and the installation
- [Debug Console](https://palbase.studio/docs/android/debug-console): what the SDK records on the device for a bug report
- [Web Analytics](https://palbase.studio/docs/web/analytics): the same events from a browser, and what the project reads back
