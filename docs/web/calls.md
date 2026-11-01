> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` is the signed-in person's voice and video calls in the browser: it rings the people called, hears the calls that ring this person, and runs a call's media — every call's, one to one or in a group, through the platform's media server. Palbase gives the data, not the screens: the app draws what a call's state says — who calls, how it goes, each person's camera and shared screen, who is speaking — in its own design, and calls what the person does; it opens no peer connection, sends no signal and keeps no heartbeat itself. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  // The others' voices play by themselves: true unless the app plays each stream itself.
  calls: { playAudio: true },
});
```

```ts
// src/call.ts
import { pb } from "./lib/palbase";

// The microphone is asked for first; once it is allowed, every device of theirs rings.
const call = await pb.calls.voice("usr_01a1684c796e7394aa8ec75d893a8fe2");

const stop = call.subscribe(() => {
  const { phase, remote, endReason } = call.state;
  if (phase === "connected") console.log("talking with", remote.map((r) => r.name ?? r.userId).join(", "));
  if (phase === "ended") {
    console.log("ended:", endReason);
    stop();
  }
});

await call.setMicrophone(false); // muted
await call.leave(); // hung up — or, while it rings, canceled
```

```ts
// src/incoming.ts
import { pb } from "./lib/palbase";

// The calls that ring this person while the page is open — and the one ringing as a tap on its notification opens it.
pb.calls.onIncoming((call) => {
  const { call: c, phase } = call.state;
  if (phase !== "incoming") return; // "invited": a huddle, joined with call.join()
  const caller = c.participants.find((p) => p.user_id === c.caller_id);
  if (confirm(`${caller?.name ?? c.caller_id} is calling. Answer?`)) void call.accept();
  else void call.decline();
});
```

## Making a call

| Call | What it does |
|---|---|
| `voice(userIds, options)` | A voice call: one person (a direct call) or several (a group) |
| `video(userIds, options)` | A video call |
| `start(userIds, options)` | Either, `video` saying which |
| `join(call, options)` | Comes into a group call on this device: one this person was asked to — a huddle, one they declined or left — or, unasked, one held at a place that lets them in ([A call at a place](#a-call-at-a-place)). `call` is its id, or the call itself |

Each answers the call's `CallSession` once it rings. This device's microphone (and camera) is asked for first, and a refusal rings no one ([Permissions and errors](#permissions-and-errors)). A call to someone who is calling this person that very moment is their call, answered.

| Option | What it is |
|---|---|
| `video` | A video call (`start` alone) |
| `ring` | Ring the people asked (the default); `false`: a group call they join when they like (a huddle) |
| `group` | A group call even with one person asked: others may be asked later |
| `conversationId` | The conversation it is made from: its members alone may be called, and it keeps the call as a message |
| `place` | The place it is held at (`channel:42`): a group call, no one need be asked ([A call at a place](#a-call-at-a-place)) |
| `metadata` | The app's own words about the call, shown to those rung: 32 strings, 2 KiB at most |
| `callerName`, `callerImageUrl` | What those rung see of the caller; else their messaging profile's name and picture |
| `media` | A microphone (and camera) stream the app opened already: used as it is, and left open when the call ends |

## A call that rings

`pb.calls.onIncoming(listener)` hears each call that rings this person while the page is open, and the calls ringing as it opens — the person tapped the call's notification ([Ringing while the page is away](#ringing-while-the-page-is-away)). It answers the unsubscribe. A group call that rings no one comes too, in the phase `invited`.

| On the session | What it does |
|---|---|
| `accept(options)` | Answers on this device. The first of the person's devices (or tabs) to answer has the call; the others go to `elsewhere`. `accept({ video: false })` answers a video call by voice; `{ video: true }` a voice call with the camera on |
| `decline()` | Turns the call down on every device of the person's: a direct call ends; a group goes on, and may still be joined |
| `join(options)` | Comes into a group call this person was asked to: a huddle (`invited`). A session that is over joins nothing: `pb.calls.join(callId)` comes into the call again |

`accept` and `join` take `video` and `media` as making a call does.

`pb.calls.onCall(listener)` hears each call this page comes into — made, answered or joined here; `pb.calls.current` is the one it is in, or `null`. `pb.calls.ready()` follows the person's calls without making one (`start`, `join` and `onIncoming` do it themselves), and rejects when no one is signed in.

## What to draw

A session's `state` is what the app draws, and `subscribe(listener)` tells each change of it (it answers the unsubscribe):

| Field | What it is |
|---|---|
| `phase` | `calling` (the person called is rung), `incoming` (this person is rung), `invited` (asked into a huddle), `connecting` (answered, the media on its way), `connected`, `reconnecting` (the network dropped for a moment), `elsewhere` (answered on another device or tab), `ended` |
| `endReason` | Why it ended for this device: the call's `end_reason` ([A call's life](https://palbase.studio/docs/calls/overview#a-calls-life)), or `left` (this person left a group that goes on), `declined`, `missed`, `answered_elsewhere` |
| `call` | The call as the module last said it ([A call](https://palbase.studio/docs/calls/http#a-call)) |
| `me` | This person, as the call lists them |
| `outgoing` | This person rang, or started the group |
| `local` | This device's microphone and camera, while it is in the call: for its own preview |
| `microphone`, `camera` | Whether this device's microphone is heard and its camera on |
| `screenSharing`, `screen` | Whether this device shares a screen, and the screen it shares — for its own preview; `null` while it shares none |
| `speaking` | This person is heard speaking now |
| `remote` | The others in the call (below) |
| `error` | The last thing that went wrong with this device's media: a camera refused, the media server not reached |

Each of `remote` is `userId` (an agent's is `bot:<identity>`), `name`, `imageUrl`, `bot`, `stream` — their audio and video, one `MediaStream` for the whole call, the same object whichever way the media flows — whether they are heard (`audio`) and seen (`video`), `screen` — the screen they share, a `MediaStream` apart from their camera, `null` while they share none — and whether they are `speaking` now (as the media server tells it, a moment behind).

The others' voices play by themselves. With `calls: { playAudio: false }` in `createClient`'s options, each one's `stream` is the app's to play.

```ts
// src/call-view.ts
import type { CallSession } from "palbase/web";

function tile(stream: MediaStream, speaking: boolean): HTMLVideoElement {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // their voice already plays
  video.srcObject = stream;
  video.style.outline = speaking ? "3px solid #22c55e" : "none";
  return video;
}

/** Draws the others' cameras and shared screens in a grid — the one speaking framed — and this device's camera in a corner. */
export function drawCall(session: CallSession, grid: HTMLElement, self: HTMLVideoElement): () => void {
  return session.subscribe(() => {
    const { remote, local } = session.state;
    self.srcObject = local;
    grid.replaceChildren(
      ...remote.flatMap((r) => [
        ...(r.video ? [tile(r.stream, r.speaking)] : []),
        ...(r.screen ? [tile(r.screen, false)] : []),
      ]),
    );
  });
}
```

## In the call

| On the session | What it does |
|---|---|
| `setMicrophone(on)` | The microphone heard, or muted |
| `setCamera(on)` | The camera on or off: off, it is closed and its light goes out; on, opened again — a voice call's too |
| `switchCamera(deviceId)` | Another camera: the one named (a `videoinput`'s `deviceId`), or, with none named, the other facing one |
| `setScreenShare(on, { audio })` | Shares a screen, a window or a tab — the browser asks the person which — or stops sharing it ([Sharing a screen](#sharing-a-screen)) |
| `setAudioOutput(deviceId)` | Where the others' voices play: an `audiooutput`'s `deviceId`, in a browser that can choose one |
| `invite(userIds, { ring })` | Asks more people in, ringing them unless `ring` is `false`: a direct call becomes a group, going on |
| `leave()` | Hangs up — or, while it rings, cancels: a direct call ends for both; a group goes on for the others |
| `refresh()` | Reads the call as it is now |

A page that goes away — closed, reloaded, navigated off — leaves its call at once.

## The media

Every call's media — one to one or in a group — goes through the platform's media server (LiveKit), through the LiveKit client the package depends on (`livekit-client`), loaded when the page's first call starts. The caller is in the call's room while it rings, so the media flows the moment it is answered; a third person or the project's agent comes into the same room, and the call goes on as it was. Where UDP is shut (a strict office or hotel network), the media goes over TCP to port 443 of the media server. When the network drops, the session is `reconnecting` while the client comes back into the room — with a new ticket if the room was lost — and what the app drew goes on playing.

What a call costs is the data the media server sent its people ([What it costs](https://palbase.studio/docs/calls/overview)): a voice call is a small part of a video call's.

## Sharing a screen

`setScreenShare(true)` asks the browser for a screen, a window or a tab — the person picks it in the browser's own dialog — and sends it into the call as a picture of its own, apart from the camera: the others see it as their `remote` entry's `screen`, this device as `state.screen`. `{ audio: true }` sends the sound of what is shared too, where the browser offers it (a tab's). `setScreenShare(false)` stops it, and so does the browser's own "Stop sharing". A person who picks nothing rejects it (`NotAllowedError`), and nothing is shared.

```ts
// src/share.ts
import type { CallSession } from "palbase/web";

/** A Share screen button: on, then off again. */
export async function toggleShare(session: CallSession): Promise<void> {
  try {
    await session.setScreenShare(!session.state.screenSharing);
  } catch (e) {
    if ((e as Error).name !== "NotAllowedError") throw e; // the person picked nothing
  }
}
```

A shared screen goes through the media server as the camera does: its data is the call's, billed as the rest ([What it costs](https://palbase.studio/docs/calls/overview#what-it-costs)). A reconnect brings it back into the call.

## A call at a place

`pb.calls.place(name)` is a place of the app — a channel (`channel:42`), a conversation of Palbase's messaging (`conversation:<id>`) — and the call going on there ([A call at a place](https://palbase.studio/docs/calls/overview#a-call-at-a-place)). Its `state` is `place`, `call` (the call going on there, `null` for none), `watching`, and `error` — the last refusal of reading or watching it: a `PalbaseError` `not_allowed` (403) where the project's rule does not let this person into the place.

| On the place | What it does |
|---|---|
| `watch()` | Told of the place's call as it starts, changes and ends, on the person's calls channel — renewed while it is watched; answers the call going on (or `null`) |
| `unwatch()` | Told no more: the page's last watcher's stop ends the watch |
| `refresh()` | Reads the place's call as it is now |
| `subscribe(listener)` | Tells each change of `state`; answers the unsubscribe |
| `start(options)` | Starts a call at the place from this device: `userIds` to ring (none need be), and `pb.calls.start`'s options |
| `join({ name, imageUrl })` | Comes into the call going on there, unasked; `name` and `imageUrl` are what the others see of this person where messaging names them not |

```ts
// src/channel-call.ts
import { PlaceBusyError } from "palbase/web";
import { pb } from "./lib/palbase";

const place = pb.calls.place("channel:42");

// While the channel is on screen: a "Join the meeting" bar, live.
const stop = place.subscribe(() => {
  const { call } = place.state;
  const bar = document.querySelector<HTMLElement>("#meeting")!;
  bar.hidden = !call;
  if (call) bar.textContent = `Meeting going on — ${call.participants.filter((p) => p.state === "joined").length} in it`;
});
await place.watch();

export async function startOrJoin() {
  try {
    return await place.start({ ring: false });
  } catch (e) {
    // Someone started it a moment before: join theirs.
    if (e instanceof PlaceBusyError) return pb.calls.join(e.call);
    throw e;
  }
}

// When the channel leaves the screen.
export async function leaveChannel() {
  stop();
  await place.unwatch();
}
```

One call goes on at a place at a time: starting another there is refused with a `PlaceBusyError` (`409 place_busy`) carrying the call going on, to join. Someone the place does not let in is refused reading, watching, starting and joining with `not_allowed` (403). A place with no rule — no hook answering places, not a conversation — is the call's label alone: the call is seen by the people asked into it only, and the place is refused to everyone else.

## Ringing while the page is away

While no tab of the app is in front, a call rings this browser as a notification — the caller's name, and "Incoming voice call" or "Incoming video call" — shown by the SDK's service worker, `palbase-sw.js`, through the browser's push service. The browser must take the project's pushes: copy the worker into your site and subscribe it, as every web push needs ([Notifications](https://palbase.studio/docs/web/notifications#the-service-worker)). `pb.calls.deviceId` is the device the pushes are registered with.

- **A tab in front rings itself.** The worker shows no notification for a ringing call while a tab of the app is focused: `onIncoming` has it, and the app rings.
- **A tap on the notification** focuses a tab of the app, or opens one, and `onIncoming` hears the call ringing as the page opens: the person answers there.
- **When it stops ringing** — missed, or the caller gave up — the missed-call push takes the ringing notification away; a page that is open takes it away as soon as the call no longer rings there (answered on another device too).

How a call rings each platform, the push's data and the missed call are [Ringing](https://palbase.studio/docs/calls/ringing).

## History

`pb.calls.history(options)` lists this person's calls, the newest first, each with how it went for them (their participant's `state`, `missed` among them): `missed: true` for the ones they missed or were busy for, `state` for those ringing, going on or ended, `limit` (1 to 100, 20 by default) and `cursor` (the previous page's `next_cursor`). `pb.calls.get(callId)` reads one of theirs as it is now.

```ts
// src/missed.ts
import { pb } from "./lib/palbase";

const { calls, next_cursor } = await pb.calls.history({ missed: true, limit: 50 });
for (const c of calls) console.log(c.created_at, c.video ? "video" : "voice", "from", c.caller_id);
if (next_cursor) console.log("more:", next_cursor);
```

## Permissions and errors

- **The microphone.** Making, answering or joining a call asks for the microphone (and, for video, the camera) first. A refusal rejects with the browser's own error (`NotAllowedError`), and no one is rung, nothing answered. A video call with no camera, or a busy one, goes on by voice.
- **The module's refusals** are a `PalbaseError` (from `palbase/web`), its `code` saying which: `not_allowed` (403: blocks, a conversation's members, your hook, a place's rule), `in_another_call` (409), `place_busy` (409: a `PlaceBusyError`, its `call` the one going on at the place), `too_many_calls` and `quota_exceeded` (429), `invalid_user_ids`, `invalid_place` and `call_full` (400). Answering a call that is no longer this device's is a `409` too — `answered_elsewhere`, `call_ended`, `not_ringing` — and the session's state shows the call as it is.
- **Not signed in**: `401 not_signed_in`. Calls are the signed-in person's.
- **No WebRTC** (a server, a test without a browser): a `TypeError`. A browser that cannot choose where audio plays (no `setSinkId`) refuses `setAudioOutput` with a `TypeError`.
- **The media later on** — a camera turned on and refused, the media server not reached — is the session's `state.error`, and the call goes on.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Calls over HTTP](https://palbase.studio/docs/calls/http) — what the SDK sends
- [Notifications](https://palbase.studio/docs/web/notifications) — web push and the service worker
- [Error Handling](https://palbase.studio/docs/web/errors) — `PalbaseError`
