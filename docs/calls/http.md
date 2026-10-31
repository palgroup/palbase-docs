> The full documentation index: https://palbase.studio/llms.txt

# Calls over HTTP

The SDKs make these calls for an app, on each of a person's devices. This page is what they do, for an app of your own making or to read what an SDK sends. Every call here is a person's: it carries the publishable key in the `apikey` header and the signed-in user's access token as `Authorization: Bearer …`, at the project's address, `https://<ref>.palbase.studio`. What your server does with the secret key is on [Your Server](https://palbase.studio/docs/calls/server).

## A device

A person may have the app on several devices, and a call is in one of them. Every call that acts on a device names it: `device_id`, the app's own id for its install — 1 to 128 characters, no space — kept across launches. The device that answers has the call; its heartbeat, its media and its signals are that device's.

## Making a call

`POST /calls` from the caller's device:

| Field | What it is |
|---|---|
| `user_ids` | Who to call: one person (a direct call), or up to 99 (a group) |
| `device_id` | The device the call is made on |
| `video` | A video call; else voice |
| `ring` | Ring them (the default); `false`: a group call they join when they like (a huddle) |
| `group` | A group call even with one person asked, on the media server: others may be asked later |
| `conversation_id` | The conversation it is made from: its members alone may be called, and it keeps the call |
| `metadata` | Your app's own words about the call, shown to the people rung: 32 strings, 2 KiB at most |
| `caller_name`, `caller_image_url` | What those rung see of the caller; else the caller's messaging profile's name and picture |

```bash
curl -s "https://<ref>.palbase.studio/calls" \
  -H "apikey: $PALBASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_ids": ["usr_bob"], "video": true, "device_id": "ios-6f1c"}'
```

It answers the call ([A call](#a-call)):

- `201`: the call, ringing — or a direct call already over, `busy`, when the person called is in another call.
- `200`: the person called was calling the caller that very moment: the answer is their call, answered on this device.

| Refusal | Why |
|---|---|
| `400 invalid_user_ids` | Not 1 to 99 other people |
| `400 call_full` | More people than the project lets a call hold (`max_participants`) |
| `400 invalid_device_id`, `invalid_conversation_id`, `invalid_metadata`, `invalid_caller` | That field is not one |
| `403 not_allowed` | The caller may reach none of them: blocks, deleted accounts, a conversation's members, your hook |
| `404 conversation_not_found` | The caller is not in the conversation named |
| `409 in_another_call` | The caller is in another call on another device |
| `429 too_many_calls` | 10 calls this minute, or the project's `calls_per_hour` this hour |
| `429 quota_exceeded` | A free project's call data is used up this month: calls going on go on, no new one starts |

## Answering, declining, joining, leaving

| Call | What it does |
|---|---|
| `POST /calls/{call_id}/accept` with `{ "device_id" }` | Answers on this device. The first of the person's devices to answer has the call; the others stop ringing. Sent again from the same device, it is the same answer |
| `POST /calls/{call_id}/decline` | Turns the call down on every device of the person's: a direct call ends (`declined`); in a group, they are not rung any more and may still join |
| `POST /calls/{call_id}/join` with `{ "device_id" }` | Comes into a group call the person was asked to — rung, missed, declined, busy, or in it before. A direct call is answered, not joined (`409 not_joinable`) |
| `POST /calls/{call_id}/leave` | Takes the person out. A direct call ends for both: `canceled` while it rings (the person called missed it), `hung_up` once answered. A group goes on while a person is in it or being rung. Leaving a call that is over is done |
| `POST /calls/{call_id}/participants` with `{ "user_ids", "ring" }` | Asks more people into a call the person is in, ringing them unless `ring` is `false`. A direct call becomes a group on the media server, going on. A call not answered yet does not grow (`409 not_in_call`) |

Each answers the call as it is now. When the call is not what the request needs, the refusal is `409` and carries the call too (`{ "error", "error_description", "call" }`), so the app draws what is true: `call_ended`, `answered_elsewhere` (in on another of the person's devices), `not_ringing`, `call_full`. Asking more people in may also be `403 not_allowed` and `400 invalid_user_ids` (no one new to ask), as making a call is.

## Staying in the call

A device in a call says so every 15 seconds: `POST /calls/{call_id}/heartbeat` with `{ "device_id" }`. A device silent for 45 seconds is taken for gone: a direct call ends (`failed`, or `canceled` when the caller's device went silent while it rang), and a person leaves a group.

The heartbeat answers the call's `state`, its `version`, its `end_reason`, and whether this device is still in it (`in_call`). An app whose snapshot's `version` is lower than the heartbeat's missed a word on its channel: it reads the call again (`GET /calls/{call_id}`).

## The media

Every call's media goes through the media server, one to one too. `POST /calls/{call_id}/media` with `{ "device_id" }`, once the device is in the call, is its ticket into the call's room:

| Field | What it is |
|---|---|
| `url` | The media server's address (`wss://`) |
| `token` | The device's ticket into the call's room: 6 hours, and back in after a lost connection |
| `room` | The call's room |

The media server is LiveKit (open source): a device connects to `url` with `token` through LiveKit's client SDK, which the Palbase SDKs use. The caller is in a call from its start, so the caller's device joins the room as the call rings — it is sent no one's sound or picture until someone answers; a person called joins once they answered (or joined a group). A direct call that grows — someone asked in, an agent let in — goes on in the same room. Where a network lets no UDP out, LiveKit's client reaches the server over TCP on port 443 (straight, not through an HTTPS proxy).

Refused: `409 not_in_call` or `answered_elsewhere` (this device is not the one in the call), `409 call_ended`.

## The channel

Each person hears their calls on their own realtime channel, `calls:<ref>:<user_id>`, joined on the project's socket by their apps ([Web Realtime](https://palbase.studio/docs/web/realtime)). One event comes on it, `call`: a call of theirs as it is now — the same object `GET /calls/{call_id}` answers — each time it changes: rung, answered, declined, joined, left, grown into a group, ended.

Each `call` carries the call's `version`, which grows with every change: keep the highest seen, and drop an older snapshot that arrives late. What the channel tells is told once, as it happens: an app that was not listening reads the call (`GET /calls/{call_id}`), and the heartbeat's `version` says when it missed something.

## History

`GET /calls` lists the person's calls, the newest first, each with how it went for them (their participant's `state`): `limit` (1 to 100, 20 by default) and `cursor` (the previous page's `next_cursor`) page through them, `missed=true` keeps the ones they missed or were busy for, `state` the ones ringing, going on or ended. `GET /calls/{call_id}` reads one of theirs — what an app reads when it missed a word on its channel.

## A call

| Field | What it is |
|---|---|
| `id` | The call's id |
| `kind` | `direct` (two people) or `group` |
| `video` | A video call; else voice |
| `ring` | Whether it rings the people asked; `false`: a huddle |
| `state` | `ringing` (a direct call not answered yet), `active`, `ended` |
| `caller_id` | Who called |
| `conversation_id` | The conversation it was made from, or null |
| `metadata` | The caller's app's own words about it |
| `max_participants` | How many it holds |
| `created_at`, `answered_at`, `ended_at` | When it was made, answered (a direct call) and ended |
| `end_reason`, `ended_by` | How it ended ([A call's life](https://palbase.studio/docs/calls/overview#a-calls-life)), and who ended it |
| `ring_until` | When a direct call's ring ends, unanswered |
| `version` | Grows with every change |
| `participants` | Its people and agents (below) |

A participant: `user_id` (an agent's is `bot:<identity>`), `kind` (`user` or `bot`), `role` (`caller`, `callee` — the one called in a direct call — or `member`), `state` (`ringing`, `invited` — asked to a huddle —, `joined`, `left`, `declined`, `missed`, `busy`), `device_id` (the device they are in it on), `name` and `image_url` as their profile shows them, `invited_at`, `joined_at` (when their present stretch in it began), `left_at`, `seconds` (how long they were in it before the present stretch), and `bytes` (what the media server sent them in it — what the call is billed by — a minute behind at most).
