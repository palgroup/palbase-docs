> The full documentation index: https://palbase.studio/llms.txt

# Realtime

`pb.socket` is the project's one realtime connection, shared by every channel the page is on. It opens the first time a channel is joined and never before, so a page that only signs in or reads flags opens none. On it, a channel delivers what is published to it: broadcasts, and the channel's shared state when the channel has one. The client listens, and broadcasts on a channel declared to let it. The project's server broadcasts and writes state with the secret key.

> **Note:** Your own backend's realtime channels are its [gateways](https://palbase.studio/docs/web/gateways), joined through the module `palbase apps:sync` writes: typed events, and messages the backend answers with an ack. This page is the socket under them, and the channels a server declares by name.

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/room.ts
import { pb } from "./lib/palbase";

const room = pb.socket.channel("room:42");

const stop = room.on("broadcast", (frame) => {
  // { type: "broadcast", event, payload }
  console.log(frame.event, frame.payload);
});

try {
  await room.join();
} catch (e) {
  // The server's reason: not declared, not yours, too many channels, …
  console.error(e instanceof Error ? e.message : e, room.refusal);
}

// later:
stop();
room.leave();
```

And the backend that publishes to it:

```ts
// server/src/rooms/rooms.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class RoomsService {
  /** Every subscriber of room:<id> hears it. */
  async announce(roomId: string, text: string): Promise<void> {
    await Palbase.realtime.broadcast({
      body: { messages: [{ topic: `room:${roomId}`, event: "message", payload: { text } }] },
    });
  }
}
```

## Channels

`pb.socket.channel(name)` returns the channel of that name, the same object each time it is asked for. A channel is joined once however many listeners it has.

| Member | What it does |
|---|---|
| `join()` | Joins and resolves once the server took it. Rejects with the server's reason when it did not. |
| `leave()` | Leaves the channel and forgets it: a later `channel(name)` is a new one. |
| `on(event, listener)` | Listens to one event. Returns the unsubscribe. A listener that throws does not take the socket down. |
| `push(event, payload)` | Sends one event on the joined channel and resolves with what became of it, `{ status, response }`: `ok`, `error` with the server's `reason`, or `timeout` (`no reply`) when nothing answered in ten seconds. It never rejects. On a channel that is not joined it sends nothing and resolves `error`, `not joined`. |
| `onClosed(listener)` | Told when what was joined ends for good: a sign-out, or another user's sign-in. Not a drop, after which the channel is joined again. Returns the unsubscribe. |
| `state` | `closed`, `joining`, `joined` or `refused`. |
| `refusal` | Why the server refused the last join, when it did. |

The events a channel delivers:

| Event | Payload |
|---|---|
| `broadcast` | `{ type: "broadcast", event, payload }`: one published event. A broadcast reaches every subscriber but the one that sent it. |
| `state_snapshot` | `{ seq, entries }`: the channel's whole state, on join. Each entry is `{ v, life }`. |
| `state_diff` | `{ from_seq, seq, set, del }`: what changed since `from_seq`. A client holding exactly `from_seq` applies it. |

State is a keyed map per channel that outlives the connections reading it. A server writes it with `Palbase.realtime.writeState`, and a channel declared with `state_read` hands it to its subscribers. A `durable` entry stays until it is removed. An `ephemeral` one is its writer's presence, gone when the writer leaves.

Names are `:`-separated segments, 255 bytes at most. On the wire each carries a `realtime:` prefix, and the client adds it for you.

## Who may join

A channel name is a string a client chooses, so proving who you are says nothing about which channels are yours. The project's server **declares** its channels (`PUT /realtime/channels` with the secret key, or `Palbase.realtime.putChannels`), and a channel no declaration matches belongs to no one:

| Declared `kind` | Who joins |
|---|---|
| `owner` | The pattern's one `{name}` segment is the joining user: `user:{uid}` is joined by that user alone, who may do everything on it. |
| `public` | Any signed-in user of the project, with the rights the declaration gives: `publish`, `state_read`, `state_write`. |

Patterns match in their order, the first one deciding. A declared channel is joined only by a signed-in user, whose access token travels in each join. See [Channels](https://palbase.studio/docs/backend/channels).

Some namespaces are the platform's, and no declaration can claim them:

| Channel | Who joins | What it carries |
|---|---|---|
| `flags:<ref>` | Anyone, signed in or not | The project's flags changed. See [Flags](https://palbase.studio/docs/web/flags). |
| `flags:<ref>:<user_id>` | That user | Their own flag values changed. |
| `roles:<ref>:<user_id>` | That user | Their permissions, as state. |

A refused join rejects with the server's reason: `unauthorized`, `forbidden`, `invalid_topic`, `rate_limited`, `too_many_channels`, `state_budget` or `unavailable`. Only `unavailable` is worth trying again. A user who is turned away mid-connection, because a declaration changed or their session ended, gets the channel closed under them (`state` becomes `closed`). Ask again and the server answers on its merits.

A client broadcasts on a channel declared with `publish`:

```ts
// src/typing.ts
import { pb } from "./lib/palbase";

export async function sayTyping(roomId: string): Promise<void> {
  const room = pb.socket.channel(`room:${roomId}`);
  await room.join();
  // Every other subscriber hears { type: "broadcast", event: "typing", payload }; the sender does not.
  const reply = await room.push("broadcast", { type: "broadcast", event: "typing", payload: { typing: true } });
  // A refusal is answered (not declared with publish, over the rate); a broadcast the server took is answered by no one.
  if (reply.status === "error") console.warn("not sent:", reply.response.reason);
}
```

A broadcast the server took is not answered, so its `push` resolves `timeout` after ten seconds: do not hold the page on it. The channel's state is the server's to write. What a client must not be able to say, publish from your backend, which decides what reaches a channel.

## One socket, one user

The socket opens at `wss://<url's host>/realtime/v1/websocket` with the publishable key in its `apikey` parameter, because a browser cannot set a header on a WebSocket. Who the client is, is the access token each join carries. When the session is refreshed, the new token goes to every joined channel without leaving it.

The socket is one person's. When someone signs in, signs out, or the session expires, the client closes it, and every channel with it. Join again for the user who is there now:

```ts
// src/rejoin.ts
import { pb } from "./lib/palbase";

async function joinMine(): Promise<void> {
  const session = await pb.auth.currentSession();
  if (!session) return;
  const mine = pb.socket.channel(`user:${session.userId}`);
  mine.on("broadcast", (frame) => console.log("for me:", frame.event, frame.payload));
  await mine.join();
}

pb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN") void joinMine();
});
await joinMine();
```

## When the connection drops

The socket sends a heartbeat every 25 seconds. One that goes unanswered closes the socket, because a network that went away without a close leaves a socket half-open. A socket that drops is opened again after 0.5, 1, 2, 5, 10, then every 30 seconds, each pause jittered by ±20%, and every channel that was joined is joined again. A broadcast published while the socket was down is not delivered: broadcasts are delivered at most once. A channel's state comes back whole with the snapshot of the new join. `pb.socket.reconnects` counts the reopens, for your own diagnostics.

`pb.socket.disconnect()` closes it for good. The next `join()` opens a new one.

## Where the socket opens

The socket's address is built from the client's `url`: `wss://k3xq81w4m.palbase.studio/realtime/v1/websocket`, at the project's address, with the publishable key in its query. A WebSocket is not preflighted, and the project's address takes a socket from a page on any site, so the browser opens it there directly. See [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser).

## Limits

The project holds its clients to limits the platform sets and the project may lower (`PUT /realtime/limits` from a server): connections open at once, broadcasts and state writes per second, joins per second, channels per connection. A frame over 1 MiB closes the socket. A project over its connection limit, or whose realtime quota is used up, is refused a new socket.

## Related

- [Gateways](https://palbase.studio/docs/web/gateways) — your backend's channels, typed, with messages and acks
- [Channels](https://palbase.studio/docs/backend/channels) — declaring who may join what
- [Realtime in your backend](https://palbase.studio/docs/backend/realtime) — broadcasting and writing state
- [Flags](https://palbase.studio/docs/web/flags) — the change notices on `flags:<ref>`
- [Auth](https://palbase.studio/docs/web/auth) — the session the socket belongs to
- [Overview](https://palbase.studio/docs/web/overview) — the client, and calling the project from a browser
