> The full documentation index: https://palbase.studio/llms.txt

# Gateways

A gateway is a realtime channel of your app: a class marked `@Gateway(pattern, options)` and listed in a module's `providers`. Its pattern names the channels it is: `room:{roomId}` is the gateway of `room:42`, `room:43`, …, each a channel of its own. The class says who may join, the events it sends, the messages its members may send and the ack each one is answered with, and it is told when a channel fills and when it empties.

A gateway is the one way an app talks realtime to your backend. `palbase apps:sync` writes each app a typed client of the backend's gateways ([Web Gateways](https://palbase.studio/docs/web/gateways)): the app joins `RoomGateway` with `{ roomId }`, and writes no channel name, event name or payload type of its own.

## Quick example

The rooms, and who is in each:

```ts
// src/modules/rooms/rooms.service.ts
import { Injectable } from "palbase/backend";

export interface RoomMessage {
  id: string;
  from: string;
  text: string;
}

// Kept in memory to keep the example small; a real app keeps its rooms in its database.
@Injectable()
export class RoomsService {
  private readonly members = new Map<string, Set<string>>();

  add(roomId: string, userId: string): void {
    this.members.set(roomId, (this.members.get(roomId) ?? new Set()).add(userId));
  }

  isMember(roomId: string, userId: string): boolean {
    return this.members.get(roomId)?.has(userId) === true;
  }

  post(from: string, text: string): RoomMessage {
    return { id: crypto.randomUUID(), from, text };
  }
}
```

The gateway:

```ts
// src/modules/rooms/room.gateway.ts
import { Authorize, Gateway, GatewayRefusal, OnConnect, Subscribe, z } from "palbase/backend";
import type { GatewayAuthorizeContext, GatewayContext, GatewayGrant, GatewayMessageContext } from "palbase/backend";
import { RoomsService } from "./rooms.service";

export const Say = z.object({ text: z.string().min(1).max(2000) });
export const Said = z.object({ id: z.string() });
export const Message = z.object({ id: z.string(), from: z.string(), text: z.string() });
export const Welcome = z.object({ members: z.number() });

// room:<id>, one channel per room. Its members hear `message`; they send `say`.
@Gateway("room:{roomId}")
export class RoomGateway {
  static readonly events = { message: Message, welcome: Welcome };

  constructor(private readonly rooms: RoomsService) {}

  // Who may join: the room's members, and no one else.
  @Authorize()
  enter(ctx: GatewayAuthorizeContext): GatewayGrant {
    return this.rooms.isMember(ctx.params.roomId, ctx.user.id);
  }

  // Said to the member who joined, alone.
  @OnConnect()
  joined(ctx: GatewayContext): void {
    ctx.emit("welcome", { members: ctx.count });
  }

  // A member's message, checked against Say before this runs. What it returns is the member's ack.
  @Subscribe("say", Say, { reply: Said })
  say(ctx: GatewayMessageContext<z.infer<typeof Say>>): z.infer<typeof Said> {
    if (ctx.payload.text.startsWith("/")) throw new GatewayRefusal("no_commands");
    const message = this.rooms.post(ctx.user.id, ctx.payload.text);
    ctx.emit("message", message);
    return { id: message.id };
  }
}
```

A route that makes the user a member, and one that posts to a room from outside it:

```ts
// src/modules/rooms/rooms.controller.ts
import { Body, Controller, Forbidden, Palbase, Param, Post, User, type UserT } from "palbase/backend";
import { RoomGateway, Say } from "./room.gateway";
import { RoomsService } from "./rooms.service";

@Controller("/rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  // From now on the gateway lets this user into room:<roomId>.
  @Post("/{roomId}/members")
  join(@Param("roomId") roomId: string, @User() user: UserT): void {
    this.rooms.add(roomId, user.id);
  }

  // A message posted over HTTP reaches the room's members as one said in it.
  @Post("/{roomId}/messages")
  post(@Param("roomId") roomId: string, @Body(Say) body: { text: string }, @User() user: UserT): { id: string } {
    if (!this.rooms.isMember(roomId, user.id)) throw new Forbidden("not a member of this room");
    const message = this.rooms.post(user.id, body.text);
    Palbase.gateways.to(RoomGateway, { roomId }).emit("message", message);
    return { id: message.id };
  }
}
```

```ts
// src/modules/rooms/rooms.module.ts
import { Module } from "palbase/backend";
import { RoomGateway } from "./room.gateway";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({ controllers: [RoomsController], providers: [RoomsService, RoomGateway] })
export class RoomsModule {}
```

A gateway is a provider like any other: its module lists it in `providers`, it takes its dependencies by constructor, and it is built once, so what one method starts another can stop. A `@Gateway` that no module lists stops the boot by name, and so does a class that is both a controller and a gateway.

## Options

| Option | What it is | Default |
|---|---|---|
| `access` | Who may join, with no method of yours: `"owner"`, the signed-in user whose id the pattern's one `{param}` is; `"public"`, any signed-in user. Left out, an `@Authorize` method decides. | none |
| `durable` | Keeps what it sends: `true` for a day, or `{ keepSeconds }` from 1 to 604800 (a week). See [Durable gateways](#durable-gateways). | not kept |
| `graceMs` | How long the channel is held after its last member left before it is empty (`@OnEmpty`), in milliseconds. | 60000 |
| `publish` | Its members may broadcast to one another on the channel. A gateway with no method only: one with methods takes its members' messages itself (`@Subscribe`). | `false` |
| `chat` | It carries a chat of the project's agents: its event `chat` is the platform's, and every generated client holds the chat's state. Kept a day unless `durable` says how long. See [AI](https://palbase.studio/docs/backend/ai#a-chat-in-an-app). | `false` |

Who may join is said once: `access` or an `@Authorize` method, never both and never neither. The boot refuses either mistake by name.

## Patterns

A pattern is `:`-separated segments, as a channel's name is. A segment written `{name}` takes exactly one non-empty segment of the channel, and the method is given it in `ctx.params`. Any other segment matches itself.

| Pattern | Its channels | Not its channels |
|---|---|---|
| `lobby` | `lobby` | `lobby:2` |
| `room:{roomId}` | `room:42` | `room`, `room:42:chat` |
| `game:{gameId}:team:{team}` | `game:7:team:red` | `game:7:team` |

A pattern is 255 bytes at most, has no `/` and no control character, and names each `{param}` once. The namespaces `roles:`, `flags:`, `messaging:` and `debug:` are the platform's. A pattern that breaks one of these rules is refused when its class is declared.

When two of an app's patterns match one channel, the more specific one decides it: a named segment beats a `{param}`, from the left, so `lobby:staff` decides `lobby:staff` and `lobby:{id}` every other lobby. Two gateways of the same channels (`room:{roomId}` and `room:{id}`) are refused at boot. Two of the project's machines that declare the same channels have neither: the channel is refused until one of them gives it up.

The class's name is the gateway's name in every generated client (`RoomGateway`), so it is an identifier and one of a kind in the app.

## Who may join

Only a signed-in user joins a gateway. The access token the client's socket carries is who they are.

With `access: "owner"`, the pattern's one `{param}` must be the joining user's id: `inbox:{userId}` is joined by that user alone. With `access: "public"`, any signed-in user of the project joins. Either way no code of yours decides it.

Otherwise its `@Authorize` method decides, at each join. It is given the user and the channel's parameters, and it runs as that user, in a transaction of its own: `Database` is theirs, and [row-level security](https://palbase.studio/docs/backend/row-level-security) holds. It answers a grant:

| Answer | Means |
|---|---|
| `true` | In, to hear and to send. |
| `{ write: false }` | In, to hear. A message they send is refused (`forbidden`). |
| `{ read: false }`, `false`, `null`, `undefined` | Not in. |

Anything else lets no one in: `{}`, a row, a number, or `{ read: member?.canRead }` when there is no member (`undefined` is no answer). So does a method that throws. Each of these is in the app's log, without the value it answered. A refused join reaches the client as `unauthorized`; a join the app could not be asked about, as `unavailable`, which is worth trying again.

A grant holds until the user's token runs out, fifteen minutes at most — a minute for a gateway declared with `chat: true` — and then `@Authorize` is asked again. When a decision stops being true before that (a member taken off a team, a document unshared), say so: `POST /realtime/revalidate` with the secret key, naming the channel (`{ "topic": "board:42" }`) or a pattern's channels by some of their parameters (`{ "pattern": "board:{boardId}:user:{userId}", "params": { "userId": "usr_…" } }`), optionally one user's memberships alone (`"user"`). Every replica asks `@Authorize` again for those memberships at once, and a member it no longer lets in is told the channel closed; their rejoin is refused. A chat gateway needs none of this: the platform revalidates its channel itself when a member is taken out of the chat, and ends it when the chat is deleted.

## Events

What a gateway sends is declared on its class: `static readonly events = { name: schema }`, each a [Standard Schema](https://standardschema.dev) of the payload. The generated clients type each event by it.

From a gateway's own methods, `ctx.emit(event, payload)` sends to every member of the channel. In `@OnConnect` it sends to the member who joined, and no one else. From anywhere else in the app (a route, a service, a [task](https://palbase.studio/docs/backend/tasks), an [`@On`](https://palbase.studio/docs/backend/hooks)) `Palbase.gateways.to(Gateway, params)` names one channel, and its `emit` is typed by the gateway's events:

```ts
// src/modules/rooms/room-notices.service.ts
import { Injectable, Palbase } from "palbase/backend";
import { RoomGateway } from "./room.gateway";

@Injectable()
export class RoomNotices {
  /** The room hears it as a message from no one in particular. */
  closingSoon(roomId: string, minutes: number): void {
    Palbase.gateways.to(RoomGateway, { roomId }).emit("message", { id: crypto.randomUUID(), from: "", text: `This room closes in ${minutes} minutes.` });
  }
}
```

- **In order.** Events to one channel are sent in the order they were emitted. Those emitted while one is on its way go together in the next send.
- **Never thrown.** `emit` returns at once and does not fail the method. An event the gateway does not declare, or a payload that is not JSON, is not sent, and the app's log says so. So is an event that could not be sent.
- **At most once,** unless the gateway is [durable](#durable-gateways): a member that was not on the channel when an event was sent does not get it later.

A member hears only what the gateway sends. Members' own messages go to the backend, never to one another: what the others should hear, the method emits.

## Messages and acks

`@Subscribe(name, schema, { reply })` marks the method that takes one message its members send. The payload is checked against `schema` before the method runs. One that does not fit never reaches it, and the member is told the schema's issues.

The method is given a `GatewayMessageContext`: the channel, its `params`, the member as `ctx.user`, and the payload as the schema made it (`ctx.payload`). It runs as the member, in a transaction of its own, committed when it returns and rolled back when it throws. What it returns is the member's **ack**, which their `send` resolves with. `reply` is the ack's schema, which the generated clients type it by and which the ack is checked against.

What a member's `send` is answered:

| The method | The member is told |
|---|---|
| Returns a value | The value, as JSON carries it. Past 64 KiB, `reply_too_large`. |
| Returns nothing | `ok`, with no ack. |
| Throws `new GatewayRefusal("muted")` | The refusal, with your reason: `muted`. What the method wrote is rolled back. |
| Throws anything else | `handler_failed`. The error is in the app's log, never in the member's answer. |
| Returns an ack its `reply` refuses | `handler_failed`, and the log says why. |

A `GatewayRefusal`'s reason is a word your app acts on: `not_your_turn`, `too_many_messages`, `muted`. It is 256 bytes at most. A message the gateway does not declare is refused with its name.

## Moments

A gateway with methods is told of its channels' moments:

| Decorator | When | Runs as |
|---|---|---|
| `@OnFirst()` | The channel has a member and is held by no one. Told once, however many members come at once, and before the first of them is answered. | The app |
| `@OnConnect()` | A member joined, after they were answered. What it emits goes to them alone. | The member |
| `@OnDisconnect()` | A member left. | The member |
| `@OnEmpty()` | Nobody has been on the channel for its `graceMs`. | The app |

"The app" is the service role, as a [cron](https://palbase.studio/docs/backend/cron)'s work is: every row in reach. Each moment's `GatewayContext` carries `channel`, `params`, `count` (its members now), `user` (`id` is `""` in `@OnFirst` and `@OnEmpty`, which no one in particular caused), `emit`, `pipe`, `signal` and `owner`.

`ctx.signal` is the channel's own. It aborts when the channel empties, before `@OnEmpty` runs, so what `@OnFirst` started stops on it without a method to remember it. `ctx.owner.hold(work)` runs `work` past the method, until that signal aborts. A failure of it is logged, never the app's crash. `ctx.owner.release()` gives the channel up at once: its signal aborts, and the next member to come finds it held by no one, so `@OnFirst` runs again.

```ts
// src/modules/prices/prices.gateway.ts
import { Gateway, Log, OnEmpty, OnFirst, z } from "palbase/backend";
import type { GatewayContext } from "palbase/backend";

export const Tick = z.object({ symbol: z.string(), price: z.number() });

// prices:<symbol>: a price read from the exchange only while someone watches it.
@Gateway("prices:{symbol}", { access: "public", graceMs: 30_000 })
export class PricesGateway {
  static readonly events = { tick: Tick };

  // The first watcher came: read the price every second until the channel empties.
  @OnFirst()
  open(ctx: GatewayContext): void {
    const symbol = ctx.params.symbol;
    ctx.owner.hold(async (signal) => {
      while (!signal.aborted) {
        const res = await fetch(`https://quotes.example.com/v1/${encodeURIComponent(symbol)}`, { signal });
        const { price } = (await res.json()) as { price: number };
        ctx.emit("tick", { symbol, price });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    });
  }

  // Thirty seconds with nobody watching: the loop above has stopped already.
  @OnEmpty()
  closed(ctx: GatewayContext): void {
    Log.info("nobody watches", { symbol: ctx.params.symbol });
  }
}
```

A moment whose method throws is told again 1, 5 and 15 seconds later. A join or a leave told again is run once.

## Durable gateways

A durable gateway keeps what it sends: every event is kept and numbered as it is sent, for a day (`durable: true`) or for `{ keepSeconds }`, a week at most. A member that comes back, a phone that walked out of range or a socket that dropped, is sent everything after the last event it had, in order and once. A member that joins is sent what the gateway keeps first, unless it asks for only what comes next ([Web Gateways](https://palbase.studio/docs/web/gateways#durable-gateways)).

```ts
// src/modules/orders/order-updates.gateway.ts
import { Gateway, z } from "palbase/backend";

export const Status = z.object({ orderId: z.string(), status: z.enum(["paid", "packed", "shipped", "delivered"]) });

// orders:<user id>: a user's own order updates, kept a week.
@Gateway("orders:{userId}", { access: "owner", durable: { keepSeconds: 604_800 } })
export class OrderUpdates {
  static readonly events = { status: Status };
}
```

```ts
// src/modules/orders/order-status.service.ts
import { Injectable, Palbase } from "palbase/backend";
import { OrderUpdates } from "./order-updates.gateway";

@Injectable()
export class OrderStatus {
  shipped(userId: string, orderId: string): void {
    Palbase.gateways.to(OrderUpdates, { userId }).emit("status", { orderId, status: "shipped" });
  }
}
```

Every event delivered to a member counts toward the project's realtime messages, the ones sent again to a member that came back included. What a project's durable gateways keep is bounded: an event past the bound is not kept or sent, and the app's log says so. Keep a durable gateway for what members must not miss while they are away. What must outlive the conversation belongs in your database.

## Pipes

`ctx.pipe(source)` has the platform write `source` into the gateway's channel from then on. `Palbase.gateways.to(Gateway, params).pipe(source)` does the same from anywhere in the app. The backend is not in the stream: after the call, what the source says reaches the channel's members without passing through the machine.

The source today is a chat of the project's agents, `Palbase.ai.chats.events(chatId)`, piped into a gateway declared with `chat: true`. See [AI](https://palbase.studio/docs/backend/ai#a-chat-in-an-app).

## A gateway with no method

A gateway that has no method, only its access, its events and perhaps `publish`, never wakes the machine. Realtime decides its joins from the app's contract alone, and `Palbase.gateways.to(…).emit` sends to it from wherever the app runs. `OrderUpdates` above is one: a user's app can hold `orders:<their id>` open all day while the machine sleeps.

A gateway with a method is the machine's. Its joins, its members' messages and its moments are signed calls the platform makes to the machine, waking it if it sleeps. A join or a message is answered within 8 seconds and a moment within 30, or realtime gives up on it: a join is then `unavailable`, and a moment is told again.

A release's gateways are what realtime goes by within 30 seconds of it serving.

## Limits

| | |
|---|---|
| A pattern, a channel, an event's or a message's name | 255 bytes |
| An ack | 64 KiB of JSON |
| A refusal's reason | 256 bytes |
| What a durable gateway keeps | a week |
| An `@Authorize` or a message, answered | within 8 seconds |
| A moment, answered | within 30 seconds |

What the project's clients may use (connections, joins and events per second, channels per connection) is set with `putLimits` ([Realtime](https://palbase.studio/docs/backend/realtime#limits)).

## On your computer

Off the platform (the app started on your computer, or in a test) nothing joins a gateway: realtime is what calls a machine about one. `Palbase.gateways.to(…).emit` sends as the app, to the project its `PALBASE_URL` names. Test a gateway's methods as plain methods of a class ([Testing](https://palbase.studio/docs/backend/testing)).

## Gateways and the channel declaration

A channel a gateway matches is the gateway's, whatever the project's [channel declaration](https://palbase.studio/docs/backend/channels) says. The declaration (`Palbase.realtime.putChannels`, Studio's **Realtime › Channels**) is the realtime module's own list, for a backend that is not a `palbase/backend` app: a server that broadcasts with the secret key ([Realtime](https://palbase.studio/docs/backend/realtime)) and channels its clients join by name. A `palbase/backend` app declares its channels as gateways.

## Related

- [Web Gateways](https://palbase.studio/docs/web/gateways): joining a gateway from an app, its events, messages and acks
- [AI](https://palbase.studio/docs/backend/ai): a chat of the project's agents, carried by a gateway
- [Realtime](https://palbase.studio/docs/backend/realtime): the project's realtime from any server
- [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules): providers, and what is refused at boot
