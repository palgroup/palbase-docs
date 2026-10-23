> The full documentation index: https://palbase.studio/llms.txt

# Notifications

`pb.notify` (`studio.palbase:palbase-notify`) is what the app does for the project's messages: it records this device's push token for the signed-in user, and reads and writes the user's own preferences and topics. Sending is the project's server's, with the secret key ([Notifications](https://palbase.studio/docs/backend/notifications)), never the app's.

A push reaches an Android device through Firebase Cloud Messaging, with the project's own FCM account.

## Setting up push

1. **The app's Firebase project.** Add the app to a Firebase project, put its `google-services.json` in the app module, and apply the `com.google.gms.google-services` plugin with `com.google.firebase:firebase-messaging`, as Firebase's setup says.
2. **The project sends with it.** Give the environment the Firebase project's service account, the JSON key of an account that may send with FCM:

   ```sh
   palbase notify:providers:set push fcm < service-account.json -E staging
   ```

   The credentials are read from stdin, checked as the sender will use them, and never shown again.
3. **Ask to notify.** On Android 13 and newer, the app asks for `POST_NOTIFICATIONS` at runtime and declares it in its manifest.
4. **Record the token** for the signed-in user, and **show what arrives**, both from the app's `FirebaseMessagingService` (below).

## Recording the token

```kotlin
// app/src/main/kotlin/com/example/shop/Push.kt
import com.google.firebase.messaging.FirebaseMessaging
import studio.palbase.notify.notify

// appScope: a CoroutineScope of the app's own, as long as the process.
fun startPush() {
    FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
        appScope.launch { runCatching { pb.notify.register(fcmToken = token) } }
    }
}
```

`register(fcmToken, locale)` records the token for the signed-in user and returns the device as the project has it. The token is this install's, and the device row is the user's:

- **Signed out**, `register` throws `PalbaseError` `missing_credential`, and the token is kept: it is recorded for whoever signs in next, with no call of yours.
- **Signing out** forgets the device for that user while they can still be named. The call is left with the client for that moment, and made even by a later process that never loaded `pb.notify`. The next person on the phone does not get the last one's notifications.
- **Someone else signing in** gets the token the app last gave.

`pb.notify.deviceId` is how the project names this device: `android-` and the installation's id. `unregister()` forgets it for the signed-in user, and it receives nothing until it is registered again. `devices()` lists the user's devices.

## Showing a push

A push reaches an Android app as an FCM data message, never as a notification the system draws by itself. Its parts are in the message's data, beside the push's own `data`:

| Key | What it is |
|---|---|
| `pb_title`, `pb_body` | The push's title and body. |
| `pb_image`, `pb_sound` | Its image's https address and its sound, when it has them. |
| `deep_link` | Its deep link, when it has one. |
| `pb_receipt` | The push's sealed receipt for this device. |

A silent push (`silent: true`) carries none of the title, body, image and sound: it wakes the app with its data alone.

At this version the SDK draws nothing, so the app's own service shows it:

```kotlin
// app/src/main/kotlin/com/example/shop/PushService.kt
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import studio.palbase.notify.notify

class PushService : FirebaseMessagingService() {
    // A token FCM changed goes to the project for whoever is signed in.
    override fun onNewToken(token: String) {
        appScope.launch { runCatching { pb.notify.register(fcmToken = token) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.data["pb_title"] ?: return   // a silent push: data alone
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("messages", "Messages", NotificationManager.IMPORTANCE_DEFAULT))
        val notification = NotificationCompat.Builder(this, "messages")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message.data["pb_body"])
            .setAutoCancel(true)
            .build()
        manager.notify(message.messageId.hashCode(), notification)
    }
}
```

```xml
<!-- app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<application>
    <service android:name=".PushService" android:exported="false">
        <intent-filter>
            <action android:name="com.google.firebase.MESSAGING_EVENT" />
        </intent-filter>
    </service>
</application>
```

`onMessageReceived` runs in the background too, so a process the push woke makes the client as the app's `Application` does. A call it makes as the user, to your backend for example, renews the session only if the call needs it.

The project counts how each push went on each device from what the device reports with `pb_receipt` (`POST /notify/receipts`). The Android SDK at this version reports nothing, so a push sent to an Android device is `unconfirmed` unless the app reports it itself.

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

@Composable
fun InboxScreen() {
    var unread by remember { mutableLongStateOf(0L) }
    Scaffold(topBar = { TopAppBar(title = { Text(if (unread > 0) "Inbox ($unread)" else "Inbox") }) }) { pad ->
        InboxView(pb, Modifier.padding(pad).fillMaxSize(), onUnread = { unread = it }, empty = "No messages yet")
    }
}
```

`InboxView(client, modifier, locale, onOpen, onCustom, onUnread, empty, deleteLabel, onOffer, onOfferError)` takes the language to write it in (the person's chosen one unless given), what a tap on a message's link does (the system opens it unless given), a designed card's own buttons, the unread count as it changes, what an empty inbox says, and a designed card's offer button (the purchases module takes the offer unless given, once the app uses `pb.purchases`).

An app that draws its own uses `pb.notify.inbox`:

| Method | What it does |
|---|---|
| `list(limit, cursor, locale)` | A page, newest first: `items`, `nextCursor` and `unread`. Each `Inbox.Item` has its id, title, body, image, deep link, category, data, designed card, and when it was made, ends and was read. |
| `unread()` | How many are unread: what a badge shows. |
| `markRead(ids)`, `markAllRead()` | Marks messages read, on every device of the person's. |
| `remove(id)` | Deletes a message, from every device. |

## In-app messages

The project's in-app campaigns (a modal, a banner or a whole screen, designed in Studio) are shown over the app once started. `PalbaseInAppMessages` around the app's root starts them and draws them in Compose:

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

`InAppHandlers` says what the app does with a message's buttons: `onDeepLink`, `onShowPaywall` (a placement's paywall), `onCustom` (the app's own code: a name and a value), `onRequestPush` (the push ask) and `onOffer` (one of the catalog's offers; the purchases module takes it unless given, once the app uses it). A button whose action the app does not take is not drawn.

An app that draws its own calls `pb.notify.inApp.start { presentation -> … }`, which hands it each `InAppPresentation` to show (its `definition`, its `variables`) and `null` when what is shown must go. The app tells back `clicked(action)`, `dismissed()` or `closed()`. `stop()` stops them, and `refresh()` asks for the person's campaigns again.

## Related

- [Notifications in your backend](https://palbase.studio/docs/backend/notifications): sending push, email, SMS and WhatsApp
- [Auth](https://palbase.studio/docs/android/auth): the sign-in the device row follows
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-notifyprovidersset): `notify:providers:set`
