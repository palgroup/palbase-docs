> The full documentation index: https://palbase.studio/llms.txt

# Gateways

A [gateway](https://palbase.studio/docs/backend/gateways) is a realtime channel of your backend: a `@Gateway` class that says who may join, the events it sends, the messages its members may send and the ack each one is answered with. `palbase apps:sync` writes each of the backend's gateways into the app's generated client ([Calling Your Backend](https://palbase.studio/docs/android/backend-calls)) as a class of its own. The app joins it with the pattern's values, and writes no channel name, event name or payload type of its own.

## Quick example

For the backend's `RoomGateway` (`@Gateway("room:{roomId}")`, with the events `message` and `welcome` and the message `say`, in [Gateways](https://palbase.studio/docs/backend/gateways#quick-example)), the generated client has `RoomGateway(roomId)`, its events as `RoomGatewayEvent`, and its messages as `RoomGatewaySend`:

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

The channel keeps a day of the chat. `chat.loadOlder(pb, chatId)` reads the page before what the state holds (`GET /ai/chats/{id}/parts`) and folds it in front, each part once. It reads with the member's own session, which the project allows its app's users with its AI settings' `clients` (`Palbase.ai.settings.put`, [AI](https://palbase.studio/docs/backend/ai#chats)). It returns whether there is more before it, and `chat.hasOlder` says the same without reading.

```kotlin
while (support.chat.loadOlder(pb, chatId)) {
    if (enoughShown()) break
}
```

When the project's app reaches no chat of its own, the app's backend can read the page for it: `support.chat.loadOlder { query -> … }` hands the lambda the page asked for (`PBChat.PartsQuery`: `before`, `cursor`, `limit`), and the lambda answers it as a `PBChat.PartsPage(parts, nextCursor)` read through a route of yours.

### Attachments, tool calls and workspace files

A message's pictures and files are read back with the member's session:

```kotlin
import studio.palbase.realtime.chatAttachment

val picture = message.attachments.first { it.kind == PBChat.AttachmentKind.IMAGE }
val bytes = pb.chatAttachment(chatId, message, picture)
val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
```

`pb.chatToolCall(chatId, callId)` reads a tool call's whole answer, where the channel shows its last 16 KiB. `pb.chatWorkspaceFile(chatId, path)` reads a file of the chat's workspace. Both throw `PalbaseError` like any project call. Attaching a file is the backend's: the app uploads it, and the backend sends the message naming it.

## Related

- [Gateways](https://palbase.studio/docs/backend/gateways): declaring one in the backend
- [AI](https://palbase.studio/docs/backend/ai): chats, their agents and their voice
- [Realtime](https://palbase.studio/docs/android/realtime): the socket the gateways share
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the generated client
