> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` is the signed-in person's voice and video calls in the browser: it rings the people called, hears the calls that ring this person, and runs a call's media — between the two devices, or through the media server for a group. An app draws what a call's state says and calls what the person does; it opens no peer connection, sends no signal and keeps no heartbeat itself. `palbase/web/calls-ui` draws the screens for an app that wants them ready-made. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  // Every call's media through the relay, never straight between the devices: false unless the app says so.
  calls: { forceRelay: false },
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
| `join(callId, options)` | Comes into a group call this person was asked to — a huddle, one they declined or left — on this device |

Each answers the call's `CallSession` once it rings. This device's microphone (and camera) is asked for first, and a refusal rings no one ([Permissions and errors](#permissions-and-errors)). A call to someone who is calling this person that very moment is their call, answered.

| Option | What it is |
|---|---|
| `video` | A video call (`start` alone) |
| `ring` | Ring the people asked (the default); `false`: a group call they join when they like (a huddle) |
| `group` | A group call even with one person asked: others may be asked later |
| `conversationId` | The conversation it is made from: its members alone may be called, and it keeps the call as a message |
| `metadata` | The app's own words about the call, shown to those rung: 32 strings, 2 KiB at most |
| `callerName`, `callerImageUrl` | What those rung see of the caller; else their messaging profile's name and picture |
| `forceRelay` | This call's media through the relay alone |
| `media` | A microphone (and camera) stream the app opened already: used as it is, and left open when the call ends |

## A call that rings

`pb.calls.onIncoming(listener)` hears each call that rings this person while the page is open, and the calls ringing as it opens — the person tapped the call's notification ([Ringing while the page is away](#ringing-while-the-page-is-away)). It answers the unsubscribe. A group call that rings no one comes too, in the phase `invited`.

| On the session | What it does |
|---|---|
| `accept(options)` | Answers on this device. The first of the person's devices (or tabs) to answer has the call; the others go to `elsewhere`. `accept({ video: false })` answers a video call by voice; `{ video: true }` a voice call with the camera on |
| `decline()` | Turns the call down on every device of the person's: a direct call ends; a group goes on, and may still be joined |
| `join(options)` | Comes into a group call this person was asked to: a huddle (`invited`). A session that is over joins nothing: `pb.calls.join(callId)` comes into the call again |

`accept` and `join` take `video`, `forceRelay` and `media` as making a call does.

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
| `mode` | `p2p` (between the two devices) or `sfu` (through the media server) |
| `local` | This device's microphone and camera, while it is in the call: for its own preview |
| `microphone`, `camera` | Whether this device's microphone is heard and its camera on |
| `remote` | The others in the call (below) |
| `error` | The last thing that went wrong with this device's media: a camera refused, the media server not reached |

Each of `remote` is `userId` (an agent's is `bot:<identity>`), `name`, `imageUrl`, `bot`, `stream` — their audio and video, one `MediaStream` for the whole call, the same object whichever way the media flows — and whether they are heard (`audio`) and seen (`video`).

The others' voices play by themselves. With `calls: { playAudio: false }` in `createClient`'s options, each one's `stream` is the app's to play.

```ts
// src/call-view.ts
import type { CallSession } from "palbase/web";

/** Draws the others' video in a grid, and this device's camera in a corner. */
export function drawCall(session: CallSession, grid: HTMLElement, self: HTMLVideoElement): () => void {
  return session.subscribe(() => {
    const { remote, local } = session.state;
    self.srcObject = local;
    grid.replaceChildren(
      ...remote.map((r) => {
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // their voice already plays
        video.srcObject = r.stream;
        video.hidden = !r.video;
        return video;
      }),
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
| `setAudioOutput(deviceId)` | Where the others' voices play: an `audiooutput`'s `deviceId`, in a browser that can choose one |
| `invite(userIds, { ring })` | Asks more people in, ringing them unless `ring` is `false`: a direct call becomes a group, going on |
| `leave()` | Hangs up — or, while it rings, cancels: a direct call ends for both; a group goes on for the others |
| `refresh()` | Reads the call as it is now |

A page that goes away — closed, reloaded, navigated off — leaves its call at once.

## The media

A direct call's media goes between the two devices (WebRTC), through the relay only when they cannot reach each other — or always, with the project's `relay_all`, the client's `calls: { forceRelay: true }` or one call's `forceRelay`. When the connection fails it is made again with fresh relay credentials, and the session is `reconnecting` meanwhile.

A group's media, or a direct call's once a third person or the project's agent came into it, goes through the platform's media server, through the LiveKit client the package depends on (`livekit-client`). It is loaded only when a call goes there: an app whose calls stay between two devices never downloads it. A call that moves keeps its sessions and its streams: what the app drew goes on playing.

## Ready-made screens

`palbase/web/calls-ui` draws the call screens in the page, with no framework: a sheet for a call that rings — who calls, by voice or with video, Decline and Accept, and for a video call Accept by voice too — and the view of the call this page is in: the others' video (their picture while their camera is off), this device's camera, how long it has gone on, and the microphone, the camera, the other camera and hang up.

```ts
// src/calls-ui.ts
import { mountCallUI } from "palbase/web/calls-ui";
import { pb } from "./lib/palbase";

const ui = mountCallUI(pb.calls, {
  theme: { accent: "#7c3aed", radius: 12 },
  texts: { incomingVoice: "Sesli arama", incomingVideo: "Görüntülü arama", accept: "Aç", decline: "Reddet" },
  ringtone: true,
  // A call from support is drawn by the app's own screen; the rest by these.
  incoming: (call) => call.metadata?.["kind"] !== "support",
  onError: (error) => console.warn("call:", error),
});

// Takes the screens away; a call going on goes on.
ui.unmount();
```

| Option | What it is |
|---|---|
| `container` | The element the screens are drawn in (positioned); the whole page unless given |
| `texts` | Every word the screens show, each replaced as given (`CALL_UI_TEXTS` has them all): the sheet's, the phases', and each way a call ends |
| `labels` | What a screen reader says of the buttons and views (`CALL_UI_LABELS`) |
| `theme` | `accent`, `background`, `foreground`, `danger`, `radius`, `font`, set as `--pb-call-<name>` on the screens' root; the system's light and dark colors unless given |
| `className` | Added to the root element's classes |
| `ringtone` | A soft ring while a sheet shows (the default); silent where the page may not play sound yet |
| `incoming(call, session)` | Asked once for each call that rings: `false` leaves it to the app's own screen, the session headless |
| `onError(error, session)` | An answer, a microphone or a camera that failed |

The newest ringing call is shown, the others wait behind it; a huddle rings no one and shows no sheet. The view goes two seconds after its call ends. What people say of themselves — a name, a picture — is set as text and as an image's address, never as markup.

## Ringing while the page is away

While no tab of the app is in front, a call rings this browser as a notification — the caller's name, and "Incoming voice call" or "Incoming video call" — shown by the SDK's service worker, `palbase-sw.js`, through the browser's push service. The browser must take the project's pushes: copy the worker into your site and subscribe it, as every web push needs ([Notifications](https://palbase.studio/docs/web/notifications#the-service-worker)). `pb.calls.deviceId` is the device the pushes are registered with.

- **A tab in front rings itself.** The worker shows no notification for a ringing call while a tab of the app is focused: `onIncoming` has it, and the app (or `palbase/web/calls-ui`) rings.
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
- **The module's refusals** are a `PalbaseError` (from `palbase/web`), its `code` saying which: `not_allowed` (403: blocks, a conversation's members, your hook), `in_another_call` (409), `too_many_calls` and `quota_exceeded` (429), `invalid_user_ids` and `call_full` (400). Answering a call that is no longer this device's is a `409` too — `answered_elsewhere`, `call_ended`, `not_ringing` — and the session's state shows the call as it is.
- **Not signed in**: `401 not_signed_in`. Calls are the signed-in person's.
- **No WebRTC** (a server, a test without a browser): a `TypeError`. A browser that cannot choose where audio plays (no `setSinkId`) refuses `setAudioOutput` with a `TypeError`.
- **The media later on** — a camera turned on and refused, the media server not reached — is the session's `state.error`, and the call goes on.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Calls over HTTP](https://palbase.studio/docs/calls/http) — what the SDK sends
- [Notifications](https://palbase.studio/docs/web/notifications) — web push and the service worker
- [Error Handling](https://palbase.studio/docs/web/errors) — `PalbaseError`
