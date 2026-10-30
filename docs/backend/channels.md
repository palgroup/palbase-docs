> The full documentation index: https://palbase.studio/llms.txt

# Channels

> **Note:** A `palbase/backend` app declares its channels as [gateways](https://palbase.studio/docs/backend/gateways): `@Gateway` classes, typed end to end, which the generated clients join. This page is the realtime module's own declaration, `Palbase.realtime.putChannels`, for a backend that is not a `palbase/backend` app. A channel a gateway matches is the gateway's, whatever this declaration says.

A channel's name is a string a client chooses. Proving who you are says nothing about which channels are yours — a chat's `dm:alice:bob` must not be readable by every signed-in user who can spell it — so only the project says what its channel names mean. It **declares** them: a list of patterns, each saying who may join the channels it matches and what they may do there. **A channel no pattern matches belongs to no one**, and no client may join it.

## Quick example

```ts
// src/modules/realtime/channels.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class ChannelsService {
  // Declared at boot, from code: the declaration is what this code says.
  async onStart(): Promise<void> {
    await Palbase.realtime.putChannels({
      body: {
        channels: [
          // A user's own inbox: only they may join, and they may do everything on it.
          { pattern: "inbox:{uid}", kind: "owner" },
          // A board any signed-in user may watch and edit.
          { pattern: "board:{id}", kind: "public", publish: true, state_read: true, state_write: true },
          // A lobby anyone signed in may listen to, where only the server speaks.
          { pattern: "lobby", kind: "public" },
        ],
      },
    });
  }
}
```

`PUT /realtime/channels` replaces the whole declaration, in its order; `GET /realtime/channels` reads it back. Studio's **Realtime › Channels** screen edits the same list.

## Patterns

A pattern is `:`-separated segments, 255 bytes at most. A segment written `{name}` matches exactly **one** non-empty segment; any other segment matches itself.

| Pattern | Matches | Does not match |
|---|---|---|
| `lobby` | `lobby` | `lobby:2` |
| `board:{id}` | `board:7f3a` | `board`, `board:7f3a:cards` |
| `game:{id}:chat` | `game:42:chat` | `game:42`, `game::chat` |

The segment counts must be equal — so `user:{uid}` never swallows `user:42:secrets` below it — and a capture name appears once in a pattern.

## The two kinds

| Kind | Who may join | What they may do |
|---|---|---|
| `owner` | The signed-in user the pattern's **one** `{name}` names, and no one else. | Everything: listen, publish, read and write the state. |
| `public` | Any signed-in user of the project. | Listen; and what the rule grants — `publish` (broadcast on it), `state_read` (receive its state), `state_write` (write its state). |

An `owner` pattern has exactly one capture: `inbox:{uid}` is the user `uid`'s, so `inbox:usr_123` is joined by `usr_123` alone. Both kinds need a **signed-in user**: the access token each join carries is who the user is, and a client with no one signed in joins none of the project's declared channels.

Your backend is never refused: what it publishes and writes with the secret key ([Realtime](https://palbase.studio/docs/backend/realtime)) reaches every subscriber of the channel, whatever the declaration lets clients do there.

## First match wins

The declaration is matched in order, and the **first** pattern that matches a channel decides it — including deciding no:

```ts
// src/modules/realtime/rooms.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class RoomsService {
  async onStart(): Promise<void> {
    await Palbase.realtime.putChannels({
      body: {
        channels: [
          // The announcements room: everyone listens, nobody but the server speaks.
          { pattern: "room:announcements", kind: "public" },
          // Every other room: everyone may talk.
          { pattern: "room:{name}", kind: "public", publish: true },
        ],
      },
    });
  }
}
```

Put the narrow patterns before the wide ones: written the other way round, `room:{name}` would match `room:announcements` first and let everyone publish there. A channel an `owner` pattern matches for a different user is refused there and then — it does not fall through to a later pattern.

## The platform's channels

Five namespaces are the platform's and cannot be declared: `roles:`, `flags:`, `messaging:`, `calls:` and `debug:`. Of them, clients join:

| Channel | Who | What it carries |
|---|---|---|
| `flags:<ref>` | Any client of the project, signed in or not. | The notice that the project's flags changed ([Flags](https://palbase.studio/docs/backend/flags)). |
| `flags:<ref>:<user_id>` | That user. | The notice that their own values changed. |
| `roles:<ref>:<user_id>` | That user. | Their permission set. |

All three are read-only: only the platform writes them.

## When it changes

- **Open sockets are decided again within a heartbeat** of a new declaration: a client whose channel is no longer theirs is put off it.
- **A decision is trusted for at most 15 minutes**, or until the user's token expires if that is sooner: a revoked user, or one whose token is no longer valid, is noticed within that time.
- **A refused join** answers the client with its reason — `unauthorized` when the declaration says no, `unavailable` when it could not be read just then (worth retrying; `unauthorized` is final).

## Limits

The declaration holds **100 patterns** at most. What the project's clients may use — connections, joins and events per second, channels per connection — is set with `putLimits` ([Realtime](https://palbase.studio/docs/backend/realtime)).

## From the CLI

```sh
palbase realtime:channels:get --json > channels.json   # the declaration, as the document to edit
palbase realtime:channels:set --file channels.json     # replace it; open sockets are decided again within a heartbeat
palbase realtime:limits:set max_connections=500
palbase realtime:broadcast room:42 message '{"text":"hello"}'
```

Each entry of the file is a channel: `{"pattern": "room:{id}", "kind": "public", "publish": true, "state_read": true, "state_write": false}`, or `{"pattern": "user:{uid}", "kind": "owner"}`. See the [CLI reference](https://palbase.studio/docs/cli/reference#realtime).

## Related

- [Realtime](https://palbase.studio/docs/backend/realtime) — broadcasting and writing state from your backend
- [Web Realtime](https://palbase.studio/docs/web/realtime) — joining a channel in the browser
- [Flags](https://palbase.studio/docs/backend/flags) — what `flags:<ref>` carries
- [Authentication](https://palbase.studio/docs/backend/authentication) — the user a join's token names
