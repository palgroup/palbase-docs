> The full documentation index: https://palbase.studio/llms.txt

# Notifications

`pb.notify` (the `PalbaseNotify` product) is what the app does for the project's messages: it registers this device's push token, reads and sets the signed-in user's preferences and topics, reports how each push went on the device, reads the person's inbox, and shows the project's in-app campaigns. Sending is your server's, with the secret key ([Notifications](https://palbase.studio/docs/backend/notifications)), never the app's. `PalbaseNotificationService` is the app's notification service extension, and `PalbaseNotifyUI` draws in-app messages and the inbox natively in SwiftUI.

## Push

The app needs the **Push Notifications** capability, and the project needs a push provider: its APNs key, or Firebase Cloud Messaging ([Notifications](https://palbase.studio/docs/backend/notifications#every-channel-but-one-needs-a-provider-of-yours)).

```swift
import Palbase
import PalbaseNotify
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Set before launch ends, or a tap that launched the app is missed.
        UNUserNotificationCenter.current().delegate = self
        // The device's token, at every launch: the prompt is asked for apart, from a tap of the person's.
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { try? await pb.notify.register(apnsToken: deviceToken) }
    }

    // Opened, dismissed, or a button of it tapped.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        pb.notify.didReceive(response)
        completionHandler()
    }

    // Arrived while the app was in front: the extension does not run for it then.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        pb.notify.willPresent(notification)
        completionHandler([.banner, .sound])
    }
}
```

Ask the person from a tap of theirs, at the moment it makes sense:

```swift
import Palbase
import PalbaseNotify

@MainActor
func turnOnNotifications() async {
    // The system's prompt; allowed, it registers for remote notifications, and the delegate gets the token.
    let allowed = await pb.notify.requestPushAuthorization()
    print(allowed ? "on" : "off")
}
```

| Method | What it does |
|---|---|
| `register(apnsToken:locale:)` | Records the APNs token, at every launch and whenever it changes, with the device's time zone and the app's version: a push for the person's own hour goes at that hour here, and their quiet hours are on this clock. |
| `requestPushAuthorization(options:)` | Shows the system's prompt (`.alert`, `.badge`, `.sound` by default) and, allowed, registers for remote notifications. The app's alone: an extension has no application to register. |
| `didReceive(_:)` | Reports a push opened, dismissed (a category with `.customDismissAction`), or a button tapped. It returns at once. |
| `willPresent(_:)` | Reports a push delivered while the app was in the foreground. |
| `unregister()` | Forgets this device for the signed-in user: it receives nothing until registered again. |
| `devices()` | The signed-in user's devices. |
| `deviceId` | This install's device, as the project names it: `ios-<installation id>`. |

**The token is the install's, then the user's.** With no one signed in it is registered with the publishable key and the install's secret, and a push that names the install reaches it, so an app reaches people who never signed up. When someone signs in it is registered again with their session, and it is theirs. When their session ends (they sign out, or it is ended anywhere) the project forgets their device, and the app registers it as the install's again: the next person on a phone does not get the last one's notifications. The SDK does each of these by itself once it has a token.

A report that cannot go now is kept and sent at the next launch. A report is the push's own word, its receipt, and goes with the publishable key alone.

## Preferences and topics

```swift
import Palbase
import PalbaseNotify

func noMarketingEmail() async throws {
    var preferences = try await pb.notify.preferences()   // channel → category → whether they take it
    preferences["email", default: [:]]["marketing"] = false
    try await pb.notify.setPreferences(preferences)
    try await pb.notify.follow(topic: "release-notes")
}
```

A user's preferences are channel (`email`, `sms`, `whatsapp`, `push`) → category → whether they take it. `transactional` is always on; a category they never set is on. Every send with a category honours them. `follow(topic:)` and `unfollow(topic:)` add and remove the signed-in user from a topic of the project's. Marketing on a channel also needs the person's consent for it ([Consent](https://palbase.studio/docs/ios/consent)).

## The notification service extension

The extension tells the project that each push reached the phone, with the app closed too, and shows the push's picture. Add a **Notification Service Extension** target to the app, link `PalbaseNotificationService`, and make its class a subclass with nothing in it:

```swift
import PalbaseNotificationService

final class NotificationService: PalbaseNotificationService, @unchecked Sendable {}
```

The target's `NSExtensionPrincipalClass` names it (`$(PRODUCT_MODULE_NAME).NotificationService`, as Xcode's template does). Give the extension the **Keychain Sharing** capability with the app's group: the app keeps the configuration it runs with there (the project's address, its publishable key, its app group), and the extension reads it. An extension that compiles the app's environment in (`palbase/<app>.palbase` in its Compile Sources, with the build rule) can name it instead:

```swift
import Palbase
import PalbaseNotificationService

final class NotificationService: PalbaseNotificationService, @unchecked Sendable {
    override var configuration: PalbaseConfiguration? { .environment }
}
```

For each push, it reports `delivered` (five seconds at most) while it downloads the push's `image` (https only, 10 MB and fifteen seconds at most; JPEG, PNG or GIF) and attaches it. The project marks every push a person sees so that the extension runs for it. A report that could not go is kept in the app group, when the app has one, and the app sends it at its next launch: give both targets the **App Groups** capability with the same group, and the app's configuration `with(appGroup:)` ([Overview](https://palbase.studio/docs/ios/overview#what-the-app-adds-to-the-configuration)). When the system ends the extension's time first, the push is shown as it came.

An extension that does more overrides `didReceive(_:withContentHandler:)`, calls `super` with a handler of its own, and finishes with the content `super` handed it (the picture attached). It can call the project or your backend as the signed-in user: it reads the app's session through the shared keychain group.

## The inbox

The signed-in person's inbox holds the messages your backend put there and the copies of pushes it chose to keep, the same on every device of theirs: read on one, it is read on each; deleted, it is gone from each. A message stays its days (90 unless the project said) and an inbox keeps its newest 250.

`InboxView` (the `PalbaseNotifyUI` product) draws it ready:

```swift
import Palbase
import PalbaseNotifyUI
import SwiftUI

struct InboxScreen: View {
    @State private var unread = 0

    var body: some View {
        InboxView(pb, onUnread: { unread = $0 })
            .navigationTitle(unread > 0 ? "Inbox (\(unread))" : "Inbox")
    }
}
```

`InboxView(_:locale:onOpen:onCustom:onOffer:onUnread:empty:)` takes the language to write it in (the person's chosen one unless given), what a tap on a message's link does (the system opens it unless given), a designed card's own buttons, its offer button (the purchases module takes the offer unless given, once the app uses `pb.purchases`), the unread count as it changes, and what an empty inbox says.

An app that draws its own uses `pb.notify.inbox`:

| Method | What it does |
|---|---|
| `list(limit:cursor:locale:)` | A page, newest first: `items`, `nextCursor` and `unread`. Each `Inbox.Item` has `id`, `title`, `body`, `image`, `deepLink`, `category`, `data`, `card` (a designed card's definition), `createdAt`, `expiresAt` and `readAt`. |
| `unread()` | How many are unread: what a badge shows. |
| `markRead(_:)`, `markAllRead()` | Marks messages read, on every device of the person's. |
| `remove(_:)` | Deletes a message, from every device. |

## In-app messages

The project's in-app campaigns (a modal, a banner or a whole screen, designed in Studio) are shown over the app once started. `palbaseInAppMessages(_:handlers:)` on the app's root view starts them and draws them natively:

```swift
import Palbase
import PalbaseNotifyUI
import SwiftUI

@main
struct ShopApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack { InboxScreen() }
                .palbaseInAppMessages(pb, handlers: InAppHandlers(
                    onDeepLink: { url in print("open", url) },
                    onShowPaywall: { placement in print("show the paywall of", placement) }
                ))
        }
    }
}
```

The person's campaigns are asked for as each session of theirs starts (the launch, a return after half an hour away, a sign-in or out). An event the app records with `pb.analytics` (its captures and screens), or names with `pb.notify.inApp.trigger(_:properties:)`, shows the first campaign it triggers, the highest priority first, that its caps let: the project's (in a session, in a day, the least time between two) and the campaign's own. Triggers are matched on the device, so no event leaves it for them, and a message is shown whatever the person chose of analytics; a campaign to an audience reaches only people who allowed personalization.

`InAppHandlers` says what the app does with a message's buttons: `onDeepLink` (the system opens the link unless given), `onShowPaywall` (a placement's paywall), `onCustom` (the app's own code: a name and a value), `onRequestPush` (the push ask; the SDK's prompt and registration unless given) and `onOffer` (one of the catalog's offers; the purchases module takes it unless given, once the app uses it). A button whose action the app does not take is not drawn: a paywall button without `onShowPaywall`, a custom one without `onCustom`.

An app that draws its own calls `pb.notify.inApp.start(presenting:)`, which hands it each `InAppPresentation` to show (its `definition`, its `variables`) and `nil` when what is shown must go. The app tells back `clicked(_:)`, `dismissed()` or `closed()`. `stop()` stops them, and `refresh()` asks for the person's campaigns again.

## Related

- [Notifications in your backend](https://palbase.studio/docs/backend/notifications): sending push, email, SMS and WhatsApp, templates, topics, the inbox, campaigns
- [Consent](https://palbase.studio/docs/ios/consent): the marketing keys
- [Overview](https://palbase.studio/docs/ios/overview): the keychain group and app group the extension shares
- [Web Notifications](https://palbase.studio/docs/web/notifications): web push and the inbox in a browser
