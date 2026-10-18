> The full documentation index: https://palbase.studio/llms.txt

# Realtime

Every project has realtime: **channels** its clients join over one socket, a **broadcast** on a channel that reaches every subscriber, and a **shared state** per channel — keyed entries every subscriber with state access reads, a snapshot when it joins and the changes after. Clients join and listen ([Web Realtime](https://palbase.studio/docs/web/realtime)). Your backend publishes as the project's server, with the secret key: `Palbase.realtime` in a `palbase/backend` app, `createServer(…).realtime` anywhere else. Who may join which channel is the project's [channel declaration](https://palbase.studio/docs/backend/channels).

## Quick example

```ts
// src/modules/orders/live.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class OrderLive {
  /** Tells the order's owner, on their own channel, that its status changed. */
  async statusChanged(userId: string, orderId: string, status: string): Promise<void> {
    await Palbase.realtime.broadcast({
      body: { messages: [{ topic: `orders:${userId}`, event: "status", payload: { orderId, status } }] },
    });
  }
}
```

With `orders:{uid}` declared as an `owner` channel ([Channels](https://palbase.studio/docs/backend/channels)), the signed-in user — and only they — joins `orders:<their id>` and hears it as a `broadcast`:

```ts
// watch.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function watch(userId: string, onStatus: (change: unknown) => void): Promise<() => void> {
  const channel = pb.socket.channel(`orders:${userId}`);
  const off = channel.on("broadcast", (frame) => {
    if (frame.event === "status") onStatus(frame.payload);
  });
  await channel.join(); // refused unless the declaration lets this user join
  return () => {
    off();
    channel.leave();
  };
}
```

## Broadcast

`POST /realtime/broadcast` publishes 1 to 100 events in one call, each `{ topic, event, payload }`:

| Field | What it is |
|---|---|
| `topic` | The channel's name, such as `orders:usr_123` — without the `realtime:` prefix the socket carries. |
| `event` | The event's name, which the client reads as the frame's `event`. |
| `payload` | Any JSON. |

It answers `202` with how many were published. A broadcast reaches every subscriber on every replica of realtime, but the one that sent it — and the server is no subscriber, so a server broadcast reaches them all.

**A broadcast is delivered at most once.** A client that was not on the channel at that moment — offline, reconnecting, not joined yet — does not get it later, and nothing is kept. That makes a broadcast a *nudge*: "order 42 changed, look again". What a client must not miss belongs in your database, or in the channel's state.

## Revalidate

`POST /realtime/revalidate` asks every replica to decide again, now, who may be on channels whose decision may no longer hold, and drops the members who may not. It names one channel (`topic`), or every channel of a pattern whose named parameters have the values given (`pattern` and `params`), and optionally one user's memberships alone (`user`). With a `topic` and no `user`, `end: true` ends the channel instead: every member is dropped without being asked, and what a durable channel kept is forgotten. It answers `202`. A dropped member's client is told the channel closed, and its rejoin is decided on the merits. Without it, a decision holds until the user's token runs out, fifteen minutes at most.

## Shared state

Each channel has a keyed state that outlives any one connection. Your backend writes it with `POST /realtime/state`, 1 to 100 operations a call:

```ts
// src/modules/boards/board-state.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class BoardState {
  async setCard(boardId: string, cardId: string, card: { title: string; column: string }): Promise<void> {
    await Palbase.realtime.writeState({ body: { ops: [{ topic: `board:${boardId}`, key: cardId, value: card }] } });
  }

  async removeCard(boardId: string, cardId: string): Promise<void> {
    await Palbase.realtime.writeState({ body: { ops: [{ topic: `board:${boardId}`, key: cardId, delete: true }] } });
  }
}
```

- **Durable.** Entries the server writes stay until they are removed. A subscriber that joins gets the whole state (a `state_snapshot` frame), then what changed as it changes (`state_diff`); a client that lost the thread asks for it all again (`state_resync`).
- **Small.** A value is any JSON, 16 KiB at most, and each channel has a budget: a write past it is refused with `422`, and the operations before it in the call stay applied.
- **Read by subscribers with state access.** Who has it is the declaration's `state_read` (and who may write from the client, `state_write`) — see [Channels](https://palbase.studio/docs/backend/channels).

Clients may also write **ephemeral** entries — their own presence — which are gone when they leave.

## Limits

`getLimits()` reads the limits the project holds its clients to, and the platform's above them; `putLimits({ body })` sets them: connections open at once (`max_connections`), broadcasts and state writes per second (`max_events_per_second`), joins per second (`max_joins_per_second`), and channels on one connection (`max_channels_per_connection`). `null` is the platform's own, and a value above the platform's has no effect beyond it. Studio's **Realtime** screen shows and sets the same limits, and can send a test message.

## The socket, from the client's side

The socket is `GET /realtime/v1/websocket` at the project's address — Phoenix Channels v2 frames, one socket per client for every channel it is on. The publishable key opens it; a client says who it is with the access token each join carries, so the user's rights on a channel are decided per join and again when the declaration changes. The web SDK speaks it for you (`pb.socket`): it opens on the first join, sends a heartbeat every 25 s, reconnects with growing pauses, and joins its channels again after a drop.

Your backend never subscribes: `palbase/server` has no socket. What a client sends that the server must act on is a call to one of your backend's routes.

## Channel names

A channel is `:`-separated segments: `orders:<user_id>`, `board:7f3a`, `game:42:chat`, 255 bytes at most. The namespaces `roles:`, `flags:`, `messaging:` and `debug:` are the platform's — flags' live updates travel on `flags:<ref>` and `flags:<ref>:<user_id>`, a user's permission set on `roles:<ref>:<user_id>`. A channel the declaration does not match belongs to no one, and no client may join it.

## The `Realtime` service

A backend broadcasts with `Realtime`: `Realtime.broadcast(channel, event, payload?)`, and a channel's state with `Realtime.state.set(channel, key, value)` and `Realtime.state.clear(channel, key)`. Each answers `{ data, error, status }`: the platform taking it, not every subscriber receiving it; it never fails the handler.

```ts
// src/modules/projects/project-signal.service.ts
import { Injectable, Realtime } from "palbase/backend";

@Injectable()
export class ProjectSignal {
  async changed(projectId: string, what: string): Promise<void> {
    await Realtime.broadcast(`project:${projectId}`, what, {});
  }
}
```

## Related

- [Gateways](https://palbase.studio/docs/backend/gateways) — a `palbase/backend` app's own realtime channels
- [Channels](https://palbase.studio/docs/backend/channels) — who may join, publish and write state
- [Web Realtime](https://palbase.studio/docs/web/realtime) — joining and listening in the browser
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals and retries
- [Flags](https://palbase.studio/docs/backend/flags) — the live updates that ride the same socket
