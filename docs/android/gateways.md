> The full documentation index: https://palbase.studio/llms.txt

# Gateways

A [gateway](https://palbase.studio/docs/backend/gateways) is a realtime channel of your backend: a `@Gateway` class that says who may join, the events it sends, the messages its members may send and the ack each one is answered with. `palbase apps:sync` writes each of the backend's gateways into the app's generated client ([Calling Your Backend](https://palbase.studio/docs/android/backend-calls)) as a class of its own. The app joins it with the pattern's values, and writes no channel name, event name or payload type of its own.

## Quick example

For the backend's `RoomGateway` (`@Gateway("room:{roomId}")`, with the events `message` and `welcome` and the message `say`, in [Gateways](https://palbase.studio/docs/backend/gateways#quick-example)), the generated client has `RoomGateway(roomId)`, its events as `RoomGatewayEvent`, and its messages as `RoomGatewaySend`:

<!-- given: fun show(text: String) -->

```kotlin
import studio.palbase.backend.join
import studio.palbase.generated.*

val room = pb.backend.join(RoomGateway(roomId = "42"))   // returns once the backend let the user in

val listening = room.on { event ->
    when (event) {
        is RoomGatewayEvent.Message -> show("${event.payload.from}: ${event.payload.text}")
        is RoomGatewayEvent.Welcome -> show("${event.payload.members} in the room")
    }
}

// The backend's ack, typed: what its @Subscribe("say") returned.
val said: RoomGatewaySayReply = room.send(RoomGatewaySend.Say(RoomGatewaySayMessage(text = "hello")))

room.off(listening)
room.leave()
```

In Compose, hold the handle while the screen is on screen and leave it when the screen goes:

```kotlin
@Composable
fun Room(roomId: String) {
    val lines = remember { mutableStateListOf<String>() }
    LaunchedEffect(roomId) {
        val room = pb.backend.join(RoomGateway(roomId = roomId))
        room.on { event -> if (event is RoomGatewayEvent.Message) lines += event.payload.text }
        try { awaitCancellation() } finally { room.leave() }
    }
    LazyColumn { items(lines) { Text(it) } }
}
```

## Joining

`pb.<name>.join(gateway, history = true)` opens the project's socket if it is not open, and returns once the backend let the signed-in user in. Each `{param}` of the pattern is a constructor argument: a value that is empty or holds a `:` would name another channel, and is refused with `invalid params` before anything is sent.

| Member of the handle | What it does |
|---|---|
| `on { event -> }` | Listens to every event the gateway declares, as its sealed type. Returns a `GatewayRegistration`. |
| `off(registration)` | Stops one listener. |
| `send(message)` | Sends one message and waits for the backend to take it. It returns the ack, typed as the message says, or throws `PBGatewayError`. |
| `leave()` | Drops the handle's listeners and lets go of the channel. |
| `topic` | The channel: `room:42`. |
| `seq` | A durable gateway's number of the last event its channel was sent; `null` on one that keeps nothing. |

Only a signed-in user joins: the access token the socket carries is who they are. Two handles of the same channel share one membership, and the channel is left with the last of them. A gateway with members is one its backend still runs for, so leave a handle when its screen goes.

An event the generated client does not know, from a backend that moved ahead of it, is not delivered, and a listener that throws does not take the socket down. A listener is called on the socket's thread, not the main thread: hand what it gets to state a composable reads, or to the main thread.

## Messages and acks

`send` returns what the backend's `@Subscribe` returned. A message goes to the backend alone, never to the other members, who hear what the backend emits. It throws `PBGatewayError`, whose `reason` says why the message was not taken:

| `reason` | What it means |
|---|---|
| The backend's own word | Its method threw `GatewayRefusal("…")`: `no_commands`, `not_your_turn`. Act on it. |
| `forbidden` | The user may only listen on this channel, or the platform refused with no reason given. |
| `rate_limited` | Past the project's events per second. |
| `unavailable` | The backend could not be asked just then. Worth trying again. |
| `no reply`, `socket closed` | No answer came. The message may have been taken. |
| `not joined` | Nothing was sent: the handle was left, or its socket closed for good. |
| `undecodable reply` | The backend took it, but its ack is not what this client reads: a backend that moved ahead of the app. |

A join that is refused throws `PBGatewayError` too: `unauthorized` when the backend did not let the user in, `unavailable` when it could not be asked, and `rate_limited` past the project's limits. `PBGatewayError` has the reasons the client names as constants: `PBGatewayError.UNAUTHORIZED`, `FORBIDDEN`, `NOT_JOINED`, and the others.

## Durable gateways

A [durable gateway](https://palbase.studio/docs/backend/gateways#durable-gateways) keeps what it sends. A handle that joins one is sent what it keeps first, in order, then what comes after. `join(gateway, history = false)` asks for only what comes after the join. The channel's first handle decides: a second handle of the same channel gets the events from where it joins.

When the socket drops, the channel is joined again after `seq`: the handle is sent what it missed, in order, and nothing twice.

## When the connection drops

The socket reconnects by itself ([Realtime](https://palbase.studio/docs/android/realtime#the-socket)), and every gateway that was joined is joined again with it. An event that a gateway that is not durable sent while the socket was down is not delivered.

When the socket closes for good, every handle on it ends: its listeners are dropped, and `send` throws `not joined`. That happens on a sign-out, or when another user signs in. Join again, as the user who is there now.

## Chat gateways

A gateway declared with `chat: true` carries a chat of the project's agents, which the platform writes into its channel ([AI](https://palbase.studio/docs/backend/ai#a-chat-in-an-app)). Its generated class is a `PBChatGateway`, and joining it returns a `ChatGatewayHandle`. That handle is the gateway's own (`on`, `send`, `leave`) and also has `chat`: the chat's state, folded from what the platform writes there, from the chat's start, then each change as it comes.

```kotlin
import studio.palbase.realtime.ChatGatewayHandle
import studio.palbase.realtime.PBChat

@Composable
fun Support(support: ChatGatewayHandle<SupportGatewayEvent, SupportGatewaySend>) {
    val chat by support.chat.state.collectAsState()
    LazyColumn {
        items(chat.items, key = { it.key }) { item ->
            when (item) {
                is PBChat.Item.Message -> Text(item.message.text)
                is PBChat.Item.Response -> Text(item.response.text)
                is PBChat.Item.Goal -> Text(item.event.kind.value)
                is PBChat.Item.Voice -> Text(item.event.status.value)
            }
        }
    }
}
```

What the user does in the chat (a message, a yes or a no, stop) is the gateway's own typed messages, which its backend acts on: `support.send(SupportGatewaySend.Say(SupportGatewaySayMessage(text = "Merhaba")))`. The chat's state says what is, and never sends.

`support.chat.state` is a `StateFlow<PBChat.State>`, and `support.chat.updates` the same states as a flow that ends when the gateway is left. A change is told after the parts that made it: a run of an answer's text is one change.

| Member of `PBChat.State` | What it is |
|---|---|
| `items` | The conversation in order: `PBChat.Item.Message`, `.Response`, `.Goal` (a word of the chat's goal) and `.Voice` (the chat's voice began or ended). Each has a stable `key`. |
| `messages` | Each member's (or the server's) message: `text`, `author` (`null`: the server), `authorName`, `status` (pending until the agent has it, then delivered or failed), `kind` (text, or voice for a line said in the chat's voice), `attachments`, and `mine`. |
| `responses` | Every answer, a subagent's too, as it began. An answer's `parts` split its text at its tools (`PBChat.Part.Tool`), its subagents (`.Agent`) and the model's reasoning (`.Thinking`). |
| `turn` | The last turn: its `status`, and its `error` or what it is `waiting` on. |
| `waiting` | What waits for the signed-in user: `approvals`, tool calls of their own turns waiting for their yes, and `outputs`, client tools waiting for the app's answer. |
| `goal` | The chat's goal, once one was set. |
| `voice` | The chat's voice, the last that began in it, live or ended. See [Voice](https://palbase.studio/docs/android/voice). |
| `forkedFrom` | A fork's: the chat it was forked from, and the message it was cut before. |

### The chat's past

The channel keeps a day of the chat. `chat.loadOlder(pb, chatId)` reads the page before what the state holds (`GET /ai/chats/{id}/parts`) and folds it in front, each part once: what the state holds is not folded again. `limit` reads that many of the chat's events (1 to 1000, 300 by default); `turns` (1 to 20) reads back to where that many more of the chat's turns open instead — `chat.loadOlder(pb, chatId, turns = 1)` as the chat opens makes its last turn whole, however many thousand parts it holds, read page after page when it is longer than one. Not both. It reads with the member's own session, which the project allows its app's users with its AI settings' `clients` (`Palbase.ai.settings.put`, [AI](https://palbase.studio/docs/backend/ai#chats)). It returns whether there is more before it, and `chat.hasOlder` says the same without reading.

<!-- given: support: ChatGatewayHandle<SupportGatewayEvent, SupportGatewaySend>, chatId: String, fun enoughShown(): Boolean -->

```kotlin
while (support.chat.loadOlder(pb, chatId)) {
    if (enoughShown()) break
}
```

When the project's app reaches no chat of its own, the app's backend can read the page for it: `support.chat.loadOlder { query -> … }` hands the lambda the page asked for (`PBChat.PartsQuery`: `before`, `cursor`, `limit`, `turns`), and the lambda answers it as a `PBChat.PartsPage(parts, nextCursor, turns)` read through a route of yours, its `turns` as palbase/ai's `chats.parts` says it.

### Attachments, tool calls and workspace files

A message's pictures and files are read back with the member's session:

<!-- given: message: PBChat.Message, chatId: String -->

```kotlin
import studio.palbase.realtime.chatAttachment

val picture = message.attachments.first { it.kind == PBChat.AttachmentKind.IMAGE }
val bytes = pb.chatAttachment(chatId, message, picture)
val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
```

`pb.chatToolCall(chatId, callId)` reads a tool call's whole answer, where the channel shows its last 16 KiB. `pb.chatWorkspaceFile(chatId, path)` reads a file of the chat's workspace. Both throw `PalbaseError` like any project call. Attaching a file is the backend's: the app uploads it, and the backend sends the message naming it.

## A chat with no gateway

A chat left on its own channel is followed by the member's own session, with no gateway and no backend route ([AI](https://palbase.studio/docs/backend/ai#a-chat-with-no-gateway)). Add `studio.palbase:palbase-ai`. `pb.ai.chats.stream(chatId)` tells the latest turn whole, then every part as the platform tells it; after a drop it joins the channel again and reads what it missed first, so each part, and each byte of an answer, comes once.

<!-- given: chatId: String -->
```kotlin
import studio.palbase.ai.ai

pb.ai.chats.stream(chatId).collect { part ->
    when {
        part.type == "text" -> print(part.text.orEmpty())           // the answer, placed by part.offset
        part.endsItsTurn -> println("\n— ${part.status}")
        else -> Unit                                                 // message, tool, agent, goal, voice…
    }
}
```

A part is its `type`, its `data` as the stream says it, and `seq`, the chat's own numbering of it (an answer's text has none: it is placed by `offset` in the answer of `responseId`). Follow again from a part you hold with `stream(chatId, afterSeq = …)`; `live = false` reads the past and ends. The channel keeps nothing and may drop a part on a slow connection. The stream looks for what was dropped in the chat's past — after each join, a moment after an answer's text comes with a gap before it, at a turn's end once it saw a loss in that turn, when a turn at work goes silent — and tells what it finds then: place an answer's text by `offset` and order the parts you keep by `seq`, never by when they came. A `reset` cuts the answer back to its `offset`. A part dropped with nothing missing around it may not be told: a screen that must hold a turn whole reads it once it ended, with `pb.ai.api.listChatParts(chatId, turns = 1)`. The flow throws `join_refused` for one who is not a member of the chat (at once, or later, when they are taken out of it), and `no_channel` for a chat whose stream your backend put into a gateway's channel: that one is followed through its gateway, above.

What the member does goes to the chat itself, as them:

<!-- given: chatId: String -->
```kotlin
val sent = pb.ai.chats.send(chatId, text = "Ship it")
val stopped = pb.ai.chats.stop(chatId)      // the turn it stopped; null when none was at work
val chat = pb.ai.chats.get(chatId)          // its title, members, where it runs
```

`approve(chatId, approvalId, approved, reason)` answers an approval of the member's own turn, and `pb.ai.sessions.execution(chatId)` reads where the chat runs. `pb.ai.api` has every call the AI module serves an app, as its contract names them: a chat's messages and parts by page, a tool call's whole answer, a client tool's answer.

`PBChat` folds a chat's parts into its state, and a gateway gives one. A chat followed this way gives the parts themselves.

## A person's own machines

When the project lets its users connect machines of their own ([A person's own machine](https://palbase.studio/docs/backend/ai-machines#a-persons-own-machine)), `pb.ai.machines` is the signed-in person's: their list, the list as it changes, and what they do to a machine of theirs. Add `studio.palbase:palbase-ai`.

```kotlin
import studio.palbase.ai.ai

// The person's machines now, then again each time one changes.
pb.ai.machines.watch().collect { machines ->
    machines.forEach { machine ->
        println("${machine.name} ${machine.state.value} ${machine.lastSeenAt ?: "never"} ${machine.harnesses.orEmpty().map { it.name.value }}")
    }
}
```

`watch()` is a cold flow: collecting it reads the list, follows the person's own channel and reads again when Palbase says the list changed, and once a minute whatever the channel does. It emits a list only when it differs from the last one. A dropped connection does not end it: it ends with an error when the person is refused (`401`, `403`), signs out, or someone else signs in. Cancelling the collection leaves the channel. `list()` and `get(machineId)` read once.

<!-- given: machineId: String -->
```kotlin
pb.ai.machines.cordon(machineId)                  // paused: it takes no new turn
pb.ai.machines.resume(machineId)
pb.ai.machines.delete(machineId, now = true)      // removed whatever it is doing
```

Each machine is its `id`, `name`, `state` (`ONLINE`, `OFFLINE`, or `CORDONED` when it is paused), `lastSeenAt`, `registeredAt` and `harnesses`, the coding CLIs found on it. A machine that is not the person's is `404 not_found` on every call, as one that does not exist. `delete(machineId)` removes a paused machine that holds nothing (`409 machine_not_cordoned`, `409 machine_busy` otherwise).

A machine is enrolled by the app that runs on it, a Mac or a Linux machine ([Enrolling from the app](https://palbase.studio/docs/backend/ai-machines#enrolling-from-the-app)). `pb.ai.machines.keys.create(os, arch, label)` mints its key from a phone too, for an app that hands the key over to the machine itself: it is said once, and refused `403 user_machines_disabled` while the project's setting is off and `409 machine_limit_reached` at the person's limit.

## Related

- [Gateways](https://palbase.studio/docs/backend/gateways): declaring one in the backend
- [AI](https://palbase.studio/docs/backend/ai): chats, their agents and their voice
- [Realtime](https://palbase.studio/docs/android/realtime): the socket the gateways share
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the generated client
