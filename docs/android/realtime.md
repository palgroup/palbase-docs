> The full documentation index: https://palbase.studio/llms.txt

# Realtime

`pb.realtime` (`studio.palbase:palbase-realtime`) is the project's channels: what members broadcast on them, and a state each channel's members share. The channels go over the project's one realtime socket, `pb.socket`, which every module that needs one shares. It opens the first time a channel is joined and never before, so an app that only signs in or captures analytics opens none.

> **Note:** Your own backend's realtime channels are its gateways, joined through the generated client: typed events, and messages the backend answers with an ack ([Gateways](https://palbase.studio/docs/android/gateways)). This page is the socket under them, and the channels the project declares by name.

## Quick example

```kotlin
import studio.palbase.realtime.realtime
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

val room = pb.realtime.channel("room:42")

val stop = room.onBroadcast("message") { payload ->
    println("${payload["from"]}: ${payload["text"]}")
}
room.onRefused { refusal -> println("refused: $refusal") }   // {event, reason}

room.join()   // throws the server's reason when it does not let the user in
room.broadcast("message", buildJsonObject { put("from", "ada"); put("text", "hello") })

// later:
stop()
room.leave()
```

## Channels

`pb.realtime.channel(name)` is the channel of that name. Names are `:`-separated segments.

| Member | What it does |
|---|---|
| `join()` | Joins, and returns once the server let the user in. Throws `PalbaseError` when it did not ([Who may join](#who-may-join)). |
| `leave()` | Leaves the channel. |
| `onBroadcast(event) { payload -> }` | Listens to one broadcast event, a member's or the platform's. Returns what stops it. |
| `broadcast(event, payload)` | Sends an event to the channel's other members; the sender does not hear its own. The server says nothing of one it takes. |
| `onRefused { refusal -> }` | Listens to the server refusing a broadcast: `{event, reason}`, with reasons such as `forbidden` and `rate_limited`. |
| `entries` | The channel's state as the server last told it: a `Map<String, RealtimeChannel.Entry>`, each a `value` and its `life`. |
| `onState { entries -> }` | Called with the whole state each time it changes. Returns what stops it. |
| `set(key, value, life)` | Writes one entry, and returns once the server took it; a refusal is thrown. The state changes when the server says so (its next change), for every member alike. |
| `deleteOwn(key)` | Removes an entry this membership wrote, as `set` does. Every other member's entry stays theirs. |

A channel's state is a keyed map that outlives the connections reading it. A `Life.DURABLE` entry (the default) stays until it is removed. A `Life.EPHEMERAL` one is its writer's presence, gone when the writer leaves:

```kotlin
import kotlinx.serialization.json.JsonPrimitive

room.onState { entries ->
    val here = entries.filterValues { it.life == RealtimeChannel.Life.EPHEMERAL }.keys
    println("in the room: $here")
}
room.join()
room.set("presence:${pb.auth.userId.value}", JsonPrimitive("online"), RealtimeChannel.Life.EPHEMERAL)
```

The state arrives whole as a snapshot when the channel is joined, then as changes. A change that does not follow from the state held means something was missed, and the client asks for the whole state again. While the channel is not joined, `entries` is empty. Listeners are called on the socket's thread.

## Who may join

A channel name is a string a client chooses, so proving who you are says nothing about which channels are yours. The project **declares** its channels, and a channel that no declaration matches belongs to no one. A server declares them with `PUT /realtime/channels` and the secret key, or from a terminal:

```sh
palbase realtime:channels:set --file channels.json
```

```json
{
  "channels": [
    { "pattern": "user:{uid}", "kind": "owner" },
    { "pattern": "room:{id}", "kind": "public", "publish": true, "state_read": true, "state_write": true }
  ]
}
```

| `kind` | Who joins |
|---|---|
| `owner` | The pattern's one `{name}` segment is the joining user: `user:{uid}` is joined by that user alone, who may do everything on it. |
| `public` | Any signed-in user of the project, with the rights the declaration gives: `publish` (broadcast), `state_read`, `state_write`. |

Patterns match in their order, and the first one decides. A declared channel is joined only by a signed-in user, whose access token goes with each join. See [Channels](https://palbase.studio/docs/backend/channels).

A refused join throws `PalbaseError` with the code `join_refused` and the server's reply in its `body`: `unauthorized`, `forbidden`, `invalid_topic`, `rate_limited`, `too_many_channels`, `state_budget` or `unavailable`. Only `unavailable` is worth trying again. A join that got no answer at all is `join_failed`.

## The socket

`pb.socket.status` is the socket's connection as a `StateFlow`, and `pb.socket.statusChanges` every change in order:

| `RealtimeSocket.ConnectionState` | What it means |
|---|---|
| `IDLE` | Never opened: nothing has joined a channel yet. |
| `CONNECTING` | Being opened. |
| `CONNECTED` | Open, and the channels wanted are joined on it. |
| `RECONNECTING` | Dropped (the network went, a heartbeat was not answered), and opened again after a pause. |
| `DISCONNECTED` | Closed by the client: the user signed out, or no channel is wanted any more. |

```kotlin
@Composable
fun Connection() {
    val status by pb.socket.status.collectAsState()
    if (status == RealtimeSocket.ConnectionState.RECONNECTING) Text("Reconnecting…")
}
```

The socket sends a heartbeat every 25 seconds. A socket that drops is opened again after 0.5, 1, 2, 5, 10, then every 30 seconds, each pause jittered, and every channel still wanted is joined again. A broadcast sent while the socket was down is not delivered: broadcasts are delivered at most once. A channel's state comes back whole with the snapshot of the new join. `pb.socket.reconnects` counts the reopens.

### One socket, one user

The socket opens at `wss://<ref>.palbase.studio/realtime/v1/websocket`, the project's address. The publishable key goes in its `x-api-key` header, never in the address. When the session is bound to the device, the user's token and a proof signed by the device's key go there instead. Who the user is, is the access token each join carries, and a refreshed token is pushed to the joined channels without leaving them.

The socket is one person's. When the user signs out, someone else signs in, or the session ends, the client closes it, and every channel with it. Join again for the user who is there now:

```kotlin
import studio.palbase.session.AuthEvent

suspend fun joinMine() {
    val user = pb.auth.userId.value ?: return
    val mine = pb.realtime.channel("user:$user")
    mine.onBroadcast("note") { payload -> println("for me: $payload") }
    mine.join()
}

// scope: a CoroutineScope of the app's own.
pb.auth.onChange { event, _ ->
    if (event == AuthEvent.SIGNED_IN) scope.launch { joinMine() }
}
```

`pb.socket.disconnect()` closes the socket. The next join opens a new one.

## Limits

The project holds its clients to limits the platform sets and the project may lower (`PUT /realtime/limits` from a server, or `palbase realtime:limits:set`): connections open at once, broadcasts and state writes per second, joins per second, channels per connection. A frame over 1 MiB closes the socket. A project over its connection limit, or whose realtime quota is used up, is refused a new socket.

## Related

- [Gateways](https://palbase.studio/docs/android/gateways): your backend's channels, typed, with messages and acks
- [Channels](https://palbase.studio/docs/backend/channels): declaring who may join what
- [Realtime in your backend](https://palbase.studio/docs/backend/realtime): broadcasting and writing state from a server
- [Flags](https://palbase.studio/docs/android/flags): kept current over the same socket
