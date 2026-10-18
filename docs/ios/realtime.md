> The full documentation index: https://palbase.studio/llms.txt

# Realtime

`pb.realtime` (the `PalbaseRealtime` product) is the project's channels on its one realtime socket: what members broadcast, and a state every member sees the same. The socket, `pb.socket`, is in the core: it opens the first time a channel is joined and never before, so an app that only signs in or captures analytics opens none. Flags' live updates, consent and your backend's [gateways](https://palbase.studio/docs/ios/gateways) ride the same socket.

> **Note:** Your own backend's realtime channels are its [gateways](https://palbase.studio/docs/ios/gateways), joined through the client `palbase apps:sync` generates: typed events, and messages the backend answers with an ack. This page is the channels the project declares by name.

## Quick example

```swift
import Palbase
import PalbaseRealtime

func follow(roomId: String) async throws {
    let room = pb.realtime.channel("room:\(roomId)")

    let stopMessages = await room.onBroadcast("message") { payload in
        if case .string(let text)? = payload["text"] { print("message:", text) }
    }
    room.onState { entries in
        print("\(entries.count) here")
    }

    // Throws the server's reason when it does not let the user in.
    try await room.join()

    // Presence: an ephemeral entry lives as long as this connection.
    try await room.set("typing:me", .bool(true), life: .ephemeral)
    try await room.broadcast("message", ["text": .string("hello")])

    // When the screen goes:
    await stopMessages()
    await room.leave()
}
```

Payloads and values are `JSONValue`: `.string`, `.number`, `.bool`, `.object`, `.array`, `.null`, and `decode(_:)` reads one as a `Decodable` type of yours.

## Channels

`pb.realtime.channel(_:)` returns a `RealtimeChannel` for that name. A channel is joined once however many listeners it has.

| Member | What it does |
|---|---|
| `join()` | Joins; returns once the server let the user in, throws its reason when it did not. |
| `leave()` | Leaves, and forgets the state it held. |
| `onBroadcast(_:_:)` | Listens to one event's broadcasts, a member's or the project's server's. Returns what stops it (an `async` closure). |
| `broadcast(_:_:)` | Sends an event to the channel's other members; the sender does not hear its own. The call does not wait for the server: one it refuses comes to `onRefused`. |
| `onRefused(_:)` | Listens to the server refusing a broadcast: `{event, reason}`, with `forbidden`, `rate_limited`, … Returns what stops it. |
| `entries` | The channel's state as the server last told it: `[String: Entry]`, each an `Entry` with its `value` and its `life`. |
| `onState(_:)` | Told the whole state each time it changes. Returns what stops it. |
| `set(_:_:life:)` | Writes one entry. The state changes when the server says so, for every member alike. |
| `deleteOwn(_:)` | Removes one entry this membership wrote: every other entry is its writer's. |
| `name` | The channel's name. |

An entry's `life` is `.durable` (the default), which stays until it is removed, or `.ephemeral`, which is its writer's presence and goes when the writer's connection does. A member that joins is handed the whole state, and each change after it; one that missed a change asks for the whole state again by itself.

Names are `:`-separated segments, 255 bytes at most.

## Who may join

A channel name is a string the app chooses, so being signed in says nothing about which channels are the user's. The project's server **declares** its channels ([Channels](https://palbase.studio/docs/backend/channels), `PUT /realtime/channels` with the secret key), and a channel no declaration matches belongs to no one:

| Declared `kind` | Who joins |
|---|---|
| `owner` | The pattern's one `{name}` segment is the joining user: `user:{uid}` is joined by that user alone, who may do everything on it. |
| `public` | Any signed-in user of the project, with the rights the declaration gives: `publish` (broadcast), `state_read`, `state_write`. |

A refused join throws the server's reason: `unauthorized`, `forbidden`, `invalid_topic`, `rate_limited`, `too_many_channels`, `state_budget` or `unavailable`. Only `unavailable` is worth trying again. Some namespaces are the platform's, and no declaration can claim them: `flags:<ref>` and `flags:<ref>:<user>` carry [flag](https://palbase.studio/docs/ios/flags) changes, and the SDK joins them itself.

## The socket

`pb.socket.status` is an `@Observable` on the main actor. A view that reads `state` is drawn again when it changes:

```swift
import Palbase
import SwiftUI

struct ConnectionBadge: View {
    var body: some View {
        let state = pb.socket.status.state
        Label(state.rawValue, systemImage: state == .connected ? "bolt.fill" : "bolt.slash")
    }
}
```

| `state` | What it means |
|---|---|
| `idle` | Never opened: nothing has joined a channel yet. |
| `connecting` | Being opened. |
| `connected` | Open; the channels wanted are joined on it. |
| `reconnecting` | Dropped (the network went, a heartbeat went unanswered), and opened again after a pause. |
| `disconnected` | Closed by the client: someone signed out or in, or no channel is wanted. |

`status.since` is when it last changed, and `status.changes` is an `AsyncStream` of every change in order, where a view reading `state` is drawn with the newest only.

The socket sends a heartbeat every 25 seconds. One that goes unanswered closes the socket, and a socket that drops is opened again after 0.5, 1, 2, 5, 10, then every 30 seconds, each pause jittered, with every channel still wanted joined again. A broadcast sent while the socket was down is not delivered; a channel's state comes back whole with the new join. When the session is refreshed, the new token goes to every joined channel without leaving it.

The socket is one person's. When someone signs in, signs out, or the session ends, the client closes it, and every channel with it, and a channel forgets the state it held. Join again for the user who is there now, for example from `pb.auth.changes` or a SwiftUI `.task(id: pb.auth.state.userId)`.

## Limits

The project holds its clients to limits the platform sets and the project may lower (`PUT /realtime/limits` from a server): connections open at once, broadcasts and state writes per second, joins per second, channels per connection. A project over its connection limit, or whose realtime quota is used up, is refused a new socket.

## Related

- [Gateways](https://palbase.studio/docs/ios/gateways): your backend's channels, typed, with messages and acks
- [Channels](https://palbase.studio/docs/backend/channels): declaring who may join what
- [Realtime in your backend](https://palbase.studio/docs/backend/realtime): broadcasting and writing state from a server
- [Web Realtime](https://palbase.studio/docs/web/realtime): the same channels in a browser
