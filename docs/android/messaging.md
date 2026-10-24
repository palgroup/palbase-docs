> The full documentation index: https://palbase.studio/llms.txt

# Messaging

`pb.messaging` is the signed-in person's conversations on Android: their list, each conversation's timeline and its threads as `StateFlow`s Compose collects, kept in the app's own SQLite between launches and current over the project's socket. The app writes; it opens no socket, appends nothing and syncs nothing itself. A message's push brings its conversation onto the phone even while the app is closed. What the module is — history, encryption, timers, moderation, prices — is [Messaging](https://palbase.studio/docs/messaging/overview).

## Install

Palbase's packages come from its own repository; let the `studio.palbase` group come from there alone:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        exclusiveContent {
            forRepository { maven("https://palgroup.github.io/palbase-android/") }
            filter { includeGroup("studio.palbase") }
        }
    }
}
```

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.7.0"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-notify")     // pushes: the FCM token, and the service that draws them
    implementation("studio.palbase:palbase-messaging")  // pb.messaging
}
```

## Quick example

```kotlin
@Composable
fun Inbox(pb: PalbaseClient, open: (String) -> Unit) {
    // The person's conversations, the latest first: drawn from the phone at once, then kept current.
    val list by remember { pb.messaging.conversations() }.state.collectAsState()
    Text("${list.unread} unread")
    LazyColumn {
        items(list.items, key = { it.id }) { c -> Text(c.title ?: "Chat", Modifier.clickable { open(c.id) }) }
    }
}

@Composable
fun Chat(pb: PalbaseClient, id: String) {
    val chat = remember(id) { pb.messaging.conversation(id) }
    val state by chat.state.collectAsState() // entries: its messages and those on their way; members; typing
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    LazyColumn { items(state.entries) { e -> Text(e.toString()) } }
    TextField(text, { text = it })
    Button(onClick = {
        val words = text
        text = ""
        scope.launch { chat.send(words) } // drawn at once; with no network, sent once it is back
    }) { Text("Send") }
}
```

`pb.messaging.direct(userId)` is the direct conversation with someone (the one there is, or a new one, shown to them with its first message). A message waits in the outbox while the phone is offline and goes once it can, once. Files are encrypted on the phone (AES-256-GCM) before they are uploaded; `pb.messaging.open(message, attachment)` downloads and decrypts one, and a message seen once gives its files by `pb.messaging.viewOnce(message)` alone.

## Pushes

The app uses its own Firebase project:

- put `app/google-services.json` in the app and apply the `com.google.gms.google-services` plugin;
- connect the same Firebase project to the Palbase project as its FCM push provider ([Notifications](https://palbase.studio/docs/android/notifications));
- touch `pb.notify` at launch: the installation's token is registered — the installation's while no one is signed in, the person's once someone is;
- on Android 13 and later, the app asks for `POST_NOTIFICATIONS` (the permission is in the module's manifest; asking is the app's).

`palbase-notify` brings its FCM service with its manifest: nothing more to declare. The project sends data messages, and the SDK draws them.

## Messages that arrive while the app is closed

Nothing to set up. While the app is closed or in the background, a message's push is drawn, and the same push reads its conversation into the phone's copy: open the app with no network and it is there.

## A message while the app is open

While the app is in front, a message's push is not drawn in the tray: its conversation is synced, and `pb.messaging.incoming` — a `SharedFlow<Message>` — gives the app each message someone else wrote that is new to the phone, once, whether the socket or the push brought it first. A sync, a page read, the person's own messages, system messages and removed ones never come through it. Skip the conversation on the screen:

```kotlin
var banner by remember { mutableStateOf<Message?>(null) }
LaunchedEffect(Unit) {
    pb.messaging.incoming.collect { m -> if (m.conversationId != openConversationId) banner = m }
}
banner?.let { m -> IncomingBanner(m) { banner = null; openConversationId = m.conversationId } }
```

## Screenshots

While a photo or a video seen once is shown, keep the window out of screenshots and recordings (`FLAG_SECURE`): they come out black.

```kotlin
DisposableEffect(Unit) {
    val release = pb.messaging.protectViewOnce(activity)
    onDispose { release() }
}
```

In vanish mode, a screenshot taken while the conversation is open is told to the others (Android 14 and later; `DETECT_SCREEN_CAPTURE` is in the module's manifest):

```kotlin
DisposableEffect(id) {
    val stop = pb.messaging.watchScreenshots(activity, id)
    onDispose { stop() }
}
```

## Signing out

The phone's copy is kept in the app's own SQLite, in files not backed up. When the person signs out it is dropped, unless `pb.messaging.keepOnSignOut = true` — then it is theirs again when they come back. Whoever signs in next never reads it; and unless copies are kept, the person who signs in drops any other's left there.
