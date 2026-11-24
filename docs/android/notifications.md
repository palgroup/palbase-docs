> The full documentation index: https://palbase.studio/llms.txt

# Notifications

`pb.notify` (`studio.palbase:palbase-notify`) registers this device's push token (for the install while signed out, and for the signed-in user once signed in), draws incoming pushes via `PalbaseMessagingService`, reports delivery/open/dismiss receipts automatically, and manages preferences, topics, the inbox, and in-app campaigns. Sending is the project's server's, with the secret key ([Notifications](https://palbase.studio/docs/backend/notifications)), never the app's.

A push reaches an Android device through Firebase Cloud Messaging, with the project's own FCM account.

## Setting up push

1. **The app's Firebase project.** Add the app to a Firebase project, put its `google-services.json` in the app module, and apply the `com.google.gms.google-services` plugin with `com.google.firebase:firebase-messaging`, as Firebase's setup says.
2. **The project sends with it.** Give the environment the Firebase project's service account, the JSON key of an account that may send with FCM:

   ```sh
   palbase notify:providers:set push fcm < service-account.json -E staging
   ```

   The credentials are read from stdin, checked as the sender will use them, and never shown again.
3. **Ask to notify.** On Android 13 and newer, request `POST_NOTIFICATIONS` at runtime and declare it in your manifest; call `pb.notify.pushAllowed()` after the user grants permission so the token is registered immediately.
4. **Touch `pb.notify` at launch** in your `Application.onCreate()`. `palbase-notify`'s merged manifest already declares `PalbaseMessagingService`, so token registration, notification rendering, and receipt reporting work with no extra service code.

## Recording the token

```kotlin
// app/src/main/kotlin/com/example/shop/ShopApp.kt
package com.example.shop

import android.app.Application
import palbase.environment
import studio.palbase.PalbaseClient
import studio.palbase.PalbaseConfiguration
import studio.palbase.notify.notify

lateinit var pb: PalbaseClient

class ShopApp : Application() {
    override fun onCreate() {
        super.onCreate()
        pb = PalbaseClient(this, PalbaseConfiguration.environment)
        // Registers this install's FCM token automatically and flushes any pending receipts.
        pb.notify
    }
}
```

`pb.notify` manages the token across the full sign-in lifecycle automatically:

- **Signed out**, the FCM token is registered with the publishable key and the install's secret (`installationId`), so pushes addressed to the install reach people before they sign up.
- **Signing in** re-registers the token with the user's session so the device belongs to that user.
- **Signing out** (or session expiry) drops the device from the previous user and re-registers it for the anonymous install, so the next person on the phone never receives the previous user's notifications.
- You can also call `pb.notify.register(fcmToken, locale)` manually when needed.

`pb.notify.deviceId` is how the project names this device: `android-` and the installation's id. `unregister()` forgets it for the signed-in user, and it receives nothing until it is registered again. `devices()` lists the user's devices.

## Showing a push and receipts

A push reaches an Android app as an FCM data message containing `pb_title`, `pb_body`, optional `pb_image`, `pb_sound`, `deep_link`, and `pb_receipt` beside your custom `data` keys. A silent push (`silent: true`) omits the display keys and wakes the app with its data alone.

`PalbaseMessagingService` (declared automatically by `palbase-notify`'s manifest):

- draws standard notifications using the app's `com.google.firebase.messaging.default_notification_icon` and `com.google.firebase.messaging.default_notification_channel_id` metadata when present (falling back to the app icon and the SDK's default channel, named by the string resource `palbase_notification_channel_name`);
- opens the app's launch activity on tap with the push's data attached as extras;
- automatically reports `delivered`, `not_shown` (when notifications or the channel are turned off), `opened`, and `dismissed` receipts to `POST /notify/receipts` (retried on the next launch if offline);
- forwards module pushes (such as [Messaging](https://palbase.studio/docs/android/messaging) and [Calls](https://palbase.studio/docs/android/calls)) to their handlers.

If your app needs custom `FirebaseMessagingService` logic alongside Palbase, subclass `PalbaseMessagingService`, call `super` first, declare your subclass for `com.google.firebase.MESSAGING_EVENT`, and remove the SDK's manifest entry:

```kotlin
// app/src/main/kotlin/com/example/shop/PushService.kt
package com.example.shop

import com.google.firebase.messaging.RemoteMessage
import studio.palbase.notify.PalbaseMessagingService

class PushService : PalbaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        // Call super first so Palbase draws notifications, reports receipts, and dispatches Calls/Messaging pushes.
        super.onMessageReceived(message)
        // Custom handling for your app's own messages.
    }
}
```

```xml
<!-- app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<application xmlns:tools="http://schemas.android.com/tools">
    <service
        android:name="studio.palbase.notify.PalbaseMessagingService"
        tools:node="remove" />
    <service android:name=".PushService" android:exported="false">
        <intent-filter>
            <action android:name="com.google.firebase.MESSAGING_EVENT" />
        </intent-filter>
    </service>
</application>
```

## Preferences and topics

```kotlin
// channel → category → whether they take it
val preferences: Map<String, Map<String, Boolean>> = pb.notify.preferences()
pb.notify.setPreferences(mapOf("push" to mapOf("marketing" to false)))

pb.notify.follow("release-notes")
pb.notify.unfollow("release-notes")
```

A write sets some of the user's preferences and answers all of them. A category the user never set is on, and `transactional` is always on: it is not theirs to turn off. A topic's followers get what the server sends to it with `to: { topic }`.

## The inbox

The signed-in person's inbox holds the messages your backend put there and the copies of pushes it chose to keep, the same on every device of theirs: read on one, it is read on each; deleted, it is gone from each. A message stays its days (90 unless the project said) and an inbox keeps its newest 250.

`InboxView` (`studio.palbase:palbase-notify-ui`) draws it ready, in Compose:

```kotlin
import studio.palbase.notify.ui.InboxView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen() {
    var unread by remember { mutableLongStateOf(0L) }
    Scaffold(topBar = { TopAppBar(title = { Text(if (unread > 0) "Inbox ($unread)" else "Inbox") }) }) { pad ->
        InboxView(pb, Modifier.padding(pad).fillMaxSize(), onUnread = { unread = it }, empty = "No messages yet")
    }
}
```

`InboxView(client, modifier, locale, onOpen, onCustom, onUnread, empty, deleteLabel, onOffer, onOfferError)` takes the language to write it in (the person's chosen one unless given), what a tap on a message's link does (the system opens it unless given), a designed card's own buttons, the unread count as it changes, what an empty inbox says, and a designed card's offer button (the IAP module takes the offer unless given, once the app uses `pb.iap`).

An app that draws its own uses `pb.notify.inbox`:

| Method | What it does |
|---|---|
| `list(limit, cursor, locale)` | A page, newest first: `items`, `nextCursor` and `unread`. Each `Inbox.Item` has its id, title, body, image, deep link, category, data, designed card, and when it was made, ends and was read. |
| `unread()` | How many are unread: what a badge shows. |
| `markRead(ids)`, `markAllRead()` | Marks messages read, on every device of the person's. |
| `remove(id)` | Deletes a message, from every device. |

## In-app messages

The project's in-app campaigns (a modal, a banner or a whole screen, designed in Studio) are shown over the app once started. `PalbaseInAppMessages` around the app's root starts them and draws them in Compose:

<!-- given: this: ComponentActivity, fun showPaywall(placement: String), @Composable fun AppNavigation() -->

```kotlin
import studio.palbase.notify.ui.InAppHandlers
import studio.palbase.notify.ui.PalbaseInAppMessages

setContent {
    PalbaseInAppMessages(pb, InAppHandlers(
        onDeepLink = { url -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) },
        onShowPaywall = { placement -> showPaywall(placement) },
    )) {
        AppNavigation()
    }
}
```

The person's campaigns are asked for as each session of theirs starts (the launch, a return after half an hour away, a sign-in or out). An event the app records with `pb.analytics` (its captures and screens), or names with `pb.notify.inApp.trigger(event, properties)`, shows the first campaign it triggers, the highest priority first, that its caps let: the project's (in a session, in a day, the least time between two) and the campaign's own. Triggers are matched on the device, so no event leaves it for them, and a message is shown whatever the person chose of analytics; a campaign to an audience reaches only people who allowed personalization. A [journey](https://palbase.studio/docs/backend/journeys)'s in-app step opens one of these campaigns for its person, shown the next time it is triggered.

`InAppHandlers` says what the app does with a message's buttons: `onDeepLink`, `onShowPaywall` (a placement's paywall), `onCustom` (the app's own code: a name and a value), `onRequestPush` (the push ask) and `onOffer` (one of the catalog's offers; the IAP module (`palbase-iap`) takes it unless given, once the app uses `pb.iap`). A button whose action the app does not take is not drawn.

An app that draws its own calls `pb.notify.inApp.start { presentation -> … }`, which hands it each `InAppPresentation` to show (its `definition`, its `variables`) and `null` when what is shown must go. The app tells back `clicked(action)`, `dismissed()` or `closed()`. `stop()` stops them, and `refresh()` asks for the person's campaigns again.

## Related

- [Notifications in your backend](https://palbase.studio/docs/backend/notifications): sending push, email, SMS and WhatsApp
- [Auth](https://palbase.studio/docs/android/auth): the sign-in the device row follows
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-notifyprovidersset): `notify:providers:set`
