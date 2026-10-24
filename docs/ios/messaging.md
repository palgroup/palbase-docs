> The full documentation index: https://palbase.studio/llms.txt

# Messaging

`pb.messaging` is the signed-in person's conversations on iOS: their list, each conversation's timeline and its threads, as `@Observable` objects SwiftUI draws, kept in the app's SQLite between launches and current over the project's socket. The app writes; it opens no socket, appends nothing and syncs nothing itself. With the notification service extension, a message that arrives while the app is closed is already on the phone when it opens. What the module is — history, encryption, timers, moderation, prices — is [Messaging](https://palbase.studio/docs/messaging/overview).

## Install

Add `https://github.com/palgroup/palbase-swift` with Swift Package Manager, at 0.7.0 or later:

- the app's target: `Palbase` and `PalbaseMessaging`;
- the notification service extension's target (below): `PalbaseMessagingNotificationService`.

## Quick example

```swift
import Palbase
import PalbaseMessaging
import SwiftUI

struct Inbox: View {
    let pb: PalbaseClient
    // The person's conversations, the latest first: drawn from the phone at once, then kept current.
    @State private var list: ConversationList?

    var body: some View {
        List(list?.items ?? [], id: \.id) { conversation in
            NavigationLink(conversation.title ?? "Chat") { Chat(view: pb.messaging.conversation(conversation.id)) }
        }
        .navigationTitle("Chats (\(list?.unread ?? 0))")
        .task { list = pb.messaging.conversations() }
    }
}

struct Chat: View {
    let view: ConversationView
    @State private var text = ""

    var body: some View {
        VStack {
            List(view.entries) { entry in
                switch entry {
                case .message(let m): Text(m.text ?? "a file")
                case .pending(let item): Text(item.request.text ?? "a file").foregroundStyle(.secondary) // on its way
                }
            }
            TextField("Message", text: $text)
                .onSubmit {
                    let words = text
                    text = ""
                    // Drawn at once, sent now or when the network is back — once.
                    Task { _ = try? await view.send(words) }
                }
        }
        .onAppear { view.onScreen(true) }
        .onDisappear { view.onScreen(false) }
        .task { try? await view.markRead() }
    }
}
```

`pb.messaging.direct(with: userId)` is the direct conversation with someone (the one there is, or a new one, shown to them with its first message); `group(title:memberIds:)` makes a group. `ConversationView` has `entries`, `members`, `typing`, `hasEarlier` and `loadEarlier()`; `thread(_:)` is a message's thread, `scheduled()` the person's messages for later.

## Writing

`send(_:_:)` takes text, or `SendOptions`: `replyTo`, `threadId` and `alsoInConversation`, `mentions`, `files` (encrypted on the phone before they are uploaded), `expiresIn` with `expiresFrom`, `viewOnce`, and `sendAt` for a message the server sends later. A message waits in the outbox while the phone is offline and goes once it can, once. `edit`, `remove`, `react`, `unreact`, `markRead`, `typing`, `cancelScheduled` and `editScheduled` change what was said; `open(_:attachment:)` downloads and decrypts a file, and a message seen once gives its files by `viewOnce(_:)` alone — held by the app, never by the phone's copy.

## A message while the app is open

A message's push is not drawn as the system's banner while the app is in front: the message is synced, and `incoming()` gives it to the app to draw its own banner. Answer the system with what `Messaging.foregroundPresentation` says:

```swift
import Palbase
import PalbaseMessaging
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let pb = PalbaseClient(try! PalbaseConfiguration.environment.with(appGroup: "group.com.example.chat"))

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { try? await pb.notify.register(apnsToken: deviceToken) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        pb.notify.willPresent(notification)
        // A message's push: none (the app draws its own); any other push: as the app wants.
        completionHandler(Messaging.foregroundPresentation(for: notification, of: pb) ?? [.banner, .sound])
    }
}
```

`incoming()` gives each message someone else wrote that is new to the phone once, whether the socket or the push brought it first — never what a sync or a page read, the person's own messages, or a muted conversation's. `onScreen` is true for the conversation on the screen:

```swift
.task {
    for await m in pb.messaging.incoming() where !m.onScreen {
        banner = m // m.message, m.conversation: draw it; a tap opens pb.messaging.conversation(m.message.conversationId)
    }
}
```

## Messages that arrive while the app is closed

The `PalbaseMessagingNotificationService` extension shows a message's push and, while it does, brings that conversation's new messages into the phone's copy: open the app without a network and they are there.

1. **Add the extension.** *File › New › Target › Notification Service Extension*; give it `PalbaseMessagingNotificationService`, and replace its `NotificationService.swift`:

   ```swift
   import PalbaseMessagingNotificationService

   // Swift 6 asks a subclass to restate its base's @unchecked Sendable.
   final class NotificationService: PalbaseMessagingNotificationService, @unchecked Sendable {}
   ```

2. **Share the copy and the session.** In *Signing & Capabilities*, give the app and the extension the same:
   - **App Groups**: one group, such as `group.<bundle id>` — where the conversations are kept;
   - **Keychain Sharing**: `<bundle id>.palbase`, the `keychain_group` `palbase apps:sync` writes to the environment's file — where the extension reads the session, and writes it back when it renews it.

   The app alone has **Push Notifications**.

3. **Give the app the group** (above): `PalbaseConfiguration.environment.with(appGroup: "group.<bundle id>")`, so it reads what the extension wrote. The extension reads the app's configuration from the shared keychain: the app must have been opened once.

The extension's `Info.plist` is Xcode's: `NSExtensionPointIdentifier` `com.apple.usernotifications.service`, `NSExtensionPrincipalClass` `$(PRODUCT_MODULE_NAME).NotificationService`. iOS gives an extension about 30 seconds, enough for a conversation's new messages. A muted conversation sends no push: its messages come when the app opens.

## Screenshots

iOS cannot stop a screenshot. A conversation's screen says it is shown (`onScreen(true)` as it appears, `onScreen(false)` as it goes): when a screenshot is taken while it shows a conversation in vanish mode or a message seen once, the others are told. A conversation in vanish mode drops what the person read when they leave it: call `close()` as its screen goes.

## Signing out

When the person signs out, what the phone kept of their conversations is dropped, unless `pb.messaging.keepOnSignOut` is true — then it is theirs again when they sign back in. Kept or not, no one else who signs in on the phone reads it.
