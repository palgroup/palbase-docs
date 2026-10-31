> The full documentation index: https://palbase.studio/llms.txt

# Calls

Calls are voice and video calls between a project's people: one to one, or a group of up to 100. It is a module every project has, like messaging: there is no server to run. A person's phone rings on the lock screen as any call does, and they answer on whichever of their devices they pick up. Your server, with the secret key, sets the module up, reads and ends calls, and lets its own agent into one.

The web, iOS and Android SDKs run a call for the app — ringing, answering, the media, the heartbeat — through the HTTP API this section describes ([Calls over HTTP](https://palbase.studio/docs/calls/http)):

- **Web**: `pb.calls`, and `palbase/web/calls-ui` for ready-made screens ([Web Calls](https://palbase.studio/docs/web/calls))
- **iOS**: the `PalbaseCalls` product, and `PalbaseCallsUI` for ready-made screens ([iOS Calls](https://palbase.studio/docs/ios/calls))
- **Android**: `studio.palbase:palbase-calls`, and `palbase-calls-ui` for ready-made screens ([Android Calls](https://palbase.studio/docs/android/calls))

## Kinds of call

- **A direct call** rings one person (`POST /calls` with one user id).
- **A group call** asks several people in (`POST /calls` with up to 99 user ids, or `group: true` with one). A person who missed or declined it may still join while it lasts.
- **A huddle** is a group call that rings no one (`ring: false`): the people asked see it and join when they like.
- **A direct call grows.** Asking a third person in — or letting the project's agent in — makes it a group, going on in the same room.

Every call's sound and picture go through Palbase's media server (LiveKit, open source), one to one too: each device sends its own once, however many listen, and gets the others' from the server. A device's address reaches no one else in the call. Where a network lets no UDP out, the media goes over TCP on port 443 (straight to the media server: a network that lets the web out only through an HTTPS proxy does not pass it). The server sees the media as it passes it on; nothing of it is kept.

A call is voice or video (`video`) from its start; a person may still turn their camera on or off in it. What a call costs is the data the media server sent its people ([What it costs](#what-it-costs)).

## Who may call whom

Anyone in the project may call anyone, except:

- **Blocks.** No one who blocked the caller, nor whom the caller blocked — the same blocks as messaging's ([Messaging](https://palbase.studio/docs/messaging/overview)).
- **Deleted accounts.** A deleted person cannot be called.
- **A conversation's members.** A call made from a conversation (`conversation_id`) reaches its members alone, and is kept in it as a `call` message: who called, voice or video, how it ended and how long it lasted.
- **Your hook.** With the project's hook set, your endpoint is asked before a call rings and before someone is asked into one (`calls.can_call`), and narrows who may be reached ([Your Server](https://palbase.studio/docs/calls/server#who-may-call-whom)).

A call to no one the caller may reach is `403 not_allowed`. A person starts 10 calls a minute at most, and the project's `calls_per_hour` an hour (60 unless it says otherwise): past either, `429 too_many_calls`.

## A call's life

1. **It rings.** The people called are rung on every device of theirs: a call screen on iOS and Android, even locked; a notification and a ring in a browser ([Ringing](https://palbase.studio/docs/calls/ringing)). The caller's app shows it ringing.
2. **Someone answers.** The first of a person's devices to answer has the call; their other devices stop ringing. A person in a call on one device cannot answer another call on a second device (`409 in_another_call`); an app that lost its call — killed, crashed — answers the next one on the same device, and the lost call ends.
3. **It goes on.** Each device in the call says so every 15 seconds (its heartbeat). A device silent for 45 seconds — its app gone, its network lost for good — is taken for gone: a direct call ends (`failed`), and a person leaves a group.
4. **It ends.** Every device in it is told how (`end_reason`), and the call is in each person's history.

| How a call ends | `end_reason` |
|---|---|
| Someone in an answered direct call hung up | `hung_up` |
| The caller gave up before an answer (the person called missed it) | `canceled` |
| The person called turned it down | `declined` |
| No one answered in 45 seconds | `missed` |
| The person called was in another call, or being rung by one | `busy` |
| A device in a direct call went silent | `failed` |
| Your server ended it, or everyone left a group | `ended` |

`ended_by` names who hung up, canceled or declined, or whose device went silent.

- **Busy.** A call to someone in another call ends at once (`busy`), and they are told they missed it. In a group, a busy person is not rung, and may join later.
- **Missed.** A person rung for 45 seconds without answering missed the call, and gets a missed-call notification; so do the people a caller stopped calling before they answered. A direct call ends; a group goes on without them.
- **Declined.** A direct call ends. In a group, the person is not rung any more, and may still join.
- **Calling each other at once.** When two people call each other in the same moment, the second call is the first one, answered: they are in one call, not two that refuse each other.
- **A group ends** when no person is in it or being rung: an agent alone does not keep it going.

## History

A person's calls are theirs to list, the newest first, each with how it went for them — `missed`, `declined`, `left` … (`GET /calls`; `missed=true` for the calls they missed). Studio lists the project's calls (**Calls › Calls**), any person's by their user id; your server reads them with the secret key (`GET /calls/admin/calls`).

A call's record is who called whom, when, how long each was in it and how it ended. Its sound and picture never pass through the API and are never kept. Ended calls are kept 400 days.

When a person's account is deleted, the direct calls they were in go from the history, their place in a group's record goes, and a group they started names `deleted-user` as its caller. What the media server sent them stays counted, under `deleted-user`.

## The project's settings

In Studio (**Calls**), or with the secret key (`GET` and `PUT /calls/settings`; [Your Server](https://palbase.studio/docs/calls/server#settings)):

| Setting | What it does |
|---|---|
| `max_participants` | How many people a call holds, agents included: 2 to 100 (the default) |
| `calls_per_hour` | How many calls one person may start in an hour: 1 to 1,000 (60 by default); 10 a minute whatever it says |
| `hook` | Who may call whom ([Your Server](https://palbase.studio/docs/calls/server#who-may-call-whom)); none: blocks alone decide |

## Webhooks

Your backend hears of the project's calls ([Webhooks](https://palbase.studio/docs/server/webhooks#the-events)):

| Event | Sent when |
|---|---|
| `calls.call.started` | A call was made — ringing, or a group going on |
| `calls.call.ended` | A call ended (`end_reason` says why) |
| `calls.participant.joined` | A person answered or joined, or an agent came into the call |
| `calls.participant.left` | A person or an agent left the call |

`calls.call.started` and `calls.participant.joined` are when to send your agent in ([Agents](https://palbase.studio/docs/calls/agents)).

## What it costs

A call is billed by the data the media server sent its people: each person's, and each agent's, sound, picture and data from the others, and the server's own word to their app — as the server counts its packets, without the network's own headers. Voice and video, one to one and in a group, cost the same per GB; a voice call sends far less than a video one, and a picture sends less when it is small on the screen.

| | Free each month | Past it |
|---|---|---|
| Call data | 25 GB | $0.12 a GB |

A GB is 1,000,000,000 bytes. A caller alone in a call that rings is sent little: the server's word to their app, no one's sound or picture. What each person was sent is in the call's record (`bytes`, a minute behind at most), and the month's total in the project's usage. Past a free project's 25 GB, until the month ends, no new call starts (`429 quota_exceeded`): calls going on go on to their end. A project on Pay as you go goes on, paying for what is past them ([Billing](https://palbase.studio/docs/getting-started/billing)).
