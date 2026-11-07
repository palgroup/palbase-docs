> The full documentation index: https://palbase.studio/llms.txt

# Analytics

`pb.analytics` (`studio.palbase:palbase-analytics`) is the app's analytics, performance samples and diagnostics, each behind its own consent key: `analytics` for events, screens and the person's properties, `performance` for timings and request traces, `diagnostics` for the log sent with a report. Nothing waits on it. What is collected is held and sent together, and a send that fails is let go.

## Quick example

```kotlin
// app/src/main/kotlin/com/example/shop/ShopApp.kt
package com.example.shop

import android.app.Application
import kotlinx.serialization.json.JsonPrimitive
import palbase.environment
import studio.palbase.ConsentOptions
import studio.palbase.ConsentState
import studio.palbase.PalbaseClient
import studio.palbase.PalbaseConfiguration
import studio.palbase.analytics.analytics

lateinit var pb: PalbaseClient

class ShopApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // What the app collects before the person chooses: nothing here — the consent screen asks first.
        pb = PalbaseClient(this, PalbaseConfiguration.environment.with(consent = ConsentOptions(start = mapOf("analytics" to ConsentState.DENIED))))
        // Touched at launch: from here it makes the app's own events ($install, $app_open, …).
        pb.analytics
    }
}

fun checkedOut(items: Int) {
    pb.analytics.screen("Checkout")
    pb.analytics.capture("checkout_started", mapOf("items" to JsonPrimitive(items), "plan" to JsonPrimitive("pro")))
}
```

Touch `pb.analytics` once at launch, in the `Application`'s `onCreate`: from then on it makes the app's own events and timings.

## Consent

`pb.consent` is the one gate every collecting module asks, key by key. While a key is not granted, nothing of it is made: no event, no queue, no file, no request, and no anonymous id.

| Key | What it covers |
|---|---|
| `analytics` | Events the app captures, screens viewed, identify and the person's properties |
| `performance` | Timings: launches, screens, requests |
| `diagnostics` | The log sent with a report |

The platform's other keys (`personalization`, `marketing_push` and the other channels, `ads_measurement`, `ads_personalization`) and the app's own (`custom.<name>`, named in `ConsentOptions.customKeys`) are the same as on [iOS](https://palbase.studio/docs/ios/consent#the-keys); `keys()` lists them with their words.

There is no default. What the app starts with until the person chooses is the app's to say (`ConsentOptions.start`, in the configuration), because whether its users must opt in is the app's to know: a key with no starting value and no choice collects nothing. The person's own choice, once made, wins:

```kotlin
import studio.palbase.AuthAPI
import studio.palbase.ConsentState

suspend fun consentScreen() {
    val region = pb.consent.region()               // gdpr asks first; us collects until refused
    val ask = pb.consent.needsAsking()             // never chosen, or chosen under another text
    if (region.jurisdiction == AuthAPI.ConsentRegion.Jurisdiction.GDPR || ask.isNotEmpty()) {
        // … show the screen, then:
        pb.consent.setMany(mapOf("analytics" to ConsentState.GRANTED, "performance" to ConsentState.DENIED))
    }
    val chosen: ConsentState? = pb.consent.state("analytics")   // null: no choice and no starting value
    val stop = pb.consent.onChange { key, state -> println("$key is now $state") }
}
```

When a key is withdrawn, what was held of it is deleted, on the device too, and with `analytics` the anonymous id and the session go as well. A store that cannot be read counts as a refusal, never as the starting value. A choice stands at once and is sent to the project, with when it was made; on sign-out the device goes back to the app's starting values.

## Events and screens

| Method | What it does |
|---|---|
| `capture(event, properties)` | Records an event. The name is a letter or `$`, then letters, digits and `_.:-$`, 64 at most. `properties` is a `Map<String, JsonElement>`. |
| `screen(name, properties)` | Records a screen the user saw. |
| `identify(traits)` | Ties this device's anonymous events to the signed-in user, with their traits. It is done by itself at sign-in, with the next send. |
| `flush()` | Sends what is held now, of the keys granted now. |

An event is sent as the signed-in user, or, with no one signed in, under an anonymous id the device keeps (`anon_…`). A session is the events with no more than 30 minutes between them. When the user signs out, the anonymous id goes, and the next person on the device is someone new.

What is held goes together: 5 seconds after the first of it, as soon as 20 events, screens and timings are held, and when the app's screens are hidden. What is held when the app closes is kept on the device and sent at the next launch.

## Timings

While `performance` is granted, the SDK times on its own how long the launch took, from the process's start to its first activity started, as an `app_start` sample named `cold` — a process begun for a push, a job or a widget and opened later is not one. In an app built with the Palbase Gradle plugin it also times each request the app makes — its own OkHttp clients and `HttpURLConnection`s and every library's, the SDK's among them — as a `network` sample: its method, its address as its route (no query, an id in the path as `:id`), its status and how long it took. What analytics itself sends is not timed.

```kotlin
// settings.gradle.kts
pluginManagement { repositories { gradlePluginPortal(); google(); mavenCentral(); maven("https://palgroup.github.io/palbase-android/") } }
```

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("studio.palbase") version "0.18.0"
}
```

The plugin rewrites, as the app is built, each `OkHttpClient()`, `OkHttpClient.Builder.build()`, `URL.openConnection()` and a connection's `getResponseCode()` and `getInputStream()` — in the app and in every library it takes — to the SDK, which does what was asked and times it. It reaches no network, and an app without `palbase-analytics` is built as it was. Each timing is turned off in `AnalyticsOptions(network = false, appStart = false)`.

An app whose users can grant `performance` declares these timings in Play Console's Data safety form as **App info and performance › Diagnostics**, collected, for analytics.

What the app measures itself:

```kotlin
import studio.palbase.analytics.Analytics
import studio.palbase.analytics.analytics

suspend fun refreshFeed(loadFeed: suspend () -> Unit) {
    val trace = pb.analytics.startTrace("load_feed")
    loadFeed()
    trace.stop(mapOf("source" to "network"))

    pb.analytics.measure("image_decode", 12.5, Analytics.Measure.CUSTOM, mapOf("format" to "webp"))   // milliseconds
}
```

`Analytics.Measure` is the kind of a measurement: `CUSTOM`, `SCREEN`, `APP_START` or `NETWORK`. Each is collected only with `performance` granted.

## Diagnostics

```kotlin
import studio.palbase.analytics.Analytics
import studio.palbase.analytics.analytics

suspend fun checkoutFailed() {
    pb.analytics.log("cart is empty at checkout", Analytics.Level.WARNING)   // kept in memory, the last 200 lines
    pb.analytics.report()                                                     // sends the lines kept, as what led to an error

    pb.analytics.recordRequest(method = "GET", endpoint = "/v1/feed", status = 500, durationMs = 840, requestId = "req_01")
}
```

`log` keeps a line in memory and sends nothing, so the lines go only with a `report()`, which sends them as what led to an error (or, with another `trigger`, what the user reported). `recordRequest` records a request the app made and how it ended, as a trace: `performance` collects it, and `log` and `report` are `diagnostics`'.

Studio's Analytics screens show what the app sent: its events, people, funnels and retention.

## Related

- [Overview](https://palbase.studio/docs/android/overview): the client, consent and the installation
- [Debug Console](https://palbase.studio/docs/android/debug-console): what the SDK records on the device for a bug report
- [Web Analytics](https://palbase.studio/docs/web/analytics): the same events from a browser, and what the project reads back
