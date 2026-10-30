> The full documentation index: https://palbase.studio/llms.txt

# Messaging

`pb.messaging` is the signed-in person's conversations on iOS: their list, each conversation's timeline and its threads, as `@Observable` objects SwiftUI draws, kept in the app's SQLite between launches and current over the project's socket. The app writes; it opens no socket, appends nothing and syncs nothing itself. With the notification service extension, a message that arrives while the app is closed is already on the phone when it opens. What the module is — history, encryption, timers, moderation, prices — is [Messaging](https://palbase.studio/docs/messaging/overview).

## Install

Add `https://github.com/palgroup/palbase-swift` with Swift Package Manager, at 0.10.0 or later:

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

## Spaces and open groups

A conversation may belong to a place of your app's — an organization, a workspace — when it is made with a `space` your app names (`org:<id>`), for good: `direct(with: userId, space: org)` opens the pair's conversation there (the two have one in each space, and one with none), `group(title:space:visibility:)` makes a group there, `conversations(spaces: [org])` lists a space's — its `unread` that space's — and `search(_:space:)` searches one. Each conversation says its `space` (`nil`: none).

An open group (`visibility: .open`; `isOpen` on the conversation) is a channel: `openGroups(space:)` lists a space's, each with whether the person is in it (`joined`), and `join(_:)` lets the person in — the group then in their list at once. Making one, listing and joining ask the project's hook (`open_group`, `list_open`, `join`): refused, a `PalbaseError` with code `not_allowed`; an open group names its space (`space_required`). One an admin removed does not join again by themselves (`removed`).

```swift
// Sources/Workspace/Channels.swift
let org = "org:2f6c0c1e-8a3b-4c1d-9e5f-0a1b2c3d4e5f"
let sidebar = pb.messaging.conversations(spaces: [org])
let channels = try await pb.messaging.openGroups(space: org)
for c in channels.items where !c.joined { _ = try await pb.messaging.join(c.id) }
let dm = try await pb.messaging.direct(with: "usr_01a1684c796e7394aa8ec75d893a8fe2", space: org)
```

A message your server wrote as someone (an assistant sending their words) says what wrote it: `message.via` (`"pal"`) — show it beside the message.

## Writing

`send(_:_:)` takes text, or `SendOptions`: `replyTo`, `threadId` and `alsoInConversation`, `mentions`, `files` (encrypted on the phone before they are uploaded), `expiresIn` with `expiresFrom`, `viewOnce`, and `sendAt` for a message the server sends later. A message waits in the outbox while the phone is offline and goes once it can, once. `edit`, `remove`, `react`, `unreact`, `markRead`, `typing`, `cancelScheduled` and `editScheduled` change what was said; `open(_:attachment:)` downloads and decrypts a file, and a message seen once gives its files by `viewOnce(_:)` alone — held by the app, never by the phone's copy.

## Search

`search(_:)` finds the person's messages that say every word asked — a word's beginning finds it, "toplanti" finds "Toplantıda" — the newest first, across their conversations or in one (`in:`). Each `SearchHit` carries what a result row draws: the conversation's `title` and `photo` (a group's, or the other person's in a direct one), its `sender`, `peer`, and its `matches` — where its text or a file's name says what was asked, in UTF-16 code units. The first page also lists the person's conversations whose name says it (`conversations`), found on the phone. What the module finds and never finds: [Messaging](https://palbase.studio/docs/messaging/overview#search).

```swift
let found = try await pb.messaging.search("toplanti")
for c in found.conversations { print(c.title ?? "Chat") }   // their names say it: draw them first
for hit in found.messages {
    let text = hit.message.text ?? ""
    var row = AttributedString(text)   // the text, what was asked in bold
    for m in hit.matches where m.field == .text {
        let from = text.utf16.index(text.startIndex, offsetBy: m.offset)
        let to = text.utf16.index(from, offsetBy: m.length)
        if let r = Range(from..<to, in: row) { row[r].inlinePresentationIntent = .stronglyEmphasized }
    }
}
let more = try await pb.messaging.search("toplanti", cursor: found.nextCursor)   // while nextCursor is not nil
```

A find opens where it was said: `conversation(_:at:)` is the conversation's page around it, `focus` naming the message to scroll to and mark. `loadEarlier()` reads back from there and `loadLater()` forward; once it reaches the newest, `hasLater` is false and it is kept current as any. An answer the conversation's timeline does not show has a `threadRootId`: open its thread at it.

```swift
if let root = hit.threadRootId {
    thread = pb.messaging.thread(hit.conversation.id, root: root, at: hit.message.id)
} else {
    chat = pb.messaging.conversation(hit.conversation.id, at: hit.message.id)   // chat.focus == hit.message.id
}
```

### By meaning

With the project's `search_by_meaning` on ([Messaging](https://palbase.studio/docs/messaging/overview#by-meaning)), `search(_:by: .meaning)` finds the messages nearest what the question means, in none of its words: "uçuş saati kaçta" finds "Uçağımız sabah dokuzda Sabiha Gökçen'den kalkıyor". The nearest come first, one page (`nextCursor` is nil), each with `score` — how near, 0.3 to 1 — and no `matches`; `conversations` is empty. A hit opens as any does: `conversation(_:at:)`.

```swift
do {
    let found = try await pb.messaging.search("uçuş saati kaçta", by: .meaning)
    for hit in found.messages { print(hit.score ?? 0, hit.title ?? "", hit.message.text ?? "") }
} catch let e as PalbaseError {
    // search_by_meaning_off: the project searches by words alone. too_many_searches: a person asks
    // 30 at once, one more a minute. ai_payment_required: the project's AI use is spent.
    print(e.code)
}
```

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

   final class NotificationService: PalbaseMessagingNotificationService {}
   ```

2. **Share the copy and the session.** In *Signing & Capabilities*, give the app and the extension the same:
   - **App Groups**: one group, such as `group.<bundle id>` — where the conversations are kept;
   - **Keychain Sharing**: `<bundle id>.palbase`, the `keychain_group` `palbase apps:sync` writes to the environment's file — where the extension reads the session, and writes it back when it renews it.

   The app alone has **Push Notifications**.

3. **Give the app the group** (above): `PalbaseConfiguration.environment.with(appGroup: "group.<bundle id>")`, so it reads what the extension wrote. The extension reads the app's configuration from the shared keychain: the app must have been opened once.

The extension's `Info.plist` is Xcode's: `NSExtensionPointIdentifier` `com.apple.usernotifications.service`, `NSExtensionPrincipalClass` `$(PRODUCT_MODULE_NAME).NotificationService`. iOS gives an extension about 30 seconds, enough for a conversation's new messages. A muted conversation sends no push: its messages come when the app opens.

## Screenshots

iOS cannot stop a screenshot. A conversation's screen says it is shown (`onScreen(true)` as it appears, `onScreen(false)` as it goes): when a screenshot is taken while it shows a conversation in vanish mode or a message seen once, the others are told. A conversation in vanish mode drops what the person read when they leave it: call `close()` as its screen goes.

## A deleted group

When a group's owner or an admin deletes it — or its last member leaves — it goes from everyone's `conversations()` at once, and those who were in it can still report it for 14 days ([Messaging](https://palbase.studio/docs/messaging/overview#moderation)). `pb.messaging.deletedGroups()` is `@Observable`: its `items` are the groups the person can still report, the latest to stop first, each with `id`, `title`, `deletedBy` and `reportableUntil`, and one goes at its `reportableUntil`. `report(_:)` names it by its id with no message; the last 30 messages the person saw in it go with the report. A group the project's server deleted is not among them.

```swift
let deleted = pb.messaging.deletedGroups()
for group in deleted.items {
    print(group.title ?? "a group", group.reportableUntil)
}
if let group = deleted.items.first {
    try await pb.messaging.report(.init(conversationId: group.id, reason: .harassment, userId: group.deletedBy))
}
```

The title is the one the device had; it is nil when the device no longer had the group as the word came — on the deleter's own device now and then.

## Signing out

When the person signs out, what the phone kept of their conversations is dropped, unless `pb.messaging.keepOnSignOut` is true — then it is theirs again when they sign back in. Kept or not, no one else who signs in on the phone reads it.
