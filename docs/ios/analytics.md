> The full documentation index: https://palbase.studio/llms.txt

# Analytics

`pb.analytics` (the `PalbaseAnalytics` product) records what the app's users do, how its screens and requests perform, and its log when something goes wrong, each behind its own consent key: `analytics` for events, screens and the person's properties, `performance` for timings and request traces, `diagnostics` for the log sent with a report. Nothing waits on it: what is collected is held, sent together a few seconds later, and a send that fails is let go. What the project makes of it (people, funnels, retention, audiences) is in Studio's Analytics screens.

## Quick example

```swift
import Palbase
import PalbaseAnalytics
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Touched at launch: from here it makes the app's own events ($install, $app_open, …).
        _ = pb.analytics
        return true
    }
}

func checkedOut(total: Double) {
    pb.analytics.capture("checkout_completed", properties: ["total": .number(total), "currency": .string("EUR")])
}
```

Nothing is collected for a key the person has not granted, and nothing for one with no choice and no starting value: give the app's starting values in [Consent](https://palbase.studio/docs/ios/consent), or ask first.

## Events and screens

| Method | What it does |
|---|---|
| `capture(_:properties:)` | Records an event: a name (a letter or `$`, then letters, digits and `_.:-$`, 64 at most) and its properties. |
| `screen(_:properties:)` | Records a screen the user saw. |
| `identify(traits:)` | Ties this device's anonymous events to the signed-in user, with their traits. It is done by itself after each sign-in. |
| `flush()` | Sends what is held now. |

An event is held for up to 5 seconds, or until 20 are held, and they go together; what is held when the app goes to the background goes then, and what is held when it closes offline is kept on disk and sent at the next launch. With no one signed in, events are an anonymous id's, made the first time one is needed; after a sign-in they are the user's, and the anonymous id's are tied to them. A session is a run of events with no gap of 30 minutes.

## The person's properties

```swift
import Palbase
import PalbaseAnalytics

func onboarded(plan: String) async {
    await pb.analytics.people.set(["plan": .string(plan)])
    await pb.analytics.people.setOnce(["first_seen_plan": .string(plan)])
    await pb.analytics.people.add(["projects_created": 1])
}
```

`people` is the signed-in user, or with no one signed in this device's anonymous id, whose properties become the user's once they sign in. `set`, `setOnce` (only where none is set), `unset` and `add` (to a number) are sent at once, while `analytics` is granted.

## The app's own events

From the moment `pb.analytics` is first touched, it records these by itself, each while `analytics` is granted:

| Event | When |
|---|---|
| `$install` | Once per install, timed at the first launch even when analytics is allowed later. `$reinstall: true` when the keychain kept the install from before the app was deleted; `$apple_ads_token`, Apple's attribution token, while `ads_measurement` is granted. |
| `$app_open` | Each time the app comes to the foreground; `$cold: true` on a launch. |
| `$app_background` | Each time it goes to the background. |
| `$session_start` | Each time a session begins, after 30 minutes without an event. |
| `$app_updated` | When the app's version is not the one it last ran as: `$previous_version`, `$version`. |
| `$timezone` | The person's time zone, a property, set when it is not the one last set. |

Each one can be turned off in the configuration: `PalbaseConfiguration.environment.with(analytics: AnalyticsOptions(appBackground: false))` ([Overview](https://palbase.studio/docs/ios/overview#what-the-app-adds-to-the-configuration)). An app extension (a widget, a notification service) makes none of them.

## Performance

While `performance` is granted, the SDK times on its own, with no code of the app's:

- **Each request the app's `URLSession` makes** — the project's, its backend's and every other service's; async, completion handler or delegate alike — as a `network` sample: its method, its address as its route (no query, an id in the path as `:id`), its status and how long it took. What analytics itself sends is not timed, nor a request the app cancelled, nor a web socket.
- **How long the launch took**, from the process's start to the app before the person, as an `app_start` sample named `cold`. A launch the system began ahead of the person (prewarming), or one begun in the background (a push, a fetch) and opened later, is not one.

Before `performance` is granted nothing of the app's networking is touched. Each is turned off in the configuration: `AnalyticsOptions(network: false, appStart: false)`.

The SDK's privacy manifest declares these timings as **Performance Data**, linked to the user, for analytics, so Xcode's Privacy Report lists it. An app whose users can grant `performance` adds Performance Data to its App Privacy answers in App Store Connect.

What the app measures itself:

```swift
import Palbase
import PalbaseAnalytics

func loadFeed() async {
    let trace = pb.analytics.startTrace("feed_load")
    // … load it …
    trace.stop(attributes: ["source": "network"])
    pb.analytics.measure("feed_items", value: 42)
}
```

| Method | What it does |
|---|---|
| `startTrace(_:)` | Starts timing something; the trace's `stop(attributes:)` records how long it took, in milliseconds. |
| `measure(_:value:kind:attributes:)` | Records one measurement. `kind` is `.custom` (the default), `.screen`, `.appStart` or `.network`. |
| `recordRequest(method:endpoint:status:durationMs:requestId:error:)` | Records a request the app made and how it ended. |

They are collected while `performance` is granted. While `analytics` is not, a timing goes with the publishable key alone: no user's token, no person's id, no install's id.

## Diagnostics

`log(_:level:)` keeps a line of the app's log in memory (the last 200, levels `.debug`, `.info`, `.warning`, `.error`), and `report(_:)` sends what it kept as what led to an error: `.error` (the default), `.crash` or `.userReport`. Both work while `diagnostics` is granted, and nothing of it is written to disk.

## When consent changes

While a key is not granted, nothing of it is made: no event, no queue, no file, no request, and no anonymous id. When it is withdrawn, what was held of it is deleted, on disk too, and with `analytics` the anonymous ids. When someone signs out, the next person on the device is someone new: the anonymous ids go. See [Consent](https://palbase.studio/docs/ios/consent).

## App Tracking Transparency

`pb.tracking` reads App Tracking Transparency's answer and shows its prompt when the app asks:

```swift
import Palbase
import PalbaseAnalytics

func askToTrack() async {
    if pb.tracking.status == .notDetermined {
        let answer = await pb.tracking.requestAuthorization()
        print(answer) // .authorized, .denied, .restricted
    }
}
```

The prompt's words are the app's `NSUserTrackingUsageDescription`. Palbase never asks on its own and never reads the advertising identifier: what the app does with the answer is its own. Ad measurement is a consent key of its own (`ads_measurement`).

## Related

- [Consent](https://palbase.studio/docs/ios/consent): the keys analytics collects behind
- [Flags](https://palbase.studio/docs/ios/flags#experiments): `$flag_exposure`, what an experiment's results count
- [Web Analytics](https://palbase.studio/docs/web/analytics): the same events from a browser
- [Debug Console](https://palbase.studio/docs/ios/debug-console): what the SDK records on the device, apart from analytics
