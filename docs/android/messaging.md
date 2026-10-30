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
    implementation(platform("studio.palbase:palbase-bom:0.9.0"))
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

## Spaces and open groups

A conversation may belong to a place of your app's — an organization, a workspace — when it is made with a `space` your app names (`org:<id>`), for good: `direct(userId, space = org)` opens the pair's conversation there (the two have one in each space, and one with none), `group(title, space = org, visibility = …)` makes a group there, `conversations(spaces = listOf(org))` lists a space's — its `unread` that space's — and `search(query, space = org)` searches one. Each conversation says its `space` (`null`: none).

An open group (`visibility` open) is a channel: `openGroups(space)` lists a space's, each with whether the person is in it (`joined`), and `join(conversationId)` lets the person in — the group then in their list at once. Making one, listing and joining ask the project's hook (`open_group`, `list_open`, `join`): refused, a `PalbaseError` with code `not_allowed`; an open group names its space (`space_required`). One an admin removed does not join again by themselves (`removed`).

```kotlin
// app/src/main/java/com/example/workspace/Channels.kt
val org = "org:2f6c0c1e-8a3b-4c1d-9e5f-0a1b2c3d4e5f"
val sidebar = pb.messaging.conversations(spaces = listOf(org))
val channels = pb.messaging.openGroups(org)
for (c in channels.items) if (!c.joined) pb.messaging.join(c.id)
val dm = pb.messaging.direct("usr_01a1684c796e7394aa8ec75d893a8fe2", space = org)
```

A message your server wrote as someone (an assistant sending their words) says what wrote it: `message.via` (`"pal"`) — show it beside the message.

## Search

`pb.messaging.search(query)` finds the person's messages that say every word asked — a word's beginning finds it, "toplanti" finds "Toplantıda" — the newest first, across their conversations or in one (`conversationId`). Each `SearchHit` carries what a result row draws: the conversation's `title` and `photo` (a group's, or the other person's in a direct one), its `sender`, and its `matches` — where its text or a file's name says what was asked, in UTF-16 offsets, as a `String`'s. The first page also lists the person's conversations whose name says it (`conversations`), found on the phone. What the module finds and never finds: [Messaging](https://palbase.studio/docs/messaging/overview#search).

```kotlin
val results = pb.messaging.search("toplanti")
results.conversations.forEach { c -> Text(c.title ?: "Chat") } // their names say it: draw them first
results.messages.forEach { hit ->
    Text(hit.title ?: "Chat")
    Text(buildAnnotatedString {
        append(hit.message.text ?: "")
        hit.matches.filter { it.field == SearchMatch.Field.TEXT }.forEach { m ->
            addStyle(SpanStyle(fontWeight = FontWeight.Bold), m.offset.toInt(), (m.offset + m.length).toInt())
        }
    })
}
// More: pb.messaging.search("toplanti", cursor = results.nextCursor) while nextCursor is not null —
// a page may hold fewer messages than asked, even none.
```

A find opens where it was said: `pb.messaging.conversation(hit.conversation.id, at = hit.message.id)` is the conversation's page around it, `focus` naming the message to scroll to and mark. `loadEarlier()` reads back from there and `loadLater()` forward; once it reaches the newest, `hasLater` is false and it reads on live. An answer the conversation's timeline does not show has a `threadRootId`: open its thread at it.

```kotlin
val view = hit.threadRootId?.let { root -> pb.messaging.thread(hit.conversation.id, root, at = hit.message.id) }
    ?: pb.messaging.conversation(hit.conversation.id, at = hit.message.id)
```

### By meaning

With the project's `search_by_meaning` on ([Messaging](https://palbase.studio/docs/messaging/overview#by-meaning)), `search(query, by = SearchBy.MEANING)` finds the messages nearest what the question means, in none of its words: "uçuş saati kaçta" finds "Uçağımız sabah dokuzda Sabiha Gökçen'den kalkıyor". The nearest come first, one page (`nextCursor` is null), each with `score` — how near, 0.3 to 1 — and no `matches`; `conversations` is empty. A hit opens as any does: `conversation(id, at = hit.message.id)`.

```kotlin
try {
    val found = pb.messaging.search("uçuş saati kaçta", by = SearchBy.MEANING)
    found.messages.forEach { hit -> Text("${hit.title}: ${hit.message.text} (${"%.2f".format(hit.score)})") }
} catch (e: PalbaseError) {
    // search_by_meaning_off: the project searches by words alone. too_many_searches: a person asks
    // 30 at once, one more a minute (e.retryAfter). ai_payment_required: the project's AI use is spent.
}
```

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

## A deleted group

When a group's owner or an admin deletes it — or its last member leaves — it goes from everyone's `conversations()` at once, and those who were in it can still report it for 14 days ([Messaging](https://palbase.studio/docs/messaging/overview#moderation)). `pb.messaging.deletedGroups` is a `StateFlow<List<DeletedGroup>>` of the groups the person can still report, the latest to stop first, each with `id`, `title`, `deletedBy` and `reportableUntil`; one goes at its `reportableUntil`. `report` names it by its id with no message; the last 30 messages the person saw in it go with the report. A group the project's server deleted is not among them.

```kotlin
val deleted by pb.messaging.deletedGroups.collectAsState()
deleted.forEach { group -> Text(group.title ?: "a group") }

deleted.firstOrNull()?.let { group ->
    pb.messaging.report(MessagingAPI.ReportRequest(conversationId = group.id, reason = MessagingAPI.ReportRequest.Reason.HARASSMENT, userId = group.deletedBy))
}
```

The title is the one the device had; it is null when the device no longer had the group as the word came — on the deleter's own device now and then.

## Signing out

The phone's copy is kept in the app's own SQLite, in files not backed up. When the person signs out it is dropped, unless `pb.messaging.keepOnSignOut = true` — then it is theirs again when they come back. Whoever signs in next never reads it; and unless copies are kept, the person who signs in drops any other's left there.
