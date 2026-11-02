> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` is the signed-in person's voice and video calls on iOS. A call rings the phone as any call does — the system's own call screen through CallKit, on the lock screen and with the app closed, woken by a VoIP push — and an `@Observable` `PBCall` is what the app draws, in its own design: where the call is, its cameras and shared screens, who is speaking, its controls. Palbase gives the data, not the screens. Every call's media — one to one or in a group — goes through the platform's media server (LiveKit): a third person or the project's agent comes into the same room, and where UDP is shut it goes over TCP to port 443. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Install

The calls are a Swift package of their own, so an app that makes no calls takes none of their weight. Add `https://github.com/palgroup/palbase-swift-calls` with Swift Package Manager, at the same version as `palbase-swift`:

```swift
.package(url: "https://github.com/palgroup/palbase-swift-calls", exact: "0.16.4")
```

Link `PalbaseCalls` to the app — and `PalbaseCallsBroadcast` to its Broadcast Upload Extension alone, when it shares the whole screen ([Sharing a screen](#sharing-a-screen)). `PalbaseCalls` brings Palbase's core and `PalbaseNotify` of the same version, and LiveKit's WebRTC and client SDK, which the media server's calls go through. **Do not add LiveKit's own Swift package beside them**: its client SDK is already inside `PalbaseCalls`. It needs iOS 18 and Xcode 16.3 or newer.

The app:

- says why it asks for the microphone (`NSMicrophoneUsageDescription`) and, for video calls, the camera (`NSCameraUsageDescription`) in its `Info.plist`;
- has the **Push Notifications** capability, and the **Background Modes** `voip` (Voice over IP) and `audio` (Audio, AirPlay, and Picture in Picture).

## A call rings the phone

A call that comes while the app is closed, in the background or the phone is locked rings by a **VoIP push** (PushKit), which wakes the app, and is handed to **CallKit** at once: iOS draws its own call screen — the caller's name, the app's name and icon, its ringtone — and the call is answered or declined there.

- **The APNs key.** VoIP pushes go through the project's APNs key, the same `.p8` its notifications use ([Notifications](https://palbase.studio/docs/backend/notifications#every-channel-but-one-needs-a-provider-of-yours)): the platform sends them to the app's bundle id with `.voip` after it. Nothing else is set up.
- **The token.** `PalbaseCalls` registers the app's PushKit token with the project's notifications as a device of its own (platform `ios_voip`), beside the app's notification token, for the person signed in. The app writes no PushKit code.
- **Configure at launch.** `pb.calls.configure(_:)` sets the system's call screen and the VoIP pushes up. Call it once, before `application(_:didFinishLaunchingWithOptions:)` returns — a VoIP push that launched the app must find it there: iOS stops sending VoIP pushes to an app that does not report each one to CallKit at once.

```swift
import Palbase
import PalbaseCalls
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // A 40-point template image of the app's assets, shown on the system's call screen.
        pb.calls.configure(.init(callKit: .inBackground, iconTemplateImageName: "CallIcon"))
        return true
    }
}
```

`Calls.Configuration`:

| Field | What it is |
|---|---|
| `callKit` | Whether the system's call screen carries the calls: `.inBackground` (the default) — a call that comes while the app is in the background, locked or closed rings on the system's screen, and in the open app the app's own screen rings; `.always` — every call, in the app too; `.never` — none: calls ring in the app alone, while it runs, and no VoIP push is taken |
| `iconTemplateImageName` | A 40-point template image of the app's assets, on the system's call screen |
| `ringtoneSound` | A sound file of the app's bundle the system rings with — and the app's own ring; the system's ringtone when `nil` |
| `includesCallsInRecents` | The calls are listed in the Phone app's recents (`true` by default) |

## Making a call

```swift
import PalbaseCalls
import SwiftUI

struct CallButton: View {
    let userId: String

    var body: some View {
        Button("Video call") {
            Task {
                // Rings every device of theirs; the media goes through the media server.
                let call = try await pb.calls.call(userId, video: true)
                call.setMuted(true)
            }
        }
    }
}
```

| Call | What it does |
|---|---|
| `call(_ userId:, video:, conversationId:, metadata:, name:, imageURL:)` | Rings one person: a direct call. `name` and `imageURL` are what they see of the caller (else the caller's messaging profile's) |
| `callGroup(_ userIds:, video:, ring:, conversationId:, place:, metadata:, name:, imageURL:)` | A group call — several people, or one others may be asked to later. `ring: false` rings no one: the people asked join when they like (a huddle); `place:` holds it at a place, no one need be asked |
| `join(_ callId:, name:, imageURL:)` | Comes into a group call: one the person was asked to — rung, missed, declined, or in before — or, unasked, one held at a place that lets them in ([A call at a place](#a-call-at-a-place)); `name` and `imageURL` are what the others see of them there |
| `place(_ name:)` | A place of the app (`channel:42`) and the call going on there ([A call at a place](#a-call-at-a-place)) |
| `history(missed:, limit:, cursor:)` | The person's calls, the newest first, with how each went for them; `missed: true` the ones they missed |
| `call(id:)` | The call by its id, while it is on the device |

Each that makes or joins a call answers its `PBCall` and throws the module's refusal as a `PalbaseError`: `not_allowed`, `in_another_call`, `too_many_calls`, `quota_exceeded` and the rest of [Calls over HTTP](https://palbase.studio/docs/calls/http#making-a-call); `not_signed_in` when no one is. A call to someone who is calling this person that very moment is their call, answered.

`pb.calls` is `@Observable` too: `live` (the calls on the device — ringing, being made, going on; one that ends stays a moment, for its screen to say so), `ringing` (a call ringing in the app, not on the system's screen) and `current` (the call the person is in on this device, or makes). `deviceId` is the install's device, as the server names it.

## The call

A `PBCall` is `@Observable`: a SwiftUI view that reads it is drawn again as it changes.

| Property | What it is |
|---|---|
| `phase` | `.ringing` (someone calls them), `.invited` (asked into a huddle: `join()` comes in), `.calling` (they call; the other side rings), `.connecting`, `.connected`, `.reconnecting` (the media dropped and is coming back), `.elsewhere` (in it on another of their devices), `.ended(CallEndReason)`; `phase.isHere` while they are in it on this device |
| `snapshot` | The call as the server last told it ([A call](https://palbase.studio/docs/calls/http#a-call)) |
| `isIncoming`, `isVideo`, `isGroup` | Someone called them; a video call; a group |
| `title`, `imageURL` | What a screen names the call by — the others' names — and the other person's picture in a direct call |
| `others`, `joinedOthers` | The other people (and agents) in the call; those in it now |
| `media` | `.idle`, `.connecting`, `.connected`, `.reconnecting`, `.failed` |
| `isMuted`, `isCameraOn`, `isSpeakerOn`, `isFrontCamera` | The controls' state |
| `localVideo`, `remoteVideos`, `video(of:)` | This phone's camera while it is on, the others' cameras each with whose it is (`CallVideoTrack.userId`), and one person's |
| `isScreenSharing`, `remoteScreens`, `screen(of:)` | This phone shares a screen; the others' shared screens, apart from their cameras (`CallVideoTrack.isScreen`), and one person's |
| `speaking` | The user ids of those heard speaking now |
| `place` | The place it is held at, if it is |
| `connectedAt` | When it was answered (a direct call) or the person came in (a group): what a duration counts from |
| `problem` | The last thing that went wrong here — a refusal, the media failing: what a screen may show |
| `onSystem` | The system's call screen carries it |

`CallEndReason` is the server's `end_reason` — `.hungUp`, `.canceled`, `.declined`, `.missed`, `.busy`, `.failed`, `.ended` — or the person's own in a group that goes on (`.left`), and `.answeredElsewhere` when another of their devices took it.

| Action | What it does |
|---|---|
| `accept()` | Answers on this device — through the system's screen when it rings there. Throws the server's refusal: `answered_elsewhere` when another of the person's devices took it first |
| `join()` | Comes into a group call the person was asked to: a huddle, or one they declined or missed |
| `decline()` | Turns a ringing call down: a direct call ends; a group goes on without them |
| `hangUp()` | Hangs up — or cancels the call they are making, or turns down one ringing |
| `setMuted(_:)`, `setSpeaker(_:)` | The microphone muted; the sound through the speaker |
| `setCamera(_:)`, `flipCamera()` | The camera on or off, and the other camera — a video call's |
| `invite(_ userIds:, ring:)` | Asks more people in: a direct call becomes a group in the same room, going on |
| `setScreenShare(_:)` | Shares the screen, or stops sharing it ([Sharing a screen](#sharing-a-screen)) |

`CallVideoView(track, fill: true, mirrored: nil)` draws a camera — or a shared screen — in SwiftUI: filling its frame or fitted in it, this phone's own camera mirrored unless said otherwise.

## Drawing the call

The app draws its own screens from `pb.calls`: `ringing` is the call to show ringing in the app (a call on the system's screen is answered there), `current` the call the person is in. Over the whole app:

```swift
import PalbaseCalls
import SwiftUI

struct CallOverlay: ViewModifier {
    private var call: PBCall? { pb.calls.ringing ?? pb.calls.current }

    func body(content: Content) -> some View {
        content.fullScreenCover(item: Binding(get: { call }, set: { _ in })) { call in
            if call.phase == .ringing {
                VStack(spacing: 24) {
                    Text(call.title).font(.title)
                    Text(call.isVideo ? "Video call" : "Voice call")
                    HStack(spacing: 64) {
                        Button("Decline") { Task { await call.decline() } }
                        Button("Accept") { Task { try? await call.accept() } }
                    }
                }
            } else {
                InCall(call: call)
            }
        }
    }
}

struct InCall: View {
    let call: PBCall

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // A shared screen fills the screen; else the other's camera.
            if let shared = call.remoteScreens.first ?? call.remoteVideos.first {
                CallVideoView(shared, fill: shared.isScreen == false)
            } else {
                Text(call.title).font(.largeTitle)
            }
            if let me = call.localVideo { CallVideoView(me).frame(width: 110, height: 160) }
        }
        .overlay(alignment: .bottom) {
            HStack {
                Button(call.isMuted ? "Unmute" : "Mute") { call.setMuted(!call.isMuted) }
                Button(call.isScreenSharing ? "Stop sharing" : "Share screen") {
                    Task { try? await call.setScreenShare(!call.isScreenSharing) }
                }
                Button("Hang up") { Task { await call.hangUp() } }
            }
        }
    }
}
```

The example app (`Examples/PalbaseExample`, `CallScreens.swift`) draws the ringing screen and the call this way — the others' tiles framed while `speaking` names them, the call's clock from `connectedAt`, `problem` when something failed.

## Sharing a screen

`setScreenShare(true)` sends a screen into the call as a picture of its own, apart from the camera: the others get it as one of their `remoteScreens`; `isScreenSharing` says it, and `setScreenShare(false)` stops it. It goes through the media server as the camera does, and its data is the call's ([What it costs](https://palbase.studio/docs/calls/overview#what-it-costs)). What is shared is the configuration's `screenShare`:

- **`.inApp`** (the default) — the app's own screen, captured in the app (ReplayKit): nothing to set up. iOS asks the person before it records the app's screen.
- **`.appWindow`** — the app's window drawn from its own views, ten times a second: no ReplayKit, so no prompt, and it shares where ReplayKit is not — the iOS Simulator has none. A video or camera layer, the keyboard and other windows are not in it, and nothing is shared while the app is in the background.
- **`.broadcastExtension`** — the whole screen, the app in the background too, through the app's **Broadcast Upload Extension**: sharing shows the system's picker and starts with the broadcast.

```swift
pb.calls.configure(.init(screenShare: .broadcastExtension))
```

The extension is the app's own target, set up once in Xcode:

1. **File › New › Target › Broadcast Upload Extension**; its bundle identifier is the app's with `.broadcast` after it (`com.example.app.broadcast`), with **Include UI Extension** left unchecked.
2. Link **`PalbaseCallsBroadcast`** (palbase-swift-calls) to the extension alone, and make its `SampleHandler` a subclass with nothing in it:

   ```swift
   import PalbaseCallsBroadcast

   final class SampleHandler: PalbaseBroadcastHandler, @unchecked Sendable {}
   ```

3. Give the app and the extension the same **App Group** — `group.` and the app's bundle identifier (`group.com.example.app`) — in both targets' Signing & Capabilities. Another group is named by `RTCAppGroupIdentifier` in both `Info.plist`s, and another extension by `RTCScreenSharingExtension` in the app's.

Without the app group, `setScreenShare(true)` is refused with `no_broadcast_extension`. On iOS 27 and newer the system's own picker shares from the app (ScreenCaptureKit), the extension's part all the same.

## A call at a place

`pb.calls.place(_:)` is a place of the app — a channel (`channel:42`), a conversation of Palbase's messaging (`conversation:<id>`) — and the call going on there ([A call at a place](https://palbase.studio/docs/calls/overview#a-call-at-a-place)): a `CallPlace`, `@Observable`, one object for a place while the app holds it.

| | What it is |
|---|---|
| `call` | The call going on there (`CallsAPI.Call`), `nil` for none |
| `isWatching`, `problem` | It is watched; the last thing that went wrong — `not_allowed` where the project's rule does not let the person in |
| `watch()` | Follows the place while the calling task runs — a view's `.task` — and lets it go when it ends: told as a call starts there, changes and ends, the watch renewed |
| `startWatching()`, `stopWatching()` | The same, by hand: the last watcher's stop ends the watch |
| `refresh()` | Reads the place's call as it is now |
| `start(video:, invite:, ring:, metadata:, name:, imageURL:)` | Starts a call at the place: no one need be invited |
| `join(name:, imageURL:)` | Comes into the call going on there, unasked |

```swift
struct ChannelMeetingBar: View {
    let channelId: String
    var place: CallPlace { pb.calls.place("channel:\(channelId)") }

    var body: some View {
        Group {
            if let call = place.call {
                Button("Join the meeting (\(call.participants.filter { $0.state == .joined }.count) in it)") {
                    Task { _ = try? await place.join() }
                }
            } else {
                Button("Start a meeting") { Task { _ = try? await place.start(ring: false) } }
            }
        }
        .task { try? await place.watch() } // watched while the channel is on screen
    }
}
```

One call goes on at a place at a time: starting another there throws a `PalbaseError` with `isPlaceBusy`, its `call` the one going on — and the place's `call` shows it — to join. `isNotAllowed` is the project's rule saying no. A place with no rule — no hook answering places, not a conversation — is the call's label alone: its call is seen by the people asked into it only.

## Permissions

The first time a call is made or answered, the SDK asks for the microphone — and the camera for a video call — with the reasons the `Info.plist` gives. It does not refuse a call the person said no to: ask before, and send someone who refused to the app's Settings, where they allow it.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Ringing](https://palbase.studio/docs/calls/ringing) — how a call rings each platform, and what its push carries
- [Notifications](https://palbase.studio/docs/ios/notifications) — the APNs key and the app's pushes
