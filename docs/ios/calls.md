> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` is the signed-in person's voice and video calls on iOS. A call rings the phone as any call does — the system's own call screen through CallKit, on the lock screen and with the app closed, woken by a VoIP push — and an `@Observable` `PBCall` is what the app draws: where the call is, its cameras, its controls. Every call's media — one to one or in a group — goes through the platform's media server (LiveKit): a third person or the project's agent comes into the same room, and where UDP is shut it goes over TCP to port 443. `PalbaseCallsUI` draws the screens for an app that wants them ready-made. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Install

The calls are a Swift package of their own, so an app that makes no calls takes none of their weight. Add `https://github.com/palgroup/palbase-swift-calls` with Swift Package Manager, at the same version as `palbase-swift`:

```swift
.package(url: "https://github.com/palgroup/palbase-swift-calls", exact: "0.14.1")
```

Link `PalbaseCalls` (the calls, headless) and, for the ready screens, `PalbaseCallsUI`. They bring Palbase's core and `PalbaseNotify` of the same version, and LiveKit's WebRTC and client SDK, which the media server's calls go through. **Do not add LiveKit's own Swift package beside them**: its client SDK is already inside `PalbaseCalls`. It needs iOS 18 and Xcode 16.3 or newer.

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
| `callGroup(_ userIds:, video:, ring:, conversationId:, metadata:, name:, imageURL:)` | A group call — several people, or one others may be asked to later. `ring: false` rings no one: the people asked join when they like (a huddle) |
| `join(_ callId:)` | Comes into a group call the person was asked to — rung, missed, declined, or in before |
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

`CallVideoView(track, fill: true, mirrored: nil)` draws a camera in SwiftUI: filling its frame or fitted in it, this phone's own camera mirrored unless said otherwise.

## Ready-made screens

`PalbaseCallsUI` shows the calls over the app: an incoming call that rings in the app (who calls, voice or video, Decline and Accept), then the call the person is in — the others' cameras or their picture, this phone's camera in a corner, how long it has gone on, and mute, speaker, camera, flip and hang up.

```swift
import PalbaseCalls
import PalbaseCallsUI
import SwiftUI

@main
struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .callScreens(pb.calls)
                .callTexts(turkish)
        }
    }

    private var turkish: CallTexts {
        var t = CallTexts()
        t.incomingVoice = "Sesli arama"
        t.incomingVideo = "Görüntülü arama"
        t.accept = "Aç"
        t.decline = "Reddet"
        t.hangUp = "Kapat"
        return t
    }
}
```

- `.callScreens(pb.calls)` — the ready screens, `IncomingCallView` and `InCallView`.
- `.callScreens(pb.calls, incoming: { call in … }, inCall: { call in … })` — the app's own screen for either or both, each given the `PBCall`.
- `.callTexts(_:)` — every word they say (`CallTexts`: `incomingVoice`, `incomingVideo`, `calling`, `connecting`, `reconnecting`, `elsewhere`, `ended`, `accept`, `decline`, `hangUp`, `mute`, `speaker`, `camera`, `flip`).
- The parts, for a screen of the app's own: `CallStatus(call:)` (where the call is, in words, and its duration), `CallControls(call:)`, `CallAvatar(call:size:)`.

A call on the system's screen is answered there; the app's screens show it once the app is in front.

## Permissions

The first time a call is made or answered, the SDK asks for the microphone — and the camera for a video call — with the reasons the `Info.plist` gives. It does not refuse a call the person said no to: ask before, and send someone who refused to the app's Settings, where they allow it.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Ringing](https://palbase.studio/docs/calls/ringing) — how a call rings each platform, and what its push carries
- [Notifications](https://palbase.studio/docs/ios/notifications) — the APNs key and the app's pushes
